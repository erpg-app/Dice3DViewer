import { createSeededRandom, type SeededRandom } from '../random'
import { parseParticleColor } from '../particleOptions'
import type { ParticleEffectDefinition, ParticleEmitterOptions } from '../types'
import type { ReadonlyVec3 } from '../engine/vector'

export { customizeEffect } from './particleCustomize'
export { ParticleAtlas, PARTICLE_ATLAS_SLOTS } from './particleAtlas'
export { PARTICLE_FRAGMENT, PARTICLE_VERTEX } from './particleShaders'

/** Particles alive at once; a burst beyond this recycles random live particles. */
export const PARTICLE_CAPACITY = 4000
/** Floats per particle in a render batch: x, y, z, size, premultiplied r, g, b, a, shape, angle. */
export const PARTICLE_STRIDE = 10

export type ParticleBurst = 'impact' | 'collision' | 'settle' | 'explode' | 'critical'

/** The die behind an emission, checked against the emitter's `when` sides and faces. */
export interface ParticleSubject {
	readonly sides: number
	readonly value: number
}

export interface BurstOptions {
	/** Multiplies the amount (hit strength). Default `1`. */
	readonly strength?: number
	/** Die (or dice, any of them may match) behind the burst. */
	readonly subject?: ParticleSubject | readonly ParticleSubject[]
	/** Hit force, for `minForce`. */
	readonly force?: number
	/** Identity of the die, for `cooldown`. */
	readonly key?: object
	/** Plays regardless of the emitter conditions (manual trigger). */
	readonly always?: boolean
}

const matchesFace = (faces: 'max' | 'min' | readonly number[], subject: ParticleSubject): boolean =>
	faces === 'max' ? subject.value === subject.sides : faces === 'min' ? subject.value === 1 : faces.includes(subject.value)

/** 0 up, 1 out, 2 sphere, 3 back. */
type Direction = 0 | 1 | 2 | 3

interface Emitter {
	readonly options: ParticleEmitterOptions
	/** RGBA per color stop. */
	readonly stops: Float32Array
	/** RGB per palette color (empty = colors come from the stops). */
	readonly palette: Float32Array
	readonly additive: boolean
	readonly direction: Direction
	readonly gravity: number
	readonly drag: number
	readonly swirl: number
	readonly grow: number
	readonly flicker: number
	/** Sprite index understood by the particle shader (an image is 16 + its atlas slot). */
	readonly shape: number
	readonly orient: Orientation
	readonly spin: number
}

/** A link particle spans the gap between two dice along this angle. */
interface Span {
	readonly gap: number
	readonly angle: number
}

const NO_MOTION: ReadonlyVec3 = [0, 0, 0]

/** 0 random, 1 upright, 2 along the motion. */
type Orientation = 0 | 1 | 2

const DIRECTIONS: Readonly<Record<string, Direction>> = { up: 0, out: 1, sphere: 2, back: 3 }
const ORIENTATIONS: Readonly<Record<string, Orientation>> = { random: 0, upright: 1, motion: 2 }
const UPRIGHT = 1
const MOTION = 2
/** Sprite indices of the particle shader. */
export const SHAPES: Readonly<Record<string, number>> = {
	soft: 0, spark: 1, star: 2, ring: 3, confetti: 4, smoke: 5,
	bolt: 6, arc: 7, flame: 8, snowflake: 9, heart: 10, diamond: 11, triangle: 12, cross: 13
}
/** Shader index of the first image of the atlas. */
export const IMAGE_SHAPE_BASE = 16
/** Shapes that point along their motion unless told otherwise. */
const MOTION_SHAPES: ReadonlySet<string> = new Set(['spark', 'bolt'])
/** Sprite space x points up the screen at this angle (shader `q`, world z grows down the screen). */
const UP_ANGLE = -Math.PI / 2

export interface ParticleBatches {
	readonly additive: Float32Array
	readonly additiveCount: number
	readonly alpha: Float32Array
	readonly alphaCount: number
}

/**
 * CPU particle system for dice effects: struct-of-arrays storage, no
 * allocation per frame, emitters built from declarative definitions.
 * Purely cosmetic, but seeded, so a presentation looks the same every time.
 */
