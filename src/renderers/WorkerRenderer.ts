import { DisplayCancelledError } from '../errors'
import { createTextureCanvas, getTextureContext, isSvgImage, loadImage, type ImageSize } from '../render/images'
import { sceneUrl } from '../runtimeAssets'
import { dispatchTimelineProgress, type DiceTimelinePlan } from '../timeline'
import { noop } from '../timelineOptions'
import type { DisplayRenderer, NormalizedDisplayRequest, ParticleBurstMoment, RendererContext, RequiredViewerOptions } from '../types'
import {
	deserializeError, serializeError, type AssetValue, type FromWorker,
	type ToWorker, type Viewport, type WorkerCall, type WorkerOptions
} from './workerMessages'

const STARTUP_TIMEOUT_MS = 4000
const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)'

const workerOptions = (options: Readonly<RequiredViewerOptions>): WorkerOptions => {
	const { container, onThemeConfigLoaded, onThemeLoaded, onCollision, onTimelineProgress, ...data } = options
	return { ...data, reportCollisions: onCollision !== noop, reportProgress: onTimelineProgress !== noop }
}

const loadBitmap = async (url: string, size?: ImageSize): Promise<ImageBitmap> => {
	const image = await loadImage(url)
	if(!isSvgImage(url)) {
		try {
			return await createImageBitmap(image)
		} catch {
			// A blob or data URL can also contain SVG with no intrinsic dimensions.
		}
	}
	const surface = createTextureCanvas(size?.width ?? (image.naturalWidth || 1024), size?.height ?? (image.naturalHeight || 1024))
	const context = getTextureContext(surface)
	if(!context) throw new Error('Unable to rasterize the dice image.')
	context.drawImage(image, 0, 0, surface.width, surface.height)
	return createImageBitmap(surface)
}

export class WorkerRenderer implements DisplayRenderer {
	readonly mode = 'physics' as const
	readonly #onFailure: () => void
	readonly #pending = new Map<number, { resolve(): void; reject(error: unknown): void }>()
	#worker: Worker | undefined
	#context: RendererContext | undefined
	#options: Readonly<RequiredViewerOptions> | undefined
	#motion: MediaQueryList | undefined
	#nextId = 0
	#ready = false
	#transferred = false

	constructor(onFailure: () => void) {
		this.#onFailure = onFailure
	}

	static supports(canvas: HTMLCanvasElement): boolean {
		return typeof Worker === 'function' && typeof OffscreenCanvas === 'function'
			&& typeof createImageBitmap === 'function' && typeof canvas.transferControlToOffscreen === 'function'
	}

	get transferred(): boolean {
		return this.#transferred
	}

	async init(context: RendererContext): Promise<void> {
		this.#context = context
		this.#options = context.options
		const worker = new Worker(sceneUrl(), { type: 'module' })
		this.#worker = worker
		worker.onmessage = ({ data }: MessageEvent<FromWorker>) => { void this.#receive(data) }
		worker.onerror = event => {
			event.preventDefault()
			this.#fail(new Error(event.message || 'Dice renderer worker could not load.'))
		}
		worker.onmessageerror = () => this.#fail(new Error('Dice renderer worker returned an invalid message.'))
		const timer = setTimeout(() => this.#fail(new Error('Dice renderer worker did not start.')), STARTUP_TIMEOUT_MS)
		try {
			await this.#call({ type: 'probe' })
			const canvas = context.canvas
			const viewport = this.#viewport(canvas.clientWidth || canvas.parentElement?.clientWidth || 300,
				canvas.clientHeight || canvas.parentElement?.clientHeight || 150)
			const offscreen = canvas.transferControlToOffscreen()
			this.#transferred = true
			if(typeof matchMedia === 'function') {
				this.#motion = matchMedia(REDUCED_MOTION_QUERY)
				this.#motion.addEventListener?.('change', this.#motionChanged)
			}
			await this.#call({
				type: 'init', canvas: offscreen, viewport, options: workerOptions(context.options),
				baseUrl: document.baseURI, reducedMotion: this.#motion?.matches ?? false,
				effects: context.effects
			}, [offscreen])
			if(this.#worker !== worker) throw new DisplayCancelledError()
			this.#ready = true
		} finally {
			clearTimeout(timer)
		}
	}

