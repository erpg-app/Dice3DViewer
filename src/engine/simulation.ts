import { createSeededRandom } from '../random'
import { chooseSymmetry, findFace, readFace, supportHeight, type DiceShape } from './shape'
import { add, cross, dot, qrot, scale, sub, type Quat, type ReadonlyQuat, type ReadonlyVec3, type Vec3 } from './vector'

/**
 * Deterministic rigid-body simulation specialised for dice.
 *
 * The throw runs freely until every body rests. The resolved value is applied
 * afterwards by a symmetry rotation G of the polyhedron that is used only by
 * the visual mesh: G maps the collider onto itself, so the physical trajectory
 * is untouched and no guidance, motor or final lock is needed.
 *
 * Contacts: vertex/plane for the table and the four viewport walls, SAT with a
 * clipped contact manifold (face/face) or closest points (edge/edge) between
 * dice. Contacts are speculative, so fast dice cannot tunnel into each other,
 * restitution runs as a separate pass and penetration is removed in position.
 *
 * The hot loop is allocation-free (scalar body state, preallocated world-space
 * buffers and a pooled contact list) and only uses + - * / and Math.sqrt, so
 * the same seed yields bit-identical keyframes in every JavaScript engine.
 */

export interface SimulationBody {
	readonly shape: DiceShape
	/** Result that must end up in reading position. */
	readonly value: number
	/** Face artwork "up" direction for the target value (optional). */
	readonly readUp?: ReadonlyVec3
	readonly position: ReadonlyVec3
	readonly orientation: ReadonlyQuat
	readonly velocity: ReadonlyVec3
	readonly angularVelocity: ReadonlyVec3
	/** Seconds after the start of the simulation. */
	readonly releaseTime: number
	/** Wall ignored until the body has entered the stage (0 left, 1 right, 2 north, 3 south, -1 none). */
	readonly portal: number
	readonly mass?: number
	/** Explosion child: released from this body as soon as it settles. */
	readonly spawnParent?: number
	/** Explosion child entering through the `portal` edge instead of bursting out of its parent. */
	readonly spawnFromEdge?: boolean
	/** Immovable obstacle (a die that already rests): never moves and is never remapped. */
	readonly fixed?: boolean
	/**
	 * Thrown again from rest (reroll). The value rotation cannot be applied from
	 * the first frame, so the result reports the airborne window to blend it in.
	 */
	readonly retoss?: boolean
}

export interface SimulationOptions {
	readonly halfX: number
	readonly halfZ: number
	readonly gravity: number
	readonly floorFriction: number
	readonly floorRestitution: number
	readonly wallFriction: number
	readonly wallRestitution: number
	readonly diceFriction: number
	readonly diceRestitution: number
	readonly linearDamping: number
	readonly angularDamping: number
	/**
	 * Settle budget in seconds (measured from the start; an explosion child gets
	 * the same budget from its own birth). It is never a hard stop: past it a
	 * moving body loses energy progressively until it rests, so a throw always
	 * ends with every die at rest and every explosion child born.
	 */
	readonly maxTime: number
	readonly seed: string
	readonly explodeDelay?: number
	readonly burstHeight?: number
	readonly spread?: number
	readonly explodeSpeed?: number
	/** Release height of explosion children entering from the edge. */
	readonly edgeHeight?: number
	readonly dt?: number
	readonly iterations?: number
	readonly recordEvery?: number
	/** Minimum face alignment (cosine) for a resting body to count as readable. Default 0.966 (15°). */
	readonly readyAlignment?: number
	/**
	 * Packed tables: a die that rests stays put (later arrivals bounce off the
	 * pile instead of re-simulating it). Keeps big throws affordable.
	 */
	readonly permanentSleep?: boolean
}

/** `collision`: two dice hit each other. `impact`: a die hits the table hard. */
export type SimulationMarkerType = 'release' | 'settle' | 'explode' | 'collision' | 'impact'

export interface SimulationMarker {
	readonly frame: number
	readonly type: SimulationMarkerType
	readonly body: number
	readonly other?: number
	readonly force?: number
}

export interface SimulationResult {
	/** Per recorded frame: x, y, z, qx, qy, qz, qw for each body. */
	readonly frames: readonly Float32Array[]
	readonly fps: number
	readonly bodyCount: number
	readonly releaseFrames: readonly number[]
	/** Visual rotation G applied on top of each body's physical orientation. */
	readonly visualOffsets: readonly Quat[]
	/**
	 * Re-tossed bodies only: recorded frames [liftoff, touchdown] in which G is
	 * blended in from identity (the body is airborne, so no contact reveals it).
	 */
	readonly remapWindows: readonly (readonly [number, number] | null)[]
	/** Explosion children bursting from a parent: first visible frame and the parent's centre. */
	readonly births: readonly ({ readonly frame: number; readonly from: ReadonlyVec3 } | null)[]
	readonly landed: readonly { readonly value: number | null; readonly alignment: number; readonly readable: boolean }[]
	readonly markers: readonly SimulationMarker[]
	readonly durationSeconds: number
	/** Every body rests flat, inside the stage and carries its value. */
	readonly clean: boolean
	readonly stats: { readonly steps: number; readonly diceImpacts: number; readonly wallImpacts: number }
}

const READY_ALIGNMENT = 0.966
/** Above these speeds a body is moving, whatever its recent drift. */
const MOVING_LINEAR = 0.5
const MOVING_ANGULAR = 1
/**
 * Rest is measured as drift over a window, not as instantaneous speed: in a
 * pile, one step without support adds g·dt (≈0.2 u/s) and would reset a
 * speed-based timer forever although the die does not move.
 */
const QUIET_DRIFT = 0.012
/** 1 - |q·q0| for about 0.02 rad of rotation. */
const QUIET_TURN = 5e-5
/**
 * Slow bodies in contact lose speed like dice on felt (rolling resistance).
 * Without warm starting, piles otherwise creep for seconds; a die really
 * tipping over accelerates past these speeds and is not held back.
 */
const REST_LINEAR = 0.35
const REST_ANGULAR = 0.7
const REST_DAMPING = 9
const SLEEP_TIME = 0.22
const WAKE_SPEED = 1.2
/**
 * Overtime: past its settle budget a moving body loses a little more energy
 * every second (like felt getting rougher), so it comes to rest naturally
 * instead of freezing mid-motion. Vertical fall is never damped.
 */
const OVERTIME_DAMPING = 2.5
const OVERTIME_DAMPING_MAX = 12
/** Safety net for pathological cases: overtime seconds after the latest birth before the world stops anyway. */
const OVERTIME_LIMIT = 30
/** Approach speed of a table contact reported as an impact marker. */
const FLOOR_IMPACT_SPEED = 2.5
const SLOP = 0.004
const POSITION_CORRECTION = 0.6
const RESTITUTION_THRESHOLD = 1