export class ParticleSystem {
	#count = 0
	readonly #px = new Float32Array(PARTICLE_CAPACITY)
	readonly #py = new Float32Array(PARTICLE_CAPACITY)
	readonly #pz = new Float32Array(PARTICLE_CAPACITY)
	readonly #vx = new Float32Array(PARTICLE_CAPACITY)
	readonly #vy = new Float32Array(PARTICLE_CAPACITY)
	readonly #vz = new Float32Array(PARTICLE_CAPACITY)
	readonly #age = new Float32Array(PARTICLE_CAPACITY)
	readonly #life = new Float32Array(PARTICLE_CAPACITY)
	readonly #size = new Float32Array(PARTICLE_CAPACITY)
	readonly #phase = new Float32Array(PARTICLE_CAPACITY)
	readonly #angle = new Float32Array(PARTICLE_CAPACITY)
	readonly #spin = new Float32Array(PARTICLE_CAPACITY)
	/** Palette color of each particle (RGB). */
	readonly #tint = new Float32Array(PARTICLE_CAPACITY * 3)
	readonly #emitterOf = new Uint16Array(PARTICLE_CAPACITY)
	readonly #emitters: Emitter[] = []
	readonly #registry = new Map<ParticleEmitterOptions, number>()
	readonly #debt = new WeakMap<object, number>()
	readonly #groundDebt = new WeakMap<object, number>()
	readonly #additive = new Float32Array(PARTICLE_CAPACITY * PARTICLE_STRIDE)
	readonly #alpha = new Float32Array(PARTICLE_CAPACITY * PARTICLE_STRIDE)
	/** Alpha-blended particles of the frame, drawn from the lowest (farthest from the camera) up. */
	readonly #alphaOrder = new Uint32Array(PARTICLE_CAPACITY)
	readonly #byHeight = (a: number, b: number): number => this.#py[a]! - this.#py[b]!
	#random: SeededRandom = createSeededRandom('particles')
	#effect: ParticleEffectDefinition | null = null
	#intensity = 1
	/** Seconds of particle time (advanced by `update`), for cooldowns. */
	#time = 0
	/** Last burst time per die and emitter (`when.cooldown`). */
	#lastBurst = new WeakMap<object, Map<ParticleEmitterOptions, number>>()
	/** Continuous moments draw `when.chance` once per die and roll. */
	#lottery = new WeakMap<object, Map<ParticleEmitterOptions, boolean>>()
	/** Atlas slot of an emitter image (-1 when the atlas is full or absent). */
	readonly #imageSlot: ((url: string) => number) | undefined

	constructor(imageSlot?: (url: string) => number) {
		this.#imageSlot = imageSlot
	}

	get count(): number {
		return this.#count
	}

	/** Seconds an aura lasts after a die rests (0 without an aura). */
	get auraSeconds(): number {
		return this.#effect?.aura ? Math.max(0, this.#effect.auraSeconds ?? 2.5) : 0
	}

	/** Seconds links keep going after the dice rest (0 without links). */
	get linkSeconds(): number {
		return this.#effect?.link ? Math.max(0, this.#effect.linkSeconds ?? 2) : 0
	}

