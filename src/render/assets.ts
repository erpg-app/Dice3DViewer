import { createShape, planesFromCollider, type DiceShape } from '../engine/shape'
import { createCoinShape } from './coinTheme'
import type { ReadonlyVec3, Vec3 } from '../engine/vector'
import type { CoinTheme, DiceSkinOptions, ResolvedThemeConfig } from '../types'
import type { DiceGL, GLMesh, GLTexture, SurfaceMaterial } from './gl'
import { createTextureCanvas, getTextureContext, isSvgImage, loadImage, type ImageLoader, type ImageSize } from './images'

/** Geometry types available in theme models (d100 has its own tens mesh). */
export const MODEL_DIE_TYPES = ['d4', 'd6', 'd8', 'd10', 'd12', 'd20', 'd100'] as const

/** Models are cached by their full URL, so external themes never collide. */
export const getPolyhedralModelCacheKey = (config: Pick<ResolvedThemeConfig, 'meshFilePath'>): string =>
	config.meshFilePath
export type ModelDieType = typeof MODEL_DIE_TYPES[number]

interface BabylonMeshSource {
	readonly name: string
	readonly positions?: readonly number[]
	readonly normals?: readonly number[]
	readonly uvs?: readonly number[]
	readonly indices?: readonly number[]
}

interface BabylonModelSource {
	readonly meshes: readonly BabylonMeshSource[]
	readonly colliderFaceMap: Readonly<Record<string, Readonly<Record<string, number>>>>
}

export interface ModelGeometry {
	readonly visual: GLMesh
	/** Right-handed collider data (unscaled). */
	readonly colliderPositions: Float32Array
	readonly colliderIndices: readonly number[]
	readonly faceMap: Readonly<Record<string, number>>
}

export interface LoadedModel {
	readonly url: string
	readonly geometry: ReadonlyMap<ModelDieType, ModelGeometry>
}

/** .babylon files are left-handed; mirroring Z gives the right-handed frame used by render and physics. */
const toRightHanded = (values: readonly number[]): Float32Array => {
	const out = new Float32Array(values.length)
	for(let i = 0; i < values.length; i++) out[i] = i % 3 === 2 ? -values[i]! : values[i]!
	return out
}

const fetchJson = async <T>(url: string, base?: string): Promise<T> => {
	const response = await fetch(base ? new URL(url, base) : url)
	if(!response.ok) throw new Error(`Unable to fetch '${url}' (${response.status} ${response.statusText}).`)
	const type = response.headers.get('content-type') ?? ''
	if(type.includes('text/html')) throw new Error(`Expected JSON at '${url}' but the server returned HTML (check assetPath/origin).`)
	return await response.json() as T
}

const isLightColor = (hex: string): boolean => {
	const value = hex.replace('#', '')
	if(!/^[0-9a-f]{6}$/i.test(value)) return false
	const red = Number.parseInt(value.slice(0, 2), 16)
	const green = Number.parseInt(value.slice(2, 4), 16)
	const blue = Number.parseInt(value.slice(4, 6), 16)
	return red * 0.299 + green * 0.587 + blue * 0.114 > 175
}

export const parseHexColor = (hex: string, fallback: ReadonlyVec3 = [0.18, 0.52, 0.33]): Vec3 => {
	const value = hex.replace('#', '')
	if(!/^[0-9a-f]{6}$/i.test(value)) return [fallback[0], fallback[1], fallback[2]]
	return [0, 2, 4].map(offset => Number.parseInt(value.slice(offset, offset + 2), 16) / 255) as Vec3
}

const SKIN_BLENDS = { normal: 0, multiply: 1, screen: 2, overlay: 3 } as const

type SkinFields = Pick<SurfaceMaterial, 'skin' | 'skinScale' | 'skinBlend' | 'skinOpacity' | 'outline'>

/** Cache key part for a skin (empty without one). */
const skinKey = (skin: DiceSkinOptions | null): string =>
	skin ? JSON.stringify([skin.texture, skin.scale ?? 1, skin.blend ?? 'normal', skin.opacity ?? 1, skin.labels ?? 'auto']) : ''

const resolveAsset = (basePath: string, value: string): string =>
	/^(?:data:|https?:|blob:|\/)/.test(value) ? value : `${basePath}/${value}`

/**
 * Inverts the brightness of the grey pixels of an artwork (white marks with a
 * dark outline become dark marks with a light outline); colored pixels stay.
 */