/** Flat, cache-friendly copy of a DiceShape. */
interface ShapeData {
	readonly vertCount: number
	readonly verts: Float64Array
	readonly faceCount: number
	readonly normals: Float64Array
	readonly offsets: Float64Array
	readonly valued: Uint8Array
	readonly faceStart: Int32Array
	readonly faceSize: Int32Array
	readonly members: Int32Array
	readonly edgeCount: number
	readonly edges: Int32Array
	readonly dirCount: number
	readonly dirs: Float64Array
	readonly radius: number
	readonly readDown: boolean
}

const shapeCache = new WeakMap<DiceShape, ShapeData>()
const shapeData = (shape: DiceShape): ShapeData => {
	const cached = shapeCache.get(shape)
	if(cached) return cached
	const faceStart = new Int32Array(shape.faces.length)
	const faceSize = new Int32Array(shape.faces.length)
	const members: number[] = []
	shape.faces.forEach((face, index) => {
		faceStart[index] = members.length
		faceSize[index] = face.members.length
		members.push(...face.members)
	})
	const data: ShapeData = {
		vertCount: shape.verts.length,
		verts: Float64Array.from(shape.verts.flat()),
		faceCount: shape.faces.length,
		normals: Float64Array.from(shape.faces.flatMap(face => face.normal)),
		offsets: Float64Array.from(shape.faces.map(face => face.d)),
		valued: Uint8Array.from(shape.faces.map(face => face.value === null ? 0 : 1)),
		faceStart,
		faceSize,
		members: Int32Array.from(members),
		edgeCount: shape.edges.length,
		edges: Int32Array.from(shape.edges.flatMap(edge => [edge.i, edge.j, edge.dirIndex])),
		dirCount: shape.edgeDirs.length,
		dirs: Float64Array.from(shape.edgeDirs.flat()),
		radius: shape.radius,
		readDown: shape.readDown
	}
	shapeCache.set(shape, data)
	return data
}

class Body {
	px: number; py: number; pz: number
	qx: number; qy: number; qz: number; qw: number
	vx: number; vy: number; vz: number
	wx: number; wy: number; wz: number
	// Rotation matrix (row-major) refreshed with the world buffers.
	m00 = 1; m01 = 0; m02 = 0; m10 = 0; m11 = 1; m12 = 0; m20 = 0; m21 = 0; m22 = 1
	readonly worldVerts: Float64Array
	readonly worldNormals: Float64Array
	readonly worldOffsets: Float64Array
	readonly worldDirs: Float64Array
	worldStep = -1
	releaseStep: number
	released = false
	portal: number
	quiet = 0
	asleep = false
	asleepSince = 0
	settledReported = false
	readonly fixed: boolean
	// Pose at the start of the current quiet window.
	ax = 0; ay = 0; az = 0
	aqx = 0; aqy = 0; aqz = 0; aqw = 1
	/** Received a contact impulse during the current step. */
	touching = false
	/** Explosion child bursting out of its parent: where the parent was at the burst. */
	birth: [number, number, number] | null = null
	index = 0
	liftoffStep = -1
	touchdownStep = -1
	/** Step from which this body is in overtime (see OVERTIME_DAMPING). */
	overtimeStep = Infinity

	constructor(
		readonly input: SimulationBody,
		readonly data: ShapeData,
		readonly invM: number,
		readonly invI: number,
		readonly mass: number,
		dt: number
	) {
		this.px = input.position[0]; this.py = input.position[1]; this.pz = input.position[2]
		const q = input.orientation
		const l = Math.sqrt(q[0] * q[0] + q[1] * q[1] + q[2] * q[2] + q[3] * q[3]) || 1
		this.qx = q[0] / l; this.qy = q[1] / l; this.qz = q[2] / l; this.qw = q[3] / l
		this.vx = input.velocity[0]; this.vy = input.velocity[1]; this.vz = input.velocity[2]
		this.wx = input.angularVelocity[0]; this.wy = input.angularVelocity[1]; this.wz = input.angularVelocity[2]
		this.worldVerts = new Float64Array(data.vertCount * 3)
		this.worldNormals = new Float64Array(data.faceCount * 3)
		this.worldOffsets = new Float64Array(data.faceCount)
		this.worldDirs = new Float64Array(data.dirCount * 3)
		this.releaseStep = input.spawnParent === undefined ? Math.round(Math.max(0, input.releaseTime) / dt) : Infinity
		this.portal = input.portal
		this.fixed = Boolean(input.fixed)
		if(this.fixed) {
			this.released = true
			this.releaseStep = 0
			this.asleep = true
			this.asleepSince = -1e9
			this.settledReported = true
			this.vx = this.vy = this.vz = 0
			this.wx = this.wy = this.wz = 0
		}
	}

	/** Starts a new quiet window at the current pose. */
	anchor(): void {
		this.ax = this.px; this.ay = this.py; this.az = this.pz
		this.aqx = this.qx; this.aqy = this.qy; this.aqz = this.qz; this.aqw = this.qw
	}

	/** Refreshes the rotation matrix and world-space geometry. */
	updateWorld(step: number): void {
		if(this.worldStep === step) return
		this.worldStep = step
		const x = this.qx, y = this.qy, z = this.qz, w = this.qw
		const m00 = 1 - 2 * (y * y + z * z), m01 = 2 * (x * y - w * z), m02 = 2 * (x * z + w * y)
		const m10 = 2 * (x * y + w * z), m11 = 1 - 2 * (x * x + z * z), m12 = 2 * (y * z - w * x)
		const m20 = 2 * (x * z - w * y), m21 = 2 * (y * z + w * x), m22 = 1 - 2 * (x * x + y * y)
		this.m00 = m00; this.m01 = m01; this.m02 = m02
		this.m10 = m10; this.m11 = m11; this.m12 = m12
		this.m20 = m20; this.m21 = m21; this.m22 = m22
		const data = this.data
		const lv = data.verts, wv = this.worldVerts
		for(let i = 0; i < data.vertCount * 3; i += 3) {
			const a = lv[i]!, b = lv[i + 1]!, c = lv[i + 2]!
			wv[i] = m00 * a + m01 * b + m02 * c + this.px
			wv[i + 1] = m10 * a + m11 * b + m12 * c + this.py
			wv[i + 2] = m20 * a + m21 * b + m22 * c + this.pz
		}
		const ln = data.normals, wn = this.worldNormals, wo = this.worldOffsets
		for(let f = 0, i = 0; f < data.faceCount; f++, i += 3) {
			const a = ln[i]!, b = ln[i + 1]!, c = ln[i + 2]!
			const nx = m00 * a + m01 * b + m02 * c, ny = m10 * a + m11 * b + m12 * c, nz = m20 * a + m21 * b + m22 * c
			wn[i] = nx; wn[i + 1] = ny; wn[i + 2] = nz
			wo[f] = nx * this.px + ny * this.py + nz * this.pz + data.offsets[f]!
		}
		const ld = data.dirs, wd = this.worldDirs
		for(let i = 0; i < data.dirCount * 3; i += 3) {
			const a = ld[i]!, b = ld[i + 1]!, c = ld[i + 2]!
			wd[i] = m00 * a + m01 * b + m02 * c
			wd[i + 1] = m10 * a + m11 * b + m12 * c
			wd[i + 2] = m20 * a + m21 * b + m22 * c
		}
	}

