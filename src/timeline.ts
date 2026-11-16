import { normalizeDisplayMode, normalizeDisplaySides, normalizeDisplayValue } from './displayRequest'
import type {
	ClassifyTimelineEvent,
	DiceTimelineEvent,
	DisplayMode,
	DisplayTimelineRequest,
	ExcludeTimelineEvent,
	NormalizedTimelineOptions,
	RequiredViewerOptions,
	ResolvedDie,
	TimelineDieDefinition,
	TimelineProgressDie,
	TimelineProgressEvent,
	TransformTimelineEvent
} from './types'

export type TimelineEffectName = keyof NormalizedTimelineOptions['effects']

export interface NormalizedTimelineDieDefinition {
	readonly id: string
	readonly sides: TimelineDieDefinition['sides']
	readonly theme: string
	readonly themeColor: string
}

export interface NormalizedDisplayTimelineRequest {
	readonly id: string
	readonly dice: readonly NormalizedTimelineDieDefinition[]
	readonly events: readonly DiceTimelineEvent[]
	readonly seed: string
	readonly mode: DisplayMode
}

export interface TimelineSpawnAction {
	readonly kind: 'explode'
	readonly effect: 'explode'
	readonly dieId: string
	readonly parentDieId: string
	readonly value: number
	readonly discarded: boolean
	readonly eventSequences: readonly number[]
}

export interface TimelineRerollAction {
	readonly kind: 'reroll'
	readonly effect: 'reroll' | 'unique'
	readonly dieId: string
	readonly from: number
	readonly to: number
	readonly eventSequences: readonly number[]
}

export interface TimelineTransformAction {
	readonly kind: 'transform'
	readonly effect: 'compound' | 'penetrate'
	readonly dieId: string
	readonly from: number
	readonly to: number
	readonly eventSequences: readonly number[]
}

export interface TimelineSelectionAction {
	readonly kind: 'selection'
	readonly effect: 'keep' | 'drop' | 'compound'
	readonly dieId: string
	readonly discarded: boolean
	readonly eventSequences: readonly number[]
}

export interface TimelineClassifyAction {
	readonly kind: 'classify'
	readonly effect: 'success' | 'failure' | 'neutral' | 'criticalSuccess' | 'criticalFailure'
	readonly dieId: string
	readonly pulses: number
	/** The event's own color and glow, when it brings them. */
	readonly color?: string
	readonly intensity?: number
	readonly eventSequences: readonly number[]
}

export type TimelineAction =
	| TimelineSpawnAction
	| TimelineRerollAction
	| TimelineTransformAction
	| TimelineSelectionAction
	| TimelineClassifyAction

export interface TimelinePhase {
	readonly id: string
	readonly effect: TimelineEffectName
	readonly delayMs: number
	readonly durationMs: number
	readonly actions: readonly TimelineAction[]
	readonly eventSequences: readonly number[]
}

export interface DiceTimelinePlan {
	readonly id: string
	readonly seed: string
	readonly mode: DisplayMode
	readonly definitions: ReadonlyMap<string, NormalizedTimelineDieDefinition>
	readonly initialDice: readonly ResolvedDie[]
	readonly finalDice: readonly ResolvedDie[]
	readonly phases: readonly TimelinePhase[]
	readonly initialEventSequences: readonly number[]
	readonly allEventSequences: readonly number[]
	readonly eventCount: number
	readonly estimatedDurationMs: number
	readonly degraded: boolean
}

interface DieState {
	readonly definition: NormalizedTimelineDieDefinition
	readonly roll: Extract<DiceTimelineEvent, { readonly type: 'roll' }>
	readonly parentDieId: string | null
	depth: number
	physicalValue: number
	discarded: boolean
}

const assertNonEmpty = (value: unknown, path: string): string => {
	if(typeof value !== 'string' || value.trim().length === 0) throw new Error(`${path} must be a non-empty string.`)
	return value
}

