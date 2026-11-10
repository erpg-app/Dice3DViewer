import type { DiceParticlePreset, ParticleEffectDefinition } from './types'
import { loadModule } from './loadModule'
import { presetsUrl } from './runtimeAssets'

let presets: Promise<Readonly<Record<DiceParticlePreset, ParticleEffectDefinition>>> | undefined

/**
 * The built-in particle effects (definitions for every preset name). They are
 * a separate chunk, downloaded on the first call, so apps can list or remix
 * them (e.g. in their own editor) without weighing on the core module.
 */
export const loadParticlePresets = (): Promise<Readonly<Record<DiceParticlePreset, ParticleEffectDefinition>>> =>
	presets ??= loadModule<typeof import('./render/particlePresets')>(presetsUrl().href).then(module => module.PARTICLE_PRESETS)
