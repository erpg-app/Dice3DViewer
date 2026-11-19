import type { createShape, DiceShape, FacePlane } from '../engine/shape'
import { add, cross, dot, length, normalize, scale, sub, type ReadonlyVec3, type Vec3 } from '../engine/vector'
import { createTextureCanvas, getTextureContext } from './images'
import type { ProceduralSides } from './proceduralSides'

/**
 * Geometry of the procedural dice (see `proceduralSides.ts`). This module is
 * fetched the first time one of them is rolled, so the hull builder of the
 * renderer is handed in instead of being bundled twice.
 *
 * Every shape is face-transitive, so any face can be turned into any other by
 * a symmetry of the hull and the usual result remap applies unchanged.
 *
 * - d3: rounded triangular prism with domed ends; it rests on a wide side and
 *   is read on the strip left on top
 * - d5, d7: prisms with 5 and 7 sides, flattened edges and pointed ends
 *   ("crystal" dice), read the same way
 * - d14: heptagonal trapezohedron
 * - d16: octagonal bipyramid
 * - d24: deltoidal icositetrahedron
 * - d30: rhombic triacontahedron
 */
type ShapeBuilder = typeof createShape

const Y_UP: ReadonlyVec3 = [0, 1, 0]

/** Label "up" hint of a face from its normal; `null` picks the farthest corner. */
type UpHint = (normal: ReadonlyVec3) => ReadonlyVec3 | null

interface Definition {
	/** Unit face normals. */
	readonly normals: readonly Vec3[]
	/** Distance from the center to every face, in model units (a d20 is 0.116 across its corners). */
	readonly inradius: number
	readonly up: UpHint
}

/** A die whose faces are not all alike: planes and values are given one by one. */
interface CustomDefinition {
	readonly planes: readonly FacePlane[]
	readonly up: UpHint
	/** `precision` of the hull builder. */
	readonly precision: number
	/** Edge softening of the mesh, when larger than the default. */
	readonly bevel?: number
	/** Shading normal of the blank faces at a point (domed ends look smooth). */
	readonly round?: (point: ReadonlyVec3) => Vec3
}

const towardsPole: UpHint = normal => normal[1] >= 0 ? Y_UP : [0, -1, 0]

/** Kites around two poles: `n` faces up, `n` down, half a step apart. */
const trapezohedron = (n: number, sinElevation: number): Vec3[] => {
	const c = Math.sqrt(1 - sinElevation * sinElevation)
	const normals: Vec3[] = []
	for(let k = 0; k < n; k++) {
		const top = k / n * Math.PI * 2, bottom = (k + 0.5) / n * Math.PI * 2
		normals.push([c * Math.cos(top), sinElevation, c * Math.sin(top)], [c * Math.cos(bottom), -sinElevation, c * Math.sin(bottom)])
	}
	return normals
}

/** Triangles around two poles, mirrored at the equator. */
const bipyramid = (n: number, sinElevation: number): Vec3[] => {
	const c = Math.sqrt(1 - sinElevation * sinElevation)
	const normals: Vec3[] = []
	for(let k = 0; k < n; k++) {
		const angle = k / n * Math.PI * 2
		normals.push([c * Math.cos(angle), sinElevation, c * Math.sin(angle)], [c * Math.cos(angle), -sinElevation, c * Math.sin(angle)])
	}
	return normals
}

const signs = (x: number, y: number, z: number): Vec3[] => {
	const out: Vec3[] = []
	for(const sx of x ? [1, -1] : [1]) for(const sy of y ? [1, -1] : [1]) for(const sz of z ? [1, -1] : [1]) out.push([x * sx, y * sy, z * sz])
	return out
}

const X_AXIS: ReadonlyVec3 = [1, 0, 0]

/**
 * Crystal die: a prism with an odd number of sides lying along X. Its edges
 * are cut into narrow strips, so a die resting on a wide side shows a strip on
 * top with the result; the wide side opposite to a strip repeats its value, in
 * case the die stops the other way up. The ends are pointed and carry no
 * value: `half` is long enough for the die to fall over when it lands on one.
 */
