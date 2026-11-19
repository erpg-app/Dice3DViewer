import assert from 'node:assert/strict'
import test from 'node:test'
import { chooseValueSymmetry, createShape, findFace, readFace } from './engine/shape'
import { dot, length, qrot, type Quat } from './engine/vector'
import { createProceduralMesh, createProceduralShape } from './render/proceduralDice'
import { isProceduralSides, PROCEDURAL_SIDES } from './render/proceduralSides'

/** `faces` counts the numbered ones; the prisms (d3, d5, d7) also have blank faces at their ends. */
const BLANK_FACES: Record<number, number> = { 3: 18, 5: 20, 7: 28 }
const EXPECTED: Record<number, { faces: number; corners: number; symmetries: number }> = {
	3: { faces: 6, corners: 4, symmetries: 6 },
	5: { faces: 10, corners: 4, symmetries: 10 },
	7: { faces: 14, corners: 4, symmetries: 14 },
	14: { faces: 14, corners: 4, symmetries: 14 },
	16: { faces: 16, corners: 3, symmetries: 16 },
	24: { faces: 24, corners: 4, symmetries: 24 },
	30: { faces: 30, corners: 4, symmetries: 60 }
}

test('procedural dice are recognised by their sides', () => {
	assert.deepEqual(PROCEDURAL_SIDES.filter(isProceduralSides), [...PROCEDURAL_SIDES])
	for(const sides of [2, 4, 6, 8, 10, 12, 20, 100]) assert.equal(isProceduralSides(sides), false)
})

for(const sides of PROCEDURAL_SIDES) {
	test(`d${sides} hull has the expected faces, values and symmetries`, () => {
		const shape = createProceduralShape(createShape, sides, 6)
		const expected = EXPECTED[sides]!
		const numbered = shape.faces.filter(face => face.value !== null)
		assert.equal(numbered.length, expected.faces)
		assert.equal(shape.faces.length, expected.faces + (BLANK_FACES[sides] ?? 0))
		// The domes of the rounded d3 clip the corners of its sides.
		if(sides !== 3) for(const face of numbered) assert.equal(face.members.length, expected.corners, `face ${face.index}`)
		assert.equal(shape.symmetries.length, expected.symmetries)
		const counts = new Map<number, number>()
		for(const face of numbered) counts.set(face.value!, (counts.get(face.value!) ?? 0) + 1)
		assert.deepEqual([...counts.keys()].sort((a, b) => a - b), Array.from({ length: sides }, (_, index) => index + 1))
		assert.ok([...counts.values()].every(count => count === expected.faces / sides))
		// Opposite faces add up to faces + 1; dice numbered twice repeat the value there.
		for(const face of numbered) {
			const opposite = shape.faces.find(other => dot(face.normal, other.normal) < -0.999)!
			if(expected.faces === sides) assert.equal(face.value! + opposite.value!, sides + 1)
			else assert.equal(face.value, opposite.value)
		}
	})

	test(`d${sides} shows any value from any landed face`, () => {
		const shape = createProceduralShape(createShape, sides, 6)
		const identity: Quat = [0, 0, 0, 1]
		for(const landed of shape.faces.filter(face => face.value !== null)) for(let value = 1; value <= sides; value++) {
			const offset = chooseValueSymmetry(shape, identity, value, landed)
			assert.ok(offset, `value ${value} on face ${landed.index}`)
			assert.ok(shape.faces.some(face => face.value === value && dot(qrot(offset, face.normal), landed.normal) > 0.99))
		}
		assert.equal(readFace(shape, identity).face.normal[1] > 0.5, true)
		assert.ok(findFace(shape, 1))
	})

	test(`d${sides} mesh is closed, outward and labelled`, () => {
		const mesh = createProceduralMesh(createShape, sides)
		const expected = EXPECTED[sides]!
		assert.equal(mesh.labels.length, expected.faces)
		assert.equal(mesh.readUps.size, sides)
		assert.equal(mesh.indices.length % 3, 0)
		const point = (index: number): [number, number, number] => [mesh.positions[index * 3]!, mesh.positions[index * 3 + 1]!, mesh.positions[index * 3 + 2]!]
		const edges = new Map<string, number>()
		let volume = 0
		for(let t = 0; t < mesh.indices.length; t += 3) {
			const [a, b, c] = [point(mesh.indices[t]!), point(mesh.indices[t + 1]!), point(mesh.indices[t + 2]!)]
			volume += (a[0] * (b[1] * c[2] - b[2] * c[1]) + a[1] * (b[2] * c[0] - b[0] * c[2]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6
			for(const [p, q] of [[a, b], [b, c], [c, a]] as const) {
				const key = (v: readonly number[]): string => v.map(n => n.toFixed(5)).join(',')
				const id = [key(p), key(q)].sort().join('|')
				edges.set(id, (edges.get(id) ?? 0) + 1)
			}
		}
		assert.ok(volume > 0, 'triangles face outwards')
		assert.ok([...edges.values()].every(count => count === 2), 'every edge is shared by two triangles')
		for(const uv of mesh.uvs) assert.ok(uv >= 0 && uv <= 1)
		for(const up of mesh.readUps.values()) assert.ok(Math.abs(length(up) - 1) < 1e-6)
		for(const label of mesh.labels) assert.ok(label.height > 0.02, `label ${label.text} is readable (${label.height})`)
	})
}
