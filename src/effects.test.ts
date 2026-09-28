import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
	PARTICLE_MOMENTS,
	PARTICLE_PRESET_NAMES,
	PARTICLE_SHAPES,
	parseParticleColor,
	validateGlowOptions,
	validateParticleOptions,
	validateSkinOptions
} from './particleOptions'
import {
	IMAGE_SHAPE_BASE,
	PARTICLE_CAPACITY,
	PARTICLE_STRIDE,
	ParticleSystem,
	SHAPES,
	customizeEffect
} from './render/particles'
import { PARTICLE_PRESETS } from './render/particlePresets'
import { loadParticlePresets } from './particlePresetLoader'
import { DICE_LOOK_FORMAT, createDiceLook, diceLookOptions } from './diceLook'
import { createViewerOptions, validateViewerOptions } from './timelineOptions'
import type { ParticleEffectDefinition, ParticleEmitterOptions } from './types'

const emitter = (overrides: Partial<ParticleEmitterOptions> = {}): ParticleEmitterOptions => ({
	amount: 10,
	life: [0.5, 0.5],
	size: [0.1, 0.1],
	speed: [1, 1],
	colors: ['#ffffff', '#ff000000'],
	...overrides
})

describe('dice skins and particle options', () => {
	it('accepts the built-in presets and custom effects', () => {
		assert.deepEqual([...PARTICLE_PRESET_NAMES].sort(), Object.keys(PARTICLE_PRESETS).sort())
		for(const preset of PARTICLE_PRESET_NAMES) assert.doesNotThrow(() => validateParticleOptions({ preset, intensity: 1.5 }))
		assert.doesNotThrow(() => validateParticleOptions({ effect: { trail: emitter(), impact: emitter({ blend: 'alpha', direction: 'out' }), auraSeconds: 1 } }))
		assert.doesNotThrow(() => validateParticleOptions(null))
		const custom: ParticleEffectDefinition = { settle: emitter() }
		assert.equal(customizeEffect(custom, { preset: 'fire' } as never), custom, 'no quick control: the definition itself')
	})

	it('ships eighteen distinct presets, each reacting to every moment of a roll', async () => {
		assert.equal(PARTICLE_PRESET_NAMES.length, 18)
		for(const name of PARTICLE_PRESET_NAMES) {
			const preset = PARTICLE_PRESETS[name]
			// Links between dice are an extra of a few presets.
			assert.deepEqual(PARTICLE_MOMENTS.filter(moment => moment !== 'link' && !preset[moment]), [], `${name} defines every moment`)
		}
		const signatures = new Set(PARTICLE_PRESET_NAMES.map(name => JSON.stringify(PARTICLE_PRESETS[name])))
		assert.equal(signatures.size, 18, 'no two presets are the same')
		assert.equal(await loadParticlePresets(), PARTICLE_PRESETS, 'the lazy loader serves the same definitions')
	})

	it('rejects malformed particle options with the offending path', () => {
		const invalid: unknown[] = [
			{},
			{ preset: 'magma' },
			{ preset: 'fire', intensity: 5 },
			{ effect: { trail: emitter({ colors: [] }) } },
			{ effect: { trail: emitter({ colors: ['red'] }) } },
			{ effect: { impact: emitter({ life: [1, 0.5] }) } },
			{ effect: { impact: emitter({ size: [0.1] as unknown as [number, number] }) } },
			{ effect: { settle: emitter({ direction: 'down' as 'up' }) } },
			{ effect: { settle: emitter({ flicker: 2 }) } },
			{ effect: { aura: emitter({ blend: 'screen' as 'add' }) } }
		]
		for(const options of invalid) {
			assert.throws(() => validateParticleOptions(options as never), /Viewer option particles/)
		}
	})

	it('validates skins', () => {
		assert.doesNotThrow(() => validateSkinOptions({ texture: 'blob:https://example.com/1', scale: 2, blend: 'multiply', opacity: 0.5, labels: 'dark' }))
		assert.doesNotThrow(() => validateSkinOptions(null))
		for(const skin of [{ texture: '' }, { texture: 'a.png', scale: 0 }, { texture: 'a.png', opacity: 2 }, { texture: 'a.png', blend: 'dodge' }, { texture: 'a.png', labels: 'gold' }]) {
			assert.throws(() => validateSkinOptions(skin as never), /Viewer option skin/)
		}
		const options = createViewerOptions({ skin: { texture: 'marble.png' }, particles: { preset: 'sparkle' } })
		assert.doesNotThrow(() => validateViewerOptions(options))
		assert.equal(createViewerOptions({}).skin, null)
		assert.equal(createViewerOptions({}).particles, null)
		assert.throws(() => validateViewerOptions(createViewerOptions({ particles: { preset: 'nope' as 'fire' } })))
	})

	it('validates the panel controls: color, shape, size and moments', () => {
		assert.doesNotThrow(() => validateParticleOptions({ preset: 'confetti', color: '#f0a', shape: 'star', size: 2, moments: { ground: false, aura: true } }))
		for(const preset of PARTICLE_PRESET_NAMES) {
			assert.doesNotThrow(() => validateParticleOptions({ effect: PARTICLE_PRESETS[preset] }), `preset ${preset} is a valid effect`)
		}
		const invalid: unknown[] = [
			{ preset: 'fire', size: 10 },
			{ preset: 'fire', color: 'red' },
			{ preset: 'fire', shape: 'skull' },
			{ preset: 'fire', moments: { sparkle: true } },
			{ preset: 'fire', moments: { ground: 'no' } },
			{ effect: { ground: emitter({ shape: 'skull' as 'soft' }) } },
			{ effect: { ground: emitter({ image: ' ' }) } },
			{ effect: { ground: emitter({ orient: 'sideways' as 'random' }) } },
			{ effect: { link: emitter(), linkDistance: -1 } },
			{ effect: { trail: emitter({ palette: [] }) } },
			{ effect: { trail: emitter({ spin: Number.NaN }) } }
		]
		for(const options of invalid) {
			assert.throws(() => validateParticleOptions(options as never), /Viewer option particles/)
		}
	})

	it('validates the dice glow', () => {
		assert.doesNotThrow(() => validateGlowOptions({ color: '#fff', intensity: 2, light: false, pulse: true }))
		assert.doesNotThrow(() => validateGlowOptions({}))
		assert.doesNotThrow(() => validateGlowOptions(null))
		for(const glow of [{ intensity: 4 }, { color: 'gold' }, { light: 'yes' }, { pulse: 1 }, 'on']) {
			assert.throws(() => validateGlowOptions(glow as never), /Viewer option glow/)
		}
		assert.equal(createViewerOptions({}).glow, null)
		assert.doesNotThrow(() => validateViewerOptions(createViewerOptions({ glow: { intensity: 1.5, pulse: true } })))
		assert.throws(() => validateViewerOptions(createViewerOptions({ glow: { intensity: -1 } })), /glow.intensity/)
	})

	it('parses #rgb, #rrggbb and #rrggbbaa colors', () => {
		assert.deepEqual(parseParticleColor('#fff'), [1, 1, 1, 1])
		assert.deepEqual(parseParticleColor('#ff000080')?.map(value => Number(value.toFixed(2))), [1, 0, 0, 0.5])
		assert.equal(parseParticleColor('orange'), null)
	})
})