const PRISM_TIP = 1.1
const prism = (count: number, wide: number, narrow: number, half: number): CustomDefinition => {
	// Every end face runs from the rim of its side to one tip on the axis.
	const tip = narrow * PRISM_TIP
	const planes: FacePlane[] = []
	const strips: Vec3[] = []
	for(let k = 0; k < count; k++) {
		const angle = Math.PI / 2 + k / count * Math.PI * 2
		strips.push([0, Math.sin(angle), Math.cos(angle)])
	}
	strips.forEach((normal, index) => planes.push({ value: index + 1, normal, d: narrow }))
	strips.forEach((normal, index) => planes.push({ value: index + 1, normal: scale(normal, -1), d: wide }))
	for(const end of [1, -1]) for(const side of [...strips.map(normal => ({ normal, d: narrow })), ...strips.map(normal => ({ normal: scale(normal, -1), d: wide }))]) {
		const size = Math.sqrt(tip * tip + side.d * side.d)
		planes.push({ value: null, normal: normalize(add(scale(side.normal, tip), scale(X_AXIS, end * side.d))), d: side.d * (half + tip) / size })
	}
	return {
		planes,
		// Strips and wide sides are almost as far from the axis on the d5 and d7.
		precision: 0.2,
		// Numbers run along the die: a digit is narrower than tall, so it fits a strip better.
		up: () => X_AXIS
	}
}

/**
 * Rounded d3: the same prism with wider strips, soft edges and domed ends. Each
 * dome is two rings of blank facets starting `center` away from the middle
 * (far enough for the die not to balance on a facet); the mesh shades them as
 * one smooth bulge of depth `radius`.
 */
const roundPrism = (count: number, wide: number, narrow: number, center: number, radius: number): CustomDefinition => {
	const base = prism(count, wide, narrow, center)
	const sides = base.planes.filter(plane => plane.value !== null)
	const planes: FacePlane[] = [...sides]
	// Inner ring: one facet per side, starting at the rim of the prism. Outer ring: only
	// over the wide sides (a lighter hull), cutting the inner one part of the way in.
	const inner = 0.6, outer = 1.12, cut = 0.55
	for(const end of [1, -1]) {
		for(const side of sides) {
			planes.push({ value: null, normal: add(scale(side.normal, Math.cos(inner)), scale(X_AXIS, end * Math.sin(inner))), d: side.d * Math.cos(inner) + center * Math.sin(inner) })
		}
		for(const side of sides.slice(count)) {
			const reach = center + side.d * (1 - cut) * Math.cos(inner) / Math.sin(inner)
			planes.push({ value: null, normal: add(scale(side.normal, Math.cos(outer)), scale(X_AXIS, end * Math.sin(outer))), d: side.d * cut * Math.cos(outer) + reach * Math.sin(outer) })
		}
	}
	return {
		...base,
		planes,
		bevel: 0.011,
		round: point => {
			const along = Math.max(0, Math.abs(point[0]) - center) * Math.sign(point[0])
			return normalize([along / (radius * radius), point[1] / (narrow * narrow), point[2] / (narrow * narrow)])
		}
	}
}

/** Face normals of the deltoidal icositetrahedron: the corners of a rhombicuboctahedron. */
const deltoidalNormals = (): Vec3[] => {
	const long = 1 + Math.SQRT2
	return [...signs(long, 1, 1), ...signs(1, long, 1), ...signs(1, 1, long)].map(normalize)
}

/** Face normals of the rhombic triacontahedron: the corners of an icosidodecahedron. */
const triacontahedronNormals = (): Vec3[] => {
	const phi = (1 + Math.sqrt(5)) / 2
	const a = 0.5, b = phi / 2, c = 1 / (2 * phi)
	return [
		...signs(1, 0, 0), ...signs(0, 1, 0), ...signs(0, 0, 1),
		...signs(a, b, c), ...signs(b, c, a), ...signs(c, a, b)
	].map(normalize)
}

