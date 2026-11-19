import { rollMixedDice, rollRpgDice } from '../../rpg-dice-roller/src/index'
import { version } from '../package.json'
import { SKIN_SAMPLES, sampleSkin } from './skins'
import { createParticleEditor } from './particleEditor'
import {
	DiceResultViewer,
	createMixedDisplayRequest,
	isDisplayCancelledError,
	type DiceGlowOptions,
	type DiceParticleOptions,
	type DiceSides,
	type DiceSkinOptions,
	type DiceTimelineEvent,
	type ResolvedDie,
	type TimelineDieDefinition
} from '../src'

/**
 * Test page: every roll is resolved by @erpg/dicecore (sibling repository)
 * and only presented by dice3dview. Query parameters reproduce a roll:
 * `?n=3d6!&seed=abc&color=%23ff0a7a&timeline=0`.
 */

const SUPPORTED_SIDES: ReadonlySet<number> = new Set([2, 3, 4, 5, 6, 7, 8, 10, 12, 14, 16, 20, 24, 30, 100])
const SYSTEM_CALL = /(?:^|;)\s*(?:as|assim|assimilacao|assimilation|dagger|daggerheart|dh|fate|fatedice|v5|vampire|vampirev5|vampiro)\s*\(/i

interface Example {
	readonly label: string
	readonly notation: string
	/** Die event the example exists to show; seeds are searched until it happens. */
	readonly shows?: string
}

const TIMELINE_EXAMPLES: readonly Example[] = [
	{ label: 'explode', notation: '3d6!', shows: 'explode:explode' },
	{ label: 'compound', notation: '2d6!!', shows: 'explode:compound' },
	{ label: 'penetrate', notation: '3d6!p', shows: 'explode:penetrate' },
	{ label: 'reroll', notation: '4d6r<2', shows: 'reroll:reroll' },
	{ label: 'unique', notation: '4d6u', shows: 'reroll:unique' },
	{ label: 'keep 3 de 4', notation: '4d6kh3' },
	{ label: 'vantagem +5', notation: '2d20kh1+5' },
	{ label: 'sucessos', notation: '6d10>=8', shows: 'classify:success' },
	{ label: 'crítico', notation: '1d20cs>19', shows: 'classify:critical-success' },
	{ label: 'falha crítica', notation: '2d20cf<2', shows: 'classify:critical-failure' },
	{ label: 'd%', notation: 'd%' },
	{ label: 'moedas', notation: '4d2' },
	{ label: 'kit d4–d20', notation: 'd4+d6+d8+d10+d12+d20' },
	{ label: 'dados irregulares', notation: 'd3+d5+d7+d14+d16+d24+d30' },
	{ label: '12d6', notation: '12d6' },
	{ label: '60d6', notation: '60d6' }
]

const SYSTEM_EXAMPLES: readonly Example[] = [
	{ label: 'V5 5 dados, 2 fome', notation: 'v5(5,2)' },
	{ label: 'Fate 4dF', notation: 'fate(4)' },
	{ label: 'Assimilação', notation: 'assim(2,1,1)' },
	{ label: 'misto', notation: '2d20kh1+5; v5(4,1); fate(4)' }
]

const $ = <T extends Element>(selector: string): T => {
	const element = document.querySelector<T>(selector)
	if(!element) throw new Error(`Missing ${selector}`)
	return element
}

const form = $<HTMLFormElement>('#notation-form')
const notationInput = $<HTMLInputElement>('#notation')
const colorInput = $<HTMLInputElement>('#color')
const timelineInput = $<HTMLInputElement>('#timeline')
const output = $<HTMLDivElement>('#output')
const metrics = $<HTMLDivElement>('#metrics')
const log = $<HTMLDivElement>('#log')

const params = new URLSearchParams(location.search)
let collisions = 0
let rollCounter = 0
let lastSeed: string | null = null
if(params.has('n')) notationInput.value = params.get('n')!
if(/^#[\da-f]{6}$/i.test(params.get('color') ?? '')) colorInput.value = params.get('color')!
if(params.get('timeline') === '0') timelineInput.checked = false

$('#version').textContent = `v${version}`

const append = (line: string): void => {
	const at = (performance.now() / 1000).toFixed(2).padStart(6)
	log.textContent = `${at}s  ${line}\n${log.textContent ?? ''}`.slice(0, 6000)
}

const initStarted = performance.now()
const viewer = new DiceResultViewer({
	container: '#stage',
	assetPath: '/assets/dice-box/',
	theme: 'default',
	themeColor: colorInput.value,
	scale: 4.6,
	onCollision: () => { collisions++ },
	onThemeLoaded: theme => append(`tema carregado: ${theme.theme}`),
	onTimelineProgress: event => {
		const phase = event.phaseIndex === null ? '' : ` ${event.phaseIndex + 1}/${event.phaseCount}`
		const dice = event.dice.map(die => `${die.value}${die.discarded ? '×' : ''}`).join(' ')
		append(`timeline ${event.stage}${phase}${event.effect ? ` ${event.effect}` : ''} → [${dice}]`)
	}
})
await viewer.init()
const initMs = performance.now() - initStarted

const eventKinds = (events: readonly { readonly subject: string; readonly type: string; readonly reason?: string; readonly outcome?: string }[]): Set<string> =>
	new Set(events.filter(event => event.subject === 'die').map(event => `${event.type}:${event.reason ?? event.outcome ?? ''}`))

/** Finds a seed whose dicecore result contains the event the example exists to show. */
const seedShowing = (example: Example, base: string): string => {
	if(!example.shows) return base
	for(let attempt = 0; attempt < 500; attempt++) {
		const seed = attempt ? `${base}~${attempt}` : base
		if(eventKinds(rollRpgDice(example.notation, { seed }).events).has(example.shows)) return seed
	}
	return base
}

interface Presentation {
	readonly text: string
	readonly dice: number
	run(): Promise<{ readonly durationMs: number; readonly extra: string }>
}

/** Generic notation → dicecore events → 3D timeline (or final faces only). */
const genericPresentation = (notation: string, seed: string, id: string, themeColor: string): Presentation => {
	const result = rollRpgDice(notation, { seed })
	const supported = result.dice.filter(die => typeof die.sides === 'number' && SUPPORTED_SIDES.has(die.sides))
	const ids = new Set(supported.map(die => die.id))
	const skipped = result.dice.length - supported.length
	const text = `${result.output}${skipped ? `\n(${skipped} dado(s) sem modelo 3D omitido(s): d3/dF usam fate() ou mixed)` : ''}`
	if(!supported.length) throw new Error(`${result.output}\nNenhum dado com modelo 3D (d2–d8, d10, d12, d14, d16, d20, d24, d30, d100).`)
	if(!timelineInput.checked) {
		const dice: ResolvedDie[] = supported.map(die => ({
			id: die.id,
			sides: die.sides as DiceSides,
			value: die.value,
			discarded: !die.included,
			themeColor
		}))
		return {
			text,
			dice: dice.length,
			run: async () => ({ durationMs: (await viewer.display({ id, seed, dice })).durationMs, extra: '' })
		}
	}
	const dice: TimelineDieDefinition[] = supported.map(die => ({ id: die.id, sides: die.sides as DiceSides, themeColor }))
	const events = result.events.filter(event => event.subject === 'die' && ids.has(event.dieId)) as unknown as DiceTimelineEvent[]
	return {
		text,
		dice: dice.length,
		run: async () => {
			const shown = await viewer.displayTimeline({ id, seed, dice, events })
			return {
				durationMs: shown.durationMs,
				extra: ` · ${shown.eventCount} eventos em ${shown.phaseCount} fase(s)${shown.degraded ? ' (degradada)' : ''}`
			}
		}
	}
}

/** System or mixed notation → rollMixedDice → one request with the system profiles. */
const mixedPresentation = (notation: string, seed: string, id: string, themeColor: string): Presentation => {
	const result = rollMixedDice(notation, { seed })
	const request = createMixedDisplayRequest({ id, seed, themeColor, dice: result.dice })
	return {
		text: result.output,
		dice: request.dice.length,
		run: async () => ({ durationMs: (await viewer.display(request)).durationMs, extra: '' })
	}
}

/** `repeat` throws the last roll again with the same seed (to compare effects). */
const roll = async (notation: string, example?: Example, repeat = false): Promise<void> => {
	const trimmed = notation.trim()
	if(!trimmed) return
	rollCounter++
	const baseSeed = params.get('seed') && rollCounter === 1 ? params.get('seed')! : `demo-${Date.now().toString(36)}`
	const seed = repeat && lastSeed ? lastSeed : example ? seedShowing(example, baseSeed) : baseSeed
	lastSeed = seed
	const id = `demo-${rollCounter}`
	const url = new URL(location.href)
	url.searchParams.set('n', trimmed)
	url.searchParams.set('seed', seed)
	history.replaceState(null, '', url)
	let presentation: Presentation
	try {
		presentation = SYSTEM_CALL.test(trimmed) || trimmed.includes(';')
			? mixedPresentation(trimmed, seed, id, colorInput.value)
			: genericPresentation(trimmed, seed, id, colorInput.value)
	} catch(error) {
		output.textContent = error instanceof Error ? error.message : String(error)
		metrics.textContent = ''
		return
	}
	output.textContent = presentation.text
	metrics.textContent = `${presentation.dice} dado(s) · rolando…`
	append(`rolar ${trimmed} (seed ${seed})`)
	collisions = 0
	const started = performance.now()
	try {
		const shown = await presentation.run()
		const wall = performance.now() - started
		metrics.textContent = `${presentation.dice} dado(s) · ${Math.round(shown.durationMs)} ms de animação (${Math.round(wall)} ms total) · ${collisions} colisões${shown.extra} · init ${Math.round(initMs)} ms`
	} catch(error) {
		if(isDisplayCancelledError(error)) return
		metrics.textContent = ''
		output.textContent = `${presentation.text}\n\nErro: ${error instanceof Error ? error.message : String(error)}`
		console.error(error)
	}
}

const chips = (container: HTMLElement, examples: readonly Example[]): void => {
	for(const example of examples) {
		const button = document.createElement('button')
		button.type = 'button'
		button.textContent = example.label
		button.title = example.shows ? `${example.notation} (semente escolhida para mostrar ${example.shows})` : example.notation
		button.addEventListener('click', () => {
			notationInput.value = example.notation
			void roll(example.notation, example)
		})
		container.append(button)
	}
}
chips($('#timeline-examples'), TIMELINE_EXAMPLES)
chips($('#system-examples'), SYSTEM_EXAMPLES)

form.addEventListener('submit', event => {
	event.preventDefault()
	void roll(notationInput.value)
})
colorInput.addEventListener('change', () => void viewer.updateOptions({ themeColor: colorInput.value }))
timelineInput.addEventListener('change', () => void roll(notationInput.value))

// Appearance: custom skin (sample or uploaded image), particle effect and the dice's own glow.
const skinSelect = $<HTMLSelectElement>('#skin')
const skinFile = $<HTMLInputElement>('#skin-file')
const skinScale = $<HTMLInputElement>('#skin-scale')
const skinBlend = $<HTMLSelectElement>('#skin-blend')
const skinOpacity = $<HTMLInputElement>('#skin-opacity')
const skinLabels = $<HTMLSelectElement>('#skin-labels')
const glowInput = $<HTMLInputElement>('#glow')
const glowOwn = $<HTMLInputElement>('#glow-own')
const glowColor = $<HTMLInputElement>('#glow-color')
const glowIntensity = $<HTMLInputElement>('#glow-intensity')
const glowLight = $<HTMLInputElement>('#glow-light')
const glowPulse = $<HTMLInputElement>('#glow-pulse')
let uploadedSkin: string | null = null
// Sample skins go between 'do tema' and the upload option.
skinSelect.querySelector('option[value="upload"]')?.before(...SKIN_SAMPLES.map(([id, label]) => new Option(label, id)))

const currentSkin = (): DiceSkinOptions | null => {
	const texture = skinSelect.value === 'upload' ? uploadedSkin : skinSelect.value ? sampleSkin(skinSelect.value) : null
	if(!texture) return null
	return {
		texture,
		scale: Number(skinScale.value),
		blend: skinBlend.value as DiceSkinOptions['blend'] & string,
		opacity: Number(skinOpacity.value),
		labels: skinLabels.value as DiceSkinOptions['labels'] & string
	}
}

const currentGlow = (): DiceGlowOptions | null => glowInput.checked
	? {
		intensity: Number(glowIntensity.value),
		light: glowLight.checked,
		pulse: glowPulse.checked,
		...(glowOwn.checked ? {} : { color: glowColor.value })
	}
	: null

/** Greys out the glow controls while the glow is off. */
const syncControls = (): void => {
	for(const control of [glowOwn, glowIntensity, glowLight, glowPulse]) control.disabled = !glowInput.checked
	glowColor.disabled = !glowInput.checked || glowOwn.checked
}

/** A skin applies to the dice of the next roll, so the demo rolls again. */
const applyLook = async (): Promise<void> => {
	await viewer.updateOptions({ skin: currentSkin() })
	append(`visual: skin ${skinSelect.value || 'do tema'}`)
	void roll(notationInput.value)
}

/** The glow changes live on the dice on the table. */
const applyGlow = (): void => {
	syncControls()
	void viewer.updateOptions({ glow: currentGlow() })
}

/** Particles change live: what is still emitting takes the new effect; "testar" plays a moment now. */
const applyParticles = async (particles: DiceParticleOptions | null): Promise<void> => {
	try {
		await viewer.updateOptions({ particles })
	} catch(error) {
		append(`efeito inválido: ${error instanceof Error ? error.message : String(error)}`)
	}
}

const particleEditor = createParticleEditor($('#particle-editor'), {
	onChange: particles => void applyParticles(particles),
	onTest: moment => {
		viewer.playParticles(moment)
		append(`partículas: ${moment}`)
	},
	onReroll: () => void roll(notationInput.value, undefined, true)
})

$('#skin-upload').addEventListener('click', () => skinFile.click())
skinFile.addEventListener('change', () => {
	const file = skinFile.files?.[0]
	if(!file) return
	if(uploadedSkin) URL.revokeObjectURL(uploadedSkin)
	uploadedSkin = URL.createObjectURL(file)
	skinSelect.value = 'upload'
	void applyLook()
})
skinSelect.addEventListener('change', () => {
	if(skinSelect.value === 'upload' && !uploadedSkin) skinFile.click()
	else void applyLook()
})
for(const control of [skinScale, skinBlend, skinOpacity, skinLabels]) {
	control.addEventListener('change', () => void applyLook())
}
for(const control of [glowInput, glowOwn, glowColor, glowIntensity, glowLight, glowPulse]) {
	control.addEventListener('input', applyGlow)
}
syncControls()
// The editor restores the last effect edited on this browser.
await applyParticles(particleEditor.options())

$('#dicecore-status').textContent = 'Valores resolvidos pelo @erpg/dicecore; o dice3dview apenas apresenta. Sistemas: v5(dados,fome), fate(n), assim(d6,d10,d12,manter).'

if(params.get('auto') !== '0') {
	const initial = [...TIMELINE_EXAMPLES, ...SYSTEM_EXAMPLES].find(example => example.notation === notationInput.value.trim())
	void roll(notationInput.value, params.has('seed') ? undefined : initial)
}
