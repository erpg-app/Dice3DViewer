import type {
	CoinFaceTheme,
	CoinTheme,
	RequiredViewerOptions,
	ResolvedThemeConfig,
	ThemeConfig,
	ThemeMaterialConfig
} from './types'

const DEFAULT_COIN_THEME: CoinTheme = Object.freeze({
	front: Object.freeze({ value: 1, texture: 'coin-1.svg' }),
	back: Object.freeze({ value: 2, texture: 'coin-2.svg' }),
	colorize: true,
	edgeColor: '#c89b3c',
	diameter: 1,
	thickness: 0.12
})

const isRecord = (value: unknown): value is Record<string, unknown> =>
	value !== null && typeof value === 'object' && !Array.isArray(value)

const assertOptionalFiniteNonNegative = (value: unknown, path: string): void => {
	if(value !== undefined && (typeof value !== 'number' || !Number.isFinite(value) || value < 0)) {
		throw new Error(`${path} must be a finite non-negative number.`)
	}
}

const assertFace = (value: unknown, expectedValue: 1 | 2, path: string): CoinFaceTheme => {
	if(!isRecord(value) || value.value !== expectedValue || typeof value.texture !== 'string') {
		throw new Error(`${path} must define value ${expectedValue} and a texture string.`)
	}
	return value as unknown as CoinFaceTheme
}

const assertMaterial = (value: unknown, theme: string): ThemeMaterialConfig => {
	if(!isRecord(value) || (value.type !== 'color' && value.type !== 'standard')) {
		throw new Error(`Theme '${theme}' material.type must be 'color' or 'standard'.`)
	}
	const diffuse = value.diffuseTexture
	if(diffuse !== undefined && typeof diffuse !== 'string' && (
		!isRecord(diffuse)
		|| typeof diffuse.light !== 'string'
		|| typeof diffuse.dark !== 'string'
	)) {
		throw new Error(`Theme '${theme}' material.diffuseTexture must be a string or light/dark map.`)
	}
	if(value.invertOnLightBody !== undefined && typeof value.invertOnLightBody !== 'boolean') {
		throw new Error(`Theme '${theme}' material.invertOnLightBody must be a boolean.`)
	}
	for(const field of ['bumpTexture', 'specularTexture'] as const) {
		if(value[field] !== undefined && typeof value[field] !== 'string') {
			throw new Error(`Theme '${theme}' material.${field} must be a string.`)
		}
	}
	for(const field of ['diffuseLevel', 'bumpLevel', 'specularPower'] as const) {
		assertOptionalFiniteNonNegative(value[field], `Theme '${theme}' material.${field}`)
	}
	return value as unknown as ThemeMaterialConfig
}

export const assertThemeConfig = (value: unknown, theme: string): ThemeConfig => {
	if(!value || typeof value !== 'object') {
		throw new Error(`Theme '${theme}' returned an invalid configuration.`)
	}
	const config = value as Partial<ThemeConfig>
	assertMaterial(config.material, theme)
	if(!Array.isArray(config.diceAvailable)
		|| config.diceAvailable.some(die => typeof die !== 'string' || die.trim().length === 0)) {
		throw new Error(`Theme '${theme}' must define material and diceAvailable.`)
	}
	if(config.meshFile !== undefined && (typeof config.meshFile !== 'string' || config.meshFile.trim().length === 0)) {
		throw new Error(`Theme '${theme}' meshFile must be a non-empty string.`)
	}
	if(config.coin !== undefined) {
		if(!isRecord(config.coin)) throw new Error(`Theme '${theme}' coin must be an object.`)
		assertFace(config.coin.front, 1, `Theme '${theme}' coin.front`)
		assertFace(config.coin.back, 2, `Theme '${theme}' coin.back`)
		if(config.coin.colorize !== undefined && typeof config.coin.colorize !== 'boolean') {
			throw new Error(`Theme '${theme}' coin.colorize must be a boolean.`)
		}
		if(config.coin.edgeColor !== undefined && typeof config.coin.edgeColor !== 'string') {
			throw new Error(`Theme '${theme}' coin.edgeColor must be a string.`)
		}
		for(const field of ['diameter', 'thickness'] as const) {
			const dimension = config.coin[field]
			if(dimension !== undefined && (typeof dimension !== 'number' || !Number.isFinite(dimension) || dimension <= 0)) {
				throw new Error(`Theme '${theme}' coin.${field} must be a positive finite number.`)
			}
		}
	}
	return config as ThemeConfig
}

export class ThemeRepository {
	readonly #cache = new Map<string, Promise<ResolvedThemeConfig>>()
	#options: Readonly<RequiredViewerOptions>

	constructor(options: Readonly<RequiredViewerOptions>) {
		this.#options = options
	}

	updateOptions(options: Readonly<RequiredViewerOptions>): void {
		const pathsChanged = options.assetPath !== this.#options.assetPath
			|| options.origin !== this.#options.origin
			|| options.externalThemes !== this.#options.externalThemes
		this.#options = options
		if(pathsChanged) this.#cache.clear()
	}

	load(theme: string): Promise<ResolvedThemeConfig> {
		const cached = this.#cache.get(theme)
		if(cached) return cached
		const pending = this.#fetch(theme)
		this.#cache.set(theme, pending)
		pending.catch(() => this.#cache.delete(theme))
		return pending
	}

	async #fetch(theme: string): Promise<ResolvedThemeConfig> {
		const externalPath = this.#options.externalThemes[theme]
		const basePath = externalPath
			? externalPath.replace(/\/$/, '')
			: `${this.#options.origin}${this.#options.assetPath}themes/${theme}`.replace(/\/$/, '')
		const response = await fetch(`${basePath}/theme.config.json`)
		if(!response.ok) {
			throw new Error(`Unable to fetch config for theme '${theme}' (${response.status} ${response.statusText}).`)
		}
		const raw = assertThemeConfig(await response.json(), theme)
		const meshFile = typeof raw.meshFile === 'string' ? raw.meshFile : 'default.json'
		const meshName = meshFile.replace(/\.[^.]+$/, '')
		const fallbackCoinBase = `${this.#options.origin}${this.#options.assetPath}themes/default`.replace(/\/$/, '')
		const coin = raw.coin ?? {
			...DEFAULT_COIN_THEME,
			front: { ...DEFAULT_COIN_THEME.front, texture: `${fallbackCoinBase}/${DEFAULT_COIN_THEME.front.texture}` },
			back: { ...DEFAULT_COIN_THEME.back, texture: `${fallbackCoinBase}/${DEFAULT_COIN_THEME.back.texture}` }
		}
		const config: ResolvedThemeConfig = Object.freeze({
			...raw,
			theme,
			basePath,
			meshName,
			meshFilePath: typeof raw.meshFile === 'string'
				? `${basePath}/${meshFile}`
				: `${this.#options.origin}${this.#options.assetPath}themes/default/default.json`,
			coin: Object.freeze({
				...coin,
				front: Object.freeze({ ...coin.front }),
				back: Object.freeze({ ...coin.back })
			})
		})
		this.#options.onThemeConfigLoaded(config)
		return config
	}
}

export { DEFAULT_COIN_THEME }
