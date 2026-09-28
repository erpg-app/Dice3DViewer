import type {
	DiceSkinOptions,
	DisplayRenderer,
	ParticleBurstMoment,
	NormalizedDisplayRequest,
	NormalizedResolvedDie,
	RendererContext,
	RequiredViewerOptions,
	ResolvedDie,
	ResolvedThemeConfig
} from '../types'
import {
	createTimelineProgressTracker,
	dispatchTimelineProgress,
	type DiceTimelinePlan,
	type TimelineEffectName,
	type TimelineProgressTracker
} from '../timeline'
import { createPhysicsExplosionScheduler, type PhysicsExplosionScheduleItem } from '../physicsTimelineScheduler'
import { DisplayCancelledError } from '../errors'
import {
	DISPLAY_CAMERA_FOV,
	DISPLAY_CAMERA_HEIGHT,
	DISPLAY_DIRECTIONAL_INTENSITY,
	DISPLAY_HEMISPHERIC_INTENSITY,
	DISPLAY_LIGHT_DIRECTION
} from './sceneEnvironment'
import { DiceGL, lookAt, multiply, perspective, type DrawState, type FrameSetup, type GLMesh, type ParticleShaders, type SurfaceMaterial } from '../render/gl'
import { AssetLibrary, parseHexColor, type CoinGeometry, type ModelDieType } from '../render/assets'
import { getCoinAccentColor, getCoinTargetQuaternion } from '../render/coinTheme'
import { faceTargetQuaternion, type DiceShape } from '../engine/shape'
import { sampleTrack, type Track } from '../engine/track'
import {
	followUpThrowSteps,
	physicsThrowSteps,
	runSliced,
	type FollowUpReroll,
	type RestingBody,
	type ThrowChild
} from '../engine/physicsThrow'
import type { ThrowBody, ThrowOptions } from '../engine/throw'
import { normalize, qmul, quatFromAxisAngle, type Quat, type Vec3 } from '../engine/vector'
import type { SimulationMarker } from '../engine/simulation'
import type { ParticleSystem } from '../render/particles'
import { parseParticleColor } from '../particleOptions'
import { loadParticlePresets } from '../particlePresetLoader'

type PolyhedronVisual = {
	readonly kind: 'polyhedron'
	readonly mesh: GLMesh
	readonly material: SurfaceMaterial
	readonly scale: number
}
type CoinVisual = {
	readonly kind: 'coin'
	readonly geometry: CoinGeometry
	readonly front: SurfaceMaterial
	readonly back: SurfaceMaterial
	readonly edge: SurfaceMaterial
}

/** How a body's visual was made, so it can be rebuilt after a lost WebGL context. */
interface VisualRecipe {
	readonly config: ResolvedThemeConfig
	readonly themeColor: string
	readonly skin: DiceSkinOptions | null
	readonly type: ModelDieType | 'coin'
}

interface Entry {
	readonly dieId: string
	readonly name: string
	readonly sides: number
	value: number
	readonly shape: DiceShape
	visual: PolyhedronVisual | CoinVisual
	readonly recipe: VisualRecipe
	readonly accentColor: string
	readonly glyphUps: ReadonlyMap<number, Vec3> | undefined
	/** The whole die this body shows (shared by both bodies of a d100), for particle conditions. */
	readonly die: { readonly sides: number; value: number }
	position: Vec3
	rotation: Quat
	visible: boolean
	alpha: number
	/** Visual size factor (explosion children grow out of their parent). */
	scale: number
	/** 1 = theme colors; discarded dice are greyed out. */
	saturation: number
}

interface Handle {
	readonly die: NormalizedResolvedDie
	readonly config: ResolvedThemeConfig
	readonly entries: Entry[]
}

interface Transient {
	readonly entries: readonly Entry[]
	readonly start: number
	readonly duration: number
	readonly color: Vec3
	readonly pulses: number
	readonly intensity: number
	readonly colorFor?: (entry: Entry) => Vec3 | undefined
}

/** Shock ring expanding on the table under a die (explosions, rerolls, criticals). */
interface Ring {
	readonly x: number
	readonly z: number
	readonly radius: number
	readonly start: number
	readonly color: Vec3
	readonly strength: number
}

interface PlaybackHandlers {
	readonly onSettle?: (body: number) => void
	readonly onExplode?: (parent: number, child: number) => void
	/** Bodies that do not move in this track (resting obstacles); their pose is left untouched. */
	readonly still?: ReadonlySet<number>
}

/** Per-geometry mass profile of the v2 physics calibration. */
const TYPE_MASS: Readonly<Record<number, number>> = { 2: 0.7, 4: 0.82, 6: 1, 8: 0.92, 10: 0.88, 12: 1.08, 20: 1.18, 100: 0.88 }
/** Discarded dice keep their opacity and lose color, so the kept ones stand out. */
const DISCARDED_SATURATION = 0.05
/** A new presentation fades the previous dice out instead of removing them at once. */
const EXIT_MS = 280
/** Longest step of the animation clock: a slow frame delays the motion, it never skips it. */
const MAX_FRAME_MS = 50
const RING_MS = 650
/** Reduced motion: dice fade in at rest instead of being thrown. */
const STILL_FADE_MS = 240
const clamp01 = (value: number): number => Math.max(0, Math.min(1, value))
const easeOut = (value: number): number => 1 - (1 - value) * (1 - value)
const NO_GLOW: { readonly color: Vec3; readonly strength: number } = { color: [0, 0, 0], strength: 0 }
const lightColors = new Map<string, Vec3>()
/** A die's own color as light: dark colors are lifted so near-black dice still shine in their hue. */
const lightColor = (hex: string): Vec3 => {
	let color = lightColors.get(hex)
	if(!color) {
		const base = parseHexColor(hex, [1, 1, 1])
		const peak = Math.max(base[0], base[1], base[2], 1e-3)
		const lift = peak < 0.75 ? 0.75 / peak : 1
		color = [Math.min(1, base[0] * lift), Math.min(1, base[1] * lift), Math.min(1, base[2] * lift)]
		lightColors.set(hex, color)
	}
	return color
}

/**
 * WebGL presentation of dice results. Every motion comes from the
 * deterministic physics engine: throws, explosions and rerolls alike.
 */
export class SceneRenderer implements DisplayRenderer {
	readonly mode = 'physics' as const
	#context: RendererContext | undefined
	#options: Readonly<RequiredViewerOptions> | undefined
	#gl: DiceGL | undefined
	#assets: AssetLibrary | undefined
	#entries: Entry[] = []
	#transients: Transient[] = []
	#rings: Ring[] = []
	#outgoing: { readonly entries: readonly Entry[]; readonly start: number } | null = null
	/** Particle engine, loaded on first use (only when the viewer has a particle effect). */
	#particles: ParticleSystem | null = null
	#customizeEffect: typeof import('../render/particles').customizeEffect | null = null
	#particleShaders: ParticleShaders | null = null
	/** Images of image particles, created with the particle engine. */
	#particleAtlas: import('../render/particles').ParticleAtlas | null = null
	#particleClock = 0
	/** When the dice last moved (links fade out from there), and one key per pair of dice. */
	#linkMoved = 0
	readonly #linkKeys = new WeakMap<Entry, WeakMap<Entry, object>>()
	/** Resting dice emitting their aura: when it started and whether it skips the conditions (manual). */
	readonly #auras = new Map<Entry, { readonly since: number; readonly always: boolean }>()
	#particleSeed = 'particles'
	#frameRequest: number | null = null
	#ambientRequest: number | null = null
	/** Animation loops currently rendering every frame. */
	#running = 0
	#generation = 0
	#width = 300
	#height = 150
	/** A lost WebGL context is being rebuilt: nothing is drawn meanwhile. */
	#restoring = false

