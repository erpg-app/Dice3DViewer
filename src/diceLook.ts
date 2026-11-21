import { validateFinishOptions, validateGlowOptions, validateMotionOptions, validateParticleOptions, validateSkinOptions } from './particleOptions'
import type { DiceFinishOptions, DiceGlowOptions, DiceMotionOptions, DiceParticleOptions, DiceSkinOptions } from './types'

export const DICE_LOOK_FORMAT = 'dice3dview-look'
export const DICE_LOOK_VERSION = 1

/**
 * A complete dice look: color, skin, finish, particle effect, glow and motion. The workshop of
 * the test page exports it as a JSON file, ready to be stored and applied later.
 */
export interface DiceLook {
	readonly format: typeof DICE_LOOK_FORMAT
	readonly version: typeof DICE_LOOK_VERSION
	readonly name?: string
	/** Dice color (`#rrggbb`); the viewer's color is kept when omitted. */
	readonly themeColor?: string
	readonly skin?: DiceSkinOptions | null
	readonly particles?: DiceParticleOptions | null
	readonly glow?: DiceGlowOptions | null
	readonly finish?: DiceFinishOptions | null
	readonly motion?: DiceMotionOptions | null
}

/** Viewer options a look sets. Parts the look leaves out are turned off. */
export interface DiceLookOptions {
	readonly themeColor?: string
	readonly skin: DiceSkinOptions | null
	readonly particles: DiceParticleOptions | null
	readonly glow: DiceGlowOptions | null
	readonly finish: DiceFinishOptions | null
	readonly motion: DiceMotionOptions | null
}

const fail = (message: string): never => {
	throw new Error(`Dice look ${message}.`)
}

/** Wraps look parts into the versioned file format. */
export const createDiceLook = (parts: Omit<DiceLook, 'format' | 'version'>): DiceLook => {
	const look: DiceLook = { format: DICE_LOOK_FORMAT, version: DICE_LOOK_VERSION, ...parts }
	diceLookOptions(look)
	return look
}

/**
 * Validates a look (an object or a parsed JSON file) and returns the viewer
 * options it sets, e.g. `viewer.updateOptions(diceLookOptions(json))`.
 * Invalid files throw with the offending field.
 */
export const diceLookOptions = (look: unknown): DiceLookOptions => {
	if(!look || typeof look !== 'object' || Array.isArray(look)) fail('must be an object')
	const value = look as Partial<DiceLook>
	if(value.format !== DICE_LOOK_FORMAT) fail(`format must be '${DICE_LOOK_FORMAT}'`)
	if(value.version !== DICE_LOOK_VERSION) fail(`version ${String(value.version)} is not supported (expected ${DICE_LOOK_VERSION})`)
	if(value.name !== undefined && typeof value.name !== 'string') fail('name must be a string')
	if(value.themeColor !== undefined && (typeof value.themeColor !== 'string' || !/^#[\da-f]{6}$/i.test(value.themeColor))) fail('themeColor must be #rrggbb')
	const skin = value.skin ?? null
	const particles = value.particles ?? null
	const glow = value.glow ?? null
	validateSkinOptions(skin)
	validateParticleOptions(particles)
	const finish = value.finish ?? null
	const motion = value.motion ?? null
	validateGlowOptions(glow)
	validateFinishOptions(finish)
	validateMotionOptions(motion)
	return Object.freeze({ ...(value.themeColor ? { themeColor: value.themeColor } : {}), skin, particles, glow, finish, motion })
}
