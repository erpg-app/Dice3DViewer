import type { ImageLoader } from '../render/images'
import type { RequiredViewerOptions, ResolvedThemeConfig } from '../types'
import SceneRenderer from './SceneRenderer'
import {
	deserializeError, serializeError, type AssetRequest, type AssetValue,
	type FromWorker, type ToWorker, type WorkerOptions
} from './workerMessages'

export { SceneRenderer }

const scope = typeof WorkerGlobalScope !== 'undefined' && self instanceof WorkerGlobalScope
	? self as unknown as DedicatedWorkerGlobalScope
	: undefined
const noop = (): void => undefined
let renderer: SceneRenderer
let active: { id: number; controller: AbortController } | undefined
let reducedMotion = false
let nextAssetId = 0
const assets = new Map<number, { resolve(value: AssetValue): void; reject(error: Error): void }>()
const send = (message: FromWorker): void => scope!.postMessage(message)

const requestAsset = (request: AssetRequest): Promise<AssetValue> => new Promise((resolve, reject) => {
	const id = ++nextAssetId
	assets.set(id, { resolve, reject })
	send({ ...request, id })
})

const loadImage: ImageLoader = async (url, size) => {
	const image = await requestAsset({ type: 'loadImage', url, size }) as ImageBitmap
	try {
		// WebGL ignores UNPACK_FLIP_Y_WEBGL for ImageBitmap inputs.
		const canvas = new OffscreenCanvas(image.width, image.height)
		const context = canvas.getContext('2d')
		if(!context) throw new Error('Unable to create a worker texture canvas.')
		context.drawImage(image, 0, 0)
		return canvas
	} finally {
		image.close()
	}
}

const rendererOptions = (source: WorkerOptions): RequiredViewerOptions => {
	const { reportCollisions, reportProgress, ...options } = source
	return {
		...options,
		container: null,
		onThemeConfigLoaded: noop,
		onThemeLoaded: noop,
		onCollision: reportCollisions ? value => { if(active) send({ type: 'collision', id: active.id, value }) } : noop,
		onTimelineProgress: reportProgress ? value => { if(active) send({ type: 'progress', id: active.id, value }) } : noop
	}
}

const receive = async (data: ToWorker): Promise<void> => {
	switch(data.type) {
		case 'asset':
		case 'assetError': {
			const pending = assets.get(data.id)
			assets.delete(data.id)
			if(data.type === 'asset') pending?.resolve(data.value)
			else pending?.reject(deserializeError(data.error))
			return
		}
		case 'probe':
			// Check the scheduler before taking ownership of the visible canvas.
			cancelAnimationFrame(requestAnimationFrame(noop))
			if(!new OffscreenCanvas(1, 1).getContext('2d')) throw new Error('Worker canvas is unavailable.')
			break
		case 'init':
			reducedMotion = data.reducedMotion
			await renderer.init({
				canvas: data.canvas,
				options: rendererOptions(data.options),
				viewport: data.viewport,
				assetBaseUrl: data.baseUrl,
				effects: data.effects,
				prefersReducedMotion: () => reducedMotion,
				loadTheme: async theme => await requestAsset({ type: 'loadTheme', theme }) as ResolvedThemeConfig,
				notifyThemeLoaded: async theme => { await requestAsset({ type: 'themeLoaded', theme }) },
				imageLoader: loadImage
			})
			break
		case 'options':
			renderer.updateOptions(rendererOptions(data.options))
			break
		case 'display':
		case 'timeline': {
			active?.controller.abort()
			const controller = new AbortController()
			active = { id: data.id, controller }
			try {
				if(data.type === 'display') await renderer.display(data.request, controller.signal)
				else await renderer.displayTimeline(data.plan, controller.signal)
			} finally {
				if(active?.id === data.id) active = undefined
			}
			break
		}
		case 'abort':
			if(active?.id === data.id) active.controller.abort()
			return
		case 'clear':
			active?.controller.abort()
			renderer.clear()
			return
		case 'resize':
			renderer.resize(data.viewport.width, data.viewport.height, data.viewport.pixelRatio)
			return
		case 'motion':
			reducedMotion = data.reduced
			return
		case 'particles':
			renderer.playParticles(data.moment, data.dice)
			return
	}
	send({ type: 'done', id: data.id })
}

if(scope) {
	renderer = new SceneRenderer()
	scope.onmessage = ({ data }: MessageEvent<ToWorker>) => {
		void receive(data).catch(error => {
			if('id' in data) send({ type: 'done', id: data.id, error: serializeError(error) })
			else setTimeout(() => { throw error }, 0)
		})
	}
}
