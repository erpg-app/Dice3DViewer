import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { brotliCompressSync, gzipSync } from 'node:zlib'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dist = path.join(root, 'dist')

const visit = directory => readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
	const target = path.join(directory, entry.name)
	return entry.isDirectory() ? visit(target) : [target]
})

const compressedMetrics = files => [...new Set(files)].filter(existsSync).reduce((metrics, file) => {
	const source = readFileSync(file)
	metrics.files++
	metrics.rawBytes += source.length
	metrics.gzipBytes += gzipSync(source, { level: 9 }).length
	metrics.brotliBytes += brotliCompressSync(source).length
	return metrics
}, { files: 0, rawBytes: 0, gzipBytes: 0, brotliBytes: 0 })

const readManifest = () => JSON.parse(readFileSync(path.join(dist, 'manifest.json'), 'utf8'))

/** Files reached through static imports from the given manifest roots. */
export const staticClosure = (roots, manifest = readManifest()) => {
	const files = new Set()
	const visited = new Set()
	const walk = key => {
		if(visited.has(key)) return
		visited.add(key)
		const entry = manifest[key]
		if(!entry) throw new Error(`Bundle manifest references missing entry '${key}'.`)
		files.add(path.join(dist, entry.file))
		for(const dependency of entry.imports ?? []) walk(dependency)
	}
	for(const key of roots) walk(key)
	return files
}

const packageMetrics = () => {
	try {
		const output = execFileSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], {
			cwd: root,
			encoding: 'utf8',
			shell: process.platform === 'win32',
			timeout: 60_000
		})
		const packed = JSON.parse(output)[0]
		return { files: packed.entryCount, packedBytes: packed.size, unpackedBytes: packed.unpackedSize }
	} catch {
		return null
	}
}

export const collectBundleMetrics = ({ includePackage = false } = {}) => {
	const manifest = readManifest()
	const measure = entry => compressedMetrics([...staticClosure([entry], manifest)])
	const allJavaScript = visit(dist).filter(file => file.endsWith('.js') && !file.includes(`${path.sep}adapters${path.sep}`))
	return {
		library: measure('src/index.ts'),
		renderer: measure('sceneWorker.js'),
		particles: measure('particles.js'),
		presets: measure('particlePresets.js'),
		allJavaScript: compressedMetrics(allJavaScript),
		adapters: compressedMetrics([path.join(dist, 'adapters/index.js')]),
		assets: compressedMetrics(visit(path.join(dist, 'assets'))),
		dist: compressedMetrics(visit(dist)),
		package: includePackage ? packageMetrics() : null
	}
}

const isMain = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url
if(isMain) {
	const metrics = collectBundleMetrics({ includePackage: true })
	const v2 = JSON.parse(readFileSync(path.join(root, 'benchmarks/bundle-baseline-v2.json'), 'utf8'))
	const v2Physics = key => v2.legacy.initial[key] + v2.legacy.physicsIncremental[key] + v2.havokJs[key] + v2.wasm[key]
	const v3Initial = key => metrics.library[key] + metrics.renderer[key]
	const ratio = (before, after) => Number((before / Math.max(1, after)).toFixed(1))
	const report = {
		schemaVersion: 4,
		capturedAt: new Date().toISOString(),
		environment: { node: process.versions.node, platform: `${process.platform}-${process.arch}` },
		...metrics,
		comparisonWithV2: {
			// v2 kinematic-only first load vs v3 with its worker (physics included).
			v2KinematicInitial: Object.fromEntries(['rawBytes', 'gzipBytes', 'brotliBytes'].map(key => [key, {
				v2: v2.legacy.initial[key],
				v3: v3Initial(key),
				reduction: ratio(v2.legacy.initial[key], v3Initial(key))
			}])),
			// v2 physics mode (Babylon + Havok JS + WASM) vs the whole v3 library.
			v2PhysicsMode: Object.fromEntries(['rawBytes', 'gzipBytes', 'brotliBytes'].map(key => {
				const v3 = v3Initial(key)
				return [key, { v2: v2Physics(key), v3, reduction: ratio(v2Physics(key), v3) }]
			}))
		}
	}
	if(process.argv.includes('--write')) {
		writeFileSync(path.join(root, 'benchmarks/bundle-baseline.json'), `${JSON.stringify(report, null, 2)}\n`)
	}
	console.log(JSON.stringify(report, null, 2))
}