	async init(context: RendererContext): Promise<void> {
		if(this.#gl) return
		this.#context = context
		this.#options = context.options
		this.#gl = new DiceGL(context.canvas, context.options.antialias, () => void this.#restore())
		this.#assets = new AssetLibrary(this.#gl)
		const width = Math.max(1, context.canvas.clientWidth || context.canvas.parentElement?.clientWidth || 300)
		const height = Math.max(1, context.canvas.clientHeight || context.canvas.parentElement?.clientHeight || 150)
		this.resize(width, height)
	}

	async display(request: NormalizedDisplayRequest, signal: AbortSignal): Promise<void> {
		this.#assertReady()
		this.#retire()
		await this.#prepareParticles(request.seed)
		if(signal.aborted) throw new DisplayCancelledError()
		const configs = await this.#loadThemes(request.dice.map(die => die.theme))
		if(signal.aborted) throw new DisplayCancelledError()
		const handles: Handle[] = []
		for(const die of request.dice) handles.push(await this.#createHandle(die, configs.get(die.theme)!))
		if(signal.aborted) throw new DisplayCancelledError()
		const entries = handles.flatMap(handle => handle.entries)
		this.#entries = entries
		const track = await this.#throw(entries, request.seed, [], signal)
		await this.#play(track, entries, signal)
	}

	async displayTimeline(plan: DiceTimelinePlan, signal: AbortSignal): Promise<void> {
		this.#assertReady()
		this.#retire()
		await this.#prepareParticles(plan.seed)
		if(signal.aborted) throw new DisplayCancelledError()
		const configs = await this.#loadThemes([...plan.definitions.values()].map(definition => definition.theme))
		if(signal.aborted) throw new DisplayCancelledError()
		const options = this.#options!
		const progress = createTimelineProgressTracker(plan)
		const handles = new Map<string, Handle>()
		for(const die of plan.initialDice) {
			const handle = await this.#createHandle(die as NormalizedResolvedDie, configs.get(die.theme!)!)
			handles.set(die.id, handle)
		}
		const initialEntries = [...handles.values()].flatMap(handle => handle.entries)
		this.#entries = [...initialEntries]
		let explosionPhaseCount = 0
		while(plan.phases[explosionPhaseCount]?.actions[0]?.kind === 'explode') explosionPhaseCount++

		let phaseIndex = 0
		if(explosionPhaseCount > 0) {
			phaseIndex = await this.#playLeadingExplosions(plan, handles, configs, progress, explosionPhaseCount, signal)
		} else {
			const track = await this.#throw(initialEntries, `${plan.seed}:initial`, [], signal)
			await this.#play(track, initialEntries, signal)
			dispatchTimelineProgress(options.onTimelineProgress, progress.initial())
		}

		for(; phaseIndex < plan.phases.length; phaseIndex++) {
			const phase = plan.phases[phaseIndex]!
			await this.#wait(options.timeline.phaseGapMs + phase.delayMs, signal)
			const first = phase.actions[0]
			if(first?.kind === 'explode') await this.#explosionPhase(plan, phaseIndex, handles, configs, signal)
			else if(first?.kind === 'reroll') await this.#rerollPhase(plan, phaseIndex, handles, signal)
			else if(first?.kind === 'selection') {
				const discarded = phase.actions.flatMap(action => handles.get(action.dieId)?.entries ?? [])
				// Keep/drop: the dice that remain answer with a soft glow while the others grey out.
				const kept = phase.effect === 'compound'
					? []
					: this.#entries.filter(entry => entry.visible && entry.saturation > 0.99 && !discarded.includes(entry))
				await this.#discard(discarded, kept, phase.durationMs, signal)
			} else {
				// Transforms (compound, penetrate) and classifications pulse in the effect color.
				const entries: Entry[] = []
				let pulses = 1
				for(const action of phase.actions) {
					entries.push(...(handles.get(action.dieId)?.entries ?? []))
					if(action.kind === 'classify') pulses = Math.max(pulses, action.pulses)
				}
				if(phase.effect === 'criticalSuccess' || phase.effect === 'criticalFailure') {
					const color = parseHexColor(options.timeline.effects[phase.effect].color, [1, 1, 1])
					for(const entry of entries) {
						this.#ring(entry, color, 1)
						this.#particles?.burst('critical', entry.position, entry.shape.radius, { subject: entry.die, key: entry })
					}
					this.#ambient()
				}
				if(entries.length) await this.#pulse(entries, phase.effect, phase.durationMs, pulses, signal)
			}
			dispatchTimelineProgress(options.onTimelineProgress, progress.completePhase(phaseIndex))
		}
		dispatchTimelineProgress(options.onTimelineProgress, progress.complete())
	}

	updateOptions(options: Readonly<RequiredViewerOptions>): void {
		const particlesChanged = options.particles !== this.#options?.particles
		this.#options = options
		// A new effect applies at once to what is still emitting (trails, auras).
		if(particlesChanged) void this.#prepareParticles(this.#particleSeed).catch((error: unknown) => console.error('[DiceResultViewer] Particle effect failed to load:', error))
		this.#requestRender()
		if(options.glow?.pulse) this.#ambient()
	}

	/** Plays a particle moment now on the dice on the table (all of them or `dieIds`), ignoring conditions. */
	playParticles(moment: ParticleBurstMoment, dieIds?: readonly string[]): void {
		const particles = this.#particles
		if(!particles) return
		const now = performance.now()
		for(const entry of this.#entries) {
			if(!entry.visible || (dieIds && !dieIds.includes(entry.dieId))) continue
			if(moment === 'aura') this.#auras.set(entry, { since: now, always: true })
			else particles.burst(moment, entry.position, entry.shape.radius, { always: true, key: entry })
		}
		this.#ambient()
	}

	resize(width: number, height: number): void {
		if(!this.#context) return
		this.#width = Math.max(1, width)
		this.#height = Math.max(1, height)
		const ratio = typeof window === 'undefined' ? 1 : Math.min(2, window.devicePixelRatio || 1)
		this.#context.canvas.width = Math.max(1, Math.round(this.#width * ratio))
		this.#context.canvas.height = Math.max(1, Math.round(this.#height * ratio))
		this.#requestRender()
	}

	/** Removes everything at once (public `clear()`). */
	clear(): void {
		this.#generation++
		if(typeof cancelAnimationFrame === 'function') {
			if(this.#frameRequest !== null) cancelAnimationFrame(this.#frameRequest)
			if(this.#ambientRequest !== null) cancelAnimationFrame(this.#ambientRequest)
		}
		this.#frameRequest = null
		this.#ambientRequest = null
		this.#entries = []
		this.#transients = []
		this.#rings = []
		this.#outgoing = null
		this.#particles?.clear()
		this.#auras.clear()
		this.#render()
	}

	dispose(): void {
		this.clear()
		this.#assets?.dispose()
		this.#gl?.dispose()
		this.#assets = undefined
		this.#gl = undefined
	}

	/** Reduced motion: the `reducedMotion` option, or the system setting when it is `auto`. */
	#reducedMotion(): boolean {
		const mode = this.#options?.reducedMotion ?? 'auto'
		if(mode !== 'auto') return mode === 'always'
		return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
	}

	/**
	 * The WebGL context came back (the browser may drop it, e.g. on mobile in
	 * the background): programs are rebuilt by DiceGL, textures and meshes here,
	 * and the dice on screen reappear exactly where they were.
	 */
	async #restore(): Promise<void> {
		const assets = this.#assets
		if(!assets) return
		this.#restoring = true
		try {
			assets.reset()
			const entries = new Set([...this.#entries, ...(this.#outgoing?.entries ?? [])])
			for(const entry of entries) entry.visual = await this.#buildVisual(entry.recipe)
		} catch(error) {
			console.error('[DiceResultViewer] Could not rebuild the scene after a lost WebGL context:', error)
		} finally {
			this.#restoring = false
			this.#requestRender()
		}
	}

	/** Starts a new scene: the previous dice fade out while the next throw begins. */
	#retire(): void {
		this.#generation++
		this.#auras.clear()
		const leaving = this.#entries.filter(entry => entry.visible && entry.alpha > 0.01)
		this.#entries = []
		this.#transients = []
		this.#outgoing = leaving.length ? { entries: leaving, start: performance.now() } : null
		this.#ambient()
	}

	/**
	 * Selects the particle effect for this presentation. The engine and its
	 * presets are a separate chunk, fetched the first time an effect is used;
	 * live particles of the previous roll keep fading meanwhile.
	 */
	async #prepareParticles(seed: string): Promise<void> {
		this.#particleSeed = seed
		const options = this.#options!.particles
		if(options && !this.#particles) {
			const engine = await import('../render/particles')
			this.#particleAtlas ??= new engine.ParticleAtlas(() => this.#requestRender())
			const atlas = this.#particleAtlas
			this.#particles ??= new engine.ParticleSystem(url => atlas.slot(url))
			this.#customizeEffect = engine.customizeEffect
			this.#particleShaders = { vertex: engine.PARTICLE_VERTEX, fragment: engine.PARTICLE_FRAGMENT }
		}
		// A full definition wins; preset names load the preset chunk on first use.
		// Reduced motion plays no particles at all.
		const base = this.#reducedMotion() ? null : options?.effect ?? (options?.preset ? (await loadParticlePresets())[options.preset] : null)
		const effect = options && base && this.#customizeEffect ? this.#customizeEffect(base, options) : null
		// Options may have changed while the chunks were loading.
		if(this.#options!.particles !== options) return
		this.#particleAtlas?.prepare(effect)
		this.#particles?.configure(effect, options?.intensity ?? 1, seed)
	}

	// ---------- scene construction ----------

	async #loadThemes(themes: readonly string[]): Promise<Map<string, ResolvedThemeConfig>> {
		const configs = new Map<string, ResolvedThemeConfig>()
		for(const theme of new Set(themes)) {
			const config = await this.#context!.loadTheme(theme)
			configs.set(theme, config)
			await this.#assets!.loadModel(config.meshFilePath)
			this.#options!.onThemeLoaded(config)
		}
		return configs
	}

	/** d100 is shown as a tens die plus a units d10 (v2 mapping). */
	#bodyValues(sides: number, value: number): number[] {
		if(sides !== 100) return [value]
		const tens = Math.floor((value - 1) / 10) * 10
		return [tens, value - tens]
	}

	async #createHandle(die: Pick<ResolvedDie, 'id' | 'sides' | 'value'> & Partial<NormalizedResolvedDie>, config: ResolvedThemeConfig): Promise<Handle> {
		const options = this.#options!
		const assets = this.#assets!
		const normalized: NormalizedResolvedDie = {
			id: die.id,
			sides: die.sides,
			value: die.value,
			discarded: Boolean(die.discarded),
			theme: die.theme ?? config.theme,
			themeColor: die.themeColor ?? options.themeColor
		}
		const entries: Entry[] = []
		const base = {
			die: { sides: normalized.sides, value: normalized.value },
			position: [0, -50, 0] as Vec3,
			rotation: [0, 0, 0, 1] as Quat,
			visible: false,
			alpha: 1,
			scale: 1,
			saturation: normalized.discarded ? DISCARDED_SATURATION : 1
		}
		const recipe = (type: VisualRecipe['type']): VisualRecipe => ({ config, themeColor: normalized.themeColor, skin: options.skin, type })
		if(normalized.sides === 2) {
			const coin = recipe('coin')
			const visual = await this.#buildVisual(coin)
			entries.push({
				...base,
				dieId: normalized.id,
				name: normalized.id,
				sides: 2,
				value: normalized.value,
				shape: assets.coinGeometry(config.coin, options.scale).shape,
				visual,
				recipe: coin,
				accentColor: getCoinAccentColor(config.coin, normalized.themeColor),
				glyphUps: undefined
			})
			return { die: normalized, config, entries }
		}
		const model = await assets.loadModel(config.meshFilePath)
		const orientation = await assets.glyphOrientation(config)
		const values = this.#bodyValues(normalized.sides, normalized.value)
		const types: ModelDieType[] = normalized.sides === 100 ? ['d100', 'd10'] : [`d${normalized.sides}` as ModelDieType]
		for(const [index, type] of types.entries()) {
			if(!model.geometry.get(type)) throw new Error(`${type} is unavailable in theme '${config.theme}'.`)
			const made = recipe(type)
			entries.push({
				...base,
				dieId: normalized.id,
				name: normalized.sides === 100 ? `${normalized.id}-${index === 0 ? 'tens' : 'ones'}` : normalized.id,
				sides: type === 'd100' ? 100 : Number(type.slice(1)),
				value: values[index]!,
				shape: assets.shapeFor(model, type, options.scale * options.colliderScale),
				visual: await this.#buildVisual(made),
				recipe: made,
				accentColor: normalized.themeColor,
				glyphUps: orientation.get(type)
			})
		}
		return { die: normalized, config, entries }
	}

	/** Meshes and materials of a body (also used to rebuild them after a lost context). */
	async #buildVisual(recipe: VisualRecipe): Promise<PolyhedronVisual | CoinVisual> {
		const assets = this.#assets!
		const scale = this.#options!.scale
		const { config, themeColor, skin } = recipe
		if(recipe.type === 'coin') {
			const [front, back, edge] = await Promise.all([
				assets.coinFace(config, 'front', themeColor, skin),
				assets.coinFace(config, 'back', themeColor, skin),
				assets.coinEdge(config, themeColor, skin)
			])
			return { kind: 'coin', geometry: assets.coinGeometry(config.coin, scale), front, back, edge }
		}
		const [model, material] = await Promise.all([assets.loadModel(config.meshFilePath), assets.material(config, themeColor, skin)])
		const geometry = model.geometry.get(recipe.type)
		if(!geometry) throw new Error(`${recipe.type} is unavailable in theme '${config.theme}'.`)
		return { kind: 'polyhedron', mesh: geometry.visual, material, scale }
	}