	display(request: NormalizedDisplayRequest, signal: AbortSignal): Promise<void> {
		return this.#call({ type: 'display', request }, [], signal)
	}

	displayTimeline(plan: DiceTimelinePlan, signal: AbortSignal): Promise<void> {
		return this.#call({ type: 'timeline', plan }, [], signal)
	}

	updateOptions(options: Readonly<RequiredViewerOptions>): Promise<void> {
		this.#options = options
		return this.#call({ type: 'options', options: workerOptions(options) })
	}

	resize(width: number, height: number): void {
		if(this.#ready) this.#post({ type: 'resize', viewport: this.#viewport(width, height) })
	}

	clear(): void {
		if(this.#ready) this.#post({ type: 'clear' })
	}

	playParticles(moment: ParticleBurstMoment, dice?: readonly string[]): void {
		if(this.#ready) this.#post({ type: 'particles', moment, dice })
	}

	dispose(): void {
		this.#stop(new DisplayCancelledError())
	}

	#viewport(width: number, height: number): Viewport {
		return { width, height, pixelRatio: window.devicePixelRatio || 1 }
	}

	readonly #motionChanged = ({ matches }: MediaQueryListEvent): void => {
		this.#post({ type: 'motion', reduced: matches })
	}

	async #receive(message: FromWorker): Promise<void> {
		const { id } = message
		switch(message.type) {
			case 'done': {
				const pending = this.#pending.get(id)
				if(message.error) pending?.reject(deserializeError(message.error))
				else pending?.resolve()
				return
			}
			case 'progress':
				if(this.#pending.has(id) && this.#options) {
					const event = message.value
					for(const die of event.dice) Object.freeze(die)
					Object.freeze(event.dice)
					Object.freeze(event.revealedDieIds)
					Object.freeze(event.completedEventSequences)
					dispatchTimelineProgress(this.#options.onTimelineProgress, Object.freeze(event))
				}
				return
			case 'collision':
				if(this.#pending.has(id)) {
					try {
						this.#options?.onCollision(message.value)
					} catch(error) {
						console.error('[DiceResultViewer] onCollision callback failed:', error)
					}
				}
				return
		}
		try {
			if(message.type === 'loadImage') {
				const bitmap = await loadBitmap(message.url, message.size)
				if(!this.#post({ type: 'asset', id, value: bitmap }, [bitmap])) bitmap.close()
				return
			}
			let value: AssetValue = null
			if(message.type === 'loadTheme') value = await this.#context!.loadTheme(message.theme)
			else this.#options?.onThemeLoaded(Object.freeze(message.theme))
			this.#post({ type: 'asset', id, value })
		} catch(error) {
			this.#post({ type: 'assetError', id, error: serializeError(error) })
		}
	}

	#call(command: WorkerCall, transfer: Transferable[] = [], signal?: AbortSignal): Promise<void> {
		if(signal?.aborted || !this.#worker) return Promise.reject(new DisplayCancelledError())
		const id = ++this.#nextId
		const abort = (): void => {
			this.#pending.get(id)?.reject(new DisplayCancelledError())
			this.#pending.delete(id)
			this.#post({ type: 'abort', id })
		}
		signal?.addEventListener('abort', abort, { once: true })
		return new Promise<void>((resolve, reject) => {
			this.#pending.set(id, { resolve, reject })
			this.#post({ ...command, id }, transfer)
		}).finally(() => {
			signal?.removeEventListener('abort', abort)
			this.#pending.delete(id)
		})
	}

	#post(message: ToWorker, transfer: Transferable[] = []): boolean {
		if(!this.#worker) return false
		try {
			this.#worker.postMessage(message, transfer)
			return true
		} catch(error) {
			this.#fail(error)
			return false
		}
	}

	#fail(error: unknown): void {
		const ready = this.#ready
		this.#stop(error)
		if(ready) this.#onFailure()
	}

	#stop(error: unknown): void {
		this.#ready = false
		this.#motion?.removeEventListener?.('change', this.#motionChanged)
		this.#worker?.terminate()
		this.#worker = undefined
		for(const pending of this.#pending.values()) pending.reject(error)
		this.#pending.clear()
	}
}
