import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { createShape, faceTargetQuaternion, planesFromCollider, readFace, type DiceShape } from './engine/shape'
import { pairDepth, type SimulationResult } from './engine/simulation'
import {
	PACKED_THROW,
	createFollowUpThrow,
	createPhysicsThrow,
	physicsThrowSteps,
	runSliced,
	type RestingBody
} from './engine/physicsThrow'
import type { ThrowBody, ThrowOptions } from './engine/throw'
import { sampleTrack } from './engine/track'
import { qdot, qmul, type Quat, type Vec3 } from './engine/vector'

interface SerializedMesh { readonly name: string; readonly positions: number[]; readonly indices: number[] }
const model = JSON.parse(readFileSync(new URL('../public/assets/dice-box/themes/default/default.json', import.meta.url), 'utf8')) as {
	readonly meshes: readonly SerializedMesh[]
	readonly colliderFaceMap: Readonly<Record<string, Readonly<Record<string, number>>>>
}
const shapes = new Map<string, DiceShape>()
const shapeOf = (type: string): DiceShape => {
	const cached = shapes.get(type)
	if(cached) return cached
	const collider = model.meshes.find(mesh => mesh.name === `${type}_collider`)!
	const positions = collider.positions.map((v, i) => i % 3 === 2 ? -v : v)
	const shape = createShape(planesFromCollider(positions, collider.indices, model.colliderFaceMap[type]!, 5 * 1.02), { readDown: type === 'd4' })
	shapes.set(type, shape)
	return shape
}

const OPTIONS: ThrowOptions = {
	width: 1200, height: 700, scale: 5, startingHeight: 7.6, spawnSpacing: 1.72, spawnHeightStep: 0,
	spawnOverscan: 0.15, throwForce: 6.4, spinForce: 5.8, delay: 10, aggressiveThrowChance: 0.12, landingSpread: 0,
	wallPadding: 0.25, gravity: 1.3, friction: 0.54, restitution: 0.29, linearDamping: 0.1, angularDamping: 0.08,
	settleTimeout: 4200, burstHeight: 1.6, spread: 0.8
}

const body = (type: string, value: number): ThrowBody => {
	const shape = shapeOf(type)
	return { shape, value, canonicalTarget: faceTargetQuaternion(shape, value), coin: false, mass: 1 }
}

interface Child { readonly type: string; readonly value: number; readonly parent: number }

/** The production pipeline used by SceneRenderer (launch plan + clean re-sampling). */
const throwDice = (types: readonly string[], values: readonly number[], seed: string, children: readonly Child[] = []): SimulationResult =>
	createPhysicsThrow(
		types.map((type, index) => body(type, values[index]!)),
		seed,
		OPTIONS,
		children.map(child => ({ ...body(child.type, child.value), parent: child.parent }))
	)

interface Pose { readonly shape: DiceShape; readonly p: Vec3; readonly q: Quat }

const posesAt = (frame: Float32Array, types: readonly string[]): Pose[] => types.map((type, index) => {
	const o = index * 7
	return {
		shape: shapeOf(type),
		p: [frame[o]!, frame[o + 1]!, frame[o + 2]!],
		q: [frame[o + 3]!, frame[o + 4]!, frame[o + 5]!, frame[o + 6]!]
	}
})

/** Value shown by body `index` at the end of a track (physical pose + visual rotation). */
const shownValue = (result: SimulationResult, index: number, shape: DiceShape): number | null => {
	const pose = sampleTrack(result, index, result.frames.length - 1)
	return readFace(shape, pose.rotation).face.value
}

/** Dice resting where a first throw left them, as the renderer hands them to a later phase. */
const restingAfter = (result: SimulationResult, types: readonly string[], values: readonly number[]): RestingBody[] =>
	types.map((type, index) => {
		const pose = sampleTrack(result, index, result.frames.length - 1)
		return { ...body(type, values[index]!), position: pose.position, orientation: pose.rotation }
	})