const dominantAxis: UpHint = normal => {
	const axis = [0, 1, 2].reduce((best, index) => Math.abs(normal[index]!) > Math.abs(normal[best]!) ? index : best, 0)
	const up: Vec3 = [0, 0, 0]
	up[axis] = Math.sign(normal[axis]!)
	return up
}

const DEFINITIONS: Readonly<Record<ProceduralSides, () => Definition | CustomDefinition>> = {
	3: () => roundPrism(3, 0.07, 0.085, 0.062, 0.06),
	5: () => prism(5, 0.08, 0.0829, 0.084),
	7: () => prism(7, 0.092, 0.0943, 0.088),
	14: () => ({ normals: trapezohedron(7, 0.62), inradius: 0.074, up: towardsPole }),
	16: () => ({ normals: bipyramid(8, 0.6), inradius: 0.076, up: towardsPole }),
	24: () => ({ normals: deltoidalNormals(), inradius: 0.09, up: dominantAxis }),
	30: () => ({ normals: triacontahedronNormals(), inradius: 0.096, up: () => null })
}

/**
 * Values of the faces. Opposite faces add up to faces + 1, like real dice, and
 * consecutive pairs are placed far apart.
 */
const assignValues = (normals: readonly Vec3[], sides: number): number[] => {
	const count = normals.length
	const opposite = normals.map((normal, index) => normals.findIndex((other, otherIndex) => otherIndex !== index && dot(normal, other) < -0.999))
	const pairs: number[] = []
	normals.forEach((_, index) => {
		const other = opposite[index]!
		if(other < 0) throw new Error('Procedural dice need opposite faces.')
		if(index < other) pairs.push(index)
	})
	const order: number[] = [pairs[0]!]
	while(order.length < pairs.length) {
		let best = -1, bestScore = -Infinity
		for(const candidate of pairs) {
			if(order.includes(candidate)) continue
			// Distance to the lines already taken, the latest ones counting the most.
			let score = Infinity
			order.forEach((placed, position) => {
				const apart = 1 - Math.abs(dot(normals[candidate]!, normals[placed]!))
				score = Math.min(score, apart * (1 + (order.length - position - 1) * 0.35))
			})
			if(score > bestScore + 1e-9) {
				bestScore = score
				best = candidate
			}
		}
		order.push(best)
	}
	const values = new Array<number>(count).fill(0)
	order.forEach((face, position) => {
		const low = position + 1, high = count - position
		// Dice numbered twice repeat each value on the opposite face.
		const [first, second] = count === sides * 2 ? [low, low] : position % 2 === 0 ? [low, high] : [high, low]
		values[face] = first
		values[opposite[face]!] = second
	})
	return values
}

const planesFor = (sides: ProceduralSides, factor: number): Pick<CustomDefinition, 'up' | 'bevel' | 'round'> & { readonly planes: FacePlane[]; readonly precision?: number } => {
	const definition = DEFINITIONS[sides]()
	if('planes' in definition) return { ...definition, planes: definition.planes.map(plane => ({ ...plane, d: plane.d * factor })) }
	const values = assignValues(definition.normals, sides)
	return {
		planes: definition.normals.map((normal, index) => ({ value: values[index]!, normal, d: definition.inradius * factor })),
		up: definition.up
	}
}

/** Physics hull of a procedural die at a world scale. */
export const createProceduralShape = (build: ShapeBuilder, sides: ProceduralSides, factor: number): DiceShape => {
	const { planes, precision } = planesFor(sides, factor)
	return build(planes, precision === undefined ? {} : { precision })
}

export interface ProceduralLabel {
	readonly text: string
	/** Center and glyph height in atlas units (0–1, origin at the top left). */
	readonly x: number
	readonly y: number
	readonly height: number
	/** 6 and 9 carry a mark on dice where they can be confused. */
	readonly marked: boolean
}

