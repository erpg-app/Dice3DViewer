import { existsSync, readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { collectBundleMetrics, staticClosure } from './bundle-metrics.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dist = path.join(root, 'dist')

/** Compressed-size budgets (bytes, gzip level 9). */
const BUDGETS = Object.freeze({
	/** What every presentation loads: WebGL renderer, physics, timeline, skins. */
	libraryGzip: 45 * 1024,
	/** Optional particle engine (shaders of 14 shapes and the image atlas), fetched only when `particles` is used. */
	particlesGzip: 7 * 1024,
	/** Built-in particle presets, fetched only when a preset name is used. */
	presetsGzip: 5 * 1024,
	adaptersGzip: 3 * 1024
})

const fail = message => {
	throw new Error(`Bundle check failed: ${message}`)
}

for(const file of [
	'dice3dview.es.js',
	'dice3dview.css',
	'index.d.ts',
	'manifest.json',
	'adapters/index.js',
	'adapters/adapters.d.ts',
	'adapters/manifest.json'
]) {
	if(!existsSync(path.join(dist, file))) fail(`required artifact dist/${file} is missing.`)
}

const packageJson = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'))
if(Object.keys(packageJson.dependencies ?? {}).length) fail('v3 must not declare runtime dependencies.')
for(const subpath of ['.', './external', './adapters', './style.css']) {
	const target = packageJson.exports?.[subpath]
	if(!target) fail(`package export '${subpath}' is missing.`)
	const file = typeof target === 'string' ? target : target.import
	if(!existsSync(path.join(root, file))) fail(`package export '${subpath}' points to missing '${file}'.`)
}

const visit = directory => readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
	const target = path.join(directory, entry.name)
	return entry.isDirectory() ? visit(target) : [target]
})
for(const file of visit(dist).filter(candidate => candidate.endsWith('.js'))) {
	const source = readFileSync(file, 'utf8')
	if(/@babylonjs|HavokPhysics|\.wasm\b/.test(source)) fail(`${path.relative(dist, file)} still references Babylon or Havok.`)
}
if(visit(dist).some(file => file.endsWith('.wasm'))) fail('dist must not ship WebAssembly binaries.')

const adapterSource = readFileSync(path.join(dist, 'adapters/index.js'), 'utf8')
if(/DiceResultViewer|getContext|WebGL/.test(adapterSource)) fail('the adapters entrypoint contains renderer code.')

// Everything a presentation needs is one module (no lazy round trip before the first
// throw); only the optional particle engine and its presets are separate, dynamically
// imported chunks.
const manifest = JSON.parse(readFileSync(path.join(dist, 'manifest.json'), 'utf8'))
const LAZY = ['src/render/particles.ts', 'src/render/particlePresets.ts']
for(const key of LAZY) {
	const chunk = manifest[key]
	if(!chunk?.isDynamicEntry) fail(`${key} is not emitted as a lazy chunk.`)
	if(staticClosure(['src/index.ts']).has(path.join(dist, chunk.file))) fail(`${key} leaked into the static graph.`)
}
if(staticClosure(['src/render/particles.ts']).has(path.join(dist, manifest['src/render/particlePresets.ts'].file))) fail('the particle engine statically imports the presets.')
const chunks = Object.entries(manifest).filter(([key, entry]) => !entry.isEntry && entry.file?.endsWith('.js') && !LAZY.includes(key))
if(chunks.length) fail(`unexpected chunks: ${chunks.map(([, entry]) => entry.file).join(', ')}.`)

const adapters = await import(pathToFileURL(path.join(dist, 'adapters/index.js')).href)
for(const name of ['createMixedDisplayRequest', 'createSystemDisplayRequest', 'toMixedResolvedDice']) {
	if(typeof adapters[name] !== 'function') fail(`adapters entrypoint is missing '${name}'.`)
}

const metrics = collectBundleMetrics()
if(metrics.library.gzipBytes > BUDGETS.libraryGzip) fail(`library is ${metrics.library.gzipBytes} B gzip (budget ${BUDGETS.libraryGzip}).`)
if(metrics.particles.gzipBytes > BUDGETS.particlesGzip) fail(`particle chunk is ${metrics.particles.gzipBytes} B gzip (budget ${BUDGETS.particlesGzip}).`)
if(metrics.presets.gzipBytes > BUDGETS.presetsGzip) fail(`presets chunk is ${metrics.presets.gzipBytes} B gzip (budget ${BUDGETS.presetsGzip}).`)
if(metrics.adapters.gzipBytes > BUDGETS.adaptersGzip) fail(`adapters entry is ${metrics.adapters.gzipBytes} B gzip (budget ${BUDGETS.adaptersGzip}).`)

console.log(JSON.stringify({ library: metrics.library, particles: metrics.particles, presets: metrics.presets, adapters: metrics.adapters, budgets: BUDGETS }, null, 2))
console.log('Bundle structure passed: dependency-free core module, lazy particle engine and presets, no WebAssembly, renderer-free adapters and size budgets.')