const invertNeutralPixels = (context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, size: number): void => {
	let image: ImageData
	try {
		image = context.getImageData(0, 0, size, size)
	} catch {
		return // Cross-origin artwork without CORS: keep it as it is.
	}
	const data = image.data
	for(let i = 0; i < data.length; i += 4) {
		if(data[i + 3] === 0) continue
		const r = data[i]!, g = data[i + 1]!, b = data[i + 2]!
		if(Math.max(r, g, b) - Math.min(r, g, b) > 40) continue
		data[i] = 255 - r
		data[i + 1] = 255 - g
		data[i + 2] = 255 - b
	}
	context.putImageData(image, 0, 0)
}

export class AssetLibrary {
	readonly #gl: DiceGL
	readonly #loadImage: ImageLoader
	readonly #baseUrl: string | undefined
	readonly #models = new Map<string, Promise<LoadedModel>>()
	readonly #shapes = new Map<string, DiceShape>()
	readonly #textures = new Map<string, Promise<GLTexture>>()
	readonly #materials = new Map<string, Promise<SurfaceMaterial>>()
	readonly #orientations = new Map<string, Promise<ReadonlyMap<string, ReadonlyMap<number, Vec3>>>>()
	readonly #coinGeometry = new Map<string, CoinGeometry>()
	readonly #skins = new Map<string, Promise<{ readonly texture: GLTexture; readonly luminance: number }>>()

	constructor(gl: DiceGL, imageLoader: ImageLoader = loadImage, baseUrl?: string) {
		this.#gl = gl
		this.#loadImage = imageLoader
		this.#baseUrl = baseUrl
	}

	loadModel(url: string): Promise<LoadedModel> {
		const cached = this.#models.get(url)
		if(cached) return cached
		const pending = (async (): Promise<LoadedModel> => {
			const source = await fetchJson<BabylonModelSource>(url, this.#baseUrl)
			if(!source.colliderFaceMap) throw new Error(`Dice model '${url}' has no colliderFaceMap.`)
			const geometry = new Map<ModelDieType, ModelGeometry>()
			const byName = new Map(source.meshes.map(mesh => [mesh.name, mesh]))
			for(const type of MODEL_DIE_TYPES) {
				const visual = byName.get(type) ?? (type === 'd100' ? byName.get('d10') : undefined)
				const collider = byName.get(`${type}_collider`) ?? (type === 'd100' ? byName.get('d10_collider') : undefined)
				const faceMap = source.colliderFaceMap[type] ?? (type === 'd100' ? source.colliderFaceMap.d10 : undefined)
				if(!visual?.positions || !visual.normals || !visual.uvs || !visual.indices || !collider?.positions || !collider.indices || !faceMap) continue
				geometry.set(type, {
					visual: this.#gl.createMesh(
						toRightHanded(visual.positions),
						toRightHanded(visual.normals),
						new Float32Array(visual.uvs),
						visual.indices
					),
					colliderPositions: toRightHanded(collider.positions),
					colliderIndices: collider.indices,
					faceMap
				})
			}
			return { url, geometry }
		})()
		this.#models.set(url, pending)
		pending.catch(() => this.#models.delete(url))
		return pending
	}

	/** Physics shape for a model type at a world scale (cached). */
	shapeFor(model: LoadedModel, type: ModelDieType, scale: number): DiceShape {
		const key = `${model.url}|${type}|${scale}`
		const cached = this.#shapes.get(key)
		if(cached) return cached
		const geometry = model.geometry.get(type)
		if(!geometry) throw new Error(`${type} is unavailable in model '${model.url}'.`)
		const planes = planesFromCollider(geometry.colliderPositions, geometry.colliderIndices, geometry.faceMap, scale)
		const shape = createShape(planes, { readDown: type === 'd4' })
		this.#shapes.set(key, shape)
		return shape
	}

	loadTexture(url: string, atlasSize?: ImageSize): Promise<GLTexture> {
		const cached = this.#textures.get(url)
		if(cached) return cached
		const svg = isSvgImage(url)
		const pending = this.#loadImage(url, svg ? atlasSize : undefined).then(image => {
			if(!svg || !('naturalWidth' in image)) return this.#gl.createTexture(image)
			// SVG atlases are rasterized at their declared atlas size.
			const surface = createTextureCanvas(atlasSize?.width ?? (image.naturalWidth || 1024), atlasSize?.height ?? (image.naturalHeight || 1024))
			getTextureContext(surface)?.drawImage(image, 0, 0, surface.width, surface.height)
			return this.#gl.createTexture(surface)
		})
		this.#textures.set(url, pending)
		pending.catch(() => this.#textures.delete(url))
		return pending
	}

