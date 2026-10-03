/**
 * v3 physics benchmark (Node): CPU spent precomputing each throw with the
 * production pipeline (the renderer runs it in 8 ms slices), simulated
 * presentation length, dice impacts and how often the first choreography
 * was already clean.
 *
 *   npm run benchmark:physics            # print
 *   npm run benchmark:physics -- --write # also update benchmarks/physics-baseline.json
 */
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createShape, faceTargetQuaternion, planesFromCollider, type DiceShape } from '../src/engine/shape'
import { createPhysicsThrow } from '../src/engine/physicsThrow'
import type { ThrowBody, ThrowOptions } from '../src/engine/throw'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const model = JSON.parse(readFileSync(path.join(root, 'public/assets/dice-box/themes/default/default.json'), 'utf8')) as {
	readonly meshes: ReadonlyArray<{ readonly name: string; readonly positions: number[]; readonly indices: number[] }>
	readonly colliderFaceMap: Readonly<Record<string, Readonly<Record<string, number>>>>
}

const shapes = new Map<string, DiceShape>()
const shapeOf = (type: string): DiceShape => {
	const cached = shapes.get(type)
	if(cached) return cached
	const collider = model.meshes.find(mesh => mesh.name === `${type}_collider`)
	if(!collider) throw new Error(`Missing ${type} collider.`)
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

const SCENARIOS: Readonly<Record<string, readonly string[]>> = {
	d20: ['d20'],
	'4d6': Array.from({ length: 4 }, () => 'd6'),
	'd4-d20 kit': ['d4', 'd6', 'd8', 'd10', 'd12', 'd20'],
	'8d10': Array.from({ length: 8 }, () => 'd10'),
	'12d6': Array.from({ length: 12 }, () => 'd6'),
	'24d6': Array.from({ length: 24 }, () => 'd6'),
	'60d6': Array.from({ length: 60 }, () => 'd6'),
	'120d6': Array.from({ length: 120 }, () => 'd6')
}

const runs = Number(process.argv.find(arg => /^\d+$/.test(arg)) ?? 30)
const percentile = (values: number[], p: number): number => {
	const sorted = [...values].sort((a, b) => a - b)
	return Number((sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] ?? 0).toFixed(2))
}

const results: Record<string, unknown> = {}
for(const [name, types] of Object.entries(SCENARIOS)) {
	const cpu: number[] = [], seconds: number[] = []
	let impacts = 0, clean = 0, attempts = 0
	for(let run = 0; run < runs; run++) {
		const bodies: ThrowBody[] = types.map((type, index) => {
			const shape = shapeOf(type)
			const faces = shape.faces.map(face => face.value!)
			const value = faces[(run * 7 + index * 3) % faces.length]!
			return { shape, value, canonicalTarget: faceTargetQuaternion(shape, value), coin: false, mass: 1 }
		})
		const started = performance.now()
		const result = createPhysicsThrow(bodies, `${name}-${run}`, OPTIONS)
		cpu.push(performance.now() - started)
		seconds.push(result.durationSeconds)
		impacts += result.stats.diceImpacts
		if(result.clean) clean++
		attempts += result.attempts
	}
	results[name] = {
		physicsCpuMs: { median: percentile(cpu, 0.5), p95: percentile(cpu, 0.95) },
		simulatedSeconds: { median: percentile(seconds, 0.5), p95: percentile(seconds, 0.95) },
		diceImpactsPerThrow: Number((impacts / runs).toFixed(1)),
		cleanRate: Number((clean / runs).toFixed(2)),
		attemptsPerThrow: Number((attempts / runs).toFixed(2))
	}
}

const report = {
	schemaVersion: 1,
	capturedAt: new Date().toISOString(),
	environment: { node: process.versions.node, platform: `${process.platform}-${process.arch}`, runsPerScenario: runs, cpuThrottling: 'none' },
	scenarios: results
}
if(process.argv.includes('--write')) writeFileSync(path.join(root, 'benchmarks/physics-baseline.json'), `${JSON.stringify(report, null, 2)}\n`)
console.log(JSON.stringify(report, null, 2))
