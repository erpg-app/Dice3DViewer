import type {
	DiceGlowOptions,
	ParticleCondition,
	DiceParticleOptions,
	DiceParticlePreset,
	DiceSkinOptions,
	ParticleEmitterOptions,
	ParticleMoment,
	ParticleOrientation,
	ParticleShape
} from './types'

/** Built-in effects; their definitions load with the particle engine (render/particlePresets). */
export const PARTICLE_PRESET_NAMES: readonly DiceParticlePreset[] = Object.freeze([
	'sparkle', 'fire', 'arcane', 'frost', 'dust', 'confetti', 'electric', 'smoke',
	'lava', 'storm', 'holy', 'shadow', 'poison', 'nature', 'cosmic',
	'lightning', 'blizzard', 'hearts'
])
export const PARTICLE_SHAPES: readonly ParticleShape[] = Object.freeze([
	'soft', 'spark', 'star', 'ring', 'confetti', 'smoke',
	'bolt', 'arc', 'flame', 'snowflake', 'heart', 'diamond', 'triangle', 'cross'
])
export const PARTICLE_ORIENTATIONS: readonly ParticleOrientation[] = Object.freeze(['random', 'upright', 'motion'])
export const PARTICLE_MOMENTS: readonly ParticleMoment[] = Object.freeze(['trail', 'ground', 'impact', 'collision', 'settle', 'aura', 'explode', 'critical', 'link'])