describe('particle system', () => {
	const effect: ParticleEffectDefinition = {
		trail: emitter({ amount: 60 }),
		impact: emitter({ amount: 20 }),
		settle: emitter({ amount: 5, blend: 'alpha' })
	}

	it('bursts amount × intensity particles and retires them after their life', () => {
		const system = new ParticleSystem()
		system.configure(effect, 1.5, 'burst')
		system.burst('impact', [0, 1, 0], 0.6)
		assert.equal(system.count, 30)
		system.burst('explode', [0, 1, 0], 0.6)
		assert.equal(system.count, 30, 'emitters the effect does not define are silent')
		system.update(0.3)
		assert.equal(system.count, 30)
		system.update(0.3)
		assert.equal(system.count, 0)
	})

	it('trails in proportion to speed and time, carrying fractions between frames', () => {
		const system = new ParticleSystem()
		system.configure(effect, 1, 'trail')
		const die = {}
		for(let frame = 0; frame < 60; frame++) system.trail(die, [0, 1, 0], [6, 0, 0], 1 / 60, 0.6)
		assert.equal(system.count, 60)
		system.clear()
		for(let frame = 0; frame < 60; frame++) system.trail(die, [0, 1, 0], [0, 0, 0], 1 / 60, 0.6)
		assert.equal(system.count, 0, 'a die at rest leaves no trail')
	})

	it('packs premultiplied render batches per blend mode', () => {
		const system = new ParticleSystem()
		system.configure(effect, 1, 'batches')
		system.burst('impact', [0, 1, 0], 0.6)
		system.burst('settle', [0, 1, 0], 0.6)
		system.update(0.1)
		const batches = system.build()
		assert.equal(batches.additiveCount, 20)
		assert.equal(batches.alphaCount, 5)
		for(let i = 0; i < batches.additiveCount; i++) {
			const o = i * PARTICLE_STRIDE
			const alpha = batches.additive[o + 7]!
			assert.ok(alpha > 0 && alpha <= 1)
			for(const channel of [4, 5, 6]) assert.ok(batches.additive[o + channel]! <= alpha + 1e-6, 'colors are premultiplied')
			assert.ok(batches.additive[o + 1]! >= 0.012, 'particles stay above the table')
		}
	})

	it('is deterministic for a seed and never exceeds its capacity', () => {
		const run = (): number[] => {
			const system = new ParticleSystem()
			system.configure(effect, 1, 'same')
			system.burst('impact', [1, 2, 3], 0.6)
			system.update(0.05)
			const batches = system.build()
			return Array.from(batches.additive.subarray(0, batches.additiveCount * PARTICLE_STRIDE))
		}
		assert.deepEqual(run(), run())
		const system = new ParticleSystem()
		system.configure({ impact: emitter({ amount: 1000 }) }, 3, 'full')
		for(let i = 0; i < 3; i++) system.burst('impact', [0, 1, 0], 0.6)
		assert.equal(system.count, PARTICLE_CAPACITY)
	})

	it('marks the table per unit of distance rolled, flat on the ground', () => {
		const system = new ParticleSystem()
		system.configure({ ground: emitter({ amount: 12, life: [2, 2], speed: [0.5, 0.5], direction: 'sphere' }) }, 1, 'ground')
		assert.ok(system.hasTrail, 'a ground emitter alone animates while dice travel')
		const die = {}
		// 3 units/s for one second → 3 units rolled → 36 marks; vertical motion does not count.
		for(let frame = 0; frame < 60; frame++) system.ground(die, [frame * 0.05, 0.6, 0], [3, -5, 0], 1 / 60, 0.6)
		assert.ok(Math.abs(system.count - 36) <= 1, String(system.count))
		system.update(0.5)
		const batches = system.build()
		for(let i = 0; i < batches.additiveCount; i++) {
			assert.ok(Math.abs(batches.additive[i * PARTICLE_STRIDE + 1]! - 0.012) < 1e-6, 'marks lie on the table')
		}
		system.clear()
		for(let frame = 0; frame < 60; frame++) system.ground(die, [0, 0.6, 0], [0, 0, 0], 1 / 60, 0.6)
		assert.equal(system.count, 0, 'a die at rest leaves no marks')
	})

	it('writes each particle shape and turns sparks along their motion', () => {
		const system = new ParticleSystem()
		system.configure({
			impact: emitter({ amount: 12, shape: 'spark', direction: 'out', speed: [2, 2] }),
			settle: emitter({ amount: 6, shape: 'confetti', spin: 6 })
		}, 1, 'shapes')
		system.burst('impact', [0, 1, 0], 0)
		system.burst('settle', [0, 1, 0], 0)
		const before = system.build()
		const spins = Array.from({ length: before.additiveCount }, (_, i) => before.additive[i * PARTICLE_STRIDE + 9]!)
		system.update(0.1)
		const batches = system.build()
		let sparks = 0, confetti = 0
		for(let i = 0; i < batches.additiveCount; i++) {
			const o = i * PARTICLE_STRIDE
			const shape = batches.additive[o + 8]!
			const angle = batches.additive[o + 9]!
			if(shape === SHAPES.spark) {
				sparks++
				const heading = Math.atan2(batches.additive[o + 2]!, batches.additive[o]!)
				assert.ok(Math.abs(Math.atan2(Math.sin(heading - angle), Math.cos(heading - angle))) < 1e-3, 'a spark points where it flies')
			} else {
				assert.equal(shape, SHAPES.confetti)
				confetti++
				assert.notEqual(angle, spins[i], 'confetti spins')
			}
		}
		assert.equal(sparks, 12)
		assert.equal(confetti, 6)
	})

	it('knows every shape of the options, and validates images and orientations', () => {
		assert.deepEqual(Object.keys(SHAPES), [...PARTICLE_SHAPES], 'one shader sprite per shape')
		assert.ok(Math.max(...Object.values(SHAPES)) < IMAGE_SHAPE_BASE, 'images start after the shapes')
		assert.doesNotThrow(() => validateParticleOptions({ effect: { trail: emitter({ shape: 'bolt', image: 'https://cdn.example/bat.png', orient: 'upright' }) } }))
	})

	it('turns particles upright, along their motion or at random', () => {
		const system = new ParticleSystem()
		system.configure({
			impact: emitter({ amount: 8, shape: 'bolt', direction: 'out', speed: [2, 2] }),
			settle: emitter({ amount: 8, shape: 'heart', orient: 'upright', direction: 'out', speed: [2, 2] }),
			critical: emitter({ amount: 8, shape: 'spark', orient: 'random', direction: 'out', speed: [2, 2] })
		}, 1, 'orientation')
		system.burst('impact', [0, 1, 0], 0)
		system.burst('settle', [0, 1, 0], 0)
		system.burst('critical', [0, 1, 0], 0)
		system.update(0.05)
		const batches = system.build()
		let bolts = 0, hearts = 0, loose = 0
		for(let i = 0; i < batches.additiveCount; i++) {
			const o = i * PARTICLE_STRIDE
			const shape = batches.additive[o + 8]!, angle = batches.additive[o + 9]!
			const heading = Math.atan2(batches.additive[o + 2]!, batches.additive[o]!)
			const off = Math.abs(Math.atan2(Math.sin(heading - angle), Math.cos(heading - angle)))
			if(shape === SHAPES.bolt) { bolts++; assert.ok(off < 1e-3, 'a bolt points where it flies') }
			else if(shape === SHAPES.heart) { hearts++; assert.equal(angle, Math.fround(-Math.PI / 2), 'a heart stands upright') }
			else if(off > 1e-3) loose++
		}
		assert.equal(bolts, 8)
		assert.equal(hearts, 8)
		assert.ok(loose > 0, 'a spark told to turn at random does not follow its motion')
	})

	it('links two dice with particles along the gap, only within reach and while the fade lasts', () => {
		const system = new ParticleSystem()
		system.configure({ link: emitter({ amount: 100, size: [1, 1], speed: [0, 0], grow: 1, shape: 'bolt' }), linkDistance: 4 }, 1, 'links')
		assert.equal(system.hasLink, true)
		assert.equal(system.linkSeconds, 2, 'default link duration')
		const key = {}
		system.link(key, [0, 0.5, 0], [3, 0.5, 0], 0.1, 1)
		system.update(0.05)
		const batches = system.build()
		assert.equal(batches.additiveCount, 10)
		for(let i = 0; i < batches.additiveCount; i++) {
			const o = i * PARTICLE_STRIDE
			assert.ok(Math.abs(batches.additive[o]! - 1.5) < 1e-6, 'born at the middle of the pair')
			assert.ok(Math.abs(batches.additive[o + 3]! - 3) < 1e-5, 'as long as the gap')
			assert.ok(Math.abs(Math.sin(batches.additive[o + 9]!)) < 1e-6, 'turned along the pair')
		}
		system.clear()
		system.link(key, [0, 0.5, 0], [5, 0.5, 0], 0.1, 1)
		system.link(key, [0, 0.5, 0], [2, 0.5, 0], 0.1, 0)
		system.update(0.05)
		assert.equal(system.count, 0, 'too far apart, or faded out')
	})

	it('draws image particles from their atlas cell, or as a glow without one', () => {
		const slots = new Map([['https://cdn.example/bat.png', 3]])
		const system = new ParticleSystem(url => slots.get(url) ?? -1)
		system.configure({
			impact: emitter({ amount: 4, image: 'https://cdn.example/bat.png', shape: 'star' }),
			settle: emitter({ amount: 4, image: 'https://cdn.example/unknown.png' })
		}, 1, 'images')
		system.burst('impact', [0, 1, 0], 0)
		system.burst('settle', [0, 1, 0], 0)
		system.update(0.05)
		const batches = system.build()
		const shapes = Array.from({ length: batches.additiveCount }, (_, i) => batches.additive[i * PARTICLE_STRIDE + 8]!)
		assert.deepEqual(shapes.filter(shape => shape === IMAGE_SHAPE_BASE + 3).length, 4, 'the image wins over the shape')
		assert.deepEqual(shapes.filter(shape => shape === SHAPES.soft).length, 4, 'no cell: a soft glow')
		// The same emitter moves to another cell when the atlas reassigns it.
		slots.set('https://cdn.example/bat.png', 5)
		system.burst('impact', [0, 1, 0], 0)
		system.update(0.05)
		const moved = system.build()
		const latest = Array.from({ length: moved.additiveCount }, (_, i) => moved.additive[i * PARTICLE_STRIDE + 8]!)
		assert.ok(latest.includes(IMAGE_SHAPE_BASE + 5))
	})

	it('gives each particle one palette color, faded by the ramp', () => {
		const palette = ['#ff0000', '#00ff00', '#0000ff']
		const system = new ParticleSystem()
		system.configure({ settle: emitter({ amount: 40, palette, colors: ['#ffffff', '#ffffff80'], blend: 'alpha' }) }, 1, 'palette')
		system.burst('settle', [0, 1, 0], 0.6)
		system.update(0.2)
		const batches = system.build()
		const seen = new Set<string>()
		for(let i = 0; i < batches.alphaCount; i++) {
			const o = i * PARTICLE_STRIDE
			const alpha = batches.alpha[o + 7]!
			seen.add([4, 5, 6].map(channel => Math.round(batches.alpha[o + channel]! / alpha)).join(','))
		}
		assert.deepEqual([...seen].sort(), ['0,0,1', '0,1,0', '1,0,0'])
	})
})

