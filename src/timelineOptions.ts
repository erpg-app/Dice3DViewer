import type {
	NormalizedTimelineOptions,
	RequiredViewerOptions,
	TimelineEffectOptions,
	TimelineOptions,
	ViewerOptions
} from './types'
import { normalizeDisplayMode } from './displayRequest'
import { validateGlowOptions, validateParticleOptions, validateSkinOptions } from './particleOptions'

const noop = (): void => undefined

const baseEffect = (
	durationMs: number,
	color: string,
	intensity = 1
): Required<TimelineEffectOptions> => ({
	enabled: true,
	delayMs: 0,
	durationMs,
	intensity,
	color
})

export const DEFAULT_TIMELINE_OPTIONS: NormalizedTimelineOptions = Object.freeze({
	enabled: true,
	maxEvents: 500,
	maxDurationMs: 12_000,
	phaseGapMs: 180,
	effects: Object.freeze({
		explode: Object.freeze({ ...baseEffect(900, '#ffb020'), origin: 'source', burstHeight: 1.6, spread: 0.8 }),
		compound: Object.freeze({ ...baseEffect(320, '#d8b4fe'), showBadge: true }),
		penetrate: Object.freeze({ ...baseEffect(300, '#fbbf24'), showBadge: true }),
		reroll: Object.freeze({ ...baseEffect(750, '#60a5fa'), style: 'hop', hopHeight: 2.2 }),
		unique: Object.freeze({ ...baseEffect(750, '#a78bfa'), style: 'hop', hopHeight: 2.2 }),
		// Long enough to watch the discarded dice lose their color.
		keep: Object.freeze(baseEffect(450, '#86efac')),
		drop: Object.freeze(baseEffect(450, '#94a3b8')),
		success: Object.freeze(baseEffect(250, '#22c55e')),
		failure: Object.freeze(baseEffect(250, '#ef4444')),
		neutral: Object.freeze(baseEffect(250, '#94a3b8', 0.35)),
		criticalSuccess: Object.freeze({ ...baseEffect(250, '#facc15'), pulses: 2 }),
		criticalFailure: Object.freeze({ ...baseEffect(250, '#dc2626'), pulses: 2 })
	})
})

export const mergeTimelineOptions = (
	base: NormalizedTimelineOptions = DEFAULT_TIMELINE_OPTIONS,
	update: TimelineOptions = {}
): NormalizedTimelineOptions => {
	const effects = update.effects ?? {}
	const mergeEffect = <T extends object>(
		current: T,
		partial: object | undefined
	): T => ({ ...current, ...(partial ?? {}) } as T)
	return {
		enabled: update.enabled ?? base.enabled,
		maxEvents: update.maxEvents ?? base.maxEvents,
		maxDurationMs: update.maxDurationMs ?? base.maxDurationMs,
		phaseGapMs: update.phaseGapMs ?? base.phaseGapMs,
		effects: {
			explode: mergeEffect(base.effects.explode, effects.explode),
			compound: mergeEffect(base.effects.compound, effects.compound),
			penetrate: mergeEffect(base.effects.penetrate, effects.penetrate),
			reroll: mergeEffect(base.effects.reroll, effects.reroll),
			unique: mergeEffect(base.effects.unique, effects.unique),
			keep: mergeEffect(base.effects.keep, effects.keep),
			drop: mergeEffect(base.effects.drop, effects.drop),
			success: mergeEffect(base.effects.success, effects.success),
			failure: mergeEffect(base.effects.failure, effects.failure),
			neutral: mergeEffect(base.effects.neutral, effects.neutral),
			criticalSuccess: mergeEffect(base.effects.criticalSuccess, effects.criticalSuccess),
			criticalFailure: mergeEffect(base.effects.criticalFailure, effects.criticalFailure)
		}
	}
}

const assertFiniteNonNegative = (value: number, path: string): void => {
	if(!Number.isFinite(value) || value < 0) throw new Error(`Viewer option ${path} must be a finite non-negative number.`)
}

const assertFinitePositive = (value: number, path: string): void => {
	if(!Number.isFinite(value) || value <= 0) throw new Error(`Viewer option ${path} must be a positive finite number.`)
}

const assertBoolean = (value: boolean, path: string): void => {
	if(typeof value !== 'boolean') throw new Error(`Viewer option ${path} must be a boolean.`)
}

const assertString = (value: string, path: string, allowEmpty = false): void => {
	if(typeof value !== 'string' || (!allowEmpty && value.trim().length === 0)) {
		throw new Error(`Viewer option ${path} must be ${allowEmpty ? 'a string' : 'a non-empty string'}.`)
	}
}

