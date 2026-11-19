import {
	add,
	cross,
	dot,
	length,
	normalize,
	qdot,
	qrot,
	quatFromBasis,
	quatFromUnitVectors,
	scale,
	sub,
	type Quat,
	type ReadonlyQuat,
	type ReadonlyVec3,
	type Vec3
} from './vector'

/** One face plane of a die, in the body's local (right-handed) frame. */
export interface FacePlane {
	/** Result carried by the face; `null` for faces without a value (coin edge). */
	readonly value: number | null
	readonly normal: Vec3
	readonly d: number
}

export interface ShapeFace extends FacePlane {
	readonly index: number
	/** Hull vertex indices, counter-clockwise around the normal. */
	readonly members: readonly number[]
	readonly centroid: Vec3
	/** Artwork "up" direction on the face, when the shape declares one (coins). */
	readonly readUp?: Vec3
}

export interface ShapeEdge {
	readonly i: number
	readonly j: number
	readonly dirIndex: number
}

export interface DiceShape {
	readonly verts: readonly Vec3[]
	readonly faces: readonly ShapeFace[]
	readonly edges: readonly ShapeEdge[]
	readonly edgeDirs: readonly Vec3[]
	/** Circumscribed radius. */
	readonly radius: number
	/** d4 results are read on the face touching the table. */
	readonly readDown: boolean
	readonly inertiaK: number
	/** Rotations mapping the hull onto itself (the die's symmetry group). */
	readonly symmetries: readonly Quat[]
}

export interface ShapeOptions {
	readonly readDown?: boolean
	readonly readUps?: ReadonlyMap<number, ReadonlyVec3> | null
	readonly inertiaK?: number
	/**
	 * Scales the tolerances that merge corners and compare faces (default 1,
	 * loose enough for exported collider meshes). Exact planes whose faces differ
	 * only slightly need a smaller value.
	 */
	readonly precision?: number
}

/** Monotonic angle without trigonometry, used to order face vertices. */
const pseudoAngle = (x: number, y: number): number => {
	const s = Math.abs(x) + Math.abs(y)
	if(s === 0) return 0
	return y >= 0 ? 1 - x / s : 3 + x / s
}

/**
 * Face planes aggregated per value from a theme collider and its
 * colliderFaceMap: the same source of truth as the v2 target orientation.
 * Positions must already be in the right-handed frame.
 */
export const planesFromCollider = (
	positions: ArrayLike<number>,
	indices: ArrayLike<number>,
	faceMap: Readonly<Record<string, number>>,
	scaleFactor: number
): FacePlane[] => {
	const point = (index: number): Vec3 => [
		(positions[index * 3] ?? 0) * scaleFactor,
		(positions[index * 3 + 1] ?? 0) * scaleFactor,
		(positions[index * 3 + 2] ?? 0) * scaleFactor
	]
	const all: Vec3[] = []
	for(let index = 0; index < positions.length / 3; index++) all.push(point(index))
	const byValue = new Map<number, Vec3>()
	for(const [triangle, value] of Object.entries(faceMap)) {
		const t = Number(triangle)
		const a = point(indices[t * 3] ?? 0), b = point(indices[t * 3 + 1] ?? 0), c = point(indices[t * 3 + 2] ?? 0)
		let n = cross(sub(b, a), sub(c, a))
		const area = length(n)
		if(area < 1e-12) continue
		n = scale(n, 1 / area)
		if(dot(n, add(add(a, b), c)) < 0) n = scale(n, -1)
		byValue.set(value, add(byValue.get(value) ?? [0, 0, 0], scale(n, area)))
	}
	return [...byValue].map(([value, sum]) => {
		const normal = normalize(sum)
		let d = -Infinity
		for(const v of all) d = Math.max(d, dot(normal, v))
		return { value, normal, d }
	})
}

