import type {
	DiceSides,
	DisplayMode,
	DisplayRequest,
	NormalizedDisplayRequest,
	NormalizedResolvedDie,
	RequiredViewerOptions,
	ResolvedDie
} from './types'

const SUPPORTED_DICE: ReadonlySet<number> = new Set([2, 3, 4, 5, 6, 7, 8, 10, 12, 14, 16, 20, 24, 30, 100])

export const normalizeDisplaySides = (sides: unknown): DiceSides => {
	const normalized = Number(sides)
	if(!SUPPORTED_DICE.has(normalized)) {
		throw new Error(`Unsupported display die: d${String(sides)}. Supported dice are d2, d3, d4, d5, d6, d7, d8, d10, d12, d14, d16, d20, d24, d30, and d100.`)
	}
	return normalized as DiceSides
}

export const normalizeDisplayValue = (value: unknown, sides: DiceSides): number => {
	const normalized = Number(value)
	if(!Number.isFinite(normalized) || !Number.isInteger(normalized)) {
		throw new Error(`Display die d${sides} is missing an integer value.`)
	}
	if(normalized < 1 || normalized > sides) {
		throw new Error(`Display die d${sides} value ${normalized} is outside 1-${sides}.`)
	}
	return normalized
}

let kinematicWarned = false

/**
 * v3 presents every result with physics. The v2 `'kinematic'` mode is still
 * accepted (and reported once) so v2 callers keep working.
 */
export const normalizeDisplayMode = (mode: unknown): DisplayMode => {
	if(mode === undefined || mode === null || mode === 'physics') return 'physics'
	if(mode === 'kinematic') {
		if(!kinematicWarned && typeof console !== 'undefined') {
			kinematicWarned = true
			console.warn("[dice3dview] mode 'kinematic' was removed in v3; presenting with physics.")
		}
		return 'physics'
	}
	throw new Error(`Invalid display mode '${String(mode)}'. v3 presents every result with 'physics'.`)
}

const normalizeDie = (
	die: ResolvedDie,
	index: number,
	request: Pick<DisplayRequest, 'id'>,
	defaults: Pick<RequiredViewerOptions, 'theme' | 'themeColor'>
): NormalizedResolvedDie => {
	if(!die || typeof die !== 'object') {
		throw new Error(`Display die at index ${index} must be an object.`)
	}
	const sides = normalizeDisplaySides(die.sides)
	return Object.freeze({
		id: die.id || `${request.id}-die-${index}`,
		sides,
		value: normalizeDisplayValue(die.value, sides),
		discarded: Boolean(die.discarded),
		theme: die.theme || defaults.theme,
		themeColor: die.themeColor || defaults.themeColor
	})
}

export const normalizeDisplayRequest = (
	request: DisplayRequest,
	defaults: Pick<RequiredViewerOptions, 'mode' | 'theme' | 'themeColor'>
): NormalizedDisplayRequest => {
	if(!request || typeof request !== 'object') {
		throw new Error('display expects a request object.')
	}
	if(typeof request.id !== 'string' || request.id.trim().length === 0) {
		throw new Error('display expects a non-empty request id.')
	}
	if(!Array.isArray(request.dice) || request.dice.length === 0) {
		throw new Error('display expects at least one resolved die.')
	}
	const normalized: NormalizedDisplayRequest = {
		id: request.id,
		seed: typeof request.seed === 'string' ? request.seed : request.id,
		mode: normalizeDisplayMode(request.mode ?? defaults.mode),
		dice: Object.freeze(request.dice.map((die, index) => normalizeDie(die, index, request, defaults)))
	}
	return Object.freeze(normalized)
}

export const getDisplayBodyCount = (dice: readonly Pick<ResolvedDie, 'sides'>[]): number =>
	dice.reduce((total, die) => total + (die.sides === 100 ? 2 : 1), 0)