export const validateTimelineOptions = (timeline: NormalizedTimelineOptions): void => {
	if(typeof timeline.enabled !== 'boolean') throw new Error('Viewer option timeline.enabled must be a boolean.')
	if(!Number.isInteger(timeline.maxEvents) || timeline.maxEvents < 1) {
		throw new Error('Viewer option timeline.maxEvents must be a positive integer.')
	}
	if(!Number.isFinite(timeline.maxDurationMs) || timeline.maxDurationMs <= 0) {
		throw new Error('Viewer option timeline.maxDurationMs must be a positive finite number.')
	}
	assertFiniteNonNegative(timeline.phaseGapMs, 'timeline.phaseGapMs')
	for(const [name, effect] of Object.entries(timeline.effects)) {
		if(typeof effect.enabled !== 'boolean') throw new Error(`Viewer option timeline.effects.${name}.enabled must be a boolean.`)
		assertFiniteNonNegative(effect.delayMs, `timeline.effects.${name}.delayMs`)
		assertFiniteNonNegative(effect.durationMs, `timeline.effects.${name}.durationMs`)
		if(!Number.isFinite(effect.intensity) || effect.intensity < 0 || effect.intensity > 1) {
			throw new Error(`Viewer option timeline.effects.${name}.intensity must be between 0 and 1.`)
		}
		if(typeof effect.color !== 'string' || effect.color.trim().length === 0) {
			throw new Error(`Viewer option timeline.effects.${name}.color must be a non-empty string.`)
		}
	}
	if(!['source', 'edge'].includes(timeline.effects.explode.origin)) {
		throw new Error('Viewer option timeline.effects.explode.origin must be source or edge.')
	}
	assertFiniteNonNegative(timeline.effects.explode.burstHeight, 'timeline.effects.explode.burstHeight')
	assertFiniteNonNegative(timeline.effects.explode.spread, 'timeline.effects.explode.spread')
	for(const name of ['reroll', 'unique'] as const) {
		const effect = timeline.effects[name]
		if(!['hop', 'edge', 'spin'].includes(effect.style)) {
			throw new Error(`Viewer option timeline.effects.${name}.style must be hop, edge, or spin.`)
		}
		assertFiniteNonNegative(effect.hopHeight, `timeline.effects.${name}.hopHeight`)
	}
	for(const name of ['criticalSuccess', 'criticalFailure'] as const) {
		const pulses = timeline.effects[name].pulses
		if(!Number.isInteger(pulses) || pulses < 1) {
			throw new Error(`Viewer option timeline.effects.${name}.pulses must be a positive integer.`)
		}
	}
	for(const name of ['compound', 'penetrate'] as const) {
		if(typeof timeline.effects[name].showBadge !== 'boolean') {
			throw new Error(`Viewer option timeline.effects.${name}.showBadge must be a boolean.`)
		}
	}
}

export const createViewerOptions = (options: ViewerOptions): RequiredViewerOptions => ({
	id: options.id ?? `dice-canvas-${Date.now()}`,
	container: options.container ?? null,
	assetPath: options.assetPath ?? '/assets/dice-box/',
	origin: options.origin ?? (typeof window === 'undefined' ? '' : window.location.origin),
	mode: normalizeDisplayMode(options.mode),
	theme: options.theme ?? 'default',
	preloadThemes: [...(options.preloadThemes ?? [])],
	externalThemes: { ...(options.externalThemes ?? {}) },
	themeColor: options.themeColor ?? '#2e8555',
	maxDice: options.maxDice ?? 120,
	enableShadows: options.enableShadows ?? true,
	shadowTransparency: options.shadowTransparency ?? 0.8,
	shadowResolution: options.shadowResolution ?? 1024,
	lightIntensity: options.lightIntensity ?? 1,
	antialias: options.antialias ?? true,
	scale: options.scale ?? 5,
	duration: options.duration ?? 1100,
	delay: options.delay ?? 10,
	gravity: options.gravity ?? 1.3,
	mass: options.mass ?? 1.08,
	startingHeight: options.startingHeight ?? 7.6,
	spinForce: options.spinForce ?? 5.8,
	throwForce: options.throwForce ?? 6.4,
	aggressiveThrowChance: options.aggressiveThrowChance ?? options.wallBounceChance ?? 0.12,
	wallBounceChance: options.wallBounceChance ?? options.aggressiveThrowChance ?? 0.12,
	landingSpread: options.landingSpread ?? 0,
	wallPadding: options.wallPadding ?? 0.25,
	colliderScale: options.colliderScale ?? 1.02,
	spawnSpacing: options.spawnSpacing ?? 1.72,
	spawnHeightStep: options.spawnHeightStep ?? 0,
	spawnOverscan: options.spawnOverscan ?? 0.15,
	friction: options.friction ?? 0.54,
	restitution: options.restitution ?? 0.29,
	linearDamping: options.linearDamping ?? 0.1,
	angularDamping: options.angularDamping ?? 0.08,
	settleTimeout: options.settleTimeout ?? 4200,
	physicsWasmUrl: options.physicsWasmUrl ?? '',
	skin: options.skin ?? null,
	particles: options.particles ?? null,
	glow: options.glow ?? null,
	reducedMotion: options.reducedMotion ?? 'auto',
	onCollision: options.onCollision ?? noop,
	onThemeConfigLoaded: options.onThemeConfigLoaded ?? noop,
	onThemeLoaded: options.onThemeLoaded ?? noop,
	onTimelineProgress: options.onTimelineProgress ?? noop,
	timeline: mergeTimelineOptions(DEFAULT_TIMELINE_OPTIONS, options.timeline)
})