describe('particle conditions', () => {
	const d20 = { sides: 20, value: 20 }
	const d6 = { sides: 6, value: 3 }

	it('validates the when conditions', () => {
		assert.doesNotThrow(() => validateParticleOptions({ effect: { collision: emitter({ when: { minForce: 4, sides: [20], faces: 'max', chance: 0.5, cooldown: 0.3 } }) } }))
		assert.doesNotThrow(() => validateParticleOptions({ effect: { settle: emitter({ when: { faces: [1, 20] } }) } }))
		for(const when of [{ chance: 2 }, { faces: 'high' }, { sides: [0] }, { minForce: -1 }, { cooldown: Number.NaN }, 'always']) {
			assert.throws(() => validateParticleOptions({ effect: { impact: emitter({ when: when as never }) } }), /particles\.effect\.impact\.when/)
		}
	})

	it('plays hits only above the minimum force, and never within the cooldown of a die', () => {
		const system = new ParticleSystem()
		system.configure({ impact: emitter({ amount: 5, when: { minForce: 4, cooldown: 0.5 } }) }, 1, 'force')
		const die = {}
		system.burst('impact', [0, 1, 0], 0.6, { force: 2, key: die })
		assert.equal(system.count, 0, 'a soft touch stays quiet')
		system.burst('impact', [0, 1, 0], 0.6, { force: 6, key: die })
		assert.equal(system.count, 5)
		system.burst('impact', [0, 1, 0], 0.6, { force: 9, key: die })
		assert.equal(system.count, 5, 'the same die within its cooldown')
		system.burst('impact', [0, 1, 0], 0.6, { force: 9, key: {} })
		assert.equal(system.count, 10, 'another die is not affected')
		system.update(0.6)
		system.burst('impact', [0, 1, 0], 0.6, { force: 9, key: die })
		assert.equal(system.count, 5, 'after the cooldown (the first bursts expired)')
	})

	it('filters by sides and faces; a collision plays when either die matches', () => {
		const system = new ParticleSystem()
		system.configure({
			settle: emitter({ amount: 4, when: { sides: [20], faces: 'max' } }),
			collision: emitter({ amount: 3, when: { sides: [20] } })
		}, 1, 'faces')
		system.burst('settle', [0, 1, 0], 0.6, { subject: d6 })
		system.burst('settle', [0, 1, 0], 0.6, { subject: { sides: 20, value: 7 } })
		assert.equal(system.count, 0)
		system.burst('settle', [0, 1, 0], 0.6, { subject: d20 })
		assert.equal(system.count, 4, 'a natural 20')
		system.burst('collision', [0, 1, 0], 0.6, { subject: [d6, d6] })
		assert.equal(system.count, 4)
		system.burst('collision', [0, 1, 0], 0.6, { subject: [d6, d20] })
		assert.equal(system.count, 7)
		system.burst('settle', [0, 1, 0], 0.6, { subject: d6, always: true })
		assert.equal(system.count, 11, 'manual triggers ignore the conditions')
	})

	it('draws chance per event for bursts and once per die for continuous moments', () => {
		const never = new ParticleSystem()
		never.configure({ impact: emitter({ amount: 5, when: { chance: 0 } }), trail: emitter({ amount: 60, when: { chance: 0 } }) }, 1, 'chance')
		never.burst('impact', [0, 1, 0], 0.6)
		for(let frame = 0; frame < 30; frame++) never.trail({}, [0, 1, 0], [6, 0, 0], 1 / 60, 0.6)
		assert.equal(never.count, 0)
		const half = new ParticleSystem()
		half.configure({ trail: emitter({ amount: 60, when: { chance: 0.5 } }) }, 1, 'coin')
		const dice = Array.from({ length: 40 }, () => ({}))
		for(let frame = 0; frame < 60; frame++) for(const die of dice) half.trail(die, [0, 1, 0], [6, 0, 0], 1 / 60, 0.6)
		assert.equal(half.count % 60, 0, 'each die trails fully or not at all')
		assert.ok(half.count > 0 && half.count < 40 * 60)
	})

	it('trails only above the minimum speed', () => {
		const system = new ParticleSystem()
		system.configure({ trail: emitter({ amount: 60, when: { minSpeed: 4 } }) }, 1, 'speed')
		for(let frame = 0; frame < 60; frame++) system.trail({}, [0, 1, 0], [3, 0, 0], 1 / 60, 0.6)
		assert.equal(system.count, 0)
		for(let frame = 0; frame < 60; frame++) system.trail({}, [0, 1, 0], [6, 0, 0], 1 / 60, 0.6)
		assert.ok(system.count >= 59)
	})
})