export interface ProceduralMesh {
	readonly positions: Float32Array
	readonly normals: Float32Array
	readonly uvs: Float32Array
	readonly indices: number[]
	readonly labels: readonly ProceduralLabel[]
	/** Label "up" of each value, in the body frame. */
	readonly readUps: ReadonlyMap<number, Vec3>
}

type Point = readonly [number, number]

/** Distance from a point to the nearest edge of a convex polygon (counter-clockwise). */
const clearance = (polygon: readonly Point[], x: number, y: number): number => {
	let nearest = Infinity
	for(let i = 0; i < polygon.length; i++) {
		const a = polygon[i]!, b = polygon[(i + 1) % polygon.length]!
		const ex = b[0] - a[0], ey = b[1] - a[1]
		nearest = Math.min(nearest, ((x - a[0]) * -ey + (y - a[1]) * ex) / Math.sqrt(ex * ex + ey * ey))
	}
	return nearest
}

/** Center and radius of the largest circle inside a convex polygon. */
const largestCircle = (polygon: readonly Point[]): { readonly x: number; readonly y: number; readonly radius: number } => {
	let x = 0, y = 0
	for(const point of polygon) {
		x += point[0] / polygon.length
		y += point[1] / polygon.length
	}
	let radius = clearance(polygon, x, y)
	let step = Math.max(...polygon.map(point => Math.hypot(point[0] - x, point[1] - y))) / 2
	for(let iteration = 0; iteration < 60; iteration++) {
		let moved = false
		for(let direction = 0; direction < 8; direction++) {
			const angle = direction / 8 * Math.PI * 2
			const nx = x + Math.cos(angle) * step, ny = y + Math.sin(angle) * step
			const candidate = clearance(polygon, nx, ny)
			if(candidate > radius + 1e-12) {
				x = nx
				y = ny
				radius = candidate
				moved = true
			}
		}
		if(!moved) step /= 2
	}
	return { x, y, radius }
}

/** Edges are softened by this much (model units), like the bevel of the theme dice. */
const BEVEL = 0.0045
/** Share of an atlas cell a face may use; the rest keeps neighbours from bleeding. */
const CELL_FILL = 0.92

/**
 * Visual mesh of a procedural die: flat faces pulled in by a small bevel,
 * joined by strips and corner caps whose normals blend between the faces.
 * Each face is laid out in its own cell of a label atlas (see `labels`).
 */