	/** Best alignment of a valued face with the reading direction (0 when unreadable). */
	readingAlignment(): number {
		const sign = this.data.readDown ? -1 : 1
		// Local reading direction = Rᵀ · (0, ±1, 0).
		const ux = this.m10 * sign, uy = this.m11 * sign, uz = this.m12 * sign
		const ln = this.data.normals
		let best = -Infinity, valued = 0
		for(let f = 0, i = 0; f < this.data.faceCount; f++, i += 3) {
			const c = ln[i]! * ux + ln[i + 1]! * uy + ln[i + 2]! * uz
			if(c > best) {
				best = c
				valued = this.data.valued[f]!
			}
		}
		return valued ? best : 0
	}
}

class Contact {
	a!: Body
	b: Body | null = null
	px = 0; py = 0; pz = 0
	nx = 0; ny = 0; nz = 0
	depth = 0; mu = 0; e = 0
	wall = false
	key = 0
	ima = 0; iia = 0; imb = 0; iib = 0
	rax = 0; ray = 0; raz = 0
	rbx = 0; rby = 0; rbz = 0
	t1x = 0; t1y = 0; t1z = 0
	t2x = 0; t2y = 0; t2z = 0
	mn = 0; mt1 = 0; mt2 = 0
	vn0 = 0; bias = 0; jn = 0; jt1 = 0; jt2 = 0
}

// Pooled contacts and scratch buffers (single-threaded, reused every step).
const pool: Contact[] = []
let contactCount = 0
const polygonA = new Float64Array(128 * 3)
const polygonB = new Float64Array(128 * 3)
let RX = 0, RY = 0, RZ = 0

const addContact = (
	a: Body, b: Body | null,
	px: number, py: number, pz: number,
	nx: number, ny: number, nz: number,
	depth: number, mu: number, e: number, wall: boolean, key: number
): void => {
	let c = pool[contactCount]
	if(!c) {
		c = new Contact()
		pool.push(c)
	}
	contactCount++
	c.a = a; c.b = b
	c.px = px; c.py = py; c.pz = pz
	c.nx = nx; c.ny = ny; c.nz = nz
	c.depth = depth; c.mu = mu; c.e = e; c.wall = wall; c.key = key
	c.jn = 0; c.jt1 = 0; c.jt2 = 0
}

/** Relative velocity of the contact point, A minus B, into RX/RY/RZ. */
const relativeVelocity = (c: Contact): void => {
	const a = c.a
	RX = a.vx + (a.wy * c.raz - a.wz * c.ray)
	RY = a.vy + (a.wz * c.rax - a.wx * c.raz)
	RZ = a.vz + (a.wx * c.ray - a.wy * c.rax)
	const b = c.b
	if(b) {
		RX -= b.vx + (b.wy * c.rbz - b.wz * c.rby)
		RY -= b.vy + (b.wz * c.rbx - b.wx * c.rbz)
		RZ -= b.vz + (b.wx * c.rby - b.wy * c.rbx)
	}
}

const effectiveMass = (c: Contact, dx: number, dy: number, dz: number): number => {
	const ax = c.ray * dz - c.raz * dy, ay = c.raz * dx - c.rax * dz, az = c.rax * dy - c.ray * dx
	let k = c.ima + c.iia * (ax * ax + ay * ay + az * az)
	if(c.b) {
		const bx = c.rby * dz - c.rbz * dy, by = c.rbz * dx - c.rbx * dz, bz = c.rbx * dy - c.rby * dx
		k += c.imb + c.iib * (bx * bx + by * by + bz * bz)
	}
	return k
}

const applyImpulse = (c: Contact, jx: number, jy: number, jz: number): void => {
	const a = c.a
	a.vx += jx * c.ima; a.vy += jy * c.ima; a.vz += jz * c.ima
	a.wx += c.iia * (c.ray * jz - c.raz * jy)
	a.wy += c.iia * (c.raz * jx - c.rax * jz)
	a.wz += c.iia * (c.rax * jy - c.ray * jx)
	const b = c.b
	if(b) {
		b.vx -= jx * c.imb; b.vy -= jy * c.imb; b.vz -= jz * c.imb
		b.wx -= c.iib * (c.rby * jz - c.rbz * jy)
		b.wy -= c.iib * (c.rbz * jx - c.rbx * jz)
		b.wz -= c.iib * (c.rbx * jy - c.rby * jx)
	}
}

const minProjection = (verts: Float64Array, count: number, nx: number, ny: number, nz: number): number => {
	let min = Infinity
	for(let i = 0; i < count * 3; i += 3) {
		const d = verts[i]! * nx + verts[i + 1]! * ny + verts[i + 2]! * nz
		if(d < min) min = d
	}
	return min
}

const maxProjection = (verts: Float64Array, count: number, nx: number, ny: number, nz: number): number => {
	let max = -Infinity
	for(let i = 0; i < count * 3; i += 3) {
		const d = verts[i]! * nx + verts[i + 1]! * ny + verts[i + 2]! * nz
		if(d > max) max = d
	}
	return max
}

/** Runs a whole simulation synchronously. */
export function simulate(inputs: readonly SimulationBody[], options: SimulationOptions): SimulationResult {
	const steps = simulateSteps(inputs, options)
	for(;;) {
		const next = steps.next()
		if(next.done) return next.value
	}
}

/**
 * The simulation as a generator that yields after every step, so large
 * throws can be computed in time slices. Steps never share state through the
 * module-level scratch buffers, so interleaved simulations stay correct.
 */