describe('v3 dice physics', () => {
	it('always ends with the requested faces up (symmetry remap, no guidance)', () => {
		const scenarios = [['d20'], ['d6', 'd6', 'd6', 'd6'], ['d4', 'd6', 'd8', 'd10', 'd12', 'd20'], ['d100', 'd10']]
		let checked = 0
		scenarios.forEach((types, s) => {
			for(let run = 0; run < 8; run++) {
				const values = types.map((type, i) => {
					const faces = shapeOf(type).faces.map(face => face.value!)
					return faces[(run * 7 + i * 3 + s) % faces.length]!
				})
				const result = throwDice(types, values, `remap-${s}-${run}`)
				posesAt(result.frames[result.frames.length - 1]!, types).forEach((pose, i) => {
					const reading = readFace(pose.shape, qmul(pose.q, result.visualOffsets[i]!))
					assert.equal(reading.face.value, values[i], `${types[i]} run ${run}`)
					assert.ok(reading.alignment > 0.95)
					checked++
				})
			}
		})
		assert.equal(checked, 8 * 13)
	})

	it('keeps dice from passing through each other during impacts', () => {
		const types = Array.from({ length: 12 }, () => 'd6')
		let worst = 0
		for(let run = 0; run < 6; run++) {
			const result = throwDice(types, types.map(() => 1), `penetration-${run}`)
			result.frames.forEach((frame, frameIndex) => {
				const poses = posesAt(frame, types)
				for(let i = 0; i < poses.length; i++) for(let j = i + 1; j < poses.length; j++) {
					if(frameIndex < result.releaseFrames[i]! || frameIndex < result.releaseFrames[j]!) continue
					const a = poses[i]!, b = poses[j]!
					if(Math.hypot(a.p[0] - b.p[0], a.p[1] - b.p[1], a.p[2] - b.p[2]) > a.shape.radius * 2) continue
					worst = Math.max(worst, pairDepth(a, b) / a.shape.radius)
				}
			})
		}
		assert.ok(worst < 0.25, `worst transient penetration ${(worst * 100).toFixed(0)}% of the radius`)
	})

	it('reports hard landings on the table for effects', () => {
		const result = throwDice(['d6', 'd6', 'd20'], [1, 2, 3], 'landings')
		const impacts = result.markers.filter(marker => marker.type === 'impact')
		assert.ok(impacts.length >= 3, `expected a landing per die, got ${impacts.length}`)
		for(const body of [0, 1, 2]) assert.ok(impacts.some(marker => marker.body === body), `die ${body} landed without an impact`)
		assert.ok(impacts.every(marker => (marker.force ?? 0) > 0))
	})

	it('is bit-for-bit deterministic for the same seed', () => {
		const types = ['d6', 'd8', 'd20']
		const a = throwDice(types, [3, 5, 17], 'determinism')
		const b = throwDice(types, [3, 5, 17], 'determinism')
		assert.equal(a.frames.length, b.frames.length)
		a.frames.forEach((frame, index) => assert.deepEqual(Array.from(frame), Array.from(b.frames[index]!)))
	})

	it('computes the same throw in time slices as synchronously', async () => {
		const bodies = ['d6', 'd10', 'd12', 'd20'].map((type, index) => body(type, index + 3))
		const sync = createPhysicsThrow(bodies, 'sliced', OPTIONS)
		const sliced = await runSliced(physicsThrowSteps(bodies, 'sliced', OPTIONS), undefined, 0.2)
		assert.equal(sliced.frames.length, sync.frames.length)
		sliced.frames.forEach((frame, index) => assert.deepEqual(Array.from(frame), Array.from(sync.frames[index]!)))
		assert.deepEqual(sliced.visualOffsets, sync.visualOffsets)
	})

	it('releases exploding children from their settled parents', () => {
		const result = throwDice(['d6', 'd6'], [6, 2], 'explosion', [{ type: 'd6', value: 6, parent: 0 }, { type: 'd6', value: 4, parent: 2 }])
		const explode = result.markers.filter(marker => marker.type === 'explode')
		assert.deepEqual(explode.map(marker => [marker.body, marker.other]), [[0, 2], [2, 3]])
		const settleOf = (body: number): number => result.markers.find(marker => marker.type === 'settle' && marker.body === body)!.frame
		assert.ok(result.releaseFrames[2]! >= settleOf(0))
		assert.ok(result.releaseFrames[3]! >= settleOf(2))
		const poses = posesAt(result.frames[result.frames.length - 1]!, ['d6', 'd6', 'd6', 'd6'])
		assert.equal(readFace(poses[3]!.shape, qmul(poses[3]!.q, result.visualOffsets[3]!)).face.value, 4)
	})

	it('plays long explosion chains to the end: the settle budget is never a cut', () => {
		// Six explosions in a row need far more than settleTimeout; before, the
		// world stopped at the budget and the last children were never born.
		for(const seed of ['chain-a', 'chain-b']) {
			const children = Array.from({ length: 6 }, (_, k) => ({ type: 'd6', value: 6, parent: k === 0 ? 0 : k }))
			const result = throwDice(['d6'], [6], seed, children)
			assert.ok(result.clean, `${seed}: every die rests readable`)
			assert.ok(result.releaseFrames.every(frame => Number.isFinite(frame)), `${seed}: every child is born`)
			assert.equal(result.markers.filter(marker => marker.type === 'settle').length, 7, `${seed}: every die settles`)
			assert.ok(result.durationSeconds > OPTIONS.settleTimeout / 1000 + 2, `${seed}: the chain outlasts the budget`)
			const last = result.frames[result.frames.length - 1]!
			posesAt(last, Array.from({ length: 7 }, () => 'd6')).forEach((pose, index) => {
				assert.equal(readFace(pose.shape, qmul(pose.q, result.visualOffsets[index]!)).face.value, 6, `${seed}: die ${index}`)
			})
		}
	})

	it('reveals an explosion child out of its parent, never at its parking spot', () => {
		for(const seed of ['birth-a', 'birth-b', 'birth-c']) {
			const result = throwDice(['d6', 'd6'], [6, 2], seed, [{ type: 'd6', value: 4, parent: 0 }])
			const release = result.releaseFrames[2]!
			const birth = result.births[2]
			assert.ok(birth && birth.frame === release, `${seed}: birth recorded`)
			for(let frame = release; frame < release + 4; frame += 0.25) {
				assert.ok(sampleTrack(result, 2, frame).position[1] > -0.25, `${seed}: child below the table at frame ${frame}`)
			}
			const first = sampleTrack(result, 2, release)
			assert.ok(first.scale < 0.5, `${seed}: child starts small`)
			assert.ok(Math.hypot(first.position[0] - birth.from[0], first.position[2] - birth.from[2]) < 0.05, `${seed}: child starts inside its parent`)
			assert.equal(sampleTrack(result, 2, result.frames.length - 1).scale, 1)
		}
	})

	it('packs large throws onto the table and still shows every value', () => {
		const count = PACKED_THROW + 8
		const types = Array.from({ length: count }, () => 'd6')
		const values = types.map((_, index) => 1 + index * 5 % 6)
		const result = throwDice(types, values, 'packed')
		assert.ok(result.releaseFrames.every(frame => Number.isFinite(frame)), 'every die is thrown')
		types.forEach((type, index) => assert.equal(shownValue(result, index, shapeOf(type)), values[index], `die ${index}`))
		const again = throwDice(types, values, 'packed')
		assert.deepEqual(Array.from(again.frames[again.frames.length - 1]!), Array.from(result.frames[result.frames.length - 1]!))
	})
})