export const normalizeDisplayTimelineRequest = (
	request: DisplayTimelineRequest,
	defaults: Pick<RequiredViewerOptions, 'mode' | 'theme' | 'themeColor'>
): NormalizedDisplayTimelineRequest => {
	if(!request || typeof request !== 'object') throw new Error('displayTimeline expects a request object.')
	const id = assertNonEmpty(request.id, 'displayTimeline request id')
	if(!Array.isArray(request.dice) || request.dice.length === 0) {
		throw new Error('displayTimeline expects at least one die definition.')
	}
	if(!Array.isArray(request.events) || request.events.length === 0) {
		throw new Error('displayTimeline expects a non-empty event journal.')
	}
	const seen = new Set<string>()
	const dice = request.dice.map((die, index): NormalizedTimelineDieDefinition => {
		if(!die || typeof die !== 'object') throw new Error(`Timeline die at index ${index} must be an object.`)
		const dieId = assertNonEmpty(die.id, `Timeline die at index ${index} id`)
		if(seen.has(dieId)) throw new Error(`Timeline die id '${dieId}' is duplicated.`)
		seen.add(dieId)
		return Object.freeze({
			id: dieId,
			sides: normalizeDisplaySides(die.sides),
			theme: die.theme || defaults.theme,
			themeColor: die.themeColor || defaults.themeColor
		})
	})
	return Object.freeze({
		id,
		dice: Object.freeze(dice),
		events: Object.freeze(request.events.map(event => Object.freeze({ ...event }))),
		seed: typeof request.seed === 'string' ? request.seed : id,
		mode: normalizeDisplayMode(request.mode ?? defaults.mode)
	})
}

const eventEffect = (event: DiceTimelineEvent): TimelineEffectName | undefined => {
	if(event.type === 'reroll') return event.reason.startsWith('unique') ? 'unique' : 'reroll'
	if(event.type === 'transform') {
		if(event.reason === 'compound' || event.reason === 'penetrate') return event.reason
		return undefined
	}
	if(event.type === 'exclude') {
		if(event.reason === 'compound-absorbed') return 'compound'
		return event.reason
	}
	if(event.type === 'classify') {
		if(event.outcome === 'critical-success') return 'criticalSuccess'
		if(event.outcome === 'critical-failure') return 'criticalFailure'
		return event.outcome
	}
	return event.type === 'explode' ? 'explode' : undefined
}

const createPhase = (
	id: string,
	effect: TimelineEffectName,
	actions: readonly TimelineAction[],
	options: NormalizedTimelineOptions
): TimelinePhase => Object.freeze({
	id,
	effect,
	delayMs: options.effects[effect].delayMs,
	durationMs: options.effects[effect].durationMs,
	actions: Object.freeze(actions),
	eventSequences: Object.freeze([...new Set(actions.flatMap(action => action.eventSequences))].sort((left, right) => left - right))
})

const freezeDie = (state: DieState, value: number, discarded = state.discarded): ResolvedDie => Object.freeze({
	id: state.definition.id,
	sides: state.definition.sides,
	value,
	discarded,
	theme: state.definition.theme,
	themeColor: state.definition.themeColor
})

