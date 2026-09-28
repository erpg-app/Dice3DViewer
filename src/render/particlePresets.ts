import type { DiceParticlePreset, ParticleEffectDefinition, ParticleEmitterOptions } from '../types'

/**
 * Built-in particle effects, a lazy chunk of their own: an effect given as a
 * full definition (a look exported by the workshop) never downloads them.
 *
 * Distances are world units (a die is about 1.2 across), times are seconds.
 * Every preset reacts to all eight moments of a roll; `ground` emits per unit
 * of distance rolled on the table.
 */

/** Colors of the confetti preset (one per piece). */
const CONFETTI = ['#ff4d6d', '#ffd166', '#06d6a0', '#4cc9f0', '#b388ff', '#ff9f1c']
/** Paper and leaves keep their palette color; the ramp only fades them out. */
const PAPER = ['#ffffff', '#ffffff', '#ffffff00']
const LEAVES = ['#5fbf3f', '#8fd14f', '#c7e05a', '#f2c94c', '#3f9b2f']
const BLOSSOM = ['#ff9ec7', '#ffd1e6', '#ffffff', '#c7e05a', '#ffb3d9']
const STARLIGHT = ['#ffffff', '#9ad7ff', '#d9a6ff', '#ffd1f0', '#a6fff2']
const STAR_FADE = ['#ffffff', '#ffffffaa', '#ffffff00']
const HEARTS = ['#ff4d6d', '#ff8fab', '#ffb3c6', '#ff006e', '#ffffff']
const LIGHTNING = ['#ffffff', '#e0f4ff', '#8cc8ff', '#3a6bff00']
const SNOW = ['#ffffff', '#e6f6ffcc', '#bfe6ff00']

// Hits: the same burst for a die landing on the table and for dice hitting
// each other (collisions play at 70% of the hit strength).
const SPARKLE_HIT: ParticleEmitterOptions = { amount: 12, life: [0.3, 0.6], size: [0.1, 0.2], speed: [1.6, 3.4], direction: 'out', gravity: 5, drag: 1.5, colors: ['#ffffff', '#ffd166', '#ff9f1c00'], flicker: 0.5, shape: 'spark' }
const FIRE_HIT: ParticleEmitterOptions = { amount: 18, life: [0.35, 0.8], size: [0.05, 0.12], speed: [2, 4.6], direction: 'sphere', gravity: 9, drag: 1, colors: ['#fff1a8', '#ffa133', '#ff4d1a00'], flicker: 0.4 }
const ARCANE_HIT: ParticleEmitterOptions = { amount: 5, life: [0.45, 0.8], size: [0.3, 0.5], speed: [0, 0.2], direction: 'out', drag: 2, colors: ['#ffffff', '#c7b3ff', '#7a5cff00'], grow: 2.4, shape: 'ring' }
const FROST_HIT: ParticleEmitterOptions = { amount: 16, life: [0.4, 0.8], size: [0.1, 0.18], speed: [2, 4.2], direction: 'out', gravity: 8, drag: 1, colors: ['#ffffff', '#c9ecff', '#7cc6ff00'], shape: 'spark' }
const DUST_HIT: ParticleEmitterOptions = { amount: 7, life: [0.5, 1], size: [0.3, 0.55], speed: [0.3, 1.1], direction: 'out', gravity: -0.3, drag: 3, colors: ['#d8d2c666', '#b9b3a844', '#a39e9400'], blend: 'alpha', grow: 2.4, shape: 'smoke', spin: 0.6 }
const CONFETTI_HIT: ParticleEmitterOptions = { amount: 6, life: [0.7, 1.2], size: [0.1, 0.16], speed: [1.5, 3], direction: 'up', gravity: 6, drag: 1.2, colors: PAPER, palette: CONFETTI, blend: 'alpha', grow: 1, shape: 'confetti', spin: 9 }
const ELECTRIC_HIT: ParticleEmitterOptions = { amount: 16, life: [0.1, 0.25], size: [0.2, 0.36], speed: [3, 6], direction: 'out', drag: 4, colors: ['#ffffff', '#bfe9ff', '#3fa9ff00'], flicker: 0.8, shape: 'spark' }
const SMOKE_HIT: ParticleEmitterOptions = { amount: 6, life: [0.6, 1.1], size: [0.3, 0.5], speed: [0.4, 1.2], direction: 'out', gravity: -0.3, drag: 2.5, colors: ['#70707866', '#4a4a5244', '#2e2e3400'], blend: 'alpha', grow: 2.2, shape: 'smoke', spin: 0.6 }
const LAVA_HIT: ParticleEmitterOptions = { amount: 20, life: [0.4, 0.9], size: [0.14, 0.26], speed: [2.5, 5], direction: 'up', gravity: 11, drag: 0.8, colors: ['#fff3b0', '#ffb347', '#ff5a1acc', '#8c1a0800'], shape: 'spark' }
const STORM_HIT: ParticleEmitterOptions = { amount: 18, life: [0.08, 0.2], size: [0.22, 0.4], speed: [3.5, 7], direction: 'out', drag: 4, colors: ['#ffffff', '#d4f1ff', '#7aa8ff', '#5b3dff00'], flicker: 1, shape: 'spark' }
const SHADOW_HIT: ParticleEmitterOptions = { amount: 14, life: [0.25, 0.55], size: [0.18, 0.32], speed: [2, 4.5], direction: 'out', gravity: 2, drag: 2, colors: ['#e0c3ff', '#9b5cff', '#4b1fa800'], flicker: 0.4, shape: 'spark' }
const LIGHTNING_HIT: ParticleEmitterOptions = { amount: 5, life: [0.08, 0.18], size: [0.7, 1.1], speed: [2, 4], direction: 'out', drag: 8, colors: LIGHTNING, flicker: 0.7, shape: 'bolt' }
const SNOW_HIT: ParticleEmitterOptions = { amount: 14, life: [0.5, 1], size: [0.1, 0.2], speed: [1.4, 3], direction: 'out', gravity: 3, drag: 1.5, colors: SNOW, shape: 'snowflake', spin: 3 }
const HEART_HIT: ParticleEmitterOptions = { amount: 10, life: [0.6, 1], size: [0.12, 0.22], speed: [1, 2.4], direction: 'up', gravity: -0.5, drag: 1.8, colors: STAR_FADE, palette: HEARTS, shape: 'heart', orient: 'upright' }
const POISON_HIT: ParticleEmitterOptions = { amount: 16, life: [0.4, 0.8], size: [0.07, 0.14], speed: [1.5, 3.5], direction: 'up', gravity: 9, drag: 1, colors: ['#f0ffc2', '#9dff5c', '#3fbf1f00'] }