/** `#rgb`, `#rrggbb` or `#rrggbbaa` as linear-free 0..1 RGBA; null when invalid. */
export const parseParticleColor = (value: unknown): [number, number, number, number] | null => {
	if(typeof value !== 'string' || !/^#(?:[\da-f]{3}|[\da-f]{6}|[\da-f]{8})$/i.test(value)) return null
	const hex = value.length === 4 ? value.slice(1).split('').map(digit => digit + digit).join('') : value.slice(1)
	const channel = (index: number): number => parseInt(hex.slice(index * 2, index * 2 + 2), 16) / 255
	return [channel(0), channel(1), channel(2), hex.length === 8 ? channel(3) : 1]
}

const fail = (path: string, rule: string): never => {
	throw new Error(`Viewer option ${path} ${rule}.`)
}

const assertRange = (value: unknown, path: string, minimum: number): void => {
	if(!Array.isArray(value) || value.length !== 2 || !value.every(item => Number.isFinite(item))) fail(path, 'must be [min, max] numbers')
	const [low, high] = value as [number, number]
	if(low < minimum || high < low) fail(path, `must satisfy ${minimum} <= min <= max`)
}

const assertFinite = (value: unknown, path: string, minimum = -Infinity, maximum = Infinity): void => {
	if(value === undefined) return
	if(typeof value !== 'number' || !Number.isFinite(value) || value < minimum || value > maximum) {
		fail(path, `must be a finite number between ${minimum} and ${maximum}`)
	}
}

const assertColors = (colors: unknown, path: string): void => {
	if(!Array.isArray(colors) || !colors.length) fail(path, 'must list at least one color')
	;(colors as unknown[]).forEach((color, index) => {
		if(!parseParticleColor(color)) fail(`${path}[${index}]`, 'must be #rgb, #rrggbb or #rrggbbaa')
	})
}

const assertColor = (color: unknown, path: string): void => {
	if(color !== undefined && !parseParticleColor(color)) fail(path, 'must be #rgb, #rrggbb or #rrggbbaa')
}

const assertShape = (shape: unknown, path: string): void => {
	if(shape !== undefined && !PARTICLE_SHAPES.includes(shape as ParticleShape)) fail(path, `must be one of ${PARTICLE_SHAPES.join(', ')}`)
}

const validateCondition = (when: ParticleCondition, path: string): void => {
	if(!when || typeof when !== 'object') fail(path, 'must be an object')
	assertFinite(when.minForce, `${path}.minForce`, 0)
	assertFinite(when.minSpeed, `${path}.minSpeed`, 0)
	assertFinite(when.chance, `${path}.chance`, 0, 1)
	assertFinite(when.cooldown, `${path}.cooldown`, 0)
	if(when.sides !== undefined && (!Array.isArray(when.sides) || !when.sides.every(side => Number.isInteger(side) && side > 0))) {
		fail(`${path}.sides`, 'must list positive integers')
	}
	const faces = when.faces
	if(faces !== undefined && faces !== 'max' && faces !== 'min' && (!Array.isArray(faces) || !faces.every(face => Number.isFinite(face)))) {
		fail(`${path}.faces`, 'must be max, min or a list of values')
	}
}

const validateEmitter = (emitter: ParticleEmitterOptions, path: string): void => {
	if(!emitter || typeof emitter !== 'object') fail(path, 'must be an object')
	assertFinite(emitter.amount, `${path}.amount`, 0)
	if(emitter.amount === undefined) fail(`${path}.amount`, 'is required')
	assertRange(emitter.life, `${path}.life`, 0.01)
	assertRange(emitter.size, `${path}.size`, 0)
	assertRange(emitter.speed, `${path}.speed`, 0)
	if(emitter.direction !== undefined && !['up', 'out', 'sphere', 'back'].includes(emitter.direction)) fail(`${path}.direction`, 'must be up, out, sphere or back')
	assertFinite(emitter.gravity, `${path}.gravity`)
	assertFinite(emitter.drag, `${path}.drag`, 0)
	assertFinite(emitter.swirl, `${path}.swirl`)
	assertFinite(emitter.grow, `${path}.grow`, 0)
	assertFinite(emitter.flicker, `${path}.flicker`, 0, 1)
	assertFinite(emitter.spin, `${path}.spin`)
	assertShape(emitter.shape, `${path}.shape`)
	if(emitter.image !== undefined && (typeof emitter.image !== 'string' || !emitter.image.trim())) fail(`${path}.image`, 'must be a non-empty image URL')
	if(emitter.orient !== undefined && !PARTICLE_ORIENTATIONS.includes(emitter.orient)) fail(`${path}.orient`, `must be one of ${PARTICLE_ORIENTATIONS.join(', ')}`)
	if(emitter.blend !== undefined && emitter.blend !== 'add' && emitter.blend !== 'alpha') fail(`${path}.blend`, 'must be add or alpha')
	assertColors(emitter.colors, `${path}.colors`)
	if(emitter.palette !== undefined) assertColors(emitter.palette, `${path}.palette`)
	if(emitter.when !== undefined) validateCondition(emitter.when, `${path}.when`)
}

export const validateParticleOptions = (options: DiceParticleOptions | null): void => {
	if(options === null) return
	if(!options || typeof options !== 'object') fail('particles', 'must be an object or null')
	if(options.preset === undefined && options.effect === undefined) fail('particles', 'needs a preset or an effect')
	if(options.preset !== undefined && !PARTICLE_PRESET_NAMES.includes(options.preset)) {
		fail('particles.preset', `must be one of ${PARTICLE_PRESET_NAMES.join(', ')}`)
	}
	assertFinite(options.intensity, 'particles.intensity', 0, 3)
	assertFinite(options.size, 'particles.size', 0.2, 4)
	assertColor(options.color, 'particles.color')
	assertShape(options.shape, 'particles.shape')
	if(options.moments !== undefined) {
		if(!options.moments || typeof options.moments !== 'object') fail('particles.moments', 'must be an object')
		for(const [moment, enabled] of Object.entries(options.moments)) {
			if(!PARTICLE_MOMENTS.includes(moment as ParticleMoment)) fail(`particles.moments.${moment}`, `is not a moment (${PARTICLE_MOMENTS.join(', ')})`)
			if(typeof enabled !== 'boolean') fail(`particles.moments.${moment}`, 'must be a boolean')
		}
	}
	const effect = options.effect
	if(effect !== undefined) {
		if(!effect || typeof effect !== 'object') fail('particles.effect', 'must be an object')
		for(const key of PARTICLE_MOMENTS) if(effect[key] !== undefined) validateEmitter(effect[key]!, `particles.effect.${key}`)
		assertFinite(effect.auraSeconds, 'particles.effect.auraSeconds', 0)
		assertFinite(effect.linkDistance, 'particles.effect.linkDistance', 0)
		assertFinite(effect.linkSeconds, 'particles.effect.linkSeconds', 0)
	}
}

export const validateGlowOptions = (glow: DiceGlowOptions | null): void => {
	if(glow === null) return
	if(!glow || typeof glow !== 'object') fail('glow', 'must be an object or null')
	assertColor(glow.color, 'glow.color')
	assertFinite(glow.intensity, 'glow.intensity', 0, 3)
	if(glow.light !== undefined && typeof glow.light !== 'boolean') fail('glow.light', 'must be a boolean')
	if(glow.pulse !== undefined && typeof glow.pulse !== 'boolean') fail('glow.pulse', 'must be a boolean')
}

export const validateSkinOptions = (skin: DiceSkinOptions | null): void => {
	if(skin === null) return
	if(!skin || typeof skin !== 'object') fail('skin', 'must be an object or null')
	if(typeof skin.texture !== 'string' || !skin.texture.trim()) fail('skin.texture', 'must be a non-empty image URL')
	assertFinite(skin.scale, 'skin.scale', 0.05, 20)
	if(skin.blend !== undefined && !['normal', 'multiply', 'screen', 'overlay'].includes(skin.blend)) fail('skin.blend', 'must be normal, multiply, screen or overlay')
	assertFinite(skin.opacity, 'skin.opacity', 0, 1)
	if(skin.labels !== undefined && !['auto', 'light', 'dark'].includes(skin.labels)) fail('skin.labels', 'must be auto, light or dark')
}
