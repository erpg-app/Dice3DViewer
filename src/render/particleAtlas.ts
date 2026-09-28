import { PARTICLE_MOMENTS } from '../particleOptions'
import type { ParticleEffectDefinition } from '../types'
import { loadImage } from './assets'

const GRID = 4
const CELL = 256
/** Each image is drawn inside its cell with this margin, so mipmaps do not bleed across. */
const INSET = CELL / 16
/** Images an atlas holds at once. */
export const PARTICLE_ATLAS_SLOTS = GRID * GRID

/** The particle images of a viewer as one texture: a 4 × 4 grid of 256 px cells. */
export interface ParticleAtlasSource {
	readonly source: TexImageSource
	/** Grows each time a cell is drawn, so the GL side knows when to upload it again. */
	readonly version: number
}

/**
 * Loads the images of particle emitters into a shared canvas. Each URL gets a
 * slot (its cell) the moment an effect is prepared; a cell stays transparent
 * until its image loads and shows a soft glow when the image fails. When the
 * grid is full, slots of images the current effect does not use are reused.
 */
export class ParticleAtlas implements ParticleAtlasSource {
	readonly source: HTMLCanvasElement
	version = 0
	readonly #context: CanvasRenderingContext2D
	readonly #slots = new Map<string, number>()
	readonly #owners: (string | null)[] = new Array<string | null>(PARTICLE_ATLAS_SLOTS).fill(null)
	#inUse: ReadonlySet<string> = new Set()
	readonly #onChange: () => void

	constructor(onChange: () => void) {
		this.source = document.createElement('canvas')
		this.source.width = this.source.height = GRID * CELL
		const context = this.source.getContext('2d')
		if(!context) throw new Error('Unable to create the particle image atlas.')
		this.#context = context
		this.#onChange = onChange
	}

	/** Gives a slot to every image of the effect (starting their download). */
	prepare(effect: ParticleEffectDefinition | null): void {
		const urls = PARTICLE_MOMENTS.map(moment => effect?.[moment]?.image).filter((url): url is string => Boolean(url))
		this.#inUse = new Set(urls)
		for(const url of urls) this.slot(url)
	}

	/** Cell of an image, assigned on first use; -1 when every cell is taken by the current effect. */
	slot(url: string): number {
		const known = this.#slots.get(url)
		if(known !== undefined) return known
		let slot = this.#owners.indexOf(null)
		if(slot < 0) slot = this.#owners.findIndex(owner => owner !== null && !this.#inUse.has(owner))
		if(slot < 0) return -1
		const previous = this.#owners[slot]
		if(previous) this.#slots.delete(previous)
		this.#owners[slot] = url
		this.#slots.set(url, slot)
		this.#clear(slot)
		loadImage(url)
			.then(image => { if(this.#owners[slot] === url) this.#paint(slot, image) })
			.catch(() => { if(this.#owners[slot] === url) this.#paint(slot, null) })
		return slot
	}

	#clear(slot: number): void {
		const x = (slot % GRID) * CELL, y = Math.floor(slot / GRID) * CELL
		this.#context.clearRect(x, y, CELL, CELL)
		this.version++
	}

	/** Draws an image centered in its cell (kept in proportion), or a soft glow for a broken one. */
	#paint(slot: number, image: HTMLImageElement | null): void {
		const context = this.#context
		const x = (slot % GRID) * CELL + INSET, y = Math.floor(slot / GRID) * CELL + INSET
		const box = CELL - INSET * 2
		context.clearRect(x - INSET, y - INSET, CELL, CELL)
		if(image && image.naturalWidth > 0 && image.naturalHeight > 0) {
			const scale = box / Math.max(image.naturalWidth, image.naturalHeight)
			const width = image.naturalWidth * scale, height = image.naturalHeight * scale
			context.drawImage(image, x + (box - width) / 2, y + (box - height) / 2, width, height)
		} else {
			const glow = context.createRadialGradient(x + box / 2, y + box / 2, 0, x + box / 2, y + box / 2, box / 2)
			glow.addColorStop(0, 'rgba(255,255,255,1)')
			glow.addColorStop(1, 'rgba(255,255,255,0)')
			context.fillStyle = glow
			context.fillRect(x, y, box, box)
		}
		this.version++
		this.#onChange()
	}
}