export const planDiceTimeline = (
	request: NormalizedDisplayTimelineRequest,
	options: NormalizedTimelineOptions,
	baseDurationMs: number
): DiceTimelinePlan => {
	const definitions = new Map(request.dice.map(die => [die.id, die] as const))
	let previousSequence = 0
	const rolls = new Map<string, Extract<DiceTimelineEvent, { readonly type: 'roll' }>>()
	for(const event of request.events) {
		if(!event || typeof event !== 'object') throw new Error('Timeline events must be objects.')
		if(!['roll', 'reroll', 'explode', 'transform', 'include', 'exclude', 'classify'].includes(event.type)) {
			throw new Error(`Timeline event has unsupported type '${String((event as { readonly type?: unknown }).type)}'.`)
		}
		if(!Number.isInteger(event.sequence) || event.sequence <= previousSequence) {
			throw new Error(`Timeline event sequence must contain strictly increasing positive integers; received ${String(event.sequence)} after ${previousSequence}.`)
		}
		previousSequence = event.sequence
		if(event.subject !== undefined && event.subject !== 'die') {
			throw new Error(`Timeline event ${event.sequence} has unsupported subject '${String(event.subject)}'.`)
		}
		assertNonEmpty(event.dieId, `Timeline event ${event.sequence} dieId`)
		assertNonEmpty(event.sourceNodeId, `Timeline event ${event.sequence} sourceNodeId`)
		if(!Number.isInteger(event.rollIndex) || event.rollIndex < 0) {
			throw new Error(`Timeline event ${event.sequence} rollIndex must be a non-negative integer.`)
		}
		const definition = definitions.get(event.dieId)
		if(!definition) throw new Error(`Timeline event ${event.sequence} references unknown die '${event.dieId}'.`)
		if(event.parentDieId !== null && (typeof event.parentDieId !== 'string' || !definitions.has(event.parentDieId))) {
			throw new Error(`Timeline event ${event.sequence} references unknown parent '${event.parentDieId}'.`)
		}
		if(event.type === 'roll') {
			if(rolls.has(event.dieId)) throw new Error(`Timeline die '${event.dieId}' has more than one initial roll.`)
			normalizeDisplayValue(event.value, definition.sides)
			rolls.set(event.dieId, event)
		}
		if(event.type === 'reroll' && !['reroll', 'reroll-once', 'unique', 'unique-once'].includes(event.reason)) {
			throw new Error(`Timeline reroll ${event.sequence} has unsupported reason '${String(event.reason)}'.`)
		}
		if(event.type === 'explode') {
			assertNonEmpty(event.childDieId, `Timeline explosion ${event.sequence} childDieId`)
			if(!['explode', 'compound', 'penetrate'].includes(event.reason)) {
				throw new Error(`Timeline explosion ${event.sequence} has unsupported reason '${String(event.reason)}'.`)
			}
		}
		if(event.type === 'transform' && !['minimum', 'maximum', 'penetrate', 'compound'].includes(event.reason)) {
			throw new Error(`Timeline transform ${event.sequence} has unsupported reason '${String(event.reason)}'.`)
		}
		if(event.type === 'exclude' && !['drop', 'keep', 'compound-absorbed'].includes(event.reason)) {
			throw new Error(`Timeline exclusion ${event.sequence} has unsupported reason '${String(event.reason)}'.`)
		}
		if(event.type === 'include' && !Number.isFinite(event.contribution)) {
			throw new Error(`Timeline inclusion ${event.sequence} has a non-finite contribution.`)
		}
		if(event.type === 'classify' && ![
			'success', 'failure', 'neutral', 'critical-success', 'critical-failure'
		].includes(event.outcome)) {
			throw new Error(`Timeline classification ${event.sequence} has unsupported outcome '${String(event.outcome)}'.`)
		}
		if(event.type === 'classify' && event.color !== undefined && !/^#(?:[\da-f]{3}|[\da-f]{6})$/i.test(String(event.color))) {
			throw new Error(`Timeline classification ${event.sequence} color must be #rgb or #rrggbb.`)
		}
		if(event.type === 'classify' && event.intensity !== undefined
			&& (!Number.isFinite(event.intensity) || event.intensity < 0 || event.intensity > 1)) {
			throw new Error(`Timeline classification ${event.sequence} intensity must be between 0 and 1.`)
		}
	}
	for(const id of definitions.keys()) {
		if(!rolls.has(id)) throw new Error(`Timeline die '${id}' is missing its initial roll event.`)
	}

	const states = new Map<string, DieState>()
	for(const [id, definition] of definitions) {
		const roll = rolls.get(id)!
		states.set(id, {
			definition,
			roll,
			parentDieId: roll.parentDieId,
			depth: -1,
			physicalValue: roll.value,
			discarded: false
		})
	}

	const findDepth = (state: DieState, trail = new Set<string>()): number => {
		if(state.depth >= 0) return state.depth
		if(trail.has(state.definition.id)) throw new Error(`Timeline explosion lineage contains a cycle at '${state.definition.id}'.`)
		trail.add(state.definition.id)
		if(state.parentDieId === null) state.depth = 0
		else state.depth = findDepth(states.get(state.parentDieId)!, trail) + 1
		trail.delete(state.definition.id)
		return state.depth
	}
	for(const state of states.values()) findDepth(state)

	const explodeByChild = new Map<string, Extract<DiceTimelineEvent, { readonly type: 'explode' }>>()
	const currentValues = new Map<string, number>()
	for(const event of request.events) {
		const state = states.get(event.dieId)!
		if(event.parentDieId !== state.parentDieId) {
			throw new Error(`Timeline event ${event.sequence} has inconsistent parentDieId for '${event.dieId}'.`)
		}
		if(event.rollIndex !== state.roll.rollIndex || event.sourceNodeId !== state.roll.sourceNodeId) {
			throw new Error(`Timeline event ${event.sequence} has inconsistent roll/source identity for '${event.dieId}'.`)
		}
		if(event.type === 'roll') {
			currentValues.set(event.dieId, event.value)
			continue
		}
		const current = currentValues.get(event.dieId)
		if(current === undefined) throw new Error(`Timeline event ${event.sequence} occurs before the initial roll of '${event.dieId}'.`)
		if(event.type === 'reroll') {
			if(event.from !== current) throw new Error(`Timeline reroll ${event.sequence} expected from ${current}, received ${event.from}.`)
			normalizeDisplayValue(event.to, state.definition.sides)
			currentValues.set(event.dieId, event.to)
			state.physicalValue = event.to
		} else if(event.type === 'transform') {
			if(event.from !== current) throw new Error(`Timeline transform ${event.sequence} expected from ${current}, received ${event.from}.`)
			if(!Number.isFinite(event.to)) throw new Error(`Timeline transform ${event.sequence} has a non-finite target.`)
			currentValues.set(event.dieId, event.to)
		} else if(event.type === 'explode') {
			const child = states.get(event.childDieId)
			if(!child) throw new Error(`Timeline explosion ${event.sequence} references unknown child '${event.childDieId}'.`)
			if(child.parentDieId !== event.dieId) throw new Error(`Timeline explosion ${event.sequence} child '${event.childDieId}' does not reference parent '${event.dieId}'.`)
			if(explodeByChild.has(event.childDieId)) throw new Error(`Timeline child '${event.childDieId}' has multiple explosion events.`)
			if(event.value !== currentValues.get(event.childDieId)) {
				throw new Error(`Timeline explosion ${event.sequence} value does not match child '${event.childDieId}'.`)
			}
			explodeByChild.set(event.childDieId, event)
		} else if(event.type === 'exclude') state.discarded = true
		else if(event.type === 'include') state.discarded = false
	}
	for(const state of states.values()) {
		if(state.parentDieId !== null && !explodeByChild.has(state.definition.id)) {
			throw new Error(`Timeline generated die '${state.definition.id}' is missing its explosion event.`)
		}
	}

	const rerollsByDie = new Map<string, Extract<DiceTimelineEvent, { readonly type: 'reroll' }> []>()
	for(const event of request.events) if(event.type === 'reroll') {
		const entries = rerollsByDie.get(event.dieId) ?? []
		entries.push(event)
		rerollsByDie.set(event.dieId, entries)
	}
	const initialValueByDie = new Map<string, number>()
	const rerollActionsBySequence = new Map<number, TimelineRerollAction>()
	for(const state of states.values()) {
		let displayed = state.roll.value
		let initial = displayed
		let encounteredEnabled = false
		const events = rerollsByDie.get(state.definition.id) ?? []
		for(let index = 0; index < events.length; index++) {
			const event = events[index]!
			const effect = event.reason.startsWith('unique') ? 'unique' : 'reroll'
			if(!options.effects[effect].enabled) {
				displayed = event.to
				if(!encounteredEnabled) initial = displayed
				continue
			}
			encounteredEnabled = true
			let to = event.to
			const eventSequences = [event.sequence]
			for(let lookahead = index + 1; lookahead < events.length; lookahead++) {
				const next = events[lookahead]!
				const nextEffect = next.reason.startsWith('unique') ? 'unique' : 'reroll'
				if(options.effects[nextEffect].enabled) break
				to = next.to
				eventSequences.push(next.sequence)
			}
			rerollActionsBySequence.set(event.sequence, Object.freeze({
				kind: 'reroll', effect, dieId: event.dieId, from: displayed, to,
				eventSequences: Object.freeze(eventSequences)
			}))
			displayed = to
		}
		initialValueByDie.set(state.definition.id, initial)
	}
	const animatedSelectionDice = new Set<string>()
	if(options.enabled) for(const event of request.events) {
		if(event.type !== 'exclude') continue
		const effect = event.reason === 'compound-absorbed' ? 'compound' : event.reason
		if(options.effects[effect].enabled) animatedSelectionDice.add(event.dieId)
	}

	const initialStates = [...states.values()].filter(state => state.depth === 0 || !options.effects.explode.enabled)
	const initialDice = Object.freeze(initialStates.map(state => freezeDie(
		state,
		initialValueByDie.get(state.definition.id)!,
		animatedSelectionDice.has(state.definition.id) ? false : state.discarded
	)))
	const phases: TimelinePhase[] = []
	if(options.enabled) {
		if(options.effects.explode.enabled) {
			const maxDepth = Math.max(...[...states.values()].map(state => state.depth))
			for(let depth = 1; depth <= maxDepth; depth++) {
				const actions = [...states.values()]
					.filter(state => state.depth === depth)
					.map((state): TimelineSpawnAction => Object.freeze({
						kind: 'explode', effect: 'explode', dieId: state.definition.id,
						parentDieId: state.parentDieId!, value: initialValueByDie.get(state.definition.id)!,
						discarded: animatedSelectionDice.has(state.definition.id) ? false : state.discarded,
						eventSequences: Object.freeze([
							state.roll.sequence,
							explodeByChild.get(state.definition.id)!.sequence
						])
					}))
				if(actions.length) phases.push(createPhase(`explode-depth-${depth}`, 'explode', actions, options))
			}
		}
		const rerollRounds = new Map<number, Array<{ readonly sequence: number; readonly action: TimelineRerollAction }>>()
		const rerollOrdinalByDie = new Map<string, number>()
		for(const event of request.events) {
			const action = rerollActionsBySequence.get(event.sequence)
			if(!action) continue
			const ordinal = rerollOrdinalByDie.get(action.dieId) ?? 0
			rerollOrdinalByDie.set(action.dieId, ordinal + 1)
			const round = rerollRounds.get(ordinal) ?? []
			round.push({ sequence: event.sequence, action })
			rerollRounds.set(ordinal, round)
		}
		for(const [roundIndex, scheduled] of [...rerollRounds.entries()].sort(([left], [right]) => left - right)) {
			const byEffect = new Map<'reroll' | 'unique', typeof scheduled>()
			for(const item of scheduled) {
				const group = byEffect.get(item.action.effect) ?? []
				group.push(item)
				byEffect.set(item.action.effect, group)
			}
			for(const [effect, group] of [...byEffect.entries()].sort(([, left], [, right]) => left[0]!.sequence - right[0]!.sequence)) {
				phases.push(createPhase(
					`reroll-round-${roundIndex}-${effect}`,
					effect,
					group.map(item => item.action),
					options
				))
			}
		}
		const transforms = request.events.filter((event): event is TransformTimelineEvent => event.type === 'transform')
		const transformActions = new Map<'compound' | 'penetrate', TimelineTransformAction[]>()
		for(const event of transforms) {
			if(event.reason !== 'compound' && event.reason !== 'penetrate') continue
			if(!options.effects[event.reason].enabled) continue
			const actions = transformActions.get(event.reason) ?? []
			actions.push(Object.freeze({
				kind: 'transform', effect: event.reason, dieId: event.dieId, from: event.from, to: event.to,
				eventSequences: Object.freeze([event.sequence])
			}))
			transformActions.set(event.reason, actions)
		}
		for(const [effect, actions] of transformActions) {
			phases.push(createPhase(`transform-${effect}`, effect, actions, options))
		}
		const exclusions = request.events.filter((event): event is ExcludeTimelineEvent => event.type === 'exclude')
		const selectionActions = new Map<'keep' | 'drop' | 'compound', TimelineSelectionAction[]>()
		for(const event of exclusions) {
			const effect = event.reason === 'compound-absorbed' ? 'compound' : event.reason
			if(!options.effects[effect].enabled) continue
			const actions = selectionActions.get(effect) ?? []
			actions.push(Object.freeze({
				kind: 'selection', effect, dieId: event.dieId, discarded: true,
				eventSequences: Object.freeze([event.sequence])
			}))
			selectionActions.set(effect, actions)
		}
		for(const [effect, actions] of selectionActions) {
			phases.push(createPhase(`selection-${effect}`, effect, actions, options))
		}
		const classifications = request.events.filter((event): event is ClassifyTimelineEvent => event.type === 'classify')
		const classificationActions = new Map<TimelineClassifyAction['effect'], TimelineClassifyAction[]>()
		for(const event of classifications) {
			const effect = eventEffect(event) as TimelineClassifyAction['effect']
			if(!options.effects[effect].enabled) continue
			const configured = options.effects[effect]
			const pulses = 'pulses' in configured ? configured.pulses : 1
			const actions = classificationActions.get(effect) ?? []
			actions.push(Object.freeze({
				kind: 'classify', effect, dieId: event.dieId, pulses,
				...(event.color === undefined ? {} : { color: event.color }),
				...(event.intensity === undefined ? {} : { intensity: event.intensity }),
				eventSequences: Object.freeze([event.sequence])
			}))
			classificationActions.set(effect, actions)
		}
		for(const [effect, actions] of classificationActions) {
			phases.push(createPhase(`classify-${effect}`, effect, actions, options))
		}
	}

	const assignedSequences = new Set(phases.flatMap(phase => phase.eventSequences))
	const initialIds = new Set(initialDice.map(die => die.id))
	const revealPhaseByDie = new Map<string, string>()
	for(const phase of phases) for(const action of phase.actions) {
		if(action.kind === 'explode') revealPhaseByDie.set(action.dieId, phase.id)
	}
	const initialEventSequences = new Set<number>()
	const additionalPhaseSequences = new Map<string, number[]>()
	for(const event of request.events) {
		if(assignedSequences.has(event.sequence)) continue
		const revealPhaseId = initialIds.has(event.dieId) ? undefined : revealPhaseByDie.get(event.dieId)
		if(!revealPhaseId) {
			initialEventSequences.add(event.sequence)
			continue
		}
		const additional = additionalPhaseSequences.get(revealPhaseId) ?? []
		additional.push(event.sequence)
		additionalPhaseSequences.set(revealPhaseId, additional)
	}
	const scheduledPhases = phases.map(phase => {
		const additional = additionalPhaseSequences.get(phase.id)
		if(!additional?.length) return phase
		return Object.freeze({
			...phase,
			eventSequences: Object.freeze(
				[...new Set([...phase.eventSequences, ...additional])].sort((left, right) => left - right)
			)
		})
	})

	const estimatedDurationMs = Math.max(0, baseDurationMs) + scheduledPhases.reduce(
		(total, phase) => total + options.phaseGapMs + phase.delayMs + phase.durationMs,
		0
	)
	const degraded = !options.enabled
		|| request.events.length > options.maxEvents
		|| estimatedDurationMs > options.maxDurationMs
	const finalDice = Object.freeze([...states.values()].map(state => freezeDie(state, state.physicalValue)))
	return Object.freeze({
		id: request.id,
		seed: request.seed,
		mode: request.mode,
		definitions,
		initialDice,
		finalDice,
		phases: Object.freeze(degraded ? [] : scheduledPhases),
		initialEventSequences: Object.freeze(degraded
			? request.events.map(event => event.sequence)
			: [...initialEventSequences].sort((left, right) => left - right)),
		allEventSequences: Object.freeze(request.events.map(event => event.sequence)),
		eventCount: request.events.length,
		estimatedDurationMs,
		degraded
	})
}

