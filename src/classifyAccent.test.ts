import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { normalizeDisplayTimelineRequest, planDiceTimeline } from './timeline'
import { createViewerOptions, validateViewerOptions } from './timelineOptions'
import type { DiceTimelineEvent, DisplayTimelineRequest } from './types'

const viewerOptions = createViewerOptions({})
const identity = { subject: 'die' as const, parentDieId: null, sourceNodeId: 'duality' }

const duality = (classify: Partial<Extract<DiceTimelineEvent, { type: 'classify' }>>): DisplayTimelineRequest => ({
	id: 'duality',
	dice: [{ id: 'hope', sides: 12 }, { id: 'fear', sides: 12 }],
	events: [
		{ ...identity, type: 'roll', sequence: 1, rollIndex: 0, dieId: 'hope', value: 9 },
		{ ...identity, type: 'roll', sequence: 2, rollIndex: 1, dieId: 'fear', value: 4 },
		{ ...identity, type: 'classify', sequence: 3, rollIndex: 0, dieId: 'hope', outcome: 'neutral', ...classify }
	]
})

const plan = (request: DisplayTimelineRequest) => planDiceTimeline(
	normalizeDisplayTimelineRequest(request, viewerOptions),
	viewerOptions.timeline,
	viewerOptions.duration
)

describe('classification with its own color and glow', () => {
	it('carries the color and intensity of the event to its action', () => {
		const actions = plan(duality({ color: '#ff0a7a', intensity: 0 })).phases.flatMap(phase => phase.actions)
		assert.deepEqual(actions.map(action => action.kind === 'classify' && [action.dieId, action.color, action.intensity]), [
			['hope', '#ff0a7a', 0]
		])
	})

	it('keeps plain classifications free of both fields', () => {
		const [action] = plan(duality({})).phases.flatMap(phase => phase.actions)
		assert.ok(action && action.kind === 'classify')
		assert.equal('color' in action, false)
		assert.equal('intensity' in action, false)
	})

	it('rejects a color that is not hexadecimal and an intensity outside 0..1', () => {
		assert.throws(() => plan(duality({ color: 'gold' })), /color/)
		assert.throws(() => plan(duality({ intensity: 1.5 })), /intensity/)
	})
})

describe('maxPixelRatio', () => {
	it('defaults to 2 and accepts 0.5 to 4', () => {
		assert.equal(createViewerOptions({}).maxPixelRatio, 2)
		for(const maxPixelRatio of [0.5, 1.5, 4]) {
			assert.doesNotThrow(() => validateViewerOptions(createViewerOptions({ maxPixelRatio })))
		}
		for(const maxPixelRatio of [0, 0.25, 5, Number.NaN]) {
			assert.throws(() => validateViewerOptions(createViewerOptions({ maxPixelRatio })), /maxPixelRatio/)
		}
	})
})

describe('maxFps', () => {
	it('defaults to 60 and accepts 0 or 24 to 240', () => {
		assert.equal(createViewerOptions({}).maxFps, 60)
		for(const maxFps of [0, 24, 60, 240]) {
			assert.doesNotThrow(() => validateViewerOptions(createViewerOptions({ maxFps })))
		}
		for(const maxFps of [-1, 10, 500, Number.NaN]) {
			assert.throws(() => validateViewerOptions(createViewerOptions({ maxFps })), /maxFps/)
		}
	})
})