describe('dice looks (workshop files)', () => {
	const look = createDiceLook({
		name: 'Dragão de lava',
		themeColor: '#7a1c10',
		skin: { texture: 'data:image/png;base64,AAAA', blend: 'multiply', opacity: 0.9 },
		particles: { effect: { impact: emitter({ palette: ['#ff4d6d', '#ffd166'] }), trail: emitter() }, intensity: 1.2 },
		glow: { color: '#ff8a3d', intensity: 1.4, pulse: true }
	})

	it('round-trips through JSON into viewer options', () => {
		const options = diceLookOptions(JSON.parse(JSON.stringify(look)))
		assert.equal(look.format, DICE_LOOK_FORMAT)
		assert.equal(options.themeColor, '#7a1c10')
		assert.equal(options.skin?.blend, 'multiply')
		assert.equal(options.particles?.intensity, 1.2)
		assert.deepEqual(options.glow, { color: '#ff8a3d', intensity: 1.4, pulse: true })
		assert.doesNotThrow(() => validateViewerOptions(createViewerOptions(options)))
	})

	it('turns off the parts a look leaves out', () => {
		const options = diceLookOptions({ format: DICE_LOOK_FORMAT, version: 1 })
		assert.deepEqual(options, { skin: null, particles: null, glow: null })
	})

	it('rejects foreign or broken files with the offending field', () => {
		const broken: unknown[] = [
			null,
			[],
			{ ...look, format: 'other' },
			{ ...look, version: 2 },
			{ ...look, themeColor: 'red' },
			{ ...look, name: 7 }
		]
		for(const value of broken) assert.throws(() => diceLookOptions(value), /Dice look/)
		assert.throws(() => diceLookOptions({ ...look, particles: { preset: 'lava', intensity: 9 } }), /particles\.intensity/)
		assert.throws(() => diceLookOptions({ ...look, skin: { texture: '' } }), /skin\.texture/)
		assert.throws(() => diceLookOptions({ ...look, glow: { intensity: -1 } }), /glow\.intensity/)
	})
})

