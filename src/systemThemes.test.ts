import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
	createMixedDisplayRequest,
	createSystemDisplayRequest,
	getSystemThemeProfile,
	isSystemDiceProfileId,
	toMixedResolvedDice,
	toSystemResolvedDie,
	toSystemResolvedDice
} from './systemThemes'

const die = (
	id: string,
	profileId: string,
	sides: number,
	value: number,
	sourceDieId?: string
) => ({
	id,
	profileId,
	sides,
	value,
	...(sourceDieId === undefined ? {} : { sourceDieId })
})

describe('system dice themes', () => {
	it('maps normal and Hunger dice to distinct Vampire V5 themes', () => {
		const resolved = toSystemResolvedDice([
			die('normal:1', 'vampire-v5-normal-d10', 10, 8),
			die('hunger:1', 'vampire-v5-hunger-d10', 10, 1)
		])
		assert.deepEqual(resolved.map(item => item.theme), [
			'vampire-v5-normal',
			'vampire-v5-hunger'
		])
		assert.deepEqual(resolved.map(item => item.themeColor), ['#20242e', '#761827'])
		assert.deepEqual(resolved.map(item => item.value), [8, 1])
	})

	it('uses one Assimilação theme for d6, d10, and d12 profiles', () => {
		const resolved = toSystemResolvedDice([
			die('d6', 'assimilation-d6', 6, 5),
			die('d10', 'assimilation-d10', 10, 9),
			die('d12', 'assimilation-d12', 12, 11)
		])
		assert.deepEqual(resolved.map(item => item.theme), [
			'assimilation',
			'assimilation',
			'assimilation'
		])
		assert.deepEqual(resolved.map(item => item.sides), [6, 10, 12])
	})

	it('maps Fate dice to the symbolic d6 theme while preserving physical faces', () => {
		const resolved = toSystemResolvedDice([
			die('minus', 'fate-df', 6, 1),
			die('blank', 'fate-df', 6, 4),
			die('plus', 'fate-df', 6, 6)
		])
		assert.deepEqual(resolved.map(item => item.theme), ['fate', 'fate', 'fate'])
		// Fate has no meaningful color: it follows the request, then the viewer.
		assert.deepEqual(resolved.map(item => item.themeColor), [undefined, undefined, undefined])
		const requested = toSystemResolvedDice([die('plus', 'fate-df', 6, 6)], { themeColor: '#ff0a7a' })
		assert.equal(requested[0]?.themeColor, '#ff0a7a')
		const hunger = toSystemResolvedDice([die('hunger', 'vampire-v5-hunger-d10', 10, 1)], { themeColor: '#ff0a7a' })
		assert.equal(hunger[0]?.themeColor, '#761827', 'meaningful colors are kept')
		assert.deepEqual(resolved.map(item => item.value), [1, 4, 6])
	})

	it('maps Daggerheart Hope and Fear d12s to distinct default-theme colors', () => {
		const resolved = toSystemResolvedDice([
			die('hope', 'daggerheart-hope-d12', 12, 9),
			die('fear', 'daggerheart-fear-d12', 12, 4)
		])
		assert.deepEqual(resolved.map(item => item.theme), ['default-v2', 'default-v2'])
		assert.deepEqual(resolved.map(item => item.themeColor), ['#ff0a7a', '#00f585'])
		assert.deepEqual(resolved.map(item => item.sides), [12, 12])
	})

	it('marks non-kept Assimilação dice as discarded without choosing for the caller', () => {
		const resolved = toSystemResolvedDice([
			die('assimilation-d6:a', 'assimilation-d6', 6, 6, 'a'),
			die('assimilation-d10:b', 'assimilation-d10', 10, 8, 'b')
		], { keptIds: ['b'] })
		assert.equal(resolved[0]?.discarded, true)
		assert.equal(resolved[1]?.discarded, false)
	})

	it('allows per-profile color overrides', () => {
		const resolved = toSystemResolvedDie(
			die('hunger', 'vampire-v5-hunger-d10', 10, 10),
			{ themeColors: { 'vampire-v5-hunger-d10': '#43000d' } }
		)
		assert.equal(resolved.themeColor, '#43000d')

		const fear = toSystemResolvedDie(
			die('fear', 'daggerheart-fear-d12', 12, 12),
			{ themeColors: { 'daggerheart-fear-d12': '#004477' } }
		)
		assert.equal(fear.themeColor, '#004477')
	})

	it('creates a display request that remains authoritative about numeric values', () => {
		const request = createSystemDisplayRequest({
			id: 'roll-42',
			seed: 'visual-42',
			mode: 'physics',
			dice: [die('d12', 'assimilation-d12', 12, 12)]
		})
		assert.equal(request.id, 'roll-42')
		assert.equal(request.seed, 'visual-42')
		assert.equal(request.mode, 'physics')
		assert.equal(request.dice[0]?.value, 12)
		assert.equal(Object.isFrozen(request), true)
	})

	it('mixes generic and profiled dice in one display request', () => {
		const request = createMixedDisplayRequest({
			id: 'mixed-42',
			seed: 'mixed-42',
			mode: 'physics',
			dice: [
				{
					id: 'generic-d20',
					sides: 20,
					rawValue: 3,
					value: 20,
					physicalValue: 17,
					included: true
				},
				{
					id: 'hunger',
					sides: 10,
					value: 1,
					physicalValue: 1,
					profileId: 'vampire-v5-hunger-d10'
				},
				{
					id: 'fate-plus',
					sides: 6,
					value: 6,
					physicalValue: 6,
					profileId: 'fate-df'
				},
				{
					id: 'generic-d3',
					sides: 3,
					value: 2,
					physicalValue: 2,
					included: false
				},
				{
					id: 'generic-fudge',
					sides: 'F',
					value: 1,
					physicalValue: 1
				}
			]
		})

		assert.equal(request.id, 'mixed-42')
		assert.equal(request.seed, 'mixed-42')
		assert.equal(request.mode, 'physics')
		assert.deepEqual(request.dice.map(item => ({
			id: item.id,
			sides: item.sides,
			value: item.value,
			theme: item.theme,
			discarded: item.discarded
		})), [
			{
				id: 'generic-d20',
				sides: 20,
				value: 17,
				theme: undefined,
				discarded: false
			},
			{
				id: 'hunger',
				sides: 10,
				value: 1,
				theme: 'vampire-v5-hunger',
				discarded: false
			},
			{
				id: 'fate-plus',
				sides: 6,
				value: 6,
				theme: 'fate',
				discarded: false
			},
			{
				id: 'generic-d3',
				sides: 3,
				value: 2,
				theme: undefined,
				discarded: true
			}
		])
	})

	it('controls unsupported mixed dice and validates mixed IDs and profiles', () => {
		const fudge = {
			id: 'fudge',
			sides: 'F',
			value: 0,
			physicalValue: 0
		}
		assert.throws(
			() => toMixedResolvedDice([fudge]),
			/no supported 3D dice/
		)
		assert.throws(
			() => toMixedResolvedDice([fudge], { unsupportedDice: 'error' }),
			/unsupported generic sides/
		)
		assert.throws(
			() => toMixedResolvedDice([fudge], {
				unsupportedDice: 'skip' as never
			}),
			/unsupportedDice/
		)
		assert.throws(
			() => toMixedResolvedDice([
				{ id: 'same', sides: 6, value: 2 },
				{ id: 'same', sides: 6, value: 4 }
			]),
			/Duplicate mixed die id/
		)
		assert.throws(
			() => toMixedResolvedDice([
				{ id: 'unknown', sides: 6, value: 2, profileId: 'unknown' }
			]),
			/Unsupported system dice profile/
		)
	})

	it('rejects unknown profiles, mismatched sides, invalid values, and duplicate IDs', () => {
		assert.equal(isSystemDiceProfileId('fate-df'), true)
		assert.equal(isSystemDiceProfileId('assimilation-d6'), true)
		assert.equal(isSystemDiceProfileId('unknown'), false)
		assert.throws(() => getSystemThemeProfile('unknown'), /Unsupported system dice profile/)
		assert.throws(
			() => toSystemResolvedDie(die('bad-side', 'assimilation-d6', 10, 5)),
			/expects d6/
		)
		assert.throws(
			() => toSystemResolvedDie(die('bad-value', 'assimilation-d6', 6, 7)),
			/outside 1-6/
		)
		assert.throws(
			() => toSystemResolvedDice([
				die('same', 'assimilation-d6', 6, 3),
				die('same', 'assimilation-d6', 6, 4)
			]),
			/Duplicate system die id/
		)
	})
})