export const PARTICLE_PRESETS: Readonly<Record<DiceParticlePreset, ParticleEffectDefinition>> = Object.freeze({
	sparkle: {
		trail: { amount: 70, life: [0.35, 0.8], size: [0.12, 0.26], speed: [0.1, 0.6], direction: 'sphere', gravity: 1.2, drag: 1.2, colors: ['#ffffff', '#ffe08a', '#ffb3474d', '#ff8a0000'], flicker: 0.8, shape: 'star', spin: 1.5 },
		ground: { amount: 16, life: [0.8, 1.6], size: [0.05, 0.12], speed: [0, 0.08], direction: 'out', drag: 2, colors: ['#fff6d5', '#ffd166cc', '#ffb34766', '#ff8a0000'], flicker: 0.9 },
		impact: SPARKLE_HIT,
		collision: SPARKLE_HIT,
		settle: { amount: 14, life: [0.5, 1], size: [0.12, 0.24], speed: [0.3, 1.1], direction: 'up', gravity: -0.4, drag: 1, colors: ['#ffffff', '#ffe08a', '#ffc04700'], flicker: 0.9, shape: 'star', spin: 1 },
		aura: { amount: 8, life: [0.8, 1.5], size: [0.12, 0.22], speed: [0.1, 0.4], direction: 'up', gravity: -0.3, drag: 0.5, colors: ['#fff6d5', '#ffd16688', '#ffb34700'], flicker: 1, shape: 'star', spin: 1 },
		explode: { amount: 46, life: [0.5, 1.1], size: [0.12, 0.24], speed: [2.2, 5], direction: 'sphere', gravity: 3, drag: 1.4, colors: ['#ffffff', '#ffd166', '#ff9f1c00'], flicker: 0.6, shape: 'spark' },
		critical: { amount: 70, life: [0.7, 1.4], size: [0.14, 0.3], speed: [1.5, 4.2], direction: 'up', gravity: 2.2, drag: 1, swirl: 1.2, colors: ['#ffffff', '#ffe08a', '#ffd16699', '#ffb34700'], flicker: 0.8, shape: 'star', spin: 2 },
		auraSeconds: 2.5
	},
	fire: {
		trail: { amount: 80, life: [0.22, 0.5], size: [0.26, 0.5], speed: [0.2, 0.9], direction: 'up', gravity: -7, drag: 2.5, colors: ['#ffe9a899', '#ffb14acc', '#ff6a1ab3', '#c9260b80', '#3d0a0500'], grow: 0.15 },
		ground: { amount: 20, life: [0.6, 1.4], size: [0.12, 0.24], speed: [0, 0.06], direction: 'out', drag: 2, colors: ['#ffd27a', '#ff8c2acc', '#c9260b88', '#3d0a0500'], flicker: 0.5, grow: 0.6 },
		impact: FIRE_HIT,
		collision: FIRE_HIT,
		settle: { amount: 22, life: [0.3, 0.6], size: [0.25, 0.5], speed: [0.2, 0.8], direction: 'up', gravity: -6, drag: 2, colors: ['#fff4c2', '#ffb347', '#ff5e1a', '#8c1a0800'], grow: 0.2 },
		aura: { amount: 26, life: [0.3, 0.6], size: [0.2, 0.4], speed: [0.1, 0.5], direction: 'up', gravity: -6, drag: 2, colors: ['#fff1b8', '#ffab40', '#ff5a1acc', '#6b120600'], grow: 0.2 },
		explode: { amount: 60, life: [0.35, 0.8], size: [0.3, 0.7], speed: [2.5, 5.5], direction: 'sphere', gravity: -3, drag: 2.2, colors: ['#ffffff', '#ffd27a', '#ff6a1a', '#a3200acc', '#2a080400'], grow: 0.3 },
		critical: { amount: 80, life: [0.5, 1], size: [0.3, 0.65], speed: [1, 3.5], direction: 'up', gravity: -5, drag: 1.8, swirl: 1.5, colors: ['#ffffff', '#ffe08a', '#ff8c2a', '#c9260b99', '#2a080400'], grow: 0.25 },
		auraSeconds: 3
	},
	arcane: {
		trail: { amount: 80, life: [0.4, 0.9], size: [0.08, 0.2], speed: [0.2, 0.7], direction: 'sphere', gravity: -0.8, drag: 1.2, swirl: 4, colors: ['#f1e9ff', '#b99cff', '#7a5cff99', '#4b2bd600'], flicker: 0.4 },
		ground: { amount: 14, life: [1, 1.8], size: [0.1, 0.2], speed: [0.05, 0.2], direction: 'out', drag: 1, swirl: 3, colors: ['#e8deff', '#9d7dffcc', '#6a4cff66', '#3a1fb800'], flicker: 0.3 },
		impact: ARCANE_HIT,
		collision: ARCANE_HIT,
		settle: { amount: 20, life: [0.6, 1.1], size: [0.12, 0.24], speed: [0.5, 1.4], direction: 'out', gravity: -1.2, drag: 1.2, swirl: 6, colors: ['#ffffff', '#b99cff', '#6a4cff00'], flicker: 0.5, shape: 'star', spin: 1.5 },
		aura: { amount: 12, life: [0.9, 1.6], size: [0.12, 0.22], speed: [0.2, 0.5], direction: 'up', gravity: -0.6, drag: 0.6, swirl: 3, colors: ['#e8deff', '#9d7dffaa', '#5b3dff00'], flicker: 0.6, shape: 'star', spin: 1 },
		explode: { amount: 55, life: [0.6, 1.2], size: [0.08, 0.2], speed: [2, 4.5], direction: 'sphere', gravity: -0.4, drag: 1.4, swirl: 5, colors: ['#ffffff', '#c7b3ff', '#7a5cff', '#3a1fb800'] },
		critical: { amount: 60, life: [0.8, 1.5], size: [0.16, 0.32], speed: [1, 3], direction: 'up', gravity: -1, drag: 1, swirl: 6, colors: ['#ffffff', '#d9ccff', '#8f73ff', '#3a1fb800'], flicker: 0.5, shape: 'star', spin: 1.5 },
		auraSeconds: 3
	},
	frost: {
		trail: { amount: 60, life: [0.45, 1], size: [0.12, 0.26], speed: [0.1, 0.5], direction: 'sphere', gravity: 1.5, drag: 1.5, colors: ['#ffffff', '#d7f2ff', '#8fd3ff66', '#4aa8ff00'], flicker: 0.6, shape: 'star', spin: 0.8 },
		ground: { amount: 14, life: [1.2, 2.2], size: [0.12, 0.22], speed: [0, 0.04], direction: 'out', drag: 2, colors: ['#ffffff', '#d7f2ffcc', '#8fd3ff66', '#4aa8ff00'], flicker: 0.3, shape: 'star', spin: 0.3 },
		impact: FROST_HIT,
		collision: FROST_HIT,
		settle: { amount: 16, life: [0.6, 1.2], size: [0.22, 0.45], speed: [0.2, 0.6], direction: 'out', gravity: -0.2, drag: 2.5, colors: ['#e9f7ff55', '#bfe6ff33', '#9ad7ff00'], blend: 'alpha', grow: 2.2, shape: 'smoke', spin: 0.6 },
		aura: { amount: 8, life: [1, 1.8], size: [0.1, 0.2], speed: [0.1, 0.3], direction: 'up', gravity: -0.2, drag: 0.4, colors: ['#ffffff', '#c9ecffaa', '#7cc6ff00'], flicker: 0.9, shape: 'star', spin: 0.6 },
		explode: { amount: 44, life: [0.5, 1], size: [0.1, 0.2], speed: [2.5, 5], direction: 'sphere', gravity: 6, drag: 1, colors: ['#ffffff', '#c9ecff', '#5bb8ff00'], shape: 'spark' },
		critical: { amount: 60, life: [0.8, 1.5], size: [0.12, 0.26], speed: [0.8, 2.6], direction: 'up', gravity: 1, drag: 0.8, swirl: 1, colors: ['#ffffff', '#d7f2ff', '#8fd3ff88', '#4aa8ff00'], flicker: 0.8, shape: 'star', spin: 1 },
		auraSeconds: 2.5
	},
	dust: {
		trail: { amount: 14, life: [0.4, 0.8], size: [0.18, 0.32], speed: [0.1, 0.4], direction: 'back', drag: 3, colors: ['#d8d2c633', '#b9b3a822', '#a39e9400'], blend: 'alpha', grow: 2, shape: 'smoke', spin: 0.5 },
		ground: { amount: 6, life: [0.6, 1.2], size: [0.22, 0.4], speed: [0.05, 0.3], direction: 'out', drag: 3, colors: ['#d8d2c644', '#b9b3a833', '#a39e9400'], blend: 'alpha', grow: 2.2, shape: 'smoke', spin: 0.5 },
		impact: DUST_HIT,
		collision: DUST_HIT,
		settle: { amount: 5, life: [0.6, 1.1], size: [0.3, 0.5], speed: [0.2, 0.6], direction: 'out', gravity: -0.2, drag: 3, colors: ['#d8d2c655', '#b9b3a833', '#a39e9400'], blend: 'alpha', grow: 2.2, shape: 'smoke', spin: 0.5 },
		aura: { amount: 5, life: [1.2, 2.2], size: [0.04, 0.08], speed: [0.05, 0.2], direction: 'up', gravity: -0.1, drag: 0.5, swirl: 0.6, colors: ['#f2ead899', '#d8d2c666', '#a39e9400'], flicker: 0.4 },
		explode: { amount: 14, life: [0.6, 1.2], size: [0.35, 0.7], speed: [0.6, 1.8], direction: 'out', gravity: -0.3, drag: 2.5, colors: ['#e0dacd77', '#bcb6aa44', '#a39e9400'], blend: 'alpha', grow: 2.5, shape: 'smoke', spin: 0.6 },
		critical: { amount: 30, life: [0.9, 1.6], size: [0.4, 0.8], speed: [0.8, 2.2], direction: 'out', gravity: -0.4, drag: 2, colors: ['#e0dacd88', '#bcb6aa55', '#a39e9400'], blend: 'alpha', grow: 2.8, shape: 'smoke', spin: 0.6 },
		auraSeconds: 3
	},
	confetti: {
		trail: { amount: 22, life: [0.8, 1.4], size: [0.1, 0.16], speed: [0.3, 1], direction: 'up', gravity: 3, drag: 1.5, colors: PAPER, palette: CONFETTI, blend: 'alpha', grow: 1, shape: 'confetti', spin: 8 },
		ground: { amount: 8, life: [1.6, 2.6], size: [0.08, 0.13], speed: [0, 0.05], direction: 'out', drag: 3, colors: PAPER, palette: CONFETTI, blend: 'alpha', grow: 1, shape: 'confetti', spin: 0.5 },
		impact: CONFETTI_HIT,
		collision: CONFETTI_HIT,
		settle: { amount: 18, life: [0.9, 1.5], size: [0.1, 0.17], speed: [1.5, 3.2], direction: 'up', gravity: 5, drag: 1.5, colors: PAPER, palette: CONFETTI, blend: 'alpha', grow: 1, shape: 'confetti', spin: 10 },
		aura: { amount: 6, life: [1, 1.6], size: [0.08, 0.14], speed: [0.6, 1.4], direction: 'up', gravity: 2.5, drag: 1.8, colors: PAPER, palette: CONFETTI, blend: 'alpha', grow: 1, shape: 'confetti', spin: 7 },
		explode: { amount: 60, life: [1, 1.7], size: [0.11, 0.18], speed: [2.5, 5], direction: 'sphere', gravity: 5, drag: 1.4, colors: PAPER, palette: CONFETTI, blend: 'alpha', grow: 1, shape: 'confetti', spin: 11 },
		critical: { amount: 90, life: [1.2, 2], size: [0.11, 0.19], speed: [2.5, 5.5], direction: 'up', gravity: 4, drag: 1.2, swirl: 0.8, colors: PAPER, palette: CONFETTI, blend: 'alpha', grow: 1, shape: 'confetti', spin: 12 },
		auraSeconds: 2.5
	},
	electric: {
		trail: { amount: 90, life: [0.08, 0.2], size: [0.18, 0.34], speed: [1.5, 3.5], direction: 'sphere', drag: 6, colors: ['#ffffff', '#bfe9ff', '#5cc8ff99', '#2a6bff00'], flicker: 1, shape: 'spark' },
		ground: { amount: 18, life: [0.3, 0.7], size: [0.1, 0.2], speed: [0, 0.1], direction: 'out', drag: 2, colors: ['#e6f7ff', '#7fd4ffcc', '#2a8bff66', '#1a3bff00'], flicker: 1 },
		impact: ELECTRIC_HIT,
		collision: ELECTRIC_HIT,
		settle: { amount: 14, life: [0.1, 0.3], size: [0.18, 0.32], speed: [1.5, 3.5], direction: 'sphere', drag: 5, colors: ['#ffffff', '#bfe9ff', '#3fa9ff00'], flicker: 1, shape: 'spark' },
		aura: { amount: 20, life: [0.06, 0.16], size: [0.16, 0.28], speed: [1.5, 3], direction: 'sphere', drag: 6, colors: ['#ffffff', '#9fdcff', '#3fa9ff00'], flicker: 1, shape: 'spark' },
		explode: { amount: 50, life: [0.15, 0.35], size: [0.22, 0.4], speed: [4, 8], direction: 'sphere', drag: 4, colors: ['#ffffff', '#bfe9ff', '#5cc8ff', '#2a6bff00'], flicker: 0.8, shape: 'spark' },
		critical: { amount: 80, life: [0.15, 0.4], size: [0.2, 0.38], speed: [3, 7], direction: 'sphere', drag: 4, colors: ['#ffffff', '#d4f1ff', '#5cc8ff', '#2a6bff00'], flicker: 1, shape: 'spark' },
		auraSeconds: 2
	},
	smoke: {
		trail: { amount: 40, life: [0.6, 1.2], size: [0.25, 0.45], speed: [0.2, 0.6], direction: 'up', gravity: -0.8, drag: 1.5, colors: ['#6b6b7355', '#4a4a5244', '#2e2e3400'], blend: 'alpha', grow: 2.5, shape: 'smoke', spin: 0.8 },
		ground: { amount: 5, life: [0.8, 1.6], size: [0.2, 0.35], speed: [0.05, 0.2], direction: 'out', drag: 2, colors: ['#5f5f6744', '#44444c33', '#2e2e3400'], blend: 'alpha', grow: 2.4, shape: 'smoke', spin: 0.5 },
		impact: SMOKE_HIT,
		collision: SMOKE_HIT,
		settle: { amount: 10, life: [0.8, 1.4], size: [0.3, 0.5], speed: [0.2, 0.7], direction: 'up', gravity: -0.6, drag: 2, colors: ['#70707866', '#4a4a5244', '#2e2e3400'], blend: 'alpha', grow: 2.5, shape: 'smoke', spin: 0.6 },
		aura: { amount: 6, life: [1, 2], size: [0.25, 0.4], speed: [0.1, 0.4], direction: 'up', gravity: -0.6, drag: 1, colors: ['#5f5f6744', '#44444c33', '#2e2e3400'], blend: 'alpha', grow: 3, shape: 'smoke', spin: 0.5 },
		explode: { amount: 24, life: [0.8, 1.5], size: [0.35, 0.7], speed: [1, 2.5], direction: 'sphere', gravity: -0.4, drag: 2, colors: ['#78788088', '#4a4a5255', '#2e2e3400'], blend: 'alpha', grow: 2.5, shape: 'smoke', spin: 0.7 },
		critical: { amount: 30, life: [1, 1.8], size: [0.35, 0.6], speed: [0.8, 2], direction: 'up', gravity: -0.8, drag: 1.5, swirl: 1, colors: ['#78788088', '#4a4a5255', '#2e2e3400'], blend: 'alpha', grow: 2.8, shape: 'smoke', spin: 0.7 },
		auraSeconds: 3
	},
	// Fire and earth: molten drops, glowing pools on the table and eruptions.
	lava: {
		trail: { amount: 60, life: [0.4, 0.9], size: [0.1, 0.22], speed: [0.2, 0.8], direction: 'sphere', gravity: 6, drag: 1, colors: ['#fff3b0', '#ffb347', '#ff5a1acc', '#8c1a0866', '#2a080400'], flicker: 0.3 },
		ground: { amount: 18, life: [1.2, 2.2], size: [0.18, 0.32], speed: [0, 0.05], direction: 'out', drag: 2, colors: ['#ffcf6b', '#ff6a1acc', '#b3200a88', '#3d0a0500'], flicker: 0.2, grow: 0.7 },
		impact: LAVA_HIT,
		collision: LAVA_HIT,
		settle: { amount: 8, life: [0.8, 1.5], size: [0.3, 0.55], speed: [0.2, 0.6], direction: 'up', gravity: -0.8, drag: 1.5, colors: ['#4a322a77', '#2a1f1f55', '#14100f00'], blend: 'alpha', grow: 2.4, shape: 'smoke', spin: 0.6 },
		aura: { amount: 16, life: [0.8, 1.6], size: [0.05, 0.1], speed: [0.2, 0.6], direction: 'up', gravity: -1.5, drag: 0.6, swirl: 1.2, colors: ['#ffe08a', '#ff8c2acc', '#c9260b00'], flicker: 0.6 },
		explode: { amount: 50, life: [0.5, 1], size: [0.28, 0.6], speed: [2.5, 5.5], direction: 'sphere', gravity: 4, drag: 1.6, colors: ['#ffffff', '#ffd27a', '#ff5a1a', '#8c1a08aa', '#1a0a0500'], grow: 0.4 },
		critical: { amount: 80, life: [0.7, 1.3], size: [0.18, 0.34], speed: [3, 6.5], direction: 'up', gravity: 8, drag: 0.7, colors: ['#fff3b0', '#ffb347', '#ff5a1a', '#8c1a0800'], shape: 'spark' },
		auraSeconds: 3
	},
	// Lightning and storm clouds.
	storm: {
		trail: { amount: 35, life: [0.6, 1.1], size: [0.25, 0.45], speed: [0.2, 0.6], direction: 'back', gravity: -0.3, drag: 1.5, colors: ['#5a6a8a55', '#3a466044', '#1e243400'], blend: 'alpha', grow: 2.2, shape: 'smoke', spin: 0.7 },
		ground: { amount: 8, life: [0.4, 0.8], size: [0.1, 0.2], speed: [0, 0.05], direction: 'out', drag: 2, colors: ['#e6f7ff', '#7fd4ffaa', '#2a8bff00'], grow: 3, shape: 'ring' },
		impact: STORM_HIT,
		collision: STORM_HIT,
		settle: { amount: 3, life: [0.4, 0.7], size: [0.5, 0.8], speed: [0, 0.1], direction: 'out', drag: 2, colors: ['#ffffff', '#bfe0ff', '#5b8dff00'], grow: 3, shape: 'ring' },
		aura: { amount: 18, life: [0.06, 0.16], size: [0.16, 0.3], speed: [1.5, 3], direction: 'sphere', drag: 6, colors: ['#ffffff', '#c7d8ff', '#6a7dff00'], flicker: 1, shape: 'spark' },
		explode: { amount: 60, life: [0.12, 0.3], size: [0.24, 0.42], speed: [4, 9], direction: 'sphere', drag: 4, colors: ['#ffffff', '#d4f1ff', '#7aa8ff', '#5b3dff00'], flicker: 1, shape: 'spark' },
		critical: { amount: 90, life: [0.15, 0.45], size: [0.22, 0.42], speed: [3, 7], direction: 'up', drag: 3, swirl: 2, colors: ['#ffffff', '#e0e8ff', '#9a7dff', '#3a1fb800'], flicker: 1, shape: 'spark' },
		auraSeconds: 2.5
	},
	// Divine light: golden stars, radiant rings and a pillar of light.
	holy: {
		trail: { amount: 40, life: [0.6, 1.2], size: [0.12, 0.24], speed: [0.1, 0.4], direction: 'sphere', gravity: -0.5, drag: 1.2, colors: ['#ffffff', '#fff2b3', '#ffd96688', '#ffcc3300'], flicker: 0.7, shape: 'star', spin: 0.6 },
		ground: { amount: 12, life: [1.4, 2.4], size: [0.14, 0.26], speed: [0, 0.04], direction: 'out', drag: 2, colors: ['#fffbe6', '#ffe9a0aa', '#ffd06644', '#ffc04700'] },
		impact: { amount: 3, life: [0.4, 0.7], size: [0.4, 0.7], speed: [0, 0.1], direction: 'out', drag: 2, colors: ['#ffffff', '#fff2b3', '#ffd96600'], grow: 2.6, shape: 'ring' },
		collision: { amount: 8, life: [0.4, 0.8], size: [0.12, 0.22], speed: [1, 2.5], direction: 'sphere', gravity: -0.5, drag: 1.5, colors: ['#ffffff', '#fff2b3', '#ffd96600'], flicker: 0.5, shape: 'star', spin: 1 },
		settle: { amount: 16, life: [0.8, 1.4], size: [0.06, 0.12], speed: [0.4, 1], direction: 'up', gravity: -1.2, drag: 0.8, colors: ['#ffffff', '#fff2b3cc', '#ffd96600'], flicker: 0.4 },
		aura: { amount: 10, life: [1, 1.8], size: [0.1, 0.2], speed: [0.2, 0.5], direction: 'up', gravity: -0.6, drag: 0.6, swirl: 2.5, colors: ['#ffffff', '#fff2b3aa', '#ffd96600'], flicker: 0.8, shape: 'star', spin: 0.8 },
		explode: { amount: 50, life: [0.6, 1.1], size: [0.12, 0.26], speed: [2, 4.5], direction: 'sphere', gravity: -0.3, drag: 1.4, colors: ['#ffffff', '#fff2b3', '#ffd966', '#ffcc3300'], flicker: 0.4, shape: 'star', spin: 1.2 },
		critical: { amount: 100, life: [0.8, 1.5], size: [0.12, 0.26], speed: [2, 5], direction: 'up', gravity: -2, drag: 1, swirl: 0.8, colors: ['#ffffff', '#fffbe6', '#ffe9a0', '#ffd96600'], flicker: 0.3 },
		auraSeconds: 3.5
	},
	// Void: creeping darkness with violet sparks.
	shadow: {
		trail: { amount: 45, life: [0.6, 1.2], size: [0.25, 0.5], speed: [0.1, 0.5], direction: 'back', gravity: -0.3, drag: 1.5, colors: ['#1a0f2a88', '#12091f66', '#08040f00'], blend: 'alpha', grow: 2.2, shape: 'smoke', spin: 0.8 },
		ground: { amount: 8, life: [1, 1.8], size: [0.22, 0.4], speed: [0.03, 0.15], direction: 'out', drag: 2, colors: ['#1a0f2a77', '#12091f55', '#08040f00'], blend: 'alpha', grow: 2, shape: 'smoke', spin: 0.4 },
		impact: SHADOW_HIT,
		collision: SHADOW_HIT,
		settle: { amount: 2, life: [0.6, 1], size: [0.5, 0.8], speed: [0, 0.1], direction: 'out', drag: 2, colors: ['#c9a0ffaa', '#6a2cff66', '#1a0a4000'], grow: 2.8, shape: 'ring' },
		aura: { amount: 8, life: [1, 1.8], size: [0.2, 0.36], speed: [0.1, 0.4], direction: 'up', gravity: -0.8, drag: 1, colors: ['#1a0f2a77', '#12091f55', '#08040f00'], blend: 'alpha', grow: 2.4, shape: 'smoke', spin: 0.6 },
		explode: { amount: 30, life: [0.8, 1.4], size: [0.35, 0.7], speed: [1.2, 3], direction: 'sphere', gravity: -0.3, drag: 2, colors: ['#1a0f2a99', '#12091f66', '#08040f00'], blend: 'alpha', grow: 2.5, shape: 'smoke', spin: 0.7 },
		critical: { amount: 70, life: [0.8, 1.5], size: [0.1, 0.22], speed: [1, 3], direction: 'up', gravity: -1, drag: 1, swirl: 5, colors: ['#ffffff', '#c9a0ff', '#6a2cff', '#1a0a4000'], flicker: 0.4 },
		auraSeconds: 3
	},
	// Toxic: acid mist and puddles, bubbles and fumes.
	poison: {
		trail: { amount: 55, life: [0.4, 0.9], size: [0.15, 0.3], speed: [0.1, 0.5], direction: 'sphere', gravity: -0.5, drag: 1.4, colors: ['#d9ffb3aa', '#7dff4a88', '#2fa81b44', '#0a3a0500'], grow: 1.6 },
		ground: { amount: 14, life: [1.2, 2], size: [0.16, 0.3], speed: [0, 0.04], direction: 'out', drag: 2, colors: ['#c7ff8a', '#6fdc3acc', '#2f8f1b66', '#0a3a0500'], flicker: 0.2, grow: 0.8 },
		impact: POISON_HIT,
		collision: POISON_HIT,
		settle: { amount: 10, life: [0.8, 1.4], size: [0.08, 0.16], speed: [0.3, 0.8], direction: 'up', gravity: -1.2, drag: 0.8, colors: ['#e8ffd9', '#8cff5caa', '#3fbf1f00'], grow: 1.4, shape: 'ring' },
		aura: { amount: 8, life: [1.2, 2], size: [0.25, 0.4], speed: [0.1, 0.4], direction: 'up', gravity: -0.6, drag: 1, colors: ['#5f8f3a55', '#3d6b2444', '#1f3a1200'], blend: 'alpha', grow: 2.6, shape: 'smoke', spin: 0.5 },
		explode: { amount: 30, life: [0.9, 1.5], size: [0.35, 0.7], speed: [1, 2.6], direction: 'sphere', gravity: -0.4, drag: 2, colors: ['#6fa84a77', '#3d6b2455', '#1f3a1200'], blend: 'alpha', grow: 2.5, shape: 'smoke', spin: 0.6 },
		critical: { amount: 50, life: [0.9, 1.6], size: [0.08, 0.2], speed: [0.8, 2.2], direction: 'up', gravity: -2, drag: 0.8, swirl: 1, colors: ['#e8ffd9', '#8cff5c', '#3fbf1f00'], grow: 1.5, shape: 'ring' },
		auraSeconds: 3
	},
	// Nature: leaves, pollen and fireflies, blossoms when a die rests or a critical lands.
	nature: {
		trail: { amount: 18, life: [0.9, 1.5], size: [0.1, 0.17], speed: [0.2, 0.8], direction: 'sphere', gravity: 2.5, drag: 1.8, colors: PAPER, palette: LEAVES, blend: 'alpha', grow: 1, shape: 'confetti', spin: 6 },
		ground: { amount: 6, life: [1.5, 2.5], size: [0.09, 0.15], speed: [0, 0.05], direction: 'out', drag: 3, colors: PAPER, palette: LEAVES, blend: 'alpha', grow: 1, shape: 'confetti', spin: 0.4 },
		impact: { amount: 12, life: [0.5, 1], size: [0.1, 0.2], speed: [0.6, 1.6], direction: 'out', gravity: -0.4, drag: 2.5, colors: ['#fffbd1', '#e8f27aaa', '#b6d94c00'], flicker: 0.5 },
		collision: { amount: 6, life: [0.8, 1.3], size: [0.1, 0.16], speed: [1, 2.4], direction: 'up', gravity: 4, drag: 1.5, colors: PAPER, palette: LEAVES, blend: 'alpha', grow: 1, shape: 'confetti', spin: 8 },
		settle: { amount: 14, life: [1, 1.6], size: [0.1, 0.16], speed: [1.2, 2.6], direction: 'up', gravity: 4, drag: 1.5, colors: PAPER, palette: BLOSSOM, blend: 'alpha', grow: 1, shape: 'confetti', spin: 8 },
		aura: { amount: 6, life: [1.4, 2.4], size: [0.05, 0.1], speed: [0.1, 0.35], direction: 'up', gravity: -0.2, drag: 0.4, swirl: 1.5, colors: ['#fffbd1', '#e8f27acc', '#b6d94c00'], flicker: 1 },
		explode: { amount: 40, life: [1, 1.6], size: [0.11, 0.18], speed: [2, 4.5], direction: 'sphere', gravity: 4, drag: 1.4, colors: PAPER, palette: LEAVES, blend: 'alpha', grow: 1, shape: 'confetti', spin: 9 },
		critical: { amount: 80, life: [1.2, 2], size: [0.1, 0.18], speed: [2, 5], direction: 'up', gravity: 3, drag: 1.2, swirl: 0.6, colors: PAPER, palette: BLOSSOM, blend: 'alpha', grow: 1, shape: 'confetti', spin: 10 },
		auraSeconds: 4
	},
	// Arcane and starlight: stardust, nebula trails on the table and a spiral galaxy.
	cosmic: {
		trail: { amount: 50, life: [0.5, 1], size: [0.1, 0.22], speed: [0.1, 0.5], direction: 'sphere', gravity: -0.2, drag: 1.2, colors: STAR_FADE, palette: STARLIGHT, flicker: 0.6, shape: 'star', spin: 1 },
		ground: { amount: 10, life: [1.4, 2.4], size: [0.25, 0.45], speed: [0, 0.06], direction: 'out', drag: 2, colors: ['#ffffff66', '#ffffff33', '#ffffff00'], palette: ['#6a4cff', '#3a7bff', '#c04cff', '#ff4cc9'], grow: 1.5 },
		impact: { amount: 3, life: [0.45, 0.8], size: [0.35, 0.6], speed: [0, 0.1], direction: 'out', drag: 2, colors: ['#ffffff', '#c7d8ff', '#6a4cff00'], grow: 2.8, shape: 'ring' },
		collision: { amount: 10, life: [0.4, 0.8], size: [0.1, 0.2], speed: [1.2, 2.8], direction: 'sphere', drag: 1.5, colors: STAR_FADE, palette: STARLIGHT, flicker: 0.5, shape: 'star', spin: 1.5 },
		settle: { amount: 14, life: [0.8, 1.4], size: [0.1, 0.2], speed: [0.4, 1], direction: 'up', gravity: -0.8, drag: 1, colors: STAR_FADE, palette: STARLIGHT, flicker: 0.7, shape: 'star', spin: 1 },
		aura: { amount: 10, life: [1, 1.8], size: [0.08, 0.16], speed: [0.3, 0.7], direction: 'out', gravity: -0.2, drag: 0.6, swirl: 4, colors: STAR_FADE, palette: STARLIGHT, flicker: 0.8, shape: 'star', spin: 1 },
		explode: { amount: 60, life: [0.6, 1.2], size: [0.2, 0.45], speed: [3, 6], direction: 'sphere', drag: 1.6, colors: ['#ffffff', '#ffffffcc', '#ffffff00'], palette: ['#6a4cff', '#3a7bff', '#c04cff', '#ff4cc9', '#ffffff'], grow: 0.6 },
		critical: { amount: 100, life: [1, 1.8], size: [0.1, 0.22], speed: [1.2, 3], direction: 'out', gravity: -0.3, drag: 0.8, swirl: 6, colors: ['#ffffff', '#ffffffcc', '#ffffff00'], palette: STARLIGHT, flicker: 0.5, shape: 'star', spin: 1.5 },
		auraSeconds: 4
	},
	// Lightning: arcs crackling around the dice, bolts on every hit and a thunderclap on criticals.
	lightning: {
		trail: { amount: 30, life: [0.06, 0.14], size: [0.35, 0.6], speed: [0.2, 0.8], direction: 'sphere', drag: 6, colors: ['#ffffff', '#d6f0ff', '#6fb8ff99', '#3a6bff00'], flicker: 0.6, shape: 'arc' },
		ground: { amount: 6, life: [0.5, 0.9], size: [0.3, 0.5], speed: [0, 0.02], direction: 'out', drag: 3, colors: ['#e6f7ff', '#7fc4ffaa', '#2a6bff00'], flicker: 0.9, shape: 'arc' },
		impact: LIGHTNING_HIT,
		collision: { amount: 3, life: [0.08, 0.16], size: [0.5, 0.8], speed: [0, 0.3], direction: 'sphere', drag: 6, colors: LIGHTNING, flicker: 0.8, shape: 'arc' },
		settle: { amount: 4, life: [0.12, 0.25], size: [0.8, 1.2], speed: [0.5, 1.5], direction: 'out', drag: 6, colors: LIGHTNING, flicker: 0.6, shape: 'bolt' },
		aura: { amount: 8, life: [0.08, 0.18], size: [0.4, 0.7], speed: [0, 0.2], direction: 'sphere', drag: 5, colors: LIGHTNING, flicker: 0.8, shape: 'arc' },
		explode: { amount: 10, life: [0.12, 0.3], size: [1, 1.6], speed: [3, 6], direction: 'sphere', drag: 6, colors: LIGHTNING, flicker: 0.6, shape: 'bolt' },
		critical: { amount: 14, life: [0.15, 0.35], size: [1.2, 2], speed: [2, 5], direction: 'out', drag: 5, colors: LIGHTNING, flicker: 0.8, shape: 'bolt' },
		link: { amount: 26, life: [0.08, 0.18], size: [1.05, 1.15], speed: [0, 0], grow: 1, colors: ['#ffffff', '#f0f9ff', '#a8d8ffdd', '#5a8cff00'], flicker: 0.3, shape: 'bolt', orient: 'random' },
		auraSeconds: 2,
		linkDistance: 9,
		linkSeconds: 2.5
	},
	// Blizzard: snowflakes swirling behind the dice and settling as frost.
	blizzard: {
		trail: { amount: 40, life: [0.8, 1.5], size: [0.12, 0.24], speed: [0.2, 0.7], direction: 'sphere', gravity: 0.6, drag: 1.5, swirl: 1.2, colors: SNOW, shape: 'snowflake', spin: 1.2 },
		ground: { amount: 10, life: [1.4, 2.4], size: [0.14, 0.26], speed: [0, 0.03], direction: 'out', drag: 3, colors: ['#ffffffcc', '#d6f0ff88', '#a6dcff00'], shape: 'snowflake', spin: 0.2 },
		impact: SNOW_HIT,
		collision: SNOW_HIT,
		settle: { amount: 3, life: [0.6, 1], size: [0.5, 0.8], speed: [0, 0.1], direction: 'out', drag: 2, colors: ['#ffffff', '#cdeeff', '#8fd0ff00'], grow: 2.5, shape: 'ring' },
		aura: { amount: 10, life: [1.2, 2], size: [0.1, 0.2], speed: [0.2, 0.5], direction: 'out', gravity: -0.1, drag: 0.5, swirl: 3, colors: SNOW, shape: 'snowflake', spin: 1 },
		explode: { amount: 40, life: [0.8, 1.4], size: [0.14, 0.28], speed: [2.5, 5], direction: 'sphere', drag: 1.8, colors: SNOW, shape: 'snowflake', spin: 3 },
		critical: { amount: 80, life: [1.2, 2], size: [0.14, 0.3], speed: [1, 3], direction: 'out', drag: 0.8, swirl: 5, colors: SNOW, shape: 'snowflake', spin: 2 },
		auraSeconds: 3.5
	},
	// Hearts rising from the dice, always upright.
	hearts: {
		trail: { amount: 24, life: [0.7, 1.2], size: [0.14, 0.24], speed: [0.2, 0.6], direction: 'up', gravity: -0.6, drag: 1.4, colors: STAR_FADE, palette: HEARTS, shape: 'heart', orient: 'upright' },
		ground: { amount: 6, life: [1.2, 2], size: [0.12, 0.2], speed: [0, 0.04], direction: 'out', drag: 3, colors: ['#ffffffaa', '#ffffff55', '#ffffff00'], palette: HEARTS, shape: 'heart', orient: 'upright' },
		impact: HEART_HIT,
		collision: HEART_HIT,
		settle: { amount: 8, life: [0.9, 1.4], size: [0.16, 0.26], speed: [0.6, 1.4], direction: 'up', gravity: -1, drag: 1.2, colors: STAR_FADE, palette: HEARTS, flicker: 0.2, shape: 'heart', orient: 'upright' },
		aura: { amount: 5, life: [1.2, 2], size: [0.12, 0.2], speed: [0.2, 0.5], direction: 'up', gravity: -0.6, drag: 0.6, swirl: 1, colors: STAR_FADE, palette: HEARTS, shape: 'heart', orient: 'upright' },
		explode: { amount: 30, life: [0.8, 1.4], size: [0.16, 0.3], speed: [2, 4], direction: 'sphere', drag: 1.6, colors: STAR_FADE, palette: HEARTS, shape: 'heart', orient: 'upright' },
		critical: { amount: 50, life: [1.2, 2], size: [0.2, 0.36], speed: [1, 2.6], direction: 'up', gravity: -0.8, drag: 1, swirl: 1.5, colors: STAR_FADE, palette: HEARTS, shape: 'heart', orient: 'upright' },
		auraSeconds: 3
	}
})