/** Convex hull as the intersection of the face half-spaces. */
export const createShape = (planes: readonly FacePlane[], options: ShapeOptions = {}): DiceShape => {
	let inRadius = 0
	for(const plane of planes) inRadius = Math.max(inRadius, plane.d)
	const tolerance = inRadius * 0.02 * (options.precision ?? 1)
	const sums: Vec3[] = [], counts: number[] = []
	for(let i = 0; i < planes.length; i++) for(let j = i + 1; j < planes.length; j++) for(let k = j + 1; k < planes.length; k++) {
		const a = planes[i]!, b = planes[j]!, c = planes[k]!
		const det = dot(a.normal, cross(b.normal, c.normal))
		if(Math.abs(det) < 1e-6) continue
		const x = scale(add(add(
			scale(cross(b.normal, c.normal), a.d),
			scale(cross(c.normal, a.normal), b.d)),
		scale(cross(a.normal, b.normal), c.d)), 1 / det)
		if(!planes.every(plane => dot(plane.normal, x) <= plane.d + tolerance)) continue
		const found = sums.findIndex((sum, index) => length(sub(scale(sum, 1 / counts[index]!), x)) < tolerance * 3)
		if(found >= 0) {
			sums[found] = add(sums[found]!, x)
			counts[found] = counts[found]! + 1
		} else {
			sums.push(x)
			counts.push(1)
		}
	}
	const verts = sums.map((sum, index) => scale(sum, 1 / counts[index]!))
	const radius = Math.max(...verts.map(length))

	const faces: ShapeFace[] = planes.map((plane, index) => {
		const members = verts.map((_, vi) => vi).filter(vi => Math.abs(dot(plane.normal, verts[vi]!) - plane.d) < tolerance * 4)
		const centroid = scale(members.reduce<Vec3>((acc, vi) => add(acc, verts[vi]!), [0, 0, 0]), 1 / Math.max(1, members.length))
		const toFirst = sub(verts[members[0] ?? 0]!, centroid)
		const u = normalize(sub(toFirst, scale(plane.normal, dot(toFirst, plane.normal))))
		const w = cross(plane.normal, u)
		members.sort((p, q) => {
			const dp = sub(verts[p]!, centroid), dq = sub(verts[q]!, centroid)
			return pseudoAngle(dot(dp, u), dot(dp, w)) - pseudoAngle(dot(dq, u), dot(dq, w))
		})
		const readUp = plane.value === null ? undefined : options.readUps?.get(plane.value)
		return {
			index, value: plane.value, normal: plane.normal, d: plane.d, members, centroid,
			...(readUp ? { readUp: [readUp[0], readUp[1], readUp[2]] as Vec3 } : {})
		}
	})

	const edges: ShapeEdge[] = [], edgeDirs: Vec3[] = []
	for(const face of faces) for(let m = 0; m < face.members.length; m++) {
		const a = face.members[m]!, b = face.members[(m + 1) % face.members.length]!
		const i = Math.min(a, b), j = Math.max(a, b)
		if(edges.some(edge => edge.i === i && edge.j === j)) continue
		const dir = normalize(sub(verts[j]!, verts[i]!))
		let dirIndex = edgeDirs.findIndex(existing => Math.abs(dot(existing, dir)) > 0.995)
		if(dirIndex < 0) {
			dirIndex = edgeDirs.length
			edgeDirs.push(dir)
		}
		edges.push({ i, j, dirIndex })
	}

	return {
		verts,
		faces,
		edges,
		edgeDirs,
		radius,
		readDown: options.readDown ?? false,
		inertiaK: options.inertiaK ?? 0.3,
		symmetries: buildSymmetries(faces, tolerance)
	}
}

/**
 * Rotations mapping the face set onto itself. Exported collider meshes are not
 * perfectly regular, so the comparison uses a small angular tolerance.
 */