describe('particle customization', () => {
	const base: ParticleEffectDefinition = {
		trail: emitter({ colors: ['#ffffff', '#ffb347', '#8c1a0880'] }),
		ground: emitter(),
		impact: emitter({ palette: ['#ff4d6d', '#ffd166'] }),
		auraSeconds: 2
	}

	it('returns the effect untouched without controls and caches every variant', () => {
		assert.equal(customizeEffect(base, {}), base)
		assert.equal(customizeEffect(base, { size: 1, moments: { ground: true } }), base)
		const one = customizeEffect(base, { color: '#3366ff', moments: { ground: false } })
		assert.equal(customizeEffect(base, { color: '#3366ff', moments: { ground: false } }), one, 'same controls, same emitters')
		assert.notEqual(customizeEffect(base, { color: '#ff3366' }), one)
	})

	it('drops the moments turned off and applies shape and size', () => {
		const custom = customizeEffect(base, { moments: { ground: false, impact: false }, shape: 'ring', size: 2 })
		assert.equal(custom.ground, undefined)
		assert.equal(custom.impact, undefined)
		assert.equal(custom.trail?.shape, 'ring')
		assert.deepEqual(custom.trail?.size, [0.2, 0.2])
		assert.equal(custom.auraSeconds, 2)
	})

	it('recolors ramps and palettes in the chosen hue, keeping brightness order and alpha', () => {
		const custom = customizeEffect(base, { color: '#3366ff' })
		const stops = custom.trail!.colors.map(color => parseParticleColor(color)!)
		const luma = (c: readonly number[]): number => 0.299 * c[0]! + 0.587 * c[1]! + 0.114 * c[2]!
		assert.ok(luma(stops[0]!) > luma(stops[1]!) && luma(stops[1]!) > luma(stops[2]!), 'the ramp still fades from bright to dark')
		for(const stop of stops.slice(1)) assert.ok(stop[2] > stop[0] && stop[2] > stop[1], 'stops take the blue hue')
		assert.ok(Math.abs(stops[2]![3] - 0x80 / 255) < 1e-9, 'alpha is kept')
		for(const color of custom.impact!.palette!) {
			const [r, g, b] = parseParticleColor(color)!
			assert.ok(b >= r && b >= g, 'palette colors take the hue too')
		}
		assert.notEqual(customizeEffect(PARTICLE_PRESETS.fire, { color: '#3366ff' }).trail?.colors[0], PARTICLE_PRESETS.fire.trail?.colors[0])
	})
})
