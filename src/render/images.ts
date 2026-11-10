export interface ImageSize {
	readonly width: number
	readonly height: number
}

export type RenderImage = HTMLImageElement | OffscreenCanvas
export type ImageLoader = (url: string, rasterSize?: ImageSize) => Promise<RenderImage>

export const createTextureCanvas = (width: number, height: number): HTMLCanvasElement | OffscreenCanvas => {
	if(typeof document === 'undefined') return new OffscreenCanvas(width, height)
	const canvas = document.createElement('canvas')
	canvas.width = width
	canvas.height = height
	return canvas
}

export const getTextureContext = (canvas: HTMLCanvasElement | OffscreenCanvas, settings?: CanvasRenderingContext2DSettings) =>
	canvas.getContext('2d', settings) as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null

export const getImageSize = (image: RenderImage): ImageSize => 'naturalWidth' in image
	? { width: image.naturalWidth, height: image.naturalHeight }
	: image

export const isSvgImage = (url: string): boolean => /\.svg(?:$|\?)/i.test(url)

export const loadImage = (url: string): Promise<HTMLImageElement> => new Promise((resolve, reject) => {
	const image = new Image()
	image.crossOrigin = 'anonymous'
	image.decoding = 'async'
	image.onload = () => resolve(image)
	image.onerror = () => reject(new Error(`Unable to load image '${url}'.`))
	image.src = url
})