	/**
	 * Custom skin image as a repeatable 512² tile (any source size works on
	 * WebGL1) with its mean luminance, used to keep numbers readable.
	 */
	skin(url: string): Promise<{ readonly texture: GLTexture; readonly luminance: number }> {
		const cached = this.#skins.get(url)
		if(cached) return cached
		const pending = this.#loadImage(url).then(image => {
			const surface = createTextureCanvas(512, 512)
			getTextureContext(surface)?.drawImage(image, 0, 0, 512, 512)
			let luminance = 0.5
			const probe = createTextureCanvas(16, 16)
			const context = getTextureContext(probe, { willReadFrequently: true })
			if(context) {
				context.drawImage(surface, 0, 0, 16, 16)
				const pixels = context.getImageData(0, 0, 16, 16).data
				let sum = 0
				for(let i = 0; i < pixels.length; i += 4) sum += 0.299 * pixels[i]! + 0.587 * pixels[i + 1]! + 0.114 * pixels[i + 2]!
				luminance = sum / (pixels.length / 4) / 255
			}
			return { texture: this.#gl.createTexture(surface), luminance }
		})
		this.#skins.set(url, pending)
		pending.catch(() => this.#skins.delete(url))
		return pending
	}

	/**
	 * v2 PolyhedralFactory material, keyed by theme, color and skin. Discarded
	 * dice share it: the renderer greys them out with the saturation uniform.
	 * Skins apply to `color` themes, whose atlas only carries the labels.
	 */
	/**
	 * Skin layer of a material (image over `base`, see DiceSkinOptions) and
	 * whether the layered surface reads as light, which picks the label color.
	 */
	async #skinLayer(skin: DiceSkinOptions | null, base: Vec3): Promise<{ readonly fields: SkinFields; readonly lightBody: boolean | null }> {
		const data = skin
			? await this.skin(skin.texture).catch((error: unknown) => {
				console.warn('[DiceResultViewer] Skin texture unavailable; using the theme surface.', error)
				return null
			})
			: null
		if(!skin || !data) return { fields: {}, lightBody: null }
		const color = 0.299 * base[0] + 0.587 * base[1] + 0.114 * base[2]
		const image = data.luminance
		// Mean brightness of the layered surface, estimated per blend mode.
		const layered = { normal: image, multiply: color * image, screen: 1 - (1 - color) * (1 - image), overlay: color < 0.5 ? 2 * color * image : 1 - 2 * (1 - color) * (1 - image) }[skin.blend ?? 'normal']
		const body = color + (layered - color) * (skin.opacity ?? 1)
		const labels = skin.labels ?? 'auto'
		const lightBody = labels === 'auto' ? body > 0.5 : labels === 'dark'
		return {
			lightBody,
			fields: {
				skin: data.texture,
				skinScale: (skin.scale ?? 1) * 0.8,
				skinBlend: SKIN_BLENDS[skin.blend ?? 'normal'],
				skinOpacity: skin.opacity ?? 1,
				// Dark labels get a light outline and vice versa.
				outline: lightBody ? [0.96, 0.96, 0.96] : [0.04, 0.04, 0.05]
			}
		}
	}

	material(config: ResolvedThemeConfig, themeColor: string, skin: DiceSkinOptions | null = null): Promise<SurfaceMaterial> {
		const colorTheme = config.material.type === 'color'
		const activeSkin = colorTheme ? skin : null
		const key = `${config.theme}|${themeColor}|${skinKey(activeSkin)}`
		const cached = this.#materials.get(key)
		if(cached) return cached
		const pending = (async (): Promise<SurfaceMaterial> => {
			const base = parseHexColor(themeColor)
			const layer = await this.#skinLayer(activeSkin, base)
			// Labels contrast with the body: light body → dark atlas and vice versa.
			const lightBody = layer.lightBody ?? isLightColor(themeColor)
			const definition = config.material.diffuseTexture
			const diffuseFile = typeof definition === 'string'
				? definition
				: definition?.[lightBody ? 'dark' : 'light']
			const [diffuse, bump, specularMap] = await Promise.all([
				diffuseFile ? this.loadTexture(resolveAsset(config.basePath, diffuseFile), config.faceAtlas) : undefined,
				config.material.bumpTexture ? this.loadTexture(resolveAsset(config.basePath, config.material.bumpTexture)) : undefined,
				config.material.specularTexture ? this.loadTexture(resolveAsset(config.basePath, config.material.specularTexture)) : undefined
			])
			return {
				color: colorTheme ? base : [1, 1, 1],
				emissive: layer.fields.skin ? [0.05, 0.05, 0.05] : [base[0] * 0.18, base[1] * 0.18, base[2] * 0.18],
				specular: [0.35, 0.35, 0.35],
				diffuse,
				diffuseLevel: config.material.diffuseLevel ?? 1,
				colorMask: colorTheme,
				bump,
				bumpLevel: config.material.bumpLevel ?? 1,
				specularMap,
				...layer.fields
			}
		})()
		this.#materials.set(key, pending)
		pending.catch(() => this.#materials.delete(key))
		return pending
	}

	/**
	 * Face-artwork orientation (`faceAtlas.orientation`): the "up" direction
	 * of each label, used to present it upright whenever the die's symmetry
	 * allows. Themes without the file keep the physical orientation.
	 */
	glyphOrientation(config: ResolvedThemeConfig): Promise<ReadonlyMap<string, ReadonlyMap<number, Vec3>>> {
		const file = typeof config.faceAtlas?.orientation === 'string' ? config.faceAtlas.orientation : undefined
		if(!file) return Promise.resolve(new Map())
		const url = resolveAsset(config.basePath, file)
		const cached = this.#orientations.get(url)
		if(cached) return cached
		const pending = fetchJson<Record<string, Record<string, readonly number[]>>>(url, this.#baseUrl)
			.then(data => new Map(Object.entries(data).map(([type, values]) => [
				type,
				new Map(Object.entries(values).map(([value, direction]) => [Number(value), [direction[0] ?? 0, direction[1] ?? 0, direction[2] ?? 0] as Vec3]))
			])))
			.catch(() => new Map<string, ReadonlyMap<number, Vec3>>())
		this.#orientations.set(url, pending)
		return pending
	}

	coinGeometry(coin: CoinTheme, scale: number): CoinGeometry {
		const diameter = Math.max(0.3, Number(coin.diameter) || 1) * scale * 0.14
		const thickness = Math.max(0.04, Number(coin.thickness) || 0.12) * scale * 0.14
		const key = `${diameter}|${thickness}`
		const cached = this.#coinGeometry.get(key)
		if(cached) return cached
		const geometry = createCoinGeometry(this.#gl, diameter, thickness)
		this.#coinGeometry.set(key, geometry)
		return geometry
	}

	/**
	 * Coin face. Colorized coins are layered like dice (color and skin under
	 * the artwork, lit by the scene); full-artwork coins keep their own image.
	 */
	async coinFace(config: ResolvedThemeConfig, face: 'front' | 'back', themeColor: string, skin: DiceSkinOptions | null = null): Promise<SurfaceMaterial> {
		const coin = config.coin
		const activeSkin = coin.colorize ? skin : null
		const key = `coin|${config.theme}|${face}|${themeColor}|${skinKey(activeSkin)}`
		const cached = this.#materials.get(key)
		if(cached) return cached
		const pending = (async (): Promise<SurfaceMaterial> => {
			const url = resolveAsset(config.basePath, coin[face].texture)
			const image = await this.#loadImage(url, isSvgImage(url) ? { width: 256, height: 256 } : undefined).catch(() => null)
			const base = parseHexColor(themeColor)
			const layer = coin.colorize ? await this.#skinLayer(activeSkin, base) : null
			const surface = createTextureCanvas(256, 256)
			const context = getTextureContext(surface)
			if(context) {
				if(image) context.drawImage(image, 0, 0, 256, 256)
				else {
					context.font = 'bold 148px sans-serif'
					context.textAlign = 'center'
					context.textBaseline = 'middle'
					context.lineJoin = 'round'
					context.strokeStyle = '#111827'
					context.lineWidth = 12
					context.strokeText(String(coin[face].value), 128, 139)
					context.fillStyle = '#f8fafc'
					context.fillText(String(coin[face].value), 128, 139)
				}
				// Like the dice atlas, the marks turn dark on a light body (skin or color).
				if(layer && (layer.lightBody ?? isLightColor(themeColor))) invertNeutralPixels(context, 256)
			}
			const texture = this.#gl.createTexture(surface)
			if(!layer) return { color: [1, 1, 1], emissive: [0.22, 0.22, 0.22], specular: [0.3, 0.3, 0.3], diffuse: texture }
			return {
				color: base,
				emissive: layer.fields.skin ? [0.05, 0.05, 0.05] : [base[0] * 0.16, base[1] * 0.16, base[2] * 0.16],
				specular: [0.3, 0.3, 0.3],
				diffuse: texture,
				colorMask: true,
				...layer.fields
			}
		})()
		this.#materials.set(key, pending)
		return pending
	}

	/** Coin rim: a darker shade of the coin color, with the same skin layer. */
	async coinEdge(config: ResolvedThemeConfig, themeColor: string, skin: DiceSkinOptions | null = null): Promise<SurfaceMaterial> {
		const coin = config.coin
		const base = parseHexColor(coin.colorize ? themeColor : coin.edgeColor || themeColor)
		const color: Vec3 = coin.colorize ? [base[0] * 0.72, base[1] * 0.72, base[2] * 0.72] : base
		const layer = coin.colorize ? await this.#skinLayer(skin, color) : { fields: {} }
		return { color, emissive: [color[0] * 0.12, color[1] * 0.12, color[2] * 0.12], specular: [0.3, 0.3, 0.3], ...layer.fields }
	}

	dispose(): void {
		for(const pending of this.#textures.values()) void pending.then(texture => this.#gl.deleteTexture(texture)).catch(() => undefined)
		for(const pending of this.#skins.values()) void pending.then(skin => this.#gl.deleteTexture(skin.texture)).catch(() => undefined)
		for(const pending of this.#models.values()) void pending.then(model => {
			for(const geometry of model.geometry.values()) this.#gl.deleteMesh(geometry.visual)
		}).catch(() => undefined)
		for(const geometry of this.#coinGeometry.values()) {
			for(const mesh of [geometry.front, geometry.back, geometry.edge]) this.#gl.deleteMesh(mesh)
		}
		this.#textures.clear()
		this.#models.clear()
		this.#materials.clear()
		this.#shapes.clear()
		this.#coinGeometry.clear()
		this.#orientations.clear()
	}

	/**
	 * Forgets every GPU resource after the WebGL context was lost (they died
	 * with it and must not be deleted); the next requests rebuild them. Physics
	 * shapes and label orientations are plain data and stay.
	 */
	reset(): void {
		this.#textures.clear()
		this.#skins.clear()
		this.#models.clear()
		this.#materials.clear()
		this.#coinGeometry.clear()
	}
}

export interface CoinGeometry {
	readonly front: GLMesh
	readonly back: GLMesh
	readonly edge: GLMesh
	readonly shape: DiceShape
	readonly radius: number
	readonly halfThickness: number
}

/**
 * Procedural d2 with the v2 CoinFactory proportions. Value 1 is the +Y face,
 * value 2 the -Y face (reached by a half turn about Z, as in v2).
 */
const createCoinGeometry = (gl: DiceGL, diameter: number, thickness: number): CoinGeometry => {
	const segments = 48
	const radius = diameter / 2
	const half = thickness / 2
	const artRadius = diameter * 0.48
	const cap = (sign: 1 | -1): GLMesh => {
		const y = sign * (half + 0.001)
		const positions = [0, y, 0], normals = [0, sign, 0], uvs = [0.5, 0.5], indices: number[] = []
		for(let i = 0; i <= segments; i++) {
			const angle = i / segments * Math.PI * 2
			const x = Math.cos(angle) * artRadius, z = Math.sin(angle) * artRadius
			positions.push(x, y, z)
			normals.push(0, sign, 0)
			// Front: +u right, +v towards -Z (screen up). Back is read after a half
			// turn about Z, which mirrors X on screen.
			uvs.push(0.5 + sign * x / (2 * artRadius), 0.5 - z / (2 * artRadius))
			if(i) indices.push(0, i, i + 1)
		}
		return gl.createMesh(new Float32Array(positions), new Float32Array(normals), new Float32Array(uvs), indices)
	}
	const positions: number[] = [], normals: number[] = [], uvs: number[] = [], indices: number[] = []
	for(let i = 0; i <= segments; i++) {
		const angle = i / segments * Math.PI * 2
		const x = Math.cos(angle), z = Math.sin(angle)
		positions.push(x * radius, half, z * radius, x * radius, -half, z * radius)
		normals.push(x, 0, z, x, 0, z)
		uvs.push(0, 0, 0, 0)
		if(i) indices.push(i * 2 - 2, i * 2 - 1, i * 2, i * 2 - 1, i * 2 + 1, i * 2)
	}
	return {
		front: cap(1),
		back: cap(-1),
		edge: gl.createMesh(new Float32Array(positions), new Float32Array(normals), new Float32Array(uvs), indices),
		shape: createCoinShape(radius, half),
		radius,
		halfThickness: half
	}
}