	#canonicalTarget(entry: Entry): Quat {
		if(entry.sides === 2) return getCoinTargetQuaternion(entry.value)
		return faceTargetQuaternion(entry.shape, entry.value)
	}

	#throwOptions(): ThrowOptions {
		const options = this.#options!
		const explode = options.timeline.effects.explode
		return {
			width: this.#width,
			height: this.#height,
			scale: options.scale,
			startingHeight: options.startingHeight,
			spawnSpacing: options.spawnSpacing,
			spawnHeightStep: options.spawnHeightStep,
			spawnOverscan: options.spawnOverscan,
			throwForce: options.throwForce,
			spinForce: options.spinForce,
			delay: options.delay,
			aggressiveThrowChance: options.aggressiveThrowChance,
			wallPadding: options.wallPadding,
			gravity: options.gravity,
			friction: options.friction,
			restitution: options.restitution,
			linearDamping: options.linearDamping,
			angularDamping: options.angularDamping,
			settleTimeout: options.settleTimeout,
			burstHeight: explode.burstHeight,
			spread: explode.spread
		}
	}

	#throwBody(entry: Entry): ThrowBody {
		const readUp = entry.glyphUps?.get(entry.value)
		return {
			shape: entry.shape,
			value: entry.value,
			canonicalTarget: this.#canonicalTarget(entry),
			coin: entry.sides === 2,
			mass: this.#options!.mass * (TYPE_MASS[entry.sides] ?? 1),
			...(readUp ? { readUp } : {})
		}
	}

	#resting(entry: Entry): RestingBody {
		return { ...this.#throwBody(entry), position: entry.position, orientation: entry.rotation }
	}

	/** A deterministic physical throw, computed in slices so large throws never block the page. */
	async #throw(entries: readonly Entry[], seed: string, children: readonly { readonly entry: Entry; readonly parent: number }[], signal: AbortSignal): Promise<Track> {
		const fromEdge = this.#options!.timeline.effects.explode.origin === 'edge'
		return runSliced(physicsThrowSteps(
			entries.map(entry => this.#throwBody(entry)),
			seed,
			this.#throwOptions(),
			children.map((child): ThrowChild => ({ ...this.#throwBody(child.entry), parent: child.parent, fromEdge }))
		), signal)
	}

	// ---------- playback ----------

	#play(track: Track, entries: readonly Entry[], signal: AbortSignal, handlers: PlaybackHandlers = {}): Promise<void> {
		if(this.#reducedMotion()) return this.#playStill(track, entries, signal, handlers)
		const markers = [...track.markers].sort((left, right) => left.frame - right.frame)
		let nextMarker = 0
		const particles = this.#particles
		/** Hits scale the burst: a soft touch barely dusts, a hard throw sprays. */
		const strength = (force: number | undefined): number => Math.max(0.35, Math.min(1.4, (force ?? 4) / 8))
		const emit = (marker: SimulationMarker): void => {
			const entry = entries[marker.body]
			if(marker.type === 'collision' && marker.other !== undefined) {
				const other = entries[marker.other]
				try {
					this.#options!.onCollision({ action: 'collision', ...(entry ? { body0Id: entry.name } : {}), ...(other ? { body1Id: other.name } : {}), force: marker.force ?? 0 })
				} catch(error) {
					console.error('[DiceResultViewer] onCollision callback failed:', error)
				}
				if(entry && other) {
					const middle: Vec3 = [(entry.position[0] + other.position[0]) / 2, (entry.position[1] + other.position[1]) / 2, (entry.position[2] + other.position[2]) / 2]
					particles?.burst('collision', middle, entry.shape.radius, { strength: strength(marker.force) * 0.7, force: marker.force ?? 0, subject: [entry.die, other.die], key: entry })
				}
			} else if(marker.type === 'impact') {
				if(entry) particles?.burst('impact', [entry.position[0], 0.05, entry.position[2]], entry.shape.radius, { strength: strength(marker.force), force: marker.force ?? 0, subject: entry.die, key: entry })
			} else if(marker.type === 'settle') {
				if(entry) {
					particles?.burst('settle', entry.position, entry.shape.radius, { subject: entry.die, key: entry })
					if(particles?.auraSeconds) this.#auras.set(entry, { since: performance.now(), always: false })
				}
				handlers.onSettle?.(marker.body)
			} else if(marker.type === 'explode' && marker.other !== undefined) {
				if(entry) particles?.burst('explode', entry.position, entry.shape.radius, { subject: entry.die, key: entry })
				handlers.onExplode?.(marker.body, marker.other)
			}
		}
		const lastFrame = track.frames.length - 1
		const trails = particles?.hasTrail ?? false
		const previous = new Map<Entry, Vec3>()
		let lastElapsed = 0
		// Particles and auras outlive the motion: keep frames coming after playback.
		this.#ambient()
		return this.#run(signal, elapsed => {
			const frame = elapsed / 1000 * track.fps
			const dt = (elapsed - lastElapsed) / 1000
			lastElapsed = elapsed
			entries.forEach((entry, index) => {
				if(handlers.still?.has(index)) return
				const pose = sampleTrack(track, index, frame)
				if(trails && pose.visible && dt > 0) {
					const before = previous.get(entry)
					if(before) {
						const velocity: Vec3 = [(pose.position[0] - before[0]) / dt, (pose.position[1] - before[1]) / dt, (pose.position[2] - before[2]) / dt]
						particles?.trail(entry, pose.position, velocity, dt, entry.shape.radius, entry.die)
						// Marks on the table only while the die rolls on it, not in the air.
						if(pose.position[1] < entry.shape.radius * 1.4) particles?.ground(entry, pose.position, velocity, dt, entry.shape.radius, entry.die)
					}
					previous.set(entry, pose.position)
				}
				entry.visible = pose.visible
				entry.position = pose.position
				entry.rotation = pose.rotation
				entry.scale = pose.scale
			})
			while(nextMarker < markers.length && markers[nextMarker]!.frame <= frame) emit(markers[nextMarker++]!)
			if(frame >= lastFrame) {
				while(nextMarker < markers.length) emit(markers[nextMarker++]!)
				return true
			}
			return false
		})
	}

	/**
	 * Reduced motion: no throw. Dice that change place fade out, the others
	 * fade in at their resting pose; the timeline still receives every settle
	 * and explosion, in order.
	 */
	async #playStill(track: Track, entries: readonly Entry[], signal: AbortSignal, handlers: PlaybackHandlers): Promise<void> {
		const last = track.frames.length - 1
		const moving = entries.filter((entry, index) => !handlers.still?.has(index))
		const leaving = moving.filter(entry => entry.visible)
		if(leaving.length) {
			await this.#run(signal, elapsed => {
				const t = clamp01(elapsed / (STILL_FADE_MS * 0.6))
				for(const entry of leaving) entry.alpha = 1 - t
				return t >= 1
			})
		}
		entries.forEach((entry, index) => {
			if(handlers.still?.has(index)) return
			const pose = sampleTrack(track, index, last)
			entry.visible = pose.visible
			entry.position = pose.position
			entry.rotation = pose.rotation
			entry.scale = 1
			entry.alpha = 0
		})
		for(const marker of [...track.markers].sort((left, right) => left.frame - right.frame)) {
			if(marker.type === 'settle') handlers.onSettle?.(marker.body)
			else if(marker.type === 'explode' && marker.other !== undefined) handlers.onExplode?.(marker.body, marker.other)
		}
		try {
			await this.#run(signal, elapsed => {
				const t = clamp01(elapsed / STILL_FADE_MS)
				for(const entry of moving) entry.alpha = t
				return t >= 1
			})
		} finally {
			for(const entry of moving) entry.alpha = 1
		}
	}

	/** Explosion cue on a parent: a flash on the die and a shock ring on the table. */
	#burst(parent: Entry): void {
		if(this.#reducedMotion()) return
		const explode = this.#options!.timeline.effects.explode
		this.#flash([parent], parseHexColor(parent.accentColor), Math.min(260, explode.durationMs * 0.3), explode.intensity)
		this.#ring(parent, parseHexColor(explode.color, [1, 0.7, 0.2]), explode.intensity)
	}

	/** Leading explosion phases: children are born inside the initial simulation. */
	async #playLeadingExplosions(
		plan: DiceTimelinePlan,
		handles: Map<string, Handle>,
		configs: ReadonlyMap<string, ResolvedThemeConfig>,
		progress: TimelineProgressTracker,
		explosionPhaseCount: number,
		signal: AbortSignal
	): Promise<number> {
		const options = this.#options!
		const items: Array<{ phaseIndex: number; actionIndex: number; parentDieId: string; dieId: string }> = []
		const children: Array<{ entry: Entry; parent: number; dieId: string }> = []
		const initialEntries = [...this.#entries]
		const entryIndex = new Map<Entry, number>(initialEntries.map((entry, index) => [entry, index]))
		for(let phaseIndex = 0; phaseIndex < explosionPhaseCount; phaseIndex++) {
			plan.phases[phaseIndex]!.actions.forEach((action, actionIndex) => {
				if(action.kind === 'explode') items.push({ phaseIndex, actionIndex, parentDieId: action.parentDieId, dieId: action.dieId })
			})
		}
		// Children are created up front (hidden) and born inside the simulation.
		for(const item of items) {
			const action = plan.phases[item.phaseIndex]!.actions[item.actionIndex]!
			if(action.kind !== 'explode') continue
			const definition = plan.definitions.get(action.dieId)!
			const handle = await this.#createHandle({ ...definition, value: action.value, discarded: action.discarded }, configs.get(definition.theme)!)
			handles.set(action.dieId, handle)
			const parent = handles.get(action.parentDieId)
			handle.entries.forEach((entry, index) => {
				const parentEntry = parent?.entries[index % Math.max(1, parent.entries.length)]
				const parentIndex = parentEntry ? entryIndex.get(parentEntry) : undefined
				children.push({ entry, parent: parentIndex ?? 0, dieId: action.dieId })
				entryIndex.set(entry, initialEntries.length + children.length - 1)
			})
		}
		const allEntries = [...initialEntries, ...children.map(child => child.entry)]
		this.#entries = allEntries
		const track = await this.#throw(initialEntries, `${plan.seed}:initial`, children, signal)
		const scheduler = createPhysicsExplosionScheduler(items)
		const settled = new Set<number>()
		const settledDice = new Set<string>()
		// `initial` reports the root dice once they rest, as in a throw without
		// explosions. A child that lands first (its parent rested early) waits in
		// line, so the consumer still sees the roots before every explosion.
		const rootDieIds = new Set(initialEntries.map(entry => entry.dieId))
		const pendingActions: PhysicsExplosionScheduleItem[] = []
		let rootsAtRest = false
		const reportAction = (item: PhysicsExplosionScheduleItem): void => {
			dispatchTimelineProgress(options.onTimelineProgress, progress.completePhaseAction(item.phaseIndex, item.actionIndex))
		}
		const reportRootsAtRest = (): void => {
			if(rootsAtRest) return
			rootsAtRest = true
			dispatchTimelineProgress(options.onTimelineProgress, progress.initial())
			for(const item of pendingActions.splice(0)) reportAction(item)
		}
		await this.#play(track, allEntries, signal, {
			onSettle: body => {
				settled.add(body)
				const dieId = allEntries[body]?.dieId
				if(!dieId || settledDice.has(dieId)) return
				const bodies = allEntries.map((entry, index) => entry.dieId === dieId ? index : -1).filter(index => index >= 0)
				if(bodies.some(index => !settled.has(index))) return
				settledDice.add(dieId)
				const transition = scheduler.settle(dieId)
				if(transition.completed) {
					if(rootsAtRest) reportAction(transition.completed)
					else pendingActions.push(transition.completed)
				}
				if([...rootDieIds].every(id => settledDice.has(id))) reportRootsAtRest()
			},
			onExplode: parent => {
				const entry = allEntries[parent]
				if(entry) this.#burst(entry)
			}
		})
		// The playback always ends with every die at rest; this only guards the order.
		reportRootsAtRest()
		return explosionPhaseCount
	}

	/** A later explosion phase: children burst from resting parents, the table stays put. */
	async #explosionPhase(
		plan: DiceTimelinePlan,
		phaseIndex: number,
		handles: Map<string, Handle>,
		configs: ReadonlyMap<string, ResolvedThemeConfig>,
		signal: AbortSignal
	): Promise<void> {
		const options = this.#options!
		const phase = plan.phases[phaseIndex]!
		const resting = this.#entries.filter(entry => entry.visible)
		const parents = new Set<Entry>()
		for(const action of phase.actions) {
			if(action.kind === 'explode') for(const entry of handles.get(action.parentDieId)?.entries ?? []) parents.add(entry)
		}
		// Anticipation: the parents glow and tremble before they burst.
		await this.#cue([...parents], phase.effect, Math.min(320, Math.max(160, phase.durationMs * 0.35)), signal, entry => parseHexColor(entry.accentColor))
		const fromEdge = options.timeline.effects.explode.origin === 'edge'
		const spawned: Entry[] = []
		const children: ThrowChild[] = []
		for(const action of phase.actions) {
			if(action.kind !== 'explode') continue
			const definition = plan.definitions.get(action.dieId)!
			const handle = await this.#createHandle({ ...definition, value: action.value, discarded: action.discarded }, configs.get(definition.theme)!)
			handles.set(action.dieId, handle)
			const parent = handles.get(action.parentDieId)
			handle.entries.forEach((entry, index) => {
				const parentEntry = parent?.entries[index % Math.max(1, parent.entries.length)]
				const parentIndex = parentEntry ? resting.indexOf(parentEntry) : -1
				children.push({ ...this.#throwBody(entry), parent: Math.max(0, parentIndex), fromEdge: fromEdge || parentIndex < 0 })
				spawned.push(entry)
			})
		}
		if(!spawned.length || !resting.length) return
		this.#entries.push(...spawned)
		const track = await runSliced(followUpThrowSteps(
			{ resting: resting.map(entry => this.#resting(entry)), children },
			`${plan.seed}:${phase.id}`,
			this.#throwOptions()
		), signal)
		await this.#play(track, [...resting, ...spawned], signal, {
			still: new Set(resting.map((_, index) => index)),
			onExplode: parent => {
				const entry = resting[parent]
				if(entry) this.#burst(entry)
			}
		})
	}

	/** Rerolled dice are thrown again for real; the other dice are obstacles. */
	async #rerollPhase(plan: DiceTimelinePlan, phaseIndex: number, handles: Map<string, Handle>, signal: AbortSignal): Promise<void> {
		const options = this.#options!
		const phase = plan.phases[phaseIndex]!
		const effect = phase.effect === 'unique' ? options.timeline.effects.unique : options.timeline.effects.reroll
		const resting = this.#entries.filter(entry => entry.visible)
		const rerolls: FollowUpReroll[] = []
		const rerolled: Entry[] = []
		for(const action of phase.actions) {
			if(action.kind !== 'reroll') continue
			const handle = handles.get(action.dieId)
			if(!handle) continue
			const values = this.#bodyValues(handle.die.sides, action.to)
			handle.entries.forEach((entry, index) => {
				const at = resting.indexOf(entry)
				if(at < 0) return
				entry.value = values[index] ?? action.to
				entry.die.value = action.to
				rerolls.push({ index: at, body: this.#throwBody(entry), style: effect.style, hopHeight: effect.hopHeight, intensity: effect.intensity })
				rerolled.push(entry)
			})
		}
		if(!rerolled.length) return
		// Anticipation: the dice about to be thrown again glow and tremble in place.
		await this.#cue(rerolled, phase.effect, Math.min(360, Math.max(180, phase.durationMs * 0.35)), signal)
		const track = await runSliced(followUpThrowSteps(
			{ resting: resting.map(entry => this.#resting(entry)), rerolls },
			`${plan.seed}:${phase.id}`,
			this.#throwOptions()
		), signal)
		const color = parseHexColor(effect.color, [0.4, 0.6, 1])
		if(effect.style === 'edge') {
			// Picked up: the die shrinks away before it is thrown in again from the edge.
			await this.#vanish(rerolled, 200, signal)
		} else {
			for(const entry of rerolled) this.#ring(entry, color, effect.intensity * 0.8)
		}
		const moving = new Set(rerolls.map(reroll => reroll.index))
		await this.#play(track, resting, signal, { still: new Set(resting.map((_, index) => index).filter(index => !moving.has(index))) })
	}

	/** Anticipation before a die leaves the table: it glows and trembles, then rests exactly as before. */
	async #cue(
		entries: readonly Entry[],
		effectName: TimelineEffectName,
		durationMs: number,
		signal: AbortSignal,
		colorFor?: (entry: Entry) => Vec3 | undefined
	): Promise<void> {
		if(!entries.length || durationMs <= 0 || this.#reducedMotion()) return
		const effect = this.#options!.timeline.effects[effectName]
		const transient: Transient = {
			entries,
			start: performance.now(),
			duration: durationMs,
			color: parseHexColor(effect.color, [1, 1, 1]),
			pulses: 1,
			intensity: effect.intensity,
			...(colorFor ? { colorFor } : {})
		}
		this.#transients.push(transient)
		const bases = entries.map(entry => ({ position: entry.position, rotation: entry.rotation }))
		try {
			await this.#run(signal, elapsed => {
				const progress = clamp01(elapsed / durationMs)
				const envelope = Math.sin(Math.PI * progress)
				entries.forEach((entry, index) => {
					const base = bases[index]!
					const angle = Math.sin(elapsed * 0.075 + index * 1.7) * 0.07 * envelope
					entry.rotation = qmul(quatFromAxisAngle([Math.cos(index * 2.3), 0, Math.sin(index * 2.3)], angle), base.rotation)
					// A slight lift keeps the tilted die clear of the table.
					entry.position = [base.position[0], base.position[1] + 0.12 * envelope * envelope, base.position[2]]
				})
				return progress >= 1
			})
		} finally {
			entries.forEach((entry, index) => {
				entry.position = bases[index]!.position
				entry.rotation = bases[index]!.rotation
			})
			this.#transients = this.#transients.filter(existing => existing !== transient)
		}
	}

	/** Shrinks and fades dice away (picked up), then hides them for their next entrance. */
	async #vanish(entries: readonly Entry[], durationMs: number, signal: AbortSignal): Promise<void> {
		try {
			const shrink = this.#reducedMotion() ? 0 : 0.35
			await this.#run(signal, elapsed => {
				const progress = clamp01(elapsed / durationMs)
				for(const entry of entries) {
					entry.alpha = 1 - progress
					entry.scale = 1 - shrink * easeOut(progress)
				}
				return progress >= 1
			})
		} finally {
			for(const entry of entries) {
				entry.visible = false
				entry.alpha = 1
				entry.scale = 1
			}
		}
	}

	/** Discarded dice lose their color (opacity is kept); the remaining ones answer with a soft glow. */
	async #discard(discarded: readonly Entry[], kept: readonly Entry[], durationMs: number, signal: AbortSignal): Promise<void> {
		const duration = Math.max(1, durationMs)
		const keep = this.#options!.timeline.effects.keep
		const glow: Transient | undefined = kept.length && keep.enabled ? {
			entries: kept,
			start: performance.now(),
			duration,
			color: parseHexColor(keep.color, [0.5, 0.9, 0.6]),
			pulses: 1,
			intensity: keep.intensity * 0.55
		} : undefined
		if(glow) this.#transients.push(glow)
		const sources = discarded.map(entry => entry.saturation)
		try {
			await this.#run(signal, elapsed => {
				const progress = clamp01(elapsed / duration)
				const eased = progress * progress * (3 - 2 * progress)
				discarded.forEach((entry, index) => {
					entry.saturation = sources[index]! + (DISCARDED_SATURATION - sources[index]!) * eased
				})
				return progress >= 1
			})
		} finally {
			if(glow) this.#transients = this.#transients.filter(existing => existing !== glow)
		}
	}

	/** Short glow that does not hold the timeline (explosion cue). */
	#flash(entries: readonly Entry[], color: Vec3, durationMs: number, intensity: number): void {
		if(durationMs <= 0) return
		const transient: Transient = { entries, start: performance.now(), duration: durationMs, color, pulses: 1, intensity }
		this.#transients.push(transient)
		setTimeout(() => {
			this.#transients = this.#transients.filter(existing => existing !== transient)
			this.#requestRender()
		}, durationMs)
	}

	#ring(entry: Entry, color: Vec3, strength: number): void {
		if(strength <= 0 || this.#reducedMotion()) return
		this.#rings.push({ x: entry.position[0], z: entry.position[2], radius: entry.shape.radius, start: performance.now(), color, strength })
		this.#ambient()
	}

	#pulse(
		entries: readonly Entry[],
		effectName: TimelineEffectName,
		durationMs: number,
		pulses: number,
		signal: AbortSignal,
		colorFor?: (entry: Entry) => Vec3 | undefined
	): Promise<void> {
		if(durationMs <= 0) return Promise.resolve()
		const effect = this.#options!.timeline.effects[effectName]
		const transient: Transient = {
			entries,
			start: performance.now(),
			duration: durationMs,
			color: parseHexColor(effect.color, [1, 1, 1]),
			pulses: Math.max(1, pulses),
			intensity: effect.intensity,
			...(colorFor ? { colorFor } : {})
		}
		this.#transients.push(transient)
		return this.#wait(durationMs, signal).finally(() => {
			this.#transients = this.#transients.filter(existing => existing !== transient)
			this.#requestRender()
		})
	}

	#wait(durationMs: number, signal: AbortSignal): Promise<void> {
		if(durationMs <= 0) return signal.aborted ? Promise.reject(new DisplayCancelledError()) : Promise.resolve()
		return this.#run(signal, elapsed => elapsed >= durationMs)
	}

	/**
	 * rAF-driven step loop; rejects with DisplayCancelledError on abort or on a
	 * new scene. The clock advances at most MAX_FRAME_MS per frame, so a stall
	 * (first shader use, a busy main thread, a hidden tab) slows the motion down
	 * for a moment instead of making dice jump.
	 */
	#run(signal: AbortSignal, step: (elapsedMs: number) => boolean): Promise<void> {
		const generation = this.#generation
		let elapsed = 0
		let last = performance.now()
		this.#running++
		return new Promise<void>((resolve, reject) => {
			let finished = false
			const finish = (error?: unknown): void => {
				if(finished) return
				finished = true
				this.#running--
				signal.removeEventListener('abort', abort)
				if(error) reject(error)
				else resolve()
			}
			const abort = (): void => finish(new DisplayCancelledError())
			const tick = (): void => {
				if(finished) return
				if(signal.aborted || generation !== this.#generation) return abort()
				const now = performance.now()
				elapsed += Math.min(MAX_FRAME_MS, Math.max(0, now - last))
				last = now
				let done = false
				try {
					done = step(elapsed)
				} catch(error) {
					finish(error)
					return
				}
				this.#render()
				if(done) finish()
				else schedule(tick)
			}
			signal.addEventListener('abort', abort, { once: true })
			schedule(tick)
		})
	}

	// ---------- rendering ----------

	#requestRender(): void {
		if(this.#frameRequest !== null || typeof requestAnimationFrame !== 'function') {
			if(typeof requestAnimationFrame !== 'function') this.#render()
			return
		}
		this.#frameRequest = requestAnimationFrame(() => {
			this.#frameRequest = null
			this.#render()
		})
	}

	/** Keeps short-lived visuals (exit fade, rings) animating while no playback loop runs. */
	#ambient(): void {
		if(this.#ambientRequest !== null || typeof requestAnimationFrame !== 'function') return
		this.#ambientRequest = requestAnimationFrame(() => {
			this.#ambientRequest = null
			if(!this.#running) this.#render()
			// A pulsing glow breathes for as long as dice are on the table.
			const breathing = Boolean(this.#options?.glow?.pulse && !this.#reducedMotion() && this.#entries.some(entry => entry.visible))
			const linking = this.#linkFade(performance.now()) > 0
			if(this.#outgoing || this.#rings.length || this.#particles?.count || this.#auras.size || breathing || linking) this.#ambient()
		})
	}

	#render(): void {
		const gl = this.#gl
		const canvas = this.#context?.canvas
		const options = this.#options
		if(!gl || !canvas || !options || gl.lost || this.#restoring) return
		const reduced = this.#reducedMotion()
		const now = performance.now()
		const aspect = canvas.width / Math.max(1, canvas.height)
		const eye: Vec3 = [0, DISPLAY_CAMERA_HEIGHT, 0]
		const frame: FrameSetup = {
			viewProjection: multiply(perspective(DISPLAY_CAMERA_FOV, aspect, 1, 80), lookAt(eye, [0, 0, 0], [0, 0, -1])),
			eye,
			lightDirection: normalize(DISPLAY_LIGHT_DIRECTION),
			directionalIntensity: DISPLAY_DIRECTIONAL_INTENSITY * options.lightIntensity,
			hemisphericIntensity: DISPLAY_HEMISPHERIC_INTENSITY * options.lightIntensity
		}
		gl.beginFrame(canvas.width, canvas.height)
		const customGlow = options.glow?.color ? parseParticleColor(options.glow.color) : null
		const glowColor: Vec3 | null = customGlow ? [customGlow[0], customGlow[1], customGlow[2]] : null

		// The previous scene fading out (a new throw has started).
		let exit = 1
		if(this.#outgoing) {
			exit = 1 - (now - this.#outgoing.start) / EXIT_MS
			if(exit <= 0) this.#outgoing = null
		}
		const leaving = this.#outgoing?.entries ?? []
		const outgoing = new Set(leaving)
		const visible = this.#entries.filter(entry => entry.visible && entry.alpha > 0.001)
		const alphaOf = (entry: Entry): number => outgoing.has(entry) ? entry.alpha * exit : entry.alpha
		const scaleOf = (entry: Entry): number => outgoing.has(entry) ? entry.scale * (0.9 + 0.1 * exit) : entry.scale
		/** Own light of a die (viewer `glow`): discarded dice go dark, a pulse breathes slowly. */
		const ownGlow = (entry: Entry): { color: Vec3; strength: number } => {
			const glow = options.glow
			if(!glow) return NO_GLOW
			const lit = clamp01((entry.saturation - DISCARDED_SATURATION) / (1 - DISCARDED_SATURATION))
			const breath = glow.pulse && !reduced ? 0.7 + 0.3 * Math.sin(now / 1000 * Math.PI * 2 / 2.4 + entry.position[0] * 0.9) : 1
			const strength = (glow.intensity ?? 1) * breath * lit * alphaOf(entry)
			return strength > 0.001 ? { color: glowColor ?? lightColor(entry.accentColor), strength } : NO_GLOW
		}

		if(options.glow && options.glow.light !== false) {
			gl.drawLights(frame, [...leaving, ...visible].flatMap(entry => {
				const glow = ownGlow(entry)
				if(glow.strength <= 0.001) return []
				const height = Math.max(0, entry.position[1] - entry.shape.radius)
				return [{
					x: entry.position[0],
					z: entry.position[2],
					size: entry.shape.radius * (2.8 + 0.7 * Math.min(2, glow.strength)) * (1 + height * 0.12) * scaleOf(entry),
					alpha: 0.45 * Math.min(1.6, glow.strength) * Math.max(0.3, 1 - height * 0.1),
					color: glow.color
				}]
			}))
		}

		if(options.enableShadows) {
			gl.drawShadows(frame, [...leaving, ...visible].map(entry => {
				const height = Math.max(0, entry.position[1] - entry.shape.radius * 0.6)
				const scale = scaleOf(entry)
				return {
					x: entry.position[0] + 0.12 * height,
					z: entry.position[2] + 0.09 * height,
					size: entry.shape.radius * (1.35 + height * 0.08) * scale,
					alpha: Math.max(0.05, 0.42 - height * 0.05) * options.shadowTransparency * alphaOf(entry)
				}
			}))
		}
		this.#rings = this.#rings.filter(ring => now - ring.start < RING_MS)
		gl.drawRings(frame, this.#rings.map(ring => {
			const progress = clamp01((now - ring.start) / RING_MS)
			return {
				x: ring.x,
				z: ring.z,
				size: ring.radius * (0.9 + 2.6 * easeOut(progress)),
				alpha: 0.6 * ring.strength * Math.pow(1 - progress, 1.5),
				color: ring.color
			}
		}))

		const glowOf = (entry: Entry): { color: Vec3; strength: number } => {
			let color: Vec3 = [0, 0, 0], strength = 0
			for(const transient of this.#transients) {
				if(!transient.entries.includes(entry)) continue
				const progress = clamp01((now - transient.start) / Math.max(1, transient.duration))
				const value = (0.2 + 0.8 * Math.sin(progress * Math.PI * transient.pulses) ** 2) * transient.intensity
				if(value > strength) {
					strength = value
					color = transient.colorFor?.(entry) ?? transient.color
				}
			}
			return { color, strength }
		}
		// Surfaces first and halos after, so the programs switch twice per frame
		// instead of twice per die.
		const halos: Array<{ readonly entry: Entry; readonly state: DrawState }> = []
		const draw = (entry: Entry): void => {
			const glow = glowOf(entry)
			const own = ownGlow(entry)
			const scale = entry.visual.kind === 'polyhedron' ? entry.visual.scale * scaleOf(entry) : scaleOf(entry)
			const state: DrawState = {
				position: entry.position,
				rotation: entry.rotation,
				scale,
				alpha: alphaOf(entry),
				glow: glow.color,
				glowStrength: glow.strength,
				saturation: entry.saturation,
				emission: [own.color[0] * own.strength * 0.55, own.color[1] * own.strength * 0.55, own.color[2] * own.strength * 0.55]
			}
			if(entry.visual.kind === 'polyhedron') gl.drawSurface(frame, entry.visual.mesh, entry.visual.material, state)
			else {
				const coin = entry.visual
				gl.drawSurface(frame, coin.geometry.edge, coin.edge, state)
				gl.drawSurface(frame, coin.geometry.front, coin.front, state)
				gl.drawSurface(frame, coin.geometry.back, coin.back, state)
			}
			// The halo shows the stronger of the timeline effect and the die's own light.
			const halo = own.strength * 0.8 > glow.strength ? { ...state, glow: own.color, glowStrength: own.strength * 0.8 } : state
			if(halo.glowStrength > 0.001) halos.push({ entry, state: halo })
		}
		for(const entry of visible) if(entry.alpha >= 0.999) draw(entry)
		for(const entry of leaving) draw(entry)
		for(const entry of visible) if(entry.alpha < 0.999) draw(entry)
		for(const { entry, state } of halos) {
			if(entry.visual.kind === 'polyhedron') gl.drawHalo(frame, entry.visual.mesh, state, 0.035)
			else {
				// A coin is flat: its halo grows the whole coin (faces and rim), like the shell of a die.
				const geometry = entry.visual.geometry
				for(const mesh of [geometry.front, geometry.back, geometry.edge]) gl.drawHalo(frame, mesh, state, 0.02, 0.06, 0.7)
			}
		}
		this.#renderParticles(frame, now, canvas.height)
	}

	/** Advances and draws the particle effect (auras keep emitting while they fade). */
	#renderParticles(frame: FrameSetup, now: number, viewportHeight: number): void {
		const particles = this.#particles
		if(!particles) return
		const dt = this.#particleClock ? Math.min(MAX_FRAME_MS, Math.max(0, now - this.#particleClock)) / 1000 : 0
		this.#particleClock = now
		const auraSeconds = particles.auraSeconds
		for(const [entry, { since, always }] of this.#auras) {
			const fade = auraSeconds > 0 ? 1 - (now - since) / 1000 / auraSeconds : 0
			if(fade <= 0 || !entry.visible) {
				this.#auras.delete(entry)
				continue
			}
			// Discarded or fading dice lose their aura.
			if(entry.saturation > 0.99 && entry.alpha > 0.99) particles.aura(entry, entry.position, dt, entry.shape.radius, fade, entry.die, always)
		}
		this.#emitLinks(particles, now, dt)
		// The clock advances even with no particle alive (cooldowns count real time).
		particles.update(dt)
		if(!particles.count) return
		const batches = particles.build()
		const pointScale = viewportHeight / 2 / Math.tan(DISPLAY_CAMERA_FOV / 2)
		const shaders = this.#particleShaders!
		const atlas = this.#particleAtlas
		this.#gl!.drawParticles(frame, batches.alpha, batches.alphaCount, false, pointScale, shaders, now / 1000, atlas)
		this.#gl!.drawParticles(frame, batches.additive, batches.additiveCount, true, pointScale, shaders, now / 1000, atlas)
	}

	/** Links fade over `linkSeconds` once playback ends; 0 when they are done. */
	#linkFade(now: number): number {
		const particles = this.#particles
		if(!particles?.hasLink) return 0
		if(this.#running) {
			this.#linkMoved = now
			return 1
		}
		const seconds = particles.linkSeconds
		return seconds > 0 ? Math.max(0, 1 - (now - this.#linkMoved) / 1000 / seconds) : 0
	}

	/** Energy between every pair of dice on the table (the two bodies of a d100 count as one). */
	#emitLinks(particles: ParticleSystem, now: number, dt: number): void {
		const fade = this.#linkFade(now)
		if(fade <= 0) return
		const dice = this.#entries.filter(entry => entry.visible && entry.alpha > 0.99)
		for(let i = 0; i < dice.length; i++) for(let j = i + 1; j < dice.length; j++) {
			const a = dice[i]!, b = dice[j]!
			if(a.die === b.die) continue
			let keys = this.#linkKeys.get(a)
			if(!keys) this.#linkKeys.set(a, keys = new WeakMap())
			let key = keys.get(b)
			if(!key) keys.set(b, key = {})
			particles.link(key, a.position, b.position, dt, fade, [a.die, b.die])
		}
	}

	#assertReady(): void {
		if(!this.#gl || !this.#assets || !this.#options || !this.#context) {
			throw new Error('Renderer must be initialized before display().')
		}
	}
}

const schedule = (callback: () => void): void => {
	if(typeof requestAnimationFrame === 'function') requestAnimationFrame(() => callback())
	else setTimeout(callback, 16)
}

export default SceneRenderer