export function* simulateSteps(inputs: readonly SimulationBody[], options: SimulationOptions): Generator<void, SimulationResult, void> {
	const dt = options.dt ?? 1 / 120
	const iterations = options.iterations ?? 12
	const recordEvery = options.recordEvery ?? 2
	const explodeDelay = options.explodeDelay ?? 0.12
	const readyAlignment = options.readyAlignment ?? READY_ALIGNMENT
	const permanentSleep = Boolean(options.permanentSleep)
	const random = createSeededRandom(`${options.seed}:simulation`)
	const bodies = inputs.map(input => {
		const mass = input.mass ?? 1
		const data = shapeData(input.shape)
		return input.fixed
			? new Body(input, data, 0, 0, mass, dt)
			: new Body(input, data, 1 / mass, 1 / (input.shape.inertiaK * mass * data.radius * data.radius), mass, dt)
	})
	for(const body of bodies) {
		body.anchor()
		if(body.fixed) body.updateWorld(0)
	}
	const count = bodies.length
	// Broadphase: bodies sorted along x (insertion sort, nearly sorted between steps).
	const order = new Int32Array(count)
	for(let index = 0; index < count; index++) order[index] = index
	const spinOf = new Float64Array(count)
	const extent = new Float64Array(count)
	const W = options.halfX, D = options.halfZ
	// Walls (0 left, 1 right, 2 north, 3 south) and the table (4).
	const planeNX = [1, -1, 0, 0, 0], planeNY = [0, 0, 0, 0, 1], planeNZ = [0, 0, 1, -1, 0]
	const planeD = [-W, -W, -D, -D, 0]
	const planeMu = [options.wallFriction, options.wallFriction, options.wallFriction, options.wallFriction, options.floorFriction]
	const planeE = [options.wallRestitution, options.wallRestitution, options.wallRestitution, options.wallRestitution, options.floorRestitution]
	const reachablePlanes = new Int8Array(5)

	const frames: Float32Array[] = []
	const record = (): void => {
		const frame = new Float32Array(count * 7)
		for(let i = 0; i < count; i++) {
			const body = bodies[i]!, o = i * 7
			frame[o] = body.px; frame[o + 1] = body.py; frame[o + 2] = body.pz
			frame[o + 3] = body.qx; frame[o + 4] = body.qy; frame[o + 5] = body.qz; frame[o + 6] = body.qw
		}
		frames.push(frame)
	}
	record()

	const markers: Array<Omit<SimulationMarker, 'frame'> & { readonly step: number }> = []
	const stats = { steps: 0, diceImpacts: 0, wallImpacts: 0 }
	const impacted = new Map<number, number>()
	const floorImpacted = new Map<number, number>()
	bodies.forEach((body, index) => { body.index = index })
	const deepest = new Map<number, Contact>()
	const wallHits = new Set<number>()
	// The settle budget (maxTime) is measured from the last planned release;
	// explosion children get the same budget from their own birth.
	const budgetStart = inputs.reduce((latest, input) => input.spawnParent === undefined && !input.fixed ? Math.max(latest, input.releaseTime) : latest, 0)
	const budgetSteps = Math.ceil(Math.max(0.5, options.maxTime - budgetStart) / dt)
	const softSteps = Math.ceil(options.maxTime / dt)
	const limitSteps = Math.ceil(OVERTIME_LIMIT / dt)
	let deadline = softSteps + limitSteps
	let finished = false

	for(let step = 0; step < deadline; step++) {
		stats.steps++
		for(let index = 0; index < count; index++) {
			const body = bodies[index]!
			if(!body.released && step >= body.releaseStep) {
				body.released = true
				body.overtimeStep = softSteps
				markers.push({ step, type: 'release', body: index })
			}
			// Explosion: the child is born from its parent once the parent rests.
			const parentIndex = body.input.spawnParent
			if(!body.released && parentIndex !== undefined) {
				const parent = bodies[parentIndex]
				if(!parent || !parent.released || !parent.asleep || (step - parent.asleepSince) * dt < explodeDelay) continue
				const spread = options.spread ?? 0.8
				const burst = options.burstHeight ?? 1.6
				const jx = (random.next() * 2 - 1) * spread, jz = (random.next() * 2 - 1) * spread
				if(body.input.spawnFromEdge) {
					// Enters through the throw edge and lands a little short of its parent.
					const k = body.input.portal >= 0 ? body.input.portal : 0
					const r = body.data.radius
					const height = options.edgeHeight ?? 7.6
					if(k < 2) {
						body.px = (k === 0 ? -1 : 1) * (W + r * 1.5)
						body.pz = Math.max(-D + r, Math.min(D - r, parent.pz + jz))
					} else {
						body.px = Math.max(-W + r, Math.min(W - r, parent.px + jx))
						body.pz = (k === 2 ? -1 : 1) * (D + r * 1.5)
					}
					body.py = height
					const fall = Math.sqrt(2 * height / options.gravity)
					body.vx = (parent.px - body.px) / fall * 0.82
					body.vy = 0
					body.vz = (parent.pz - body.pz) / fall * 0.82
					body.portal = k
				} else {
					const lift = supportHeight(parent.input.shape, [parent.qx, parent.qy, parent.qz, parent.qw]) + body.data.radius + burst * 0.5
					body.px = parent.px + jx; body.py = parent.py + lift; body.pz = parent.pz + jz
					// Never born inside another die: rise until the spawn is clear.
					for(let attempt = 0; attempt < 6; attempt++) {
						let blocked = false
						for(const other of bodies) {
							if(other === body || !other.released) continue
							const dx = other.px - body.px, dy = other.py - body.py, dz = other.pz - body.pz
							const reach = (other.data.radius + body.data.radius) * 0.9
							if(dx * dx + dy * dy + dz * dz < reach * reach) {
								blocked = true
								break
							}
						}
						if(!blocked) break
						body.py += body.data.radius * 0.8
					}
					body.birth = [parent.px, parent.py, parent.pz]
					const hx = jx || 0.3, hz = jz || 0.3, hl = Math.sqrt(hx * hx + hz * hz)
					const speed = (options.explodeSpeed ?? 3.5) * (0.8 + random.next() * 0.4)
					body.vx = hx / hl * speed
					body.vy = Math.sqrt(2 * options.gravity * (burst * 0.5 + 0.3))
					body.vz = hz / hl * speed
					body.portal = -1
					if(!parent.fixed && !permanentSleep) {
						parent.asleep = false
						parent.quiet = 0
						parent.anchor()
					}
				}
				let ax = random.next() * 2 - 1, ay = random.next() * 2 - 1, az = random.next() * 2 - 1
				const al = Math.sqrt(ax * ax + ay * ay + az * az) || 1
				const spin = 12 + random.next() * 12
				ax = ax / al * spin; ay = ay / al * spin; az = az / al * spin
				body.wx = ax; body.wy = ay; body.wz = az
				body.released = true
				body.releaseStep = step
				body.overtimeStep = Math.max(softSteps, step + budgetSteps)
				deadline = Math.max(deadline, body.overtimeStep + limitSteps)
				body.worldStep = -1
				body.anchor()
				markers.push({ step, type: 'explode', body: parentIndex, other: index })
				markers.push({ step, type: 'release', body: index })
			}
		}
		let widest = 0
		for(let index = 0; index < count; index++) {
			const body = bodies[index]!
			body.touching = false
			if(!body.released) continue
			if(!body.asleep) body.vy -= options.gravity * dt
			body.updateWorld(body.asleep ? body.worldStep : step)
			const w = Math.sqrt(body.wx * body.wx + body.wy * body.wy + body.wz * body.wz)
			const v = Math.sqrt(body.vx * body.vx + body.vy * body.vy + body.vz * body.vz)
			spinOf[index] = w
			const reach = body.data.radius + (v + w * body.data.radius) * dt + 0.0025
			extent[index] = reach
			if(reach > widest) widest = reach
		}

		contactCount = 0
		for(let index = 0; index < count; index++) {
			const body = bodies[index]!
			if(!body.released || body.asleep) continue
			if(body.portal >= 0) {
				const k = body.portal
				if(planeNX[k]! * body.px + planeNZ[k]! * body.pz - planeD[k]! > body.data.radius * 0.35) body.portal = -1
			}
			// The swept sphere bounds every vertex, with padding for roundoff at large coordinates.
			const sweptRadius = extent[index]!
			const reach = sweptRadius + 1e-12 * (Math.abs(body.px) + Math.abs(body.py) + Math.abs(body.pz) + sweptRadius)
			let planeCount = 0
			for(let k = 0; k < 5; k++) {
				if(k === body.portal) continue
				const distance = planeNX[k]! * body.px + planeNY[k]! * body.py + planeNZ[k]! * body.pz - planeD[k]!
				if(distance > reach) continue
				reachablePlanes[planeCount++] = k
			}
			if(planeCount === 0) continue
			const verts = body.worldVerts
			for(let v = 0; v < body.data.vertCount * 3; v += 3) {
				const x = verts[v]!, y = verts[v + 1]!, z = verts[v + 2]!
				const rx = x - body.px, ry = y - body.py, rz = z - body.pz
				// Only vertices that can reach a plane during this step become (speculative) contacts.
				const vx = body.vx + (body.wy * rz - body.wz * ry)
				const vy = body.vy + (body.wz * rx - body.wx * rz)
				const vz = body.vz + (body.wx * ry - body.wy * rx)
				for(let plane = 0; plane < planeCount; plane++) {
					const k = reachablePlanes[plane]!
					const nx = planeNX[k]!, ny = planeNY[k]!, nz = planeNZ[k]!
					const depth = planeD[k]! - (nx * x + ny * y + nz * z)
					const approach = -(nx * vx + ny * vy + nz * vz)
					const margin = (approach > 0 ? approach : 0) * dt + 0.002
					if(depth > -margin) addContact(body, null, x, y, z, nx, ny, nz, depth, planeMu[k]!, planeE[k]!, k < 4, index * 1024 + 1000 + k)
				}
			}
		}

		// Sweep and prune along x: a pair can only touch within both bodies' reach.
		for(let a = 1; a < count; a++) {
			const index = order[a]!, x = bodies[index]!.px
			let b = a - 1
			while(b >= 0 && bodies[order[b]!]!.px > x) {
				order[b + 1] = order[b]!
				b--
			}
			order[b + 1] = index
		}
		for(let a = 0; a < count; a++) {
			const i = order[a]!, A = bodies[i]!
			if(!A.released) continue
			const limit = A.px + extent[i]! + widest
			for(let b = a + 1; b < count; b++) {
				const j = order[b]!, B = bodies[j]!
				if(B.px > limit) break
				if(!B.released || (A.asleep && B.asleep)) continue
				const dx = A.px - B.px, dy = A.py - B.py, dz = A.pz - B.pz
				const rvx = A.vx - B.vx, rvy = A.vy - B.vy, rvz = A.vz - B.vz
				const margin = (Math.sqrt(rvx * rvx + rvy * rvy + rvz * rvz) + spinOf[i]! * A.data.radius + spinOf[j]! * B.data.radius) * dt + 0.005
				const reach = A.data.radius + B.data.radius + margin
				if(dx * dx + dy * dy + dz * dz > reach * reach) continue
				const lo = i < j ? i : j, hi = i < j ? j : i
				const before = contactCount
				collideHulls(bodies[lo]!, bodies[hi]!, options, margin)
				const key = lo * 1024 + hi
				for(let k = before; k < contactCount; k++) pool[k]!.key = key
			}
		}

		for(let n = 0; n < contactCount; n++) {
			const c = pool[n]!
			const a = c.a, b = c.b
			c.rax = c.px - a.px; c.ray = c.py - a.py; c.raz = c.pz - a.pz
			if(b) {
				c.rbx = c.px - b.px; c.rby = c.py - b.py; c.rbz = c.pz - b.pz
			}
			if(!permanentSleep && (a.asleep || b?.asleep)) {
				c.ima = a.invM; c.iia = a.invI; c.imb = b ? b.invM : 0; c.iib = b ? b.invI : 0
				relativeVelocity(c)
				if(-(RX * c.nx + RY * c.ny + RZ * c.nz) > WAKE_SPEED) {
					for(const body of [a, b]) if(body?.asleep && !body.fixed) {
						body.asleep = false
						body.quiet = 0
						body.anchor()
					}
				}
			}
			c.ima = a.asleep ? 0 : a.invM
			c.iia = a.asleep ? 0 : a.invI
			c.imb = !b || b.asleep ? 0 : b.invM
			c.iib = !b || b.asleep ? 0 : b.invI
			const nx = c.nx, ny = c.ny, nz = c.nz
			let tx: number, ty: number, tz: number
			if(Math.abs(nx) > 0.57) { tx = ny; ty = -nx; tz = 0 } else { tx = 0; ty = nz; tz = -ny }
			const tl = Math.sqrt(tx * tx + ty * ty + tz * tz)
			tx /= tl; ty /= tl; tz /= tl
			c.t1x = tx; c.t1y = ty; c.t1z = tz
			c.t2x = ny * tz - nz * ty; c.t2y = nz * tx - nx * tz; c.t2z = nx * ty - ny * tx
			c.mn = 1 / effectiveMass(c, nx, ny, nz)
			c.mt1 = 1 / effectiveMass(c, c.t1x, c.t1y, c.t1z)
			c.mt2 = 1 / effectiveMass(c, c.t2x, c.t2y, c.t2z)
			relativeVelocity(c)
			c.vn0 = RX * nx + RY * ny + RZ * nz
			// Separated by a gap: may approach only until touching this step.
			c.bias = c.depth < 0 ? c.depth / dt : 0
		}

		for(let iteration = 0; iteration < iterations; iteration++) for(let n = 0; n < contactCount; n++) {
			const c = pool[n]!
			relativeVelocity(c)
			const vn = RX * c.nx + RY * c.ny + RZ * c.nz
			let jn = c.jn + (c.bias - vn) * c.mn
			if(jn < 0) jn = 0
			const dn = jn - c.jn
			if(dn !== 0) applyImpulse(c, c.nx * dn, c.ny * dn, c.nz * dn)
			c.jn = jn
			const limit = c.mu * jn
			// A speculative contact without force has no friction to apply (every
			// impulse would be zero): most contacts of a pile, skipped exactly.
			if(limit === 0 && c.jt1 === 0 && c.jt2 === 0) continue
			relativeVelocity(c)
			let jt = c.jt1 - (RX * c.t1x + RY * c.t1y + RZ * c.t1z) * c.mt1
			jt = jt < -limit ? -limit : jt > limit ? limit : jt
			let dj = jt - c.jt1
			applyImpulse(c, c.t1x * dj, c.t1y * dj, c.t1z * dj)
			c.jt1 = jt
			relativeVelocity(c)
			jt = c.jt2 - (RX * c.t2x + RY * c.t2y + RZ * c.t2z) * c.mt2
			jt = jt < -limit ? -limit : jt > limit ? limit : jt
			dj = jt - c.jt2
			applyImpulse(c, c.t2x * dj, c.t2y * dj, c.t2z * dj)
			c.jt2 = jt
		}

		// Restitution after the solver, only where contact impulse happened.
		for(let iteration = 0; iteration < 4; iteration++) for(let n = 0; n < contactCount; n++) {
			const c = pool[n]!
			if(c.vn0 > -RESTITUTION_THRESHOLD || c.jn <= 0) continue
			relativeVelocity(c)
			const vn = RX * c.nx + RY * c.ny + RZ * c.nz
			let jn = c.jn + (-c.e * c.vn0 - vn) * c.mn
			if(jn < 0) jn = 0
			const dn = jn - c.jn
			applyImpulse(c, c.nx * dn, c.ny * dn, c.nz * dn)
			c.jn = jn
		}
		wallHits.clear()
		for(let n = 0; n < contactCount; n++) {
			const c = pool[n]!
			if(c.jn > 0) {
				c.a.touching = true
				if(c.b) c.b.touching = true
			}
			if(c.wall && c.jn > 0 && c.vn0 < -2) wallHits.add(c.key)
			// A hard landing on the table (one event per body and bounce).
			if(!c.b && !c.wall && c.jn > 0 && c.vn0 < -FLOOR_IMPACT_SPEED) {
				const last = floorImpacted.get(c.a.index)
				if(last === undefined || last < step - 10) markers.push({ step, type: 'impact', body: c.a.index, force: -c.vn0 * c.a.mass })
				floorImpacted.set(c.a.index, step)
			}
			// A dice impact is the bounce itself: impulse applied while approaching.
			// Speculative contacts bounce one step before touching, so this is the
			// only reliable place to observe it. One event per pair and episode.
			const b = c.b
			if(!b || c.jn <= 0 || c.vn0 > -0.6) continue
			const last = impacted.get(c.key)
			impacted.set(c.key, step)
			if(last !== undefined && last >= step - 6) continue
			stats.diceImpacts++
			markers.push({ step, type: 'collision', body: bodies.indexOf(c.a), other: bodies.indexOf(b), force: -c.vn0 * Math.min(c.a.mass, b.mass) })
		}
		stats.wallImpacts += wallHits.size

		// Position projection: removes penetration without injecting energy.
		deepest.clear()
		for(let n = 0; n < contactCount; n++) {
			const c = pool[n]!
			const entry = deepest.get(c.key)
			if(!entry || entry.depth < c.depth) deepest.set(c.key, c)
		}
		for(const c of deepest.values()) {
			const correction = (c.depth - SLOP) * POSITION_CORRECTION
			const total = c.ima + c.imb
			if(correction <= 0 || total <= 0) continue
			const sa = correction * c.ima / total
			c.a.px += c.nx * sa; c.a.py += c.ny * sa; c.a.pz += c.nz * sa
			if(c.b) {
				const sb = correction * c.imb / total
				c.b.px -= c.nx * sb; c.b.py -= c.ny * sb; c.b.pz -= c.nz * sb
			}
		}

		let done = true
		const linear = Math.max(0, 1 - options.linearDamping * dt)
		const angular = Math.max(0, 1 - options.angularDamping * dt)
		const rest = Math.max(0, 1 - REST_DAMPING * dt)
		for(let index = 0; index < count; index++) {
			const body = bodies[index]!
			if(!body.released) {
				done = false
				continue
			}
			if(body.asleep) continue
			body.vx *= linear; body.vy *= linear; body.vz *= linear
			body.wx *= angular; body.wy *= angular; body.wz *= angular
			if(step > body.overtimeStep) {
				const overtime = Math.max(0, 1 - Math.min(OVERTIME_DAMPING_MAX, (step - body.overtimeStep) * dt * OVERTIME_DAMPING) * dt)
				body.vx *= overtime; body.vz *= overtime
				if(body.vy > 0) body.vy *= overtime
				body.wx *= overtime; body.wy *= overtime; body.wz *= overtime
			}
			if(body.touching
				&& body.vx * body.vx + body.vy * body.vy + body.vz * body.vz < REST_LINEAR * REST_LINEAR
				&& body.wx * body.wx + body.wy * body.wy + body.wz * body.wz < REST_ANGULAR * REST_ANGULAR) {
				body.vx *= rest; body.vy *= rest; body.vz *= rest
				body.wx *= rest; body.wy *= rest; body.wz *= rest
			}
			body.px += body.vx * dt; body.py += body.vy * dt; body.pz += body.vz * dt
			const { wx, wy, wz, qx, qy, qz, qw } = body
			const h = 0.5 * dt
			let nx = qx + (qw * wx + wy * qz - wz * qy) * h
			let ny = qy + (qw * wy + wz * qx - wx * qz) * h
			let nz = qz + (qw * wz + wx * qy - wy * qx) * h
			let nw = qw + (-wx * qx - wy * qy - wz * qz) * h
			const l = Math.sqrt(nx * nx + ny * ny + nz * nz + nw * nw)
			nx /= l; ny /= l; nz /= l; nw /= l
			body.qx = nx; body.qy = ny; body.qz = nz; body.qw = nw
			body.worldStep = -1
			if(body.input.retoss) {
				if(body.liftoffStep < 0) {
					if(!body.touching) body.liftoffStep = step
				} else if(body.touchdownStep < 0 && body.touching) body.touchdownStep = step
			}
			const speed = body.vx * body.vx + body.vy * body.vy + body.vz * body.vz
			const spin = body.wx * body.wx + body.wy * body.wy + body.wz * body.wz
			let still = speed < MOVING_LINEAR * MOVING_LINEAR && spin < MOVING_ANGULAR * MOVING_ANGULAR
			if(still) {
				const dx = body.px - body.ax, dy = body.py - body.ay, dz = body.pz - body.az
				const q = body.qx * body.aqx + body.qy * body.aqy + body.qz * body.aqz + body.qw * body.aqw
				still = dx * dx + dy * dy + dz * dz < QUIET_DRIFT * QUIET_DRIFT && 1 - (q < 0 ? -q : q) < QUIET_TURN
			}
			if(still) body.quiet += dt
			else {
				body.quiet = 0
				body.anchor()
			}
			if(body.quiet > 0) body.updateWorld(step)
			// Resting on a face falls asleep quickly; a leaning body must stay still longer.
			const needed = body.quiet > 0 && body.readingAlignment() >= readyAlignment ? SLEEP_TIME : SLEEP_TIME * 4
			if(body.quiet >= needed) {
				body.asleep = true
				body.asleepSince = step
				body.vx = body.vy = body.vz = 0
				body.wx = body.wy = body.wz = 0
				if(!body.settledReported) {
					body.settledReported = true
					markers.push({ step, type: 'settle', body: index })
				}
			} else done = false
		}
		if(step % recordEvery === recordEvery - 1) record()
		if(done) {
			finished = true
			break
		}
		yield
	}
	record()
	// The pool outlives this call; do not keep the finished bodies alive.
	for(let n = 0; n < pool.length; n++) pool[n]!.b = null
	contactCount = 0

	const visualOffsets: Quat[] = []
	const remapWindows: Array<readonly [number, number] | null> = []
	const landed: Array<{ value: number | null; alignment: number; readable: boolean }> = []
	const lastFrame = frames.length - 1
	let clean = finished
	for(const body of bodies) {
		const orientation: Quat = [body.qx, body.qy, body.qz, body.qw]
		const reading = readFace(body.input.shape, orientation)
		if(body.fixed) {
			visualOffsets.push([0, 0, 0, 1])
			remapWindows.push(null)
			landed.push({ value: reading.face.value, alignment: reading.alignment, readable: true })
			continue
		}
		const target = findFace(body.input.shape, body.input.value)
		const offset = target && reading.face.value !== null
			? chooseSymmetry(body.input.shape, orientation, target, reading.face, body.input.readUp ?? target.readUp)
			: null
		visualOffsets.push(offset ?? [0, 0, 0, 1])
		if(body.input.retoss) {
			const start = body.liftoffStep < 0 ? 0 : Math.floor(body.liftoffStep / recordEvery) + 1
			const end = body.touchdownStep < 0 ? lastFrame : Math.max(start + 1, Math.floor(body.touchdownStep / recordEvery) - 1)
			remapWindows.push([start, Math.min(lastFrame, end)])
		} else remapWindows.push(null)
		const inside = Math.abs(body.px) <= W + 0.05 && Math.abs(body.pz) <= D + 0.05
		const readable = Boolean(offset) && reading.alignment >= readyAlignment && inside && body.released
		landed.push({ value: reading.face.value, alignment: reading.alignment, readable })
		if(!readable) clean = false
	}

	// Frame k holds the state after step k·recordEvery − 1: the first frame that
	// already contains a body released at step s is ceil((s + 1) / recordEvery).
	// (One frame earlier, an explosion child would still sit at its parking spot.)
	const releaseFrames = bodies.map(body => Number.isFinite(body.releaseStep) ? Math.min(lastFrame, Math.ceil((body.releaseStep + 1) / recordEvery)) : Infinity)
	return {
		frames,
		fps: 1 / (dt * recordEvery),
		bodyCount: count,
		releaseFrames,
		visualOffsets,
		remapWindows,
		births: bodies.map((body, index) => body.birth ? { frame: releaseFrames[index]!, from: body.birth } : null),
		landed,
		markers: markers.map(({ step, ...marker }) => ({ ...marker, frame: Math.floor(step / recordEvery) })),
		durationSeconds: stats.steps * dt,
		clean,
		stats
	}
}

