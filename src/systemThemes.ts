import type { DiceSides, DisplayMode, DisplayRequest, ResolvedDie } from './types'

/**
 * 3D presentation of each system die. Profiles with a `themeColor` carry a
 * color with meaning (V5 normal vs. hunger, Daggerheart hope vs. fear); the
 * others (Fate, Assimilação) follow the requested color, then the viewer's.
 */
export const SYSTEM_THEME_PROFILES = Object.freeze({
	'vampire-v5-normal-d10': Object.freeze({
		theme: 'vampire-v5-normal',
		themeColor: '#20242e',
		sides: 10
	}),
	'vampire-v5-hunger-d10': Object.freeze({
		theme: 'vampire-v5-hunger',
		themeColor: '#761827',
		sides: 10
	}),
	'assimilation-d6': Object.freeze({
		theme: 'assimilation',
		sides: 6
	}),
	'assimilation-d10': Object.freeze({
		theme: 'assimilation',
		sides: 10
	}),
	'assimilation-d12': Object.freeze({
		theme: 'assimilation',
		sides: 12
	}),
	'fate-df': Object.freeze({
		theme: 'fate',
		sides: 6
	}),
	'daggerheart-hope-d12': Object.freeze({
		theme: 'default-v2',
		themeColor: '#ff0a7a',
		sides: 12
	}),
	'daggerheart-fear-d12': Object.freeze({
		theme: 'default-v2',
		themeColor: '#00f585',
		sides: 12
	})
} as const)

export type SystemDiceProfileId = keyof typeof SYSTEM_THEME_PROFILES

export interface SystemDiePresentationInput {
	readonly id: string
	readonly sourceDieId?: string
	readonly sides: number
	readonly value: number
	readonly profileId: string
	readonly discarded?: boolean
	/** Explicit color for this die (wins over every profile color). */
	readonly themeColor?: string
}

export interface SystemDicePresentationOptions {
	/**
	 * Assimilação selection IDs. When supplied, every non-selected die is
	 * presented as discarded. Both semantic IDs and sourceDieIds are accepted.
	 */
	readonly keptIds?: readonly string[]
	readonly themeColors?: Readonly<Partial<Record<SystemDiceProfileId, string>>>
	/**
	 * Color for profiles without a meaningful color (Fate, Assimilação). When
	 * absent, those dice take the viewer's `themeColor`.
	 */
	readonly themeColor?: string
}

export interface SystemDisplayRequestInput extends SystemDicePresentationOptions {
	readonly id: string
	readonly dice: readonly SystemDiePresentationInput[]
	readonly seed?: string
	readonly mode?: DisplayMode
}

export interface MixedDiePresentationInput {
	readonly id: string
	readonly sides: number | string
	readonly value: number
	readonly rawValue?: number
	readonly physicalValue?: number
	readonly profileId?: string | null
	readonly included?: boolean
	readonly discarded?: boolean
	readonly theme?: string
	readonly themeColor?: string
}

export interface MixedDicePresentationOptions extends SystemDicePresentationOptions {
	/**
	 * Unsupported generic dice (for example dF or d7) are omitted by default.
	 * System profiles are always validated and never silently omitted.
	 */
	readonly unsupportedDice?: 'omit' | 'error'
	readonly theme?: string
}

export interface MixedDisplayRequestInput extends MixedDicePresentationOptions {
	readonly id: string
	readonly dice: readonly MixedDiePresentationInput[]
	readonly seed?: string
	readonly mode?: DisplayMode
}

const profileIds: ReadonlySet<string> = new Set(Object.keys(SYSTEM_THEME_PROFILES))

export const isSystemDiceProfileId = (value: unknown): value is SystemDiceProfileId =>
	typeof value === 'string' && profileIds.has(value)

export const getSystemThemeProfile = (profileId: string) => {
	if(!isSystemDiceProfileId(profileId)) {
		throw new Error(`Unsupported system dice profile '${profileId}'.`)
	}
	return SYSTEM_THEME_PROFILES[profileId]
}

