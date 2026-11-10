import { createDisplayCanvas } from './canvas'
import { normalizeDisplayRequest, getDisplayBodyCount } from './displayRequest'
import { DisplayCancelledError, isDisplayCancelledError, rethrowPresentationError } from './errors'
import { WorkerRenderer } from './renderers/WorkerRenderer'
import { loadModule } from './loadModule'
import { particlesUrl, presetsUrl, sceneUrl } from './runtimeAssets'
import { ThemeRepository } from './themeRepository'
import {
	createTimelineProgressTracker,
	dispatchTimelineProgress,
	normalizeDisplayTimelineRequest,
	planDiceTimeline
} from './timeline'
import { createUpdatedViewerOptions, createViewerOptions, validateViewerOptions } from './timelineOptions'
import { diceLookOptions } from './diceLook'
import type {
	DisplayRenderer,
	DisplayRequest,
	DisplayResult,
	DisplayTimelineRequest,
	DisplayTimelineResult,
	ParticleBurstMoment,
	RendererContext,
	RequiredViewerOptions,
	ViewerOptions
} from './types'

const PARTICLE_BURST_MOMENTS: readonly ParticleBurstMoment[] = ['impact', 'collision', 'settle', 'aura', 'explode', 'critical']

export class DiceResultViewer {
	#canvas: HTMLCanvasElement
	#options: RequiredViewerOptions
	readonly #themes: ThemeRepository
	#renderer: DisplayRenderer | undefined
	#rendererReady: Promise<DisplayRenderer> | undefined
	#active: AbortController | undefined
	#resizeHandler: (() => void) | undefined
	#resizeObserver: ResizeObserver | undefined
	#initialization: Promise<this> | undefined
	#workerDisabled = false
	#disposed = false