describe('v3 later timeline phases', () => {
	const types = ['d6', 'd8', 'd20']
	const values = [2, 5, 11]
	const first = throwDice(types, values, 'phase-base')
	const resting = restingAfter(first, types, values)

	it('throws a rerolled die again while every other die stays exactly in place', () => {
		for(const style of ['hop', 'spin', 'edge'] as const) {
			const result = createFollowUpThrow({
				resting,
				rerolls: [{ index: 1, body: body('d8', 3), style, hopHeight: 2.2, intensity: 1 }]
			}, `reroll-${style}`, OPTIONS)
			for(const index of [0, 2]) {
				const start = sampleTrack(result, index, 0)
				const end = sampleTrack(result, index, result.frames.length - 1)
				assert.ok(Math.hypot(end.position[0] - start.position[0], end.position[1] - start.position[1], end.position[2] - start.position[2]) < 1e-4, `${style}: die ${index} moved`)
				assert.ok(Math.abs(qdot(end.rotation, start.rotation)) > 0.99999, `${style}: die ${index} turned`)
			}
			assert.equal(shownValue(result, 1, shapeOf('d8')), 3, `${style}: new value up`)
			if(style !== 'edge') {
				// Continuity: the die leaves from the exact pose it rested in, and
				// the value rotation is blended in only while it is airborne.
				assert.ok(Math.abs(qdot(sampleTrack(result, 1, 0).rotation, resting[1]!.orientation)) > 0.9999, `${style}: starts where it rested`)
				const window = result.remapWindows[1]
				assert.ok(window && window[0] >= 0 && window[1] > window[0], `${style}: airborne window`)
			}
		}
	})

	it('bursts a later explosion out of its resting parent', () => {
		const result = createFollowUpThrow({
			resting,
			children: [{ ...body('d6', 4), parent: 0 }]
		}, 'late-explosion', OPTIONS)
		assert.deepEqual(result.markers.filter(marker => marker.type === 'explode').map(marker => [marker.body, marker.other]), [[0, 3]])
		assert.equal(shownValue(result, 3, shapeOf('d6')), 4)
		for(const index of [0, 1, 2]) {
			const start = sampleTrack(result, index, 0), end = sampleTrack(result, index, result.frames.length - 1)
			assert.ok(Math.hypot(end.position[0] - start.position[0], end.position[2] - start.position[2]) < 1e-4)
		}
	})
})