export const createProceduralMesh = (build: ShapeBuilder, sides: ProceduralSides): ProceduralMesh => {
	const { planes, up, precision, bevel = BEVEL, round } = planesFor(sides, 1)
	const shape = build(planes, precision === undefined ? {} : { precision })
	const grid = Math.ceil(Math.sqrt(shape.faces.filter(face => face.value !== null).length + 1))
	const cell = 1 / grid
	// The last cell stays empty: bevels sample it and show the plain body.
	const blank: Point = [1 - cell / 2, cell / 2]

	const positions: number[] = [], normals: number[] = [], uvs: number[] = [], indices: number[] = []
	const vertex = (position: ReadonlyVec3, normal: ReadonlyVec3, uv: Point): number => {
		positions.push(position[0], position[1], position[2])
		normals.push(normal[0], normal[1], normal[2])
		uvs.push(uv[0], uv[1])
		return positions.length / 3 - 1
	}
	const at = (index: number): Vec3 => [positions[index * 3]!, positions[index * 3 + 1]!, positions[index * 3 + 2]!]
	const normalAt = (index: number): Vec3 => [normals[index * 3]!, normals[index * 3 + 1]!, normals[index * 3 + 2]!]
	/** Triangles always face away from the die, whatever order they arrive in. */
	const triangle = (a: number, b: number, c: number): void => {
		const facing = cross(sub(at(b), at(a)), sub(at(c), at(a)))
		const outward = add(add(normalAt(a), normalAt(b)), normalAt(c))
		if(dot(facing, outward) >= 0) indices.push(a, b, c)
		else indices.push(a, c, b)
	}

	const labels: ProceduralLabel[] = []
	const readUps = new Map<number, Vec3>()
	/** Bevel vertex of (face, hull vertex). */
	const corner = new Map<string, number>()

	for(const face of shape.faces) {
		const ring = face.members.map(member => shape.verts[member]!)
		const centroid = face.centroid
		// Any in-plane frame works to measure the face.
		const ax = normalize(sub(ring[0]!, centroid))
		const ay = cross(face.normal, ax)
		let flat: Point[] = ring.map(point => [dot(sub(point, centroid), ax), dot(sub(point, centroid), ay)] as const)
		let order = ring.map((_, index) => index)
		let area = 0
		flat.forEach((point, index) => {
			const next = flat[(index + 1) % flat.length]!
			area += point[0] * next[1] - next[0] * point[1]
		})
		if(area < 0) {
			flat = [...flat].reverse()
			order = [...order].reverse()
		}
		const count = flat.length
		// Small faces take a smaller bevel, so they never fold over.
		const soften = Math.min(bevel, largestCircle(flat).radius * 0.3)
		const inset: Point[] = flat.map((point, index) => {
			const previous = flat[(index + count - 1) % count]!, next = flat[(index + 1) % count]!
			const inward = (from: Point, to: Point): Point => {
				const ex = to[0] - from[0], ey = to[1] - from[1], size = Math.sqrt(ex * ex + ey * ey)
				return [-ey / size, ex / size]
			}
			const n1 = inward(previous, point), n2 = inward(point, next)
			const k = soften / (1 + n1[0] * n2[0] + n1[1] * n2[1])
			return [point[0] + (n1[0] + n2[0]) * k, point[1] + (n1[1] + n2[1]) * k]
		})
		const circle = largestCircle(inset)

		// Label frame: `upward` is the top of the number, `right` its reading direction.
		const hint = up(face.normal)
		let upward: Vec3
		if(hint) upward = normalize(sub(hint, scale(face.normal, dot(hint, face.normal))))
		else {
			let far = 0, farScore = -Infinity
			inset.forEach((point, index) => {
				const world = add(scale(ax, point[0]), scale(ay, point[1]))
				// Ties (both ends of a rhombus) go to the higher corner.
				const score = Math.hypot(point[0] - circle.x, point[1] - circle.y) + dot(world, [0.013, 0.031, 0.007])
				if(score > farScore) {
					farScore = score
					far = index
				}
			})
			const point = inset[far]!
			upward = normalize(add(scale(ax, point[0] - circle.x), scale(ay, point[1] - circle.y)))
		}
		const right = cross(upward, face.normal)
		const local = inset.map((point): Point => {
			const offset = add(scale(ax, point[0] - circle.x), scale(ay, point[1] - circle.y))
			return [dot(offset, right), dot(offset, upward)]
		})
		const extent = Math.max(...local.map(point => Math.max(Math.abs(point[0]), Math.abs(point[1]))))
		const slot = labels.length
		const column = slot % grid, row = Math.floor(slot / grid)
		const centerU = (column + 0.5) * cell, centerV = 1 - (row + 0.5) * cell
		const unit = cell / 2 * CELL_FILL / extent

		const value = face.value
		const digits = String(value).length
		const marked = sides >= 9 && (value === 6 || value === 9)
		if(value !== null) labels.push({
			text: String(value),
			x: centerU,
			y: 1 - centerV,
			height: circle.radius * unit * (precision !== undefined ? 2.5 : digits > 1 ? 1.2 : marked ? 1.3 : 1.44),
			marked
		})
		if(value !== null && !readUps.has(value)) readUps.set(value, upward)

		const first = positions.length / 3
		inset.forEach((point, index) => {
			const world = add(centroid, add(scale(ax, point[0]), scale(ay, point[1])))
			if(value === null) vertex(world, round?.(world) ?? face.normal, blank)
			else vertex(world, face.normal, [centerU + local[index]![0] * unit, centerV + local[index]![1] * unit])
		})
		for(let index = 1; index + 1 < count; index++) triangle(first, first + index, first + index + 1)
		inset.forEach((point, index) => {
			const world = add(centroid, add(scale(ax, point[0]), scale(ay, point[1])))
			corner.set(`${face.index}|${face.members[order[index]!]!}`, vertex(world, value === null ? round?.(world) ?? face.normal : face.normal, blank))
		})
	}

	for(const edge of shape.edges) {
		const sharing = shape.faces.filter(face => face.members.includes(edge.i) && face.members.includes(edge.j))
		if(sharing.length !== 2) continue
		const [f, g] = sharing as [typeof sharing[number], typeof sharing[number]]
		const a = corner.get(`${f.index}|${edge.i}`)!, b = corner.get(`${f.index}|${edge.j}`)!
		const c = corner.get(`${g.index}|${edge.j}`)!, d = corner.get(`${g.index}|${edge.i}`)!
		triangle(a, b, c)
		triangle(a, c, d)
	}

	shape.verts.forEach((point, index) => {
		const around = shape.faces.filter(face => face.members.includes(index)).map(face => corner.get(`${face.index}|${index}`)!)
		if(around.length < 3) return
		const axis = normalize(point)
		const reference = normalize(cross(axis, Math.abs(axis[1]) < 0.9 ? Y_UP : [1, 0, 0]))
		const other = cross(axis, reference)
		const middle = scale(around.reduce<Vec3>((sum, item) => add(sum, at(item)), [0, 0, 0]), 1 / around.length)
		const angle = (item: number): number => {
			const offset = sub(at(item), middle)
			return Math.atan2(dot(offset, other), dot(offset, reference))
		}
		around.sort((left, rightItem) => angle(left) - angle(rightItem))
		for(let k = 1; k + 1 < around.length; k++) triangle(around[0]!, around[k]!, around[k + 1]!)
	})

	if(length(at(0)) === 0) throw new Error(`Unable to build the d${sides} mesh.`)
	// Faces of different sizes (crystal dice) share the size of the smallest number, so the
	// face on top is the one that reads best.
	const smallest = Math.min(...labels.map(label => label.height))
	return {
		positions: new Float32Array(positions),
		normals: new Float32Array(normals),
		uvs: new Float32Array(uvs),
		indices,
		labels: sides <= 7 ? labels.map(label => ({ ...label, height: smallest })) : labels,
		readUps
	}
}

const ATLAS_SIZE = 1024

/** Number atlas of a procedural die, in the style of the default theme (white marks, colored by the material). */
export const drawProceduralLabels = (labels: readonly ProceduralLabel[]): HTMLCanvasElement | OffscreenCanvas => {
	const surface = createTextureCanvas(ATLAS_SIZE, ATLAS_SIZE)
	const context = getTextureContext(surface)
	if(!context) return surface
	context.textAlign = 'center'
	context.textBaseline = 'alphabetic'
	context.fillStyle = '#ffffff'
	for(const label of labels) {
		// `height` is the height of the digits; capitals of a bold sans are ~0.72 em.
		const digits = label.height * ATLAS_SIZE
		context.font = `bold ${(digits / 0.72).toFixed(1)}px "Trebuchet MS", "Segoe UI", Arial, sans-serif`
		const x = label.x * ATLAS_SIZE, y = label.y * ATLAS_SIZE
		context.fillText(label.text, x, y + digits / 2)
		if(label.marked) {
			const width = context.measureText(label.text).width
			context.fillRect(x - width * 0.42, y + digits * 0.62, width * 0.84, digits * 0.11)
		}
	}
	return surface
}