const assertNonEmptyId = (value: unknown, label: string): string => {
	if(typeof value !== 'string' || value.trim().length === 0) {
		throw new Error(`${label} must be a non-empty string.`)
	}
	return value
}

const validateSystemDie = (die: SystemDiePresentationInput) => {
	if(!die || typeof die !== 'object') {
		throw new Error('System die must be an object.')
	}
	const id = assertNonEmptyId(die.id, 'System die id')
	const profile = getSystemThemeProfile(die.profileId)
	if(die.sides !== profile.sides) {
		throw new Error(
			`System dice profile '${die.profileId}' expects d${profile.sides}, received d${String(die.sides)}.`
		)
	}
	if(!Number.isInteger(die.value) || die.value < 1 || die.value > profile.sides) {
		throw new Error(
			`System die '${id}' value ${String(die.value)} is outside 1-${profile.sides}.`
		)
	}
	if(die.sourceDieId !== undefined) assertNonEmptyId(die.sourceDieId, 'System sourceDieId')
	return { id, profile, profileId: die.profileId as SystemDiceProfileId }
}

const createKeptIdSet = (
	keptIds: readonly string[] | undefined
): ReadonlySet<string> | undefined => keptIds === undefined
	? undefined
	: new Set(keptIds.map(value => assertNonEmptyId(value, 'keptIds entry')))

const resolveSystemDie = (
	die: SystemDiePresentationInput,
	options: SystemDicePresentationOptions,
	kept: ReadonlySet<string> | undefined
): ResolvedDie => {
	const { id, profile, profileId } = validateSystemDie(die)
	const discarded = kept === undefined
		? Boolean(die.discarded)
		: !kept.has(id) && (die.sourceDieId === undefined || !kept.has(die.sourceDieId))
	// A meaningful profile color (V5, Daggerheart) holds unless this die or its
	// profile is recolored; neutral profiles follow the request, then the viewer.
	const meaningful = 'themeColor' in profile ? profile.themeColor : undefined
	const themeColor = die.themeColor ?? options.themeColors?.[profileId] ?? meaningful ?? options.themeColor
	return Object.freeze({
		id,
		sides: profile.sides as DiceSides,
		value: die.value,
		discarded,
		theme: profile.theme,
		...(themeColor ? { themeColor } : {})
	})
}

export const toSystemResolvedDie = (
	die: SystemDiePresentationInput,
	options: SystemDicePresentationOptions = {}
): ResolvedDie => resolveSystemDie(die, options, createKeptIdSet(options.keptIds))

export const toSystemResolvedDice = (
	dice: readonly SystemDiePresentationInput[],
	options: SystemDicePresentationOptions = {}
): readonly ResolvedDie[] => {
	if(!Array.isArray(dice) || dice.length === 0) {
		throw new Error('System presentation expects at least one die.')
	}
	const kept = createKeptIdSet(options.keptIds)
	const resolved = dice.map(die => resolveSystemDie(die, options, kept))
	const ids = new Set<string>()
	for(const die of resolved) {
		if(ids.has(die.id)) throw new Error(`Duplicate system die id '${die.id}'.`)
		ids.add(die.id)
	}
	return Object.freeze(resolved)
}

/**
 * Converts the structural SystemDieResult contract from @erpg/dicecore into
 * the display-only request consumed by DiceResultViewer.
 */
export const createSystemDisplayRequest = (
	input: SystemDisplayRequestInput
): DisplayRequest => {
	if(!input || typeof input !== 'object') {
		throw new Error('System display request must be an object.')
	}
	const id = assertNonEmptyId(input.id, 'System display request id')
	return Object.freeze({
		id,
		dice: toSystemResolvedDice(input.dice, input),
		...(input.seed === undefined ? {} : { seed: input.seed }),
		...(input.mode === undefined ? {} : { mode: input.mode })
	})
}

