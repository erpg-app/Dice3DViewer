import { PARTICLE_MOMENTS, parseParticleColor } from '../particleOptions'
import type { DiceParticleOptions, ParticleEffectDefinition, ParticleEmitterOptions, ParticleMoment } from '../types'

type Customization = Pick<DiceParticleOptions, 'color' | 'shape' | 'size' | 'moments'>

const luma = (r: number, g: number, b: number): number => 0.299 * r + 0.587 * g + 0.114 * b
const byte = (value: number): string => Math.round(Math.max(0, Math.min(1, value)) * 255).toString(16).padStart(2, '0')

/**
 * A color in the tint's hue with the brightness of the original one, so a
 * ramp keeps its shape: dark tails stay dark and hot cores stay whitish.
 */
const recolor = (color: string, tint: readonly number[]): string => {
	const [r, g, b, a] = parseParticleColor(color) ?? [1, 1, 1, 1]
	const light = luma(r, g, b), base = Math.max(0.05, luma(tint[0]!, tint[1]!, tint[2]!))
	const channel = (value: number): number => light <= base
		? value * light / base
		: value + (1 - value) * (light - base) / Math.max(1e-3, 1 - base) * 0.75
	return `#${byte(channel(tint[0]!))}${byte(channel(tint[1]!))}${byte(channel(tint[2]!))}${byte(a)}`
}

const variants = new WeakMap<ParticleEffectDefinition, Map<string, ParticleEffectDefinition>>()

/**
 * Applies the quick controls of `DiceParticleOptions` to an effect: a hue for
 * every emitter, one sprite, a size factor and the moments that play. Results
 * are cached, so the particle engine sees the same emitters roll after roll.
 */
export const customizeEffect = (effect: ParticleEffectDefinition, options: Customization): ParticleEffectDefinition => {
	const size = options.size ?? 1
	const moments = options.moments ?? {}
	if(!options.color && !options.shape && size === 1 && !Object.values(moments).includes(false)) return effect
	const key = JSON.stringify([options.color ?? '', options.shape ?? '', size, PARTICLE_MOMENTS.map(moment => moments[moment] !== false)])
	let cache = variants.get(effect)
	if(!cache) variants.set(effect, cache = new Map())
	const known = cache.get(key)
	if(known) return known
	const tint = options.color ? parseParticleColor(options.color) : null
	const result: Partial<Record<ParticleMoment, ParticleEmitterOptions>> & { auraSeconds?: number; linkDistance?: number; linkSeconds?: number } = {}
	if(effect.auraSeconds !== undefined) result.auraSeconds = effect.auraSeconds
	if(effect.linkDistance !== undefined) result.linkDistance = effect.linkDistance
	if(effect.linkSeconds !== undefined) result.linkSeconds = effect.linkSeconds
	for(const moment of PARTICLE_MOMENTS) {
		const emitter = effect[moment]
		if(!emitter || moments[moment] === false) continue
		result[moment] = {
			...emitter,
			size: [emitter.size[0] * size, emitter.size[1] * size],
			...(options.shape ? { shape: options.shape } : {}),
			...(tint ? {
				colors: emitter.colors.map(color => recolor(color, tint)),
				...(emitter.palette ? { palette: emitter.palette.map(color => recolor(color, tint)) } : {})
			} : {})
		}
	}
	const customized = Object.freeze(result) as ParticleEffectDefinition
	cache.set(key, customized)
	return customized
}
