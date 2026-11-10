import { DisplayCancelledError, isDisplayCancelledError } from '../errors'
import type { ImageSize } from '../render/images'
import type { DiceTimelinePlan } from '../timeline'
import type {
	CollisionEvent, NormalizedDisplayRequest, ParticleBurstMoment,
	RendererContext, RequiredViewerOptions, ResolvedThemeConfig, TimelineProgressEvent
} from '../types'

export type WorkerOptions = Omit<RequiredViewerOptions,
	'container' | 'onCollision' | 'onThemeLoaded' | 'onThemeConfigLoaded' | 'onTimelineProgress'
> & {
	readonly reportCollisions: boolean
	readonly reportProgress: boolean
}

export interface Viewport extends ImageSize {
	readonly pixelRatio: number
}

export type WorkerCall =
	| { type: 'probe' }
	| { type: 'init'; canvas: OffscreenCanvas; viewport: Viewport; options: WorkerOptions; baseUrl: string; reducedMotion: boolean; effects: RendererContext['effects'] }
	| { type: 'display'; request: NormalizedDisplayRequest }
	| { type: 'timeline'; plan: DiceTimelinePlan }
	| { type: 'options'; options: WorkerOptions }

export type AssetRequest =
	| { type: 'loadTheme'; theme: string }
	| { type: 'themeLoaded'; theme: ResolvedThemeConfig }
	| { type: 'loadImage'; url: string; size: ImageSize | undefined }

export type AssetValue = ResolvedThemeConfig | ImageBitmap | null
export type WorkerError = { message: string; name: string; cancelled: boolean }

export type ToWorker = (WorkerCall & { id: number })
	| { type: 'abort'; id: number }
	| { type: 'clear' }
	| { type: 'resize'; viewport: Viewport }
	| { type: 'motion'; reduced: boolean }
	| { type: 'particles'; moment: ParticleBurstMoment; dice: readonly string[] | undefined }
	| { type: 'asset'; id: number; value: AssetValue }
	| { type: 'assetError'; id: number; error: WorkerError }

export type FromWorker = (AssetRequest & { id: number })
	| { type: 'done'; id: number; error?: WorkerError }
	| { type: 'collision'; id: number; value: CollisionEvent }
	| { type: 'progress'; id: number; value: TimelineProgressEvent }

export const serializeError = (error: unknown): WorkerError => ({
	message: error instanceof Error ? error.message : String(error),
	name: error instanceof Error ? error.name : 'Error',
	cancelled: isDisplayCancelledError(error)
})

export const deserializeError = (error: WorkerError): Error => {
	if(error.cancelled) return new DisplayCancelledError(error.message)
	const result = new Error(error.message)
	result.name = error.name
	return result
}