const buildSymmetries = (faces: readonly ShapeFace[], tolerance: number): Quat[] => {
	const first = faces[0]
	if(!first) return [[0, 0, 0, 1]]
	let neighbor = -1, best = -2
	faces.forEach((face, index) => {
		const c = dot(first.normal, face.normal)
		if(index > 0 && c < 0.999 && c > best) {
			best = c
			neighbor = index
		}
	})
	if(neighbor < 0) return [[0, 0, 0, 1]]
	const frame = (x: Vec3, y: Vec3): [Vec3, Vec3, Vec3] => {
		const e1 = normalize(sub(y, scale(x, dot(x, y))))
		return [x, e1, cross(x, e1)]
	}
	const A = frame(first.normal, faces[neighbor]!.normal)
	const rotations: Quat[] = []
	for(const fi of faces) for(const fj of faces) {
		if(fi === fj || Math.abs(dot(fi.normal, fj.normal) - best) > 0.02) continue
		if(Math.abs(fi.d - first.d) > tolerance * 2) continue
		const B = frame(fi.normal, fj.normal)
		const column = (e: 0 | 1 | 2): Vec3 => [0, 1, 2].map(r => {
			const row = r as 0 | 1 | 2
			return B[0][row] * A[0][e] + B[1][row] * A[1][e] + B[2][row] * A[2][e]
		}) as Vec3
		const q = quatFromBasis(column(0), column(1), column(2))
		const maps = faces.every(face => {
			const mapped = qrot(q, face.normal)
			return faces.some(other => dot(mapped, other.normal) > 0.997 && Math.abs(other.d - face.d) < tolerance * 2)
		})
		if(!maps || rotations.some(r => Math.abs(qdot(r, q)) > 0.9999)) continue
		rotations.push(q)
	}
	return rotations.length ? rotations : [[0, 0, 0, 1]]
}

export const findFace = (shape: DiceShape, value: number): ShapeFace | undefined =>
	shape.faces.find(face => face.value === value)

/**
 * Picks G with G·n(target) = n(landed). Among the rotations about that face,
 * prefers the one leaving the face artwork upright on screen (screen up = -Z)
 * when the artwork direction is known; otherwise the rotation closest to
 * identity, so the artwork keeps the throw's natural yaw.
 */
export const chooseSymmetry = (
	shape: DiceShape,
	orientation: ReadonlyQuat,
	target: ShapeFace,
	landed: ShapeFace,
	readUp: ReadonlyVec3 | undefined = target.readUp
): Quat | null => {
	let best: Quat | null = null, bestScore = -Infinity
	for(const g of shape.symmetries) {
		if(dot(qrot(g, target.normal), landed.normal) < 0.99) continue
		const score = readUp ? -qrot(orientation, qrot(g, readUp))[2] : Math.abs(g[3])
		if(score > bestScore) {
			bestScore = score
			best = g
		}
	}
	return best
}

/**
 * Symmetry showing `value` on the landed face. Dice whose faces are not all
 * alike carry a value on more than one kind of face (d3 prism): the first face
 * with that value that can be turned onto the landed one is used.
 */
export const chooseValueSymmetry = (
	shape: DiceShape,
	orientation: ReadonlyQuat,
	value: number,
	landed: ShapeFace,
	readUp?: ReadonlyVec3
): Quat | null => {
	for(const target of shape.faces) {
		if(target.value !== value) continue
		const symmetry = chooseSymmetry(shape, orientation, target, landed, readUp ?? target.readUp)
		if(symmetry) return symmetry
	}
	return null
}

/** Local direction that must point up for the given face to be read. */
const readDirection = (shape: DiceShape): Vec3 => shape.readDown ? [0, -1, 0] : [0, 1, 0]

/** Face currently read on a body with this orientation, with its alignment. */
export const readFace = (shape: DiceShape, orientation: ReadonlyQuat): { face: ShapeFace; alignment: number } => {
	const up = qrot([-orientation[0], -orientation[1], -orientation[2], orientation[3]], readDirection(shape))
	let face = shape.faces[0]!, alignment = -Infinity
	for(const candidate of shape.faces) {
		const c = dot(candidate.normal, up)
		if(c > alignment) {
			alignment = c
			face = candidate
		}
	}
	return { face, alignment: face.value === null ? 0 : alignment }
}

/** Shortest rotation placing a face in reading position (v2 getTargetQuaternion). */
export const faceTargetQuaternion = (shape: DiceShape, value: number): Quat => {
	const face = findFace(shape, value)
	if(!face) throw new Error(`No orientation was found for face ${value}.`)
	return quatFromUnitVectors(face.normal, readDirection(shape))
}

/** Height of the body origin above the floor for a given orientation. */
export const supportHeight = (shape: DiceShape, orientation: ReadonlyQuat): number => {
	let minimumY = Infinity
	for(const v of shape.verts) minimumY = Math.min(minimumY, qrot(orientation, v)[1])
	return Math.max(0, -minimumY)
}