function collideHulls(A: Body, B: Body, options: SimulationOptions, margin: number): void {
	const da = A.data, db = B.data
	const va = A.worldVerts, vb = B.worldVerts
	let bestFace = Infinity, faceOwner = 0, faceIndex = -1
	for(let f = 0; f < da.faceCount; f++) {
		const i = f * 3
		const nx = A.worldNormals[i]!, ny = A.worldNormals[i + 1]!, nz = A.worldNormals[i + 2]!
		const overlap = A.worldOffsets[f]! - minProjection(vb, db.vertCount, nx, ny, nz)
		if(overlap < -margin) return
		if(overlap < bestFace) {
			bestFace = overlap
			faceOwner = 0
			faceIndex = f
		}
	}
	for(let f = 0; f < db.faceCount; f++) {
		const i = f * 3
		const nx = B.worldNormals[i]!, ny = B.worldNormals[i + 1]!, nz = B.worldNormals[i + 2]!
		const overlap = B.worldOffsets[f]! - minProjection(va, da.vertCount, nx, ny, nz)
		if(overlap < -margin) return
		if(overlap < bestFace - 0.002) {
			bestFace = overlap
			faceOwner = 1
			faceIndex = f
		}
	}
	let bestEdge = Infinity, ex = 0, ey = 0, ez = 0, edgeA = -1, edgeB = -1
	const cdx = A.px - B.px, cdy = A.py - B.py, cdz = A.pz - B.pz
	for(let i = 0; i < da.dirCount; i++) {
		const ax = A.worldDirs[i * 3]!, ay = A.worldDirs[i * 3 + 1]!, az = A.worldDirs[i * 3 + 2]!
		for(let j = 0; j < db.dirCount; j++) {
			const bx = B.worldDirs[j * 3]!, by = B.worldDirs[j * 3 + 1]!, bz = B.worldDirs[j * 3 + 2]!
			let nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx
			const l2 = nx * nx + ny * ny + nz * nz
			if(l2 < 1e-6) continue
			const inv = 1 / Math.sqrt(l2)
			nx *= inv; ny *= inv; nz *= inv
			if(nx * cdx + ny * cdy + nz * cdz < 0) { nx = -nx; ny = -ny; nz = -nz }
			const overlap = maxProjection(vb, db.vertCount, nx, ny, nz) - minProjection(va, da.vertCount, nx, ny, nz)
			if(overlap < -margin) return
			if(overlap < bestEdge) {
				bestEdge = overlap
				ex = nx; ey = ny; ez = nz
				edgeA = i
				edgeB = j
			}
		}
	}

	// Faces give a stable manifold; an edge axis wins only when clearly smaller.
	if(edgeA >= 0 && bestEdge < bestFace - 0.01) {
		// Deepest edge of each body along the axis (A lies on +axis, B on -axis).
		let aI = -1, aJ = -1, aScore = Infinity
		for(let e = 0; e < da.edgeCount; e++) {
			if(da.edges[e * 3 + 2] !== edgeA) continue
			const i = da.edges[e * 3]! * 3, j = da.edges[e * 3 + 1]! * 3
			const s = ex * (va[i]! + va[j]!) + ey * (va[i + 1]! + va[j + 1]!) + ez * (va[i + 2]! + va[j + 2]!)
			if(s < aScore) { aScore = s; aI = i; aJ = j }
		}
		let bI = -1, bJ = -1, bScore = Infinity
		for(let e = 0; e < db.edgeCount; e++) {
			if(db.edges[e * 3 + 2] !== edgeB) continue
			const i = db.edges[e * 3]! * 3, j = db.edges[e * 3 + 1]! * 3
			const s = -(ex * (vb[i]! + vb[j]!) + ey * (vb[i + 1]! + vb[j + 1]!) + ez * (vb[i + 2]! + vb[j + 2]!))
			if(s < bScore) { bScore = s; bI = i; bJ = j }
		}
		if(aI < 0 || bI < 0) return
		// Closest points between segments (Ericson).
		const p1x = va[aI]!, p1y = va[aI + 1]!, p1z = va[aI + 2]!
		const d1x = va[aJ]! - p1x, d1y = va[aJ + 1]! - p1y, d1z = va[aJ + 2]! - p1z
		const p2x = vb[bI]!, p2y = vb[bI + 1]!, p2z = vb[bI + 2]!
		const d2x = vb[bJ]! - p2x, d2y = vb[bJ + 1]! - p2y, d2z = vb[bJ + 2]! - p2z
		const rx = p1x - p2x, ry = p1y - p2y, rz = p1z - p2z
		const a = d1x * d1x + d1y * d1y + d1z * d1z, e = d2x * d2x + d2y * d2y + d2z * d2z
		const f = d2x * rx + d2y * ry + d2z * rz, c = d1x * rx + d1y * ry + d1z * rz, b = d1x * d2x + d1y * d2y + d1z * d2z
		const denominator = a * e - b * b
		let s = denominator > 1e-12 ? Math.min(1, Math.max(0, (b * f - c * e) / denominator)) : 0
		let t = e > 1e-12 ? (b * s + f) / e : 0
		if(t < 0) {
			t = 0
			s = a > 1e-12 ? Math.min(1, Math.max(0, -c / a)) : 0
		} else if(t > 1) {
			t = 1
			s = a > 1e-12 ? Math.min(1, Math.max(0, (b - c) / a)) : 0
		}
		const cx = (p1x + d1x * s + p2x + d2x * t) * 0.5
		const cy = (p1y + d1y * s + p2y + d2y * t) * 0.5
		const cz = (p1z + d1z * s + p2z + d2z * t) * 0.5
		addContact(A, B, cx, cy, cz, ex, ey, ez, bestEdge, options.diceFriction, options.diceRestitution, false, 0)
		return
	}

	const ref = faceOwner === 0 ? A : B, inc = faceOwner === 0 ? B : A
	const rd = ref.data, id = inc.data
	const rn = faceIndex * 3
	const rnx = ref.worldNormals[rn]!, rny = ref.worldNormals[rn + 1]!, rnz = ref.worldNormals[rn + 2]!
	let incident = 0, lowest = Infinity
	for(let f = 0; f < id.faceCount; f++) {
		const d = inc.worldNormals[f * 3]! * rnx + inc.worldNormals[f * 3 + 1]! * rny + inc.worldNormals[f * 3 + 2]! * rnz
		if(d < lowest) { lowest = d; incident = f }
	}
	// Incident polygon, clipped by the side planes of the reference face.
	let input = polygonA, output = polygonB
	let size = id.faceSize[incident]!
	const incidentStart = id.faceStart[incident]!
	for(let k = 0; k < size; k++) {
		const v = id.members[incidentStart + k]! * 3
		input[k * 3] = inc.worldVerts[v]!; input[k * 3 + 1] = inc.worldVerts[v + 1]!; input[k * 3 + 2] = inc.worldVerts[v + 2]!
	}
	const refStart = rd.faceStart[faceIndex]!, refSize = rd.faceSize[faceIndex]!
	const rv = ref.worldVerts
	for(let k = 0; k < refSize && size > 0; k++) {
		const v0 = rd.members[refStart + k]! * 3, v1 = rd.members[refStart + (k + 1) % refSize]! * 3
		const ex0 = rv[v1]! - rv[v0]!, ey0 = rv[v1 + 1]! - rv[v0 + 1]!, ez0 = rv[v1 + 2]! - rv[v0 + 2]!
		const sx = ey0 * rnz - ez0 * rny, sy = ez0 * rnx - ex0 * rnz, sz = ex0 * rny - ey0 * rnx
		const offset = sx * rv[v0]! + sy * rv[v0 + 1]! + sz * rv[v0 + 2]!
		let out = 0
		for(let p = 0; p < size; p++) {
			const q = (p + 1) % size
			const ax = input[p * 3]!, ay = input[p * 3 + 1]!, az = input[p * 3 + 2]!
			const bx = input[q * 3]!, by = input[q * 3 + 1]!, bz = input[q * 3 + 2]!
			const da0 = sx * ax + sy * ay + sz * az - offset
			const db0 = sx * bx + sy * by + sz * bz - offset
			if(da0 <= 0 && out < 128) {
				output[out * 3] = ax; output[out * 3 + 1] = ay; output[out * 3 + 2] = az
				out++
			}
			if((da0 <= 0) !== (db0 <= 0) && out < 128) {
				const t = da0 / (da0 - db0)
				output[out * 3] = ax + (bx - ax) * t; output[out * 3 + 1] = ay + (by - ay) * t; output[out * 3 + 2] = az + (bz - az) * t
				out++
			}
		}
		const swap = input
		input = output
		output = swap
		size = out
	}
	const refOffset = rnx * rv[rd.members[refStart]! * 3]! + rny * rv[rd.members[refStart]! * 3 + 1]! + rnz * rv[rd.members[refStart]! * 3 + 2]!
	// Contact normal points from B towards A.
	const sign = faceOwner === 0 ? -1 : 1
	for(let p = 0; p < size; p++) {
		const x = input[p * 3]!, y = input[p * 3 + 1]!, z = input[p * 3 + 2]!
		const depth = refOffset - (rnx * x + rny * y + rnz * z)
		if(depth <= -margin - 0.002) continue
		const h = depth * 0.5
		addContact(A, B, x + rnx * h, y + rny * h, z + rnz * h, rnx * sign, rny * sign, rnz * sign, depth, options.diceFriction, options.diceRestitution, false, 0)
	}
}