	constructor(options: ViewerOptions = {}) {
		this.#options = createViewerOptions(options)
		validateViewerOptions(this.#options)
		this.#canvas = createDisplayCanvas(this.#options.container, this.#options.id)
		this.#themes = new ThemeRepository(this.#options)
	}

	get canvas(): HTMLCanvasElement {
		return this.#canvas
	}

	async init(): Promise<this> {
		this.#assertUsable()
		return this.#initialization ??= this.#initialize().catch(error => {
			this.#initialization = undefined
			throw error
		})
	}

	async #initialize(): Promise<this> {
		await Promise.all([
			this.#ensureRenderer(),
			...[this.#options.theme, ...this.#options.preloadThemes].map(theme => this.#themes.load(theme))
		])
		if(this.#disposed) throw new DisplayCancelledError()
		this.#resizeHandler = (): void => this.resize()
		window.addEventListener('resize', this.#resizeHandler, { passive: true })
		if(typeof ResizeObserver !== 'undefined') {
			this.#resizeObserver = new ResizeObserver(() => this.resize())
			this.#resizeObserver.observe(this.canvas.parentElement ?? this.canvas)
		}
		this.resize()
		return this
	}

	async display(request: DisplayRequest): Promise<DisplayResult> {
		this.#assertUsable()
		const normalized = normalizeDisplayRequest(request, this.#options)
		const bodyCount = getDisplayBodyCount(normalized.dice)
		if(bodyCount > this.#options.maxDice) {
			throw new Error(`Display exceeds maxDice (${this.#options.maxDice}). Requested ${bodyCount} visual bodies.`)
		}
		// The renderer fades the previous dice out while the new throw starts.
		this.#cancelActive()
		const controller = new AbortController()
		this.#active = controller
		const startedAt = performance.now()
		try {
			await this.init()
			const renderer = await this.#ensureRenderer()
			if(controller.signal.aborted) throw new DisplayCancelledError()
			await renderer.display(normalized, controller.signal)
		} catch(error) {
			if(isDisplayCancelledError(error) || controller.signal.aborted) throw new DisplayCancelledError()
			// Rendering is best-effort. The resolved values remain authoritative even
			// when WebGL, a theme asset, or the optional physics runtime is unavailable.
			console.error('[DiceResultViewer] Presentation failed:', error)
		} finally {
			if(this.#active === controller) this.#active = undefined
		}
		return Object.freeze({
			id: normalized.id,
			dice: Object.freeze(normalized.dice.map(die => Object.freeze({ ...die }))),
			durationMs: Math.max(0, performance.now() - startedAt)
		})
	}

	async displayTimeline(request: DisplayTimelineRequest): Promise<DisplayTimelineResult> {
		this.#assertUsable()
		const normalized = normalizeDisplayTimelineRequest(request, this.#options)
		const bodyCount = getDisplayBodyCount(normalized.dice)
		if(bodyCount > this.#options.maxDice) {
			throw new Error(`Display exceeds maxDice (${this.#options.maxDice}). Requested ${bodyCount} visual bodies.`)
		}
		const plan = planDiceTimeline(
			normalized,
			this.#options.timeline,
			this.#options.settleTimeout
		)
		this.#cancelActive()
		const controller = new AbortController()
		this.#active = controller
		const startedAt = performance.now()
		try {
			await this.init()
			const renderer = await this.#ensureRenderer()
			if(controller.signal.aborted) throw new DisplayCancelledError()
			if(plan.degraded) {
				const flat = normalizeDisplayRequest({
					id: plan.id,
					seed: `${plan.seed}:flat`,
					mode: plan.mode,
					dice: plan.finalDice
				}, this.#options)
				await renderer.display(flat, controller.signal)
				const progress = createTimelineProgressTracker(plan)
				dispatchTimelineProgress(this.#options.onTimelineProgress, progress.initial())
				dispatchTimelineProgress(this.#options.onTimelineProgress, progress.complete())
			} else {
				await renderer.displayTimeline(plan, controller.signal)
			}
		} catch(error) {
			if(!isDisplayCancelledError(error) && !controller.signal.aborted) {
				console.error('[DiceResultViewer] Timeline presentation failed:', error)
			}
			rethrowPresentationError(error, controller.signal.aborted)
		} finally {
			if(this.#active === controller) this.#active = undefined
		}
		return Object.freeze({
			id: plan.id,
			dice: Object.freeze(plan.finalDice.map(die => Object.freeze({ ...die }))),
			durationMs: Math.max(0, performance.now() - startedAt),
			eventCount: plan.eventCount,
			phaseCount: plan.phases.length,
			degraded: plan.degraded
		})
	}

	clear(): void {
		this.#cancelActive()
		this.#renderer?.clear()
	}

	/** Cancels the running presentation without touching what is on screen. */
	#cancelActive(): void {
		this.#active?.abort()
		this.#active = undefined
	}

	async updateOptions(options: ViewerOptions): Promise<void> {
		this.#assertUsable()
		const nextOptions = createUpdatedViewerOptions(this.#options, options)
		this.#options = nextOptions
		this.#themes.updateOptions(this.#options)
		const renderer = await this.#rendererReady
		if(this.#disposed) throw new DisplayCancelledError()
		if(renderer && renderer === this.#renderer) {
			try {
				await renderer.updateOptions(this.#options)
			} catch(error) {
				if(renderer === this.#renderer || this.#disposed) throw error
				await this.#ensureRenderer()
			}
		}
		if(options.theme) await this.#themes.load(options.theme)
	}

	/**
	 * Applies a complete look (color, skin, particles and glow), e.g. a JSON
	 * file exported by the workshop. Invalid looks throw before anything changes.
	 */
	async applyLook(look: unknown): Promise<void> {
		await this.updateOptions(diceLookOptions(look))
	}

	/**
	 * Plays a particle moment now on the dice on the table (all of them, or the
	 * given die ids), ignoring the emitters' `when` conditions. Uses the current
	 * `particles` option; does nothing without one.
	 */
	playParticles(moment: ParticleBurstMoment, options: { readonly dice?: readonly string[] } = {}): void {
		this.#assertUsable()
		if(!PARTICLE_BURST_MOMENTS.includes(moment)) throw new Error(`playParticles moment must be one of ${PARTICLE_BURST_MOMENTS.join(', ')}.`)
		this.#renderer?.playParticles?.(moment, options.dice)
	}

	resize(): void {
		const width = Math.max(1, this.canvas.clientWidth || this.canvas.parentElement?.clientWidth || 300)
		const height = Math.max(1, this.canvas.clientHeight || this.canvas.parentElement?.clientHeight || 150)
		this.#renderer?.resize(width, height)
	}

	dispose(): void {
		if(this.#disposed) return
		this.#disposed = true
		this.clear()
		if(this.#resizeHandler) window.removeEventListener('resize', this.#resizeHandler)
		this.#resizeObserver?.disconnect()
		this.#resizeObserver = undefined
		this.#renderer?.dispose()
		this.canvas.remove()
	}

	/** One renderer (and WebGL context) per viewer, created on first use. */
	#ensureRenderer(): Promise<DisplayRenderer> {
		return this.#rendererReady ??= this.#startRenderer().catch(error => {
			this.#rendererReady = undefined
			throw error
		})
	}

	async #startRenderer(): Promise<DisplayRenderer> {
		const context = (): RendererContext => ({
			canvas: this.canvas,
			effects: { particles: particlesUrl().href, presets: presetsUrl().href },
			options: this.#options,
			loadTheme: theme => this.#themes.load(theme)
		})
		if(!this.#workerDisabled && WorkerRenderer.supports(this.canvas)) {
			const worker = new WorkerRenderer(() => {
				if(this.#renderer !== worker || this.#disposed) return
				this.#restoreMainThread(worker)
				this.#rendererReady = undefined
			})
			this.#renderer = worker
			try {
				await worker.init(context())
				return worker
			} catch {
				worker.dispose()
				if(this.#disposed) throw new DisplayCancelledError()
				this.#restoreMainThread(worker)
			}
		}
		const { SceneRenderer } = await loadModule<typeof import('./renderers/sceneWorker')>(sceneUrl().href)
		if(this.#disposed) throw new DisplayCancelledError()
		const renderer = new SceneRenderer()
		this.#renderer = renderer
		try {
			await renderer.init(context())
			return renderer
		} catch(error) {
			renderer.dispose()
			this.#renderer = undefined
			throw error
		}
	}

	#restoreMainThread(worker: WorkerRenderer): void {
		this.#workerDisabled = true
		this.#renderer = undefined
		if(!worker.transferred) return
		// The transferred canvas cannot create a main-thread WebGL context.
		const previous = this.#canvas
		const replacement = previous.cloneNode(false) as HTMLCanvasElement
		previous.replaceWith(replacement)
		this.#canvas = replacement
		if(!replacement.parentElement && this.#resizeObserver) {
			this.#resizeObserver.unobserve(previous)
			this.#resizeObserver.observe(replacement)
		}
	}

	#assertUsable(): void {
		if(this.#disposed) throw new Error('Cannot use a disposed DiceResultViewer.')
	}
}

export default DiceResultViewer