export const createUpdatedViewerOptions = (
	current: Readonly<RequiredViewerOptions>,
	update: ViewerOptions
): RequiredViewerOptions => {
	let merged: ViewerOptions = {
		...current,
		...update,
		timeline: mergeTimelineOptions(current.timeline, update.timeline)
	}
	if(update.aggressiveThrowChance !== undefined) {
		merged = { ...merged, wallBounceChance: update.aggressiveThrowChance }
	} else if(update.wallBounceChance !== undefined) {
		merged = { ...merged, aggressiveThrowChance: update.wallBounceChance }
	}
	const next = createViewerOptions(merged)
	validateViewerOptions(next)
	return next
}

export const validateViewerOptions = (options: RequiredViewerOptions): void => {
	assertString(options.id, 'id')
	assertString(options.assetPath, 'assetPath', true)
	assertString(options.origin, 'origin', true)
	assertString(options.theme, 'theme')
	assertString(options.themeColor, 'themeColor')
	assertString(options.physicsWasmUrl, 'physicsWasmUrl', true)
	for(const [index, theme] of options.preloadThemes.entries()) {
		assertString(theme, `preloadThemes[${index}]`)
	}
	for(const [theme, basePath] of Object.entries(options.externalThemes)) {
		assertString(theme, 'externalThemes key')
		assertString(basePath, `externalThemes.${theme}`)
	}
	if(!Number.isInteger(options.maxDice) || options.maxDice < 1) {
		throw new Error('Viewer option maxDice must be a positive integer.')
	}
	if(options.mode !== 'physics') {
		throw new Error(`Unsupported display mode '${String(options.mode)}'.`)
	}
	if(!Number.isFinite(options.aggressiveThrowChance)
		|| options.aggressiveThrowChance < 0
		|| options.aggressiveThrowChance > 1) {
		throw new Error('Viewer option aggressiveThrowChance must be between 0 and 1.')
	}
	if(!Number.isFinite(options.landingSpread)
		|| options.landingSpread < 0
		|| options.landingSpread > 1) {
		throw new Error('Viewer option landingSpread must be between 0 and 1.')
	}
	assertBoolean(options.enableShadows, 'enableShadows')
	assertBoolean(options.antialias, 'antialias')
	if(!Number.isFinite(options.shadowTransparency)
		|| options.shadowTransparency < 0
		|| options.shadowTransparency > 1) {
		throw new Error('Viewer option shadowTransparency must be between 0 and 1.')
	}
	if(!Number.isInteger(options.shadowResolution) || options.shadowResolution < 1) {
		throw new Error('Viewer option shadowResolution must be a positive integer.')
	}
	assertFiniteNonNegative(options.lightIntensity, 'lightIntensity')
	assertFinitePositive(options.scale, 'scale')
	assertFiniteNonNegative(options.duration, 'duration')
	assertFiniteNonNegative(options.delay, 'delay')
	assertFiniteNonNegative(options.gravity, 'gravity')
	assertFinitePositive(options.mass, 'mass')
	assertFinitePositive(options.startingHeight, 'startingHeight')
	assertFiniteNonNegative(options.spinForce, 'spinForce')
	assertFiniteNonNegative(options.throwForce, 'throwForce')
	assertFiniteNonNegative(options.wallPadding, 'wallPadding')
	assertFinitePositive(options.colliderScale, 'colliderScale')
	assertFiniteNonNegative(options.spawnSpacing, 'spawnSpacing')
	assertFiniteNonNegative(options.spawnHeightStep, 'spawnHeightStep')
	assertFiniteNonNegative(options.spawnOverscan, 'spawnOverscan')
	assertFiniteNonNegative(options.friction, 'friction')
	assertFiniteNonNegative(options.restitution, 'restitution')
	assertFiniteNonNegative(options.linearDamping, 'linearDamping')
	assertFiniteNonNegative(options.angularDamping, 'angularDamping')
	assertFinitePositive(options.settleTimeout, 'settleTimeout')
	for(const [name, callback] of [
		['onCollision', options.onCollision],
		['onThemeConfigLoaded', options.onThemeConfigLoaded],
		['onThemeLoaded', options.onThemeLoaded],
		['onTimelineProgress', options.onTimelineProgress]
	] as const) {
		if(typeof callback !== 'function') throw new Error(`Viewer option ${name} must be a function.`)
	}
	validateSkinOptions(options.skin)
	validateParticleOptions(options.particles)
	validateGlowOptions(options.glow)
	if(!['auto', 'always', 'never'].includes(options.reducedMotion)) throw new Error('Viewer option reducedMotion must be auto, always or never.')
	validateTimelineOptions(options.timeline)
}