const reportTimelineProgressError = (error: unknown): void => {
	try {
		console.error('[DiceResultViewer] onTimelineProgress callback failed:', error)
	} catch {
		// A consumer-provided logger must not be able to interrupt presentation.
	}
}

export const dispatchTimelineProgress = (
	callback: (event: TimelineProgressEvent) => void,
	event: TimelineProgressEvent
): void => {
	try {
		const returned = callback(event) as unknown
		if(returned && typeof (returned as PromiseLike<void>).then === 'function') {
			Promise.resolve(returned).catch(reportTimelineProgressError)
		}
	} catch(error) {
		reportTimelineProgressError(error)
	}
}

export interface TimelineProgressTracker {
	initial(): TimelineProgressEvent
	completePhaseAction(phaseIndex: number, actionIndex: number): TimelineProgressEvent
	completePhase(phaseIndex: number): TimelineProgressEvent
	complete(): TimelineProgressEvent
}

export const createTimelineProgressTracker = (plan: DiceTimelinePlan): TimelineProgressTracker => {
	const visible = new Map<string, TimelineProgressDie>()
	const completedSequences = new Set<number>()
	const orderedIds = [...plan.definitions.keys()]
	const snapshot = (
		stage: TimelineProgressEvent['stage'],
		phaseIndex: number | null,
		phaseId: string | null,
		effect: TimelineEffectName | null,
		revealedDieIds: readonly string[]
	): TimelineProgressEvent => Object.freeze({
		id: plan.id,
		stage,
		phaseIndex,
		phaseCount: plan.phases.length,
		phaseId,
		effect,
		revealedDieIds: Object.freeze([...revealedDieIds]),
		dice: Object.freeze(orderedIds.flatMap(id => {
			const die = visible.get(id)
			return die ? [Object.freeze({ ...die })] : []
		})),
		completedEventSequences: Object.freeze([...completedSequences].sort((left, right) => left - right))
	})
	const setVisible = (die: Pick<ResolvedDie, 'id' | 'value' | 'discarded'>): void => {
		visible.set(die.id, Object.freeze({
			id: die.id,
			value: die.value,
			discarded: die.discarded ?? false
		}))
	}
	const applyAction = (action: TimelinePhase['actions'][number]): void => {
		if(action.kind === 'explode') {
			setVisible({ id: action.dieId, value: action.value, discarded: action.discarded })
		} else if(action.kind === 'reroll') {
			const current = visible.get(action.dieId)
			if(current) setVisible({ ...current, value: action.to })
		} else if(action.kind === 'selection') {
			const current = visible.get(action.dieId)
			if(current) setVisible({ ...current, discarded: action.discarded })
		}
		for(const sequence of action.eventSequences) completedSequences.add(sequence)
	}
	return Object.freeze({
		initial: (): TimelineProgressEvent => {
			const dice = plan.degraded ? plan.finalDice : plan.initialDice
			for(const die of dice) setVisible(die)
			for(const sequence of plan.initialEventSequences) completedSequences.add(sequence)
			return snapshot('initial', null, null, null, dice.map(die => die.id))
		},
		completePhaseAction: (phaseIndex: number, actionIndex: number): TimelineProgressEvent => {
			const phase = plan.phases[phaseIndex]
			if(!phase) throw new Error(`Timeline phase index ${phaseIndex} is out of range.`)
			const action = phase.actions[actionIndex]
			if(!action) throw new Error(`Timeline phase action index ${actionIndex} is out of range.`)
			applyAction(action)
			return snapshot(
				'phase',
				phaseIndex,
				`${phase.id}:${action.dieId}`,
				phase.effect,
				[action.dieId]
			)
		},
		completePhase: (phaseIndex: number): TimelineProgressEvent => {
			const phase = plan.phases[phaseIndex]
			if(!phase) throw new Error(`Timeline phase index ${phaseIndex} is out of range.`)
			for(const action of phase.actions) applyAction(action)
			for(const sequence of phase.eventSequences) completedSequences.add(sequence)
			return snapshot(
				'phase',
				phaseIndex,
				phase.id,
				phase.effect,
				[...new Set(phase.actions.map(action => action.dieId))]
			)
		},
		complete: (): TimelineProgressEvent => {
			for(const die of plan.finalDice) setVisible(die)
			for(const sequence of plan.allEventSequences) completedSequences.add(sequence)
			return snapshot('complete', null, null, null, [])
		}
	})
}