const genericDisplaySides: ReadonlySet<number> = new Set([2, 3, 4, 5, 6, 7, 8, 10, 12, 14, 16, 20, 24, 30, 100])

const resolvePhysicalValue = (die: MixedDiePresentationInput): number =>
	die.physicalValue ?? die.rawValue ?? die.value

const resolveMixedGenericDie = (
	die: MixedDiePresentationInput,
	options: MixedDicePresentationOptions
): ResolvedDie | null => {
	const id = assertNonEmptyId(die.id, 'Mixed die id')
	const sourceSides = die.sides
	const displaySides = sourceSides
	if(typeof displaySides !== 'number' || !genericDisplaySides.has(displaySides)) {
		if((options.unsupportedDice ?? 'omit') === 'omit') return null
		throw new Error(`Mixed die '${id}' uses unsupported generic sides '${String(sourceSides)}'.`)
	}

	const value = resolvePhysicalValue(die)
	const maximum = displaySides
	if(!Number.isInteger(value) || value < 1 || value > maximum) {
		throw new Error(`Mixed die '${id}' physical value ${String(value)} is outside 1-${maximum}.`)
	}

	return Object.freeze({
		id,
		sides: displaySides as DiceSides,
		value,
		discarded: die.discarded ?? die.included === false,
		...(die.theme ?? options.theme
			? { theme: die.theme ?? options.theme }
			: {}),
		...(die.themeColor ?? options.themeColor
			? { themeColor: die.themeColor ?? options.themeColor }
			: {})
	})
}

const validateMixedOptions = (options: MixedDicePresentationOptions): void => {
	if(
		options.unsupportedDice !== undefined
		&& options.unsupportedDice !== 'omit'
		&& options.unsupportedDice !== 'error'
	) {
		throw new Error("unsupportedDice must be either 'omit' or 'error'.")
	}
}

/**
 * Converts the flattened `rollMixedDice().dice` contract into one 3D request.
 * Generic and profiled dice preserve their original order and physical faces.
 */
export const toMixedResolvedDice = (
	dice: readonly MixedDiePresentationInput[],
	options: MixedDicePresentationOptions = {}
): readonly ResolvedDie[] => {
	if(!Array.isArray(dice) || dice.length === 0) {
		throw new Error('Mixed presentation expects at least one die.')
	}
	validateMixedOptions(options)
	const kept = createKeptIdSet(options.keptIds)
	const resolved: ResolvedDie[] = []
	for(const die of dice) {
		if(!die || typeof die !== 'object') {
			throw new Error('Mixed die must be an object.')
		}
		if(typeof die.profileId === 'string') {
			const value = resolvePhysicalValue(die)
			resolved.push(resolveSystemDie({
				id: die.id,
				sides: typeof die.sides === 'number' ? die.sides : Number.NaN,
				value,
				profileId: die.profileId,
				discarded: die.discarded,
				...(die.themeColor ? { themeColor: die.themeColor } : {})
			}, options, kept))
			continue
		}
		const generic = resolveMixedGenericDie(die, options)
		if(generic !== null) resolved.push(generic)
	}

	if(resolved.length === 0) {
		throw new Error('Mixed presentation contains no supported 3D dice.')
	}
	const ids = new Set<string>()
	for(const die of resolved) {
		if(ids.has(die.id)) throw new Error(`Duplicate mixed die id '${die.id}'.`)
		ids.add(die.id)
	}
	return Object.freeze(resolved)
}

export const createMixedDisplayRequest = (
	input: MixedDisplayRequestInput
): DisplayRequest => {
	if(!input || typeof input !== 'object') {
		throw new Error('Mixed display request must be an object.')
	}
	const id = assertNonEmptyId(input.id, 'Mixed display request id')
	return Object.freeze({
		id,
		dice: toMixedResolvedDice(input.dice, input),
		...(input.seed === undefined ? {} : { seed: input.seed }),
		...(input.mode === undefined ? {} : { mode: input.mode })
	})
}