/** Penetration depth between two posed shapes (negative when separated). */
export const pairDepth = (
	a: { readonly shape: DiceShape; readonly p: ReadonlyVec3; readonly q: ReadonlyQuat },
	b: { readonly shape: DiceShape; readonly p: ReadonlyVec3; readonly q: ReadonlyQuat }
): number => {
	const hull = (body: typeof a): { verts: Vec3[]; normals: Vec3[]; dirs: Vec3[] } => ({
		verts: body.shape.verts.map(v => add(qrot(body.q, v), body.p)),
		normals: body.shape.faces.map(face => qrot(body.q, face.normal)),
		dirs: body.shape.edgeDirs.map(dir => qrot(body.q, dir))
	})
	const projectAll = (verts: readonly Vec3[], axis: Vec3): [number, number] => {
		let min = Infinity, max = -Infinity
		for(const v of verts) {
			const d = dot(v, axis)
			if(d < min) min = d
			if(d > max) max = d
		}
		return [min, max]
	}
	const wa = hull(a), wb = hull(b)
	let depth = Infinity
	a.shape.faces.forEach((face, i) => {
		const n = wa.normals[i]!
		depth = Math.min(depth, dot(n, a.p) + face.d - projectAll(wb.verts, n)[0])
	})
	b.shape.faces.forEach((face, i) => {
		const n = wb.normals[i]!
		depth = Math.min(depth, dot(n, b.p) + face.d - projectAll(wa.verts, n)[0])
	})
	const delta = sub(a.p, b.p)
	for(const ea of wa.dirs) for(const eb of wb.dirs) {
		let axis = cross(ea, eb)
		const l2 = dot(axis, axis)
		if(l2 < 1e-6) continue
		axis = scale(axis, 1 / Math.sqrt(l2))
		if(dot(axis, delta) < 0) axis = scale(axis, -1)
		depth = Math.min(depth, projectAll(wb.verts, axis)[1] - projectAll(wa.verts, axis)[0])
	}
	return depth
}
