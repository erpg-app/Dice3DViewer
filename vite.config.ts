import path from 'node:path'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { build, transform } from 'esbuild'
import { defineConfig, searchForWorkspaceRoot, type Plugin, type UserConfig } from 'vite'
import dts from 'vite-plugin-dts'

const root = path.dirname(fileURLToPath(import.meta.url))
const renderSource = /[\\/]src[\\/]render[\\/][^\\/]+\.ts$/
const loaderFile = path.join(root, 'src/loadModule.ts')

// Minification strips import hints. Restore them after the final minification
// so consumer bundlers keep the runtime imports and only relocate their URLs.
const bundledLoader = 'export const loadModule = url => __dice3dNativeImport__(url)'
const restoreNativeImport = (code: string): string =>
	code.replaceAll('__dice3dNativeImport__(', 'import(/* @vite-ignore */ /* webpackIgnore: true */ ')

const compactShaders = (code: string): string => code.replace(/`([^`$]*\bvoid main\b[^`$]*)`/g, (_, source: string) =>
	`\`${source.split('\n').map(line => line.replace(/\/\/.*$/, '').trim()).filter(Boolean).join('\n')}\``)

/** A consuming bundler can relocate these ESM assets without following their imports. */
const standaloneRuntime = (): Plugin => {
	const assetReferences = new Set<string>()
	return {
		name: 'dice3dview:standalone-runtime',
		apply: 'build',
		enforce: 'pre',
		async transform(_, id) {
			const file = path.resolve(id)
			if(file === loaderFile) return { code: bundledLoader, map: null }
			if(file !== path.join(root, 'src/runtimeAssets.ts')) return null
			const entries = {
				sceneUrl: 'src/renderers/sceneWorker.ts',
				particlesUrl: 'src/render/particles.ts',
				presetsUrl: 'src/render/particlePresets.ts'
			}
			const urls = await Promise.all(Object.entries(entries).map(async ([name, entry]) => {
				const result = await build({
					absWorkingDir: root,
					entryPoints: [entry],
					bundle: true,
					write: false,
					format: 'esm',
					minify: true,
					target: 'es2022',
					legalComments: 'none',
					charset: 'utf8',
					plugins: [{
						name: 'dice3dview:compact-shaders',
						setup(context) {
							context.onLoad({ filter: /[\\/]loadModule\.ts$/ }, ({ path: file }) =>
								path.resolve(file) === loaderFile ? { contents: bundledLoader, loader: 'js' } : undefined)
							context.onLoad({ filter: renderSource }, async ({ path: file }) => ({
								contents: compactShaders(await readFile(file, 'utf8')), loader: 'ts'
							}))
						}
					}]
				})
				const referenceId = this.emitFile({
					type: 'asset',
					name: path.basename(entry, '.ts') + '.js',
					source: restoreNativeImport(result.outputFiles[0]!.text)
				})
				assetReferences.add(referenceId)
				return `export const ${name} = () => import.meta.ROLLUP_FILE_URL_${referenceId}`
			}))
			return { code: urls.join('\n'), map: null }
		},
		resolveFileUrl({ referenceId, relativePath }) {
			if(assetReferences.has(referenceId)) return `new URL(${JSON.stringify('./' + relativePath)}, import.meta.url)`
		}
	}
}

/**
 * Vite keeps whitespace in ES library output for pure annotations.
 */
const minifyWhitespace = (): Plugin => ({
	name: 'dice3dview:minify-whitespace',
	apply: 'build',
	async generateBundle(_, bundle) {
		for(const output of Object.values(bundle)) {
			if(output.type !== 'chunk') continue
			const result = await transform(output.code, { minifyWhitespace: true, format: 'esm', target: 'es2022', legalComments: 'none', charset: 'utf8' })
			output.code = restoreNativeImport(result.code)
		}
	}
})

// v3 has no runtime dependencies. The same build serves CDN and bundlers
// (`./external` is kept as an alias of the root entrypoint).
export default defineConfig(({ mode }): UserConfig => {
	const adaptersBuild = mode === 'adapters'
	const outDir = adaptersBuild ? 'dist/adapters' : 'dist'
	const entry = path.resolve(root, adaptersBuild ? 'src/adapters.ts' : 'src/index.ts')
	const entryFileName = adaptersBuild ? 'index.js' : 'dice3dview.es.js'
	const plugins: Plugin[] = [standaloneRuntime(), minifyWhitespace(), dts(adaptersBuild ? {
		include: ['src/adapters.ts'],
		outDir,
		beforeWriteFile: (_, content) => ({
			// The root declaration already exports the full adapter API.
			content: content.replaceAll("from './systemThemes'", "from '../index.js'")
				.replaceAll("from './types'", "from '../index.js'")
		})
	} : {
		include: ['src/**/*.ts'],
		exclude: ['src/**/*.test.ts'],
		rollupTypes: true,
		insertTypesEntry: true
	})]

	return {
		base: './',
		build: {
			outDir,
			emptyOutDir: true,
			copyPublicDir: !adaptersBuild,
			manifest: 'manifest.json',
			// ES2022 keeps native private fields: lowered to WeakMap helpers they made
			// the particle loop 10x slower (1.36 ms vs 0.13 ms per frame at 2,400 particles).
			target: 'es2022',
			lib: {
				entry,
				name: adaptersBuild ? 'dice3dviewAdapters' : 'dice3dview',
				formats: ['es'],
				fileName: () => entryFileName
			},
			minify: 'esbuild',
			sourcemap: false,
			rollupOptions: {
				preserveEntrySignatures: 'allow-extension',
				output: {
					entryFileNames: entryFileName,
					chunkFileNames: 'chunks/[name]-[hash].js',
					assetFileNames: assetInfo => assetInfo.name === 'style.css'
						? 'dice3dview.css'
						: assetInfo.name?.endsWith('.js') ? 'chunks/[name]-[hash][extname]' : 'assets/[name]-[hash][extname]'
				}
			}
		},
		plugins,
		server: {
			fs: {
				// demo/ and example/ resolve rolls with @erpg/dicecore from the sibling checkout.
				allow: [searchForWorkspaceRoot(root), path.resolve(root, '../rpg-dice-roller')]
			}
		}
	}
})