	get hasLink(): boolean {
		return Boolean(this.#effect?.link)
	}

	get hasTrail(): boolean {
		return Boolean(this.#effect?.trail || this.#effect?.ground)
	}

	/** Effect for the next emissions; live particles keep the emitter they were born with. */
	configure(effect: ParticleEffectDefinition | null, intensity: number, seed: string): void {
		this.#effect = effect
		this.#intensity = Math.max(0, intensity)
		this.#random = createSeededRandom(`${seed}:particles`)
		this.#lottery = new WeakMap()
		if(this.#count === 0 && this.#emitters.length > 48) {
			this.#emitters.length = 0
			this.#registry.clear()
		}
	}

	clear(): void {
		this.#count = 0
	}

	/** Continuous emission while a die travels, proportional to its speed (full rate at 6 units/s). */
	trail(key: object, position: ReadonlyVec3, velocity: ReadonlyVec3, dt: number, radius: number, subject?: ParticleSubject): void {
		const options = this.#effect?.trail
		if(!options || dt <= 0) return
		const speed = Math.sqrt(velocity[0] * velocity[0] + velocity[1] * velocity[1] + velocity[2] * velocity[2])
		if(!this.#allows(options, subject, key, undefined, speed, true)) return
		this.#stream(this.#debt, key, options, options.amount * this.#intensity * Math.min(1.5, speed / 6) * dt, position, velocity, radius * 0.55)
	}

	/** Marks on the table while a die rolls near it: `amount` per unit of distance. */
	ground(key: object, position: ReadonlyVec3, velocity: ReadonlyVec3, dt: number, radius: number, subject?: ParticleSubject): void {
		const options = this.#effect?.ground
		if(!options || dt <= 0) return
		const speed = Math.sqrt(velocity[0] * velocity[0] + velocity[2] * velocity[2])
		if(!this.#allows(options, subject, key, undefined, speed, true)) return
		this.#stream(this.#groundDebt, key, options, options.amount * this.#intensity * (speed * dt), [position[0], 0.012, position[2]], velocity, radius * 0.3, true)
	}

	/** Emission around a resting die; `fade` goes from 1 to 0 over `auraSeconds`. `always` skips the conditions. */
	aura(key: object, position: ReadonlyVec3, dt: number, radius: number, fade: number, subject?: ParticleSubject, always = false): void {
		const options = this.#effect?.aura
		if(!options || dt <= 0 || fade <= 0) return
		if(!always && !this.#allows(options, subject, key, undefined, undefined, true)) return
		this.#stream(this.#debt, key, options, options.amount * this.#intensity * fade * dt, position, [0, 0, 0], radius * 0.6)
	}

	/**
	 * Energy between two dice: particles at the middle of the pair, turned
	 * along it and sized to the gap. `fade` goes from 1 to 0 after the dice rest.
	 */
	link(key: object, a: ReadonlyVec3, b: ReadonlyVec3, dt: number, fade: number, subjects?: readonly ParticleSubject[]): void {
		const options = this.#effect?.link
		if(!options || dt <= 0 || fade <= 0) return
		const dx = b[0] - a[0], dz = b[2] - a[2]
		const gap = Math.sqrt(dx * dx + dz * dz)
		if(gap < 1e-3 || gap > Math.max(0, this.#effect?.linkDistance ?? 5)) return
		if(!this.#allows(options, subjects, key, undefined, undefined, true)) return
		const middle: ReadonlyVec3 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2]
		this.#stream(this.#debt, key, options, options.amount * this.#intensity * fade * dt, middle, NO_MOTION, 0, false, { gap, angle: Math.atan2(dz, dx) })
	}

	burst(kind: ParticleBurst, position: ReadonlyVec3, radius: number, burst: BurstOptions = {}): void {
		const options = this.#effect?.[kind]
		if(!options) return
		if(!burst.always && !this.#allows(options, burst.subject, burst.key, burst.force, undefined, false)) return
		const count = Math.round(options.amount * this.#intensity * Math.max(0, burst.strength ?? 1))
		if(count > 0) this.#emit(this.#register(options), count, position, [0, 0, 0], radius * (kind === 'impact' || kind === 'collision' ? 0.35 : 0.5), false)
	}

	/** Checks an emitter's `when` conditions; a cooldown is consumed only when the burst plays. */
	#allows(options: ParticleEmitterOptions, subject: ParticleSubject | readonly ParticleSubject[] | undefined, key: object | undefined, force: number | undefined, speed: number | undefined, continuous: boolean): boolean {
		const when = options.when
		if(!when) return true
		if(when.minForce !== undefined && force !== undefined && force < when.minForce) return false
		if(when.minSpeed !== undefined && speed !== undefined && speed < when.minSpeed) return false
		if(subject && (when.sides || when.faces !== undefined)) {
			const subjects = 'sides' in subject ? [subject as ParticleSubject] : subject as readonly ParticleSubject[]
			const faces = when.faces
			if(!subjects.some(die => (!when.sides || when.sides.includes(die.sides)) && (faces === undefined || matchesFace(faces, die)))) return false
		}
		if(when.chance !== undefined && when.chance < 1) {
			if(continuous && key) {
				let draws = this.#lottery.get(key)
				if(!draws) this.#lottery.set(key, draws = new Map())
				let won = draws.get(options)
				if(won === undefined) draws.set(options, won = this.#random.next() < when.chance)
				if(!won) return false
			} else if(this.#random.next() >= when.chance) return false
		}
		if(when.cooldown && key && !continuous) {
			let marks = this.#lastBurst.get(key)
			if(!marks) this.#lastBurst.set(key, marks = new Map())
			const last = marks.get(options)
			if(last !== undefined && this.#time - last < when.cooldown) return false
			marks.set(options, this.#time)
		}
		return true
	}

	update(dt: number): void {
		if(dt <= 0) return
		this.#time += dt
		for(let i = 0; i < this.#count; i++) {
			const age = this.#age[i]! + dt
			if(age >= this.#life[i]!) {
				this.#move(this.#count - 1, i)
				this.#count--
				i--
				continue
			}
			this.#age[i] = age
			const emitter = this.#emitters[this.#emitterOf[i]!]!
			let vx = this.#vx[i]!, vy = this.#vy[i]! - emitter.gravity * dt, vz = this.#vz[i]!
			if(emitter.drag > 0) {
				const keep = Math.max(0, 1 - emitter.drag * dt)
				vx *= keep; vy *= keep; vz *= keep
			}
			if(emitter.swirl !== 0) {
				const angle = emitter.swirl * dt, cos = Math.cos(angle), sin = Math.sin(angle)
				const x = vx * cos - vz * sin
				vz = vx * sin + vz * cos
				vx = x
			}
			let y = this.#py[i]! + vy * dt
			if(y < 0.012) {
				// Particles settle on the table instead of sinking through it.
				y = 0.012
				if(vy < 0) vy *= -0.25
				vx *= 0.7
				vz *= 0.7
			}
			this.#px[i] = this.#px[i]! + vx * dt
			this.#py[i] = y
			this.#pz[i] = this.#pz[i]! + vz * dt
			this.#vx[i] = vx; this.#vy[i] = vy; this.#vz[i] = vz
			// Sparks and bolts stretch along their motion (screen x = world x, sprite y = world z).
			if(emitter.orient === MOTION && vx * vx + vz * vz > 0.0025) this.#angle[i] = Math.atan2(vz, vx)
			else this.#angle[i] = this.#angle[i]! + this.#spin[i]! * dt
		}
	}

	/** Writes the render batches: additive glow, and alpha-blended smoke sorted far to near. */
	build(): ParticleBatches {
		let additiveCount = 0, alphaCount = 0, alphaIndices = 0
		for(let i = 0; i < this.#count; i++) {
			const emitter = this.#emitters[this.#emitterOf[i]!]!
			if(!emitter.additive) this.#alphaOrder[alphaIndices++] = i
			else if(this.#write(this.#additive, additiveCount * PARTICLE_STRIDE, i, emitter)) additiveCount++
		}
		// The camera looks down, so the lowest particles are the farthest.
		if(alphaIndices > 1) this.#alphaOrder.subarray(0, alphaIndices).sort(this.#byHeight)
		for(let k = 0; k < alphaIndices; k++) {
			const i = this.#alphaOrder[k]!
			if(this.#write(this.#alpha, alphaCount * PARTICLE_STRIDE, i, this.#emitters[this.#emitterOf[i]!]!)) alphaCount++
		}
		return { additive: this.#additive, additiveCount, alpha: this.#alpha, alphaCount }
	}

	/** One particle of a batch at `offset`; false when it is invisible this frame. */
	#write(target: Float32Array, offset: number, i: number, emitter: Emitter): boolean {
		const t = this.#age[i]! / this.#life[i]!
		const stops = emitter.stops, segments = stops.length / 4 - 1
		const position = t * segments
		const index = Math.min(segments - 1, Math.floor(position)), frac = segments > 0 ? position - index : 0
		const o0 = Math.max(0, index) * 4, o1 = Math.min(segments, index + 1) * 4
		let a = stops[o0 + 3]! + (stops[o1 + 3]! - stops[o0 + 3]!) * frac
		a *= Math.min(1, t / 0.06)
		if(emitter.flicker > 0) a *= 1 - emitter.flicker * 0.5 * (1 + Math.sin(this.#age[i]! * 26 + this.#phase[i]!))
		if(a <= 0.004) return false
		let r: number, g: number, b: number
		if(emitter.palette.length) {
			r = this.#tint[i * 3]!; g = this.#tint[i * 3 + 1]!; b = this.#tint[i * 3 + 2]!
		} else {
			r = stops[o0]! + (stops[o1]! - stops[o0]!) * frac
			g = stops[o0 + 1]! + (stops[o1 + 1]! - stops[o0 + 1]!) * frac
			b = stops[o0 + 2]! + (stops[o1 + 2]! - stops[o0 + 2]!) * frac
		}
		target[offset] = this.#px[i]!
		target[offset + 1] = this.#py[i]!
		target[offset + 2] = this.#pz[i]!
		target[offset + 3] = this.#size[i]! * (1 + (emitter.grow - 1) * t)
		target[offset + 4] = r * a
		target[offset + 5] = g * a
		target[offset + 6] = b * a
		target[offset + 7] = a
		target[offset + 8] = emitter.shape
		target[offset + 9] = this.#angle[i]!
		return true
	}

	#stream(debts: WeakMap<object, number>, key: object, options: ParticleEmitterOptions, amount: number, position: ReadonlyVec3, velocity: ReadonlyVec3, radius: number, flat = false, span?: Span): void {
		const debt = (debts.get(key) ?? 0) + amount
		const count = Math.floor(debt)
		debts.set(key, debt - count)
		if(count > 0) this.#emit(this.#register(options), count, position, velocity, radius, flat, span)
	}

	#register(options: ParticleEmitterOptions): number {
		const known = this.#registry.get(options)
		// An image may have lost its atlas cell to the images of a later effect.
		if(known !== undefined && (!options.image || this.#emitters[known]!.shape === this.#imageShape(options.image))) return known
		const colors = options.colors.map(color => parseParticleColor(color) ?? [1, 1, 1, 1])
		const palette = (options.palette ?? []).map(color => parseParticleColor(color) ?? [1, 1, 1, 1])
		const shapeName = options.shape ?? 'soft'
		const emitter: Emitter = {
			options,
			stops: Float32Array.from(colors.length > 1 ? colors.flat() : [...colors[0]!, ...colors[0]!]),
			palette: Float32Array.from(palette.flatMap(color => [color[0], color[1], color[2]])),
			additive: (options.blend ?? 'add') === 'add',
			direction: DIRECTIONS[options.direction ?? 'sphere'] ?? 2,
			gravity: options.gravity ?? 0,
			drag: options.drag ?? 0,
			swirl: options.swirl ?? 0,
			grow: options.grow ?? 0.3,
			flicker: options.flicker ?? 0,
			shape: options.image ? this.#imageShape(options.image) : SHAPES[shapeName] ?? 0,
			orient: ORIENTATIONS[options.orient ?? (!options.image && MOTION_SHAPES.has(shapeName) ? 'motion' : 'random')] ?? 0,
			spin: options.spin ?? 0
		}
		this.#emitters.push(emitter)
		this.#registry.set(options, this.#emitters.length - 1)
		return this.#emitters.length - 1
	}

	/** Shader index of an image (a soft glow without an atlas cell). */
	#imageShape(url: string): number {
		const slot = this.#imageSlot?.(url) ?? -1
		return slot >= 0 ? IMAGE_SHAPE_BASE + slot : 0
	}

	/** `flat` spreads the particles on the table (ground marks) instead of around a point. */
	#emit(emitterIndex: number, count: number, position: ReadonlyVec3, source: ReadonlyVec3, radius: number, flat: boolean, span?: Span): void {
		const emitter = this.#emitters[emitterIndex]!
		const options = emitter.options
		const random = this.#random
		const sourceSpeed = Math.sqrt(source[0] * source[0] + source[1] * source[1] + source[2] * source[2])
		const paletteSize = emitter.palette.length / 3
		for(let n = 0; n < count; n++) {
			let i = this.#count
			if(i < PARTICLE_CAPACITY) this.#count++
			else i = Math.floor(random.next() * PARTICLE_CAPACITY)
			this.#px[i] = position[0] + (random.next() * 2 - 1) * radius
			this.#py[i] = flat ? position[1] : Math.max(0.012, position[1] + (random.next() * 2 - 1) * radius)
			this.#pz[i] = position[2] + (random.next() * 2 - 1) * radius
			const speed = random.range(options.speed[0], options.speed[1])
			let vx: number, vy: number, vz: number
			const heading = random.next() * Math.PI * 2
			if(emitter.direction === 0) {
				const spread = speed * 0.45 * random.next()
				vx = Math.cos(heading) * spread
				vz = Math.sin(heading) * spread
				vy = speed * (0.6 + 0.4 * random.next())
			} else if(emitter.direction === 1) {
				vx = Math.cos(heading) * speed
				vz = Math.sin(heading) * speed
				vy = speed * 0.25 * random.next()
			} else if(emitter.direction === 3 && sourceSpeed > 1e-3) {
				vx = -source[0] / sourceSpeed * speed + Math.cos(heading) * speed * 0.35
				vy = -source[1] / sourceSpeed * speed + (random.next() * 2 - 1) * speed * 0.35
				vz = -source[2] / sourceSpeed * speed + Math.sin(heading) * speed * 0.35
			} else {
				const z = random.next() * 2 - 1, ring = Math.sqrt(1 - z * z)
				vx = Math.cos(heading) * ring * speed
				vy = z * speed
				vz = Math.sin(heading) * ring * speed
			}
			if(flat) vy = 0
			this.#vx[i] = vx; this.#vy[i] = vy; this.#vz[i] = vz
			this.#age[i] = 0
			this.#life[i] = random.range(options.life[0], options.life[1])
			this.#size[i] = random.range(options.size[0], options.size[1])
			this.#phase[i] = random.next() * Math.PI * 2
			const turn = random.next() * Math.PI * 2
			this.#angle[i] = emitter.orient === UPRIGHT ? UP_ANGLE
				: emitter.orient === MOTION && vx * vx + vz * vz > 0.0025 ? Math.atan2(vz, vx)
				: turn
			this.#spin[i] = emitter.spin * (0.5 + random.next()) * (random.next() < 0.5 ? -1 : 1)
			if(span) {
				// Links: as long as the gap between the dice, pointing either way along it.
				this.#size[i] = this.#size[i]! * span.gap
				this.#angle[i] = span.angle + (random.next() < 0.5 ? 0 : Math.PI)
			}
			if(paletteSize) {
				const pick = Math.floor(random.next() * paletteSize) * 3
				this.#tint[i * 3] = emitter.palette[pick]!
				this.#tint[i * 3 + 1] = emitter.palette[pick + 1]!
				this.#tint[i * 3 + 2] = emitter.palette[pick + 2]!
			}
			this.#emitterOf[i] = emitterIndex
		}
	}

	#move(from: number, to: number): void {
		if(from === to) return
		this.#px[to] = this.#px[from]!; this.#py[to] = this.#py[from]!; this.#pz[to] = this.#pz[from]!
		this.#vx[to] = this.#vx[from]!; this.#vy[to] = this.#vy[from]!; this.#vz[to] = this.#vz[from]!
		this.#age[to] = this.#age[from]!; this.#life[to] = this.#life[from]!
		this.#size[to] = this.#size[from]!; this.#phase[to] = this.#phase[from]!
		this.#angle[to] = this.#angle[from]!; this.#spin[to] = this.#spin[from]!
		this.#tint[to * 3] = this.#tint[from * 3]!
		this.#tint[to * 3 + 1] = this.#tint[from * 3 + 1]!
		this.#tint[to * 3 + 2] = this.#tint[from * 3 + 2]!
		this.#emitterOf[to] = this.#emitterOf[from]!
	}
}
