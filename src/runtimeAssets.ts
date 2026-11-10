export const sceneUrl = (): URL => new URL('./renderers/sceneWorker.ts', import.meta.url)
export const particlesUrl = (): URL => new URL('./render/particles.ts', import.meta.url)
export const presetsUrl = (): URL => new URL('./render/particlePresets.ts', import.meta.url)
