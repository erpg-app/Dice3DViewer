import { PARTICLE_PRESETS } from '../src/render/particlePresets'
import type {
	DiceParticleOptions,
	DiceParticlePreset,
	ParticleBurstMoment,
	ParticleEffectDefinition,
	ParticleMoment,
	ParticleOrientation,
	ParticleShape
} from '../src'

/**
 * Particle editor of the test page and the workshop. It edits a full effect
 * definition (one emitter per moment of the roll, with its conditions),
 * starting from a preset or mixing moments of different presets, and hands
 * `DiceParticleOptions` to the viewer. It lives in the demo only: the library
 * just takes the resulting definition.
 */

type Direction = 'up' | 'out' | 'sphere' | 'back'
type Faces = 'max' | 'min' | number[]

interface EditableCondition {
	minForce?: number
	minSpeed?: number
	sides?: number[]
	faces?: Faces
	chance?: number
	cooldown?: number
}

interface EditableEmitter {
	amount: number
	life: [number, number]
	size: [number, number]
	speed: [number, number]
	direction?: Direction
	gravity?: number
	drag?: number
	swirl?: number
	grow?: number
	flicker?: number
	shape?: ParticleShape
	image?: string
	orient?: ParticleOrientation
	spin?: number
	blend?: 'add' | 'alpha'
	colors: string[]
	palette?: string[]
	when?: EditableCondition
}

type EditableEffect = { [moment in ParticleMoment]?: EditableEmitter } & { auraSeconds?: number }

interface EditorState {
	base: DiceParticlePreset | 'custom' | ''
	edited: boolean
	effect: EditableEffect
	enabled: Record<ParticleMoment, boolean>
	selected: ParticleMoment
	intensity: number
	size: number
	tint: string | null
	shape: ParticleShape | ''
}

export interface ParticleEditorOptions {
	/** localStorage key of the editor state (one per page). */
	readonly storageKey?: string
}

export interface ParticleEditor {
	/** Current particle options (null = no effect). */
	options(): DiceParticleOptions | null
	/** Loads particle options (e.g. from a look file) into the editor. */
	load(particles: DiceParticleOptions | null): void
}

export interface ParticleEditorHandlers {
	/** New particle options (null = no effect). */
	readonly onChange: (particles: DiceParticleOptions | null) => void
	/** Plays a burst moment on the dice on the table. */
	readonly onTest: (moment: ParticleBurstMoment) => void
	/** Rolls the same throw again (trails need motion). */
	readonly onReroll: () => void
}

const MOMENTS: readonly { readonly id: ParticleMoment; readonly label: string; readonly unit: string; readonly hint: string }[] = [
	{ id: 'trail', label: 'rastro no ar', unit: 'partículas/s (a 6 u/s)', hint: 'Enquanto o dado voa; cresce com a velocidade.' },
	{ id: 'ground', label: 'rastro no chão', unit: 'por unidade percorrida', hint: 'Marcas na mesa enquanto o dado rola nela.' },
	{ id: 'impact', label: 'impacto na mesa', unit: 'por impacto', hint: 'O dado bate forte na mesa.' },
	{ id: 'collision', label: 'colisão entre dados', unit: 'por colisão', hint: 'Dois dados se chocam (a explosão sai entre eles, a 70% da força).' },
	{ id: 'settle', label: 'ao parar', unit: 'por dado', hint: 'Quando o dado para.' },
	{ id: 'aura', label: 'aura', unit: 'partículas/s', hint: 'Em volta do dado parado, apagando ao longo da duração.' },
	{ id: 'explode', label: 'explosão', unit: 'por explosão', hint: 'Um dado explodido nasce do pai.' },
	{ id: 'critical', label: 'crítico', unit: 'por dado', hint: 'Sucesso ou falha crítica na timeline.' },
	{ id: 'link', label: 'entre dados', unit: 'partículas/s por par', hint: 'Energia ligando cada par de dados enquanto rolam e um pouco depois (raio/arco, vida curta, tamanho ~1,1 = distância).' }
]
const BURSTS: ReadonlySet<ParticleMoment> = new Set(['impact', 'collision', 'settle', 'aura', 'explode', 'critical'])
export const PRESETS: readonly [DiceParticlePreset, string][] = [
	['sparkle', 'cintilante'], ['fire', 'fogo'], ['arcane', 'arcano'], ['frost', 'gelo'],
	['electric', 'elétrico'], ['confetti', 'confete'], ['smoke', 'fumaça'], ['dust', 'poeira'],
	['lava', 'lava (fogo + terra)'], ['storm', 'tempestade (raio + nuvem)'], ['holy', 'sagrado (luz + estrelas)'],
	['shadow', 'sombra (vazio + arcano)'], ['poison', 'veneno (ácido + fumaça)'], ['nature', 'natureza (folhas + pólen)'],
	['cosmic', 'cósmico (estrelas + nebulosa)'], ['lightning', 'raio (arcos + relâmpagos)'],
	['blizzard', 'nevasca (flocos de neve)'], ['hearts', 'corações']
]
const SHAPES: readonly [ParticleShape, string][] = [
	['soft', 'luz suave'], ['spark', 'faísca'], ['star', 'estrela'], ['ring', 'anel'], ['confetti', 'confete'], ['smoke', 'fumaça'],
	['bolt', 'raio'], ['arc', 'arco elétrico'], ['flame', 'chama'], ['snowflake', 'floco de neve'], ['heart', 'coração'],
	['diamond', 'diamante'], ['triangle', 'triângulo'], ['cross', 'cruz']
]
const ORIENTATIONS: readonly [ParticleOrientation, string][] = [
	['random', 'aleatória'], ['upright', 'em pé'], ['motion', 'segue o movimento']
]
const DIRECTIONS: readonly [Direction, string][] = [
	['sphere', 'todas as direções'], ['up', 'para cima'], ['out', 'para os lados'], ['back', 'contra o movimento']
]
const SIDES = [2, 4, 6, 8, 10, 12, 20, 100]
const DEFAULT_STORAGE_KEY = 'dice3dview-demo-particle-editor'

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T

const allEnabled = (): Record<ParticleMoment, boolean> =>
	Object.fromEntries(MOMENTS.map(moment => [moment.id, true])) as Record<ParticleMoment, boolean>

const newEmitter = (moment: ParticleMoment): EditableEmitter => moment === 'ground'
	? { amount: 14, life: [0.8, 1.6], size: [0.1, 0.2], speed: [0, 0.1], direction: 'out', drag: 2, colors: ['#ffffff', '#ffd166cc', '#ff9f1c00'] }
	: { amount: moment === 'trail' ? 60 : moment === 'aura' ? 12 : 20, life: [0.4, 0.9], size: [0.1, 0.2], speed: [0.5, 1.5], direction: 'sphere', colors: ['#ffffff', '#ffd166', '#ff9f1c00'] }

/** `#rrggbb` and alpha 0..1 from `#rgb`, `#rrggbb` or `#rrggbbaa`. */
const splitColor = (color: string): { hex: string; alpha: number } => {
	const raw = color.replace('#', '')
	const full = raw.length === 3 ? raw.split('').map(digit => digit + digit).join('') : raw
	return { hex: `#${full.slice(0, 6)}`, alpha: full.length === 8 ? parseInt(full.slice(6, 8), 16) / 255 : 1 }
}
const joinColor = (hex: string, alpha: number): string =>
	alpha >= 0.999 ? hex : `${hex}${Math.round(Math.max(0, Math.min(1, alpha)) * 255).toString(16).padStart(2, '0')}`

const h = <K extends keyof HTMLElementTagNameMap>(tag: K, props: Record<string, unknown> = {}, ...children: (Node | string)[]): HTMLElementTagNameMap[K] => {
	const element = document.createElement(tag)
	for(const [key, value] of Object.entries(props)) {
		if(key === 'class') element.className = String(value)
		else (element as unknown as Record<string, unknown>)[key] = value
	}
	element.append(...children)
	return element
}

const select = <T extends string>(options: readonly (readonly [T, string])[], value: string, onChange: (value: T) => void): HTMLSelectElement => {
	const element = h('select', {}, ...options.map(([id, label]) => h('option', { value: id, textContent: label })))
	element.value = value
	element.addEventListener('change', () => onChange(element.value as T))
	return element
}

/** Range and number input kept in sync. */
const slider = (label: string, value: number, min: number, max: number, step: number, onInput: (value: number) => void, title = ''): HTMLLabelElement => {
	const range = h('input', { type: 'range', min: String(min), max: String(max), step: String(step), value: String(value) })
	const number = h('input', { type: 'number', min: String(min), max: String(max), step: String(step), value: String(value), class: 'num' })
	const set = (next: number, source: HTMLInputElement): void => {
		if(!Number.isFinite(next)) return
		if(source !== range) range.value = String(next)
		if(source !== number) number.value = String(next)
		onInput(next)
	}
	range.addEventListener('input', () => set(Number(range.value), range))
	number.addEventListener('change', () => set(Number(number.value), number))
	return h('label', { class: 'field', title }, label, range, number)
}

/** `[min, max]` pair; typing a min above the max moves the max too (and vice versa). */
const pair = (label: string, value: [number, number], min: number, step: number, unit: string, onInput: () => void): HTMLLabelElement => {
	const low = h('input', { type: 'number', min: String(min), step: String(step), value: String(value[0]), class: 'num' })
	const high = h('input', { type: 'number', min: String(min), step: String(step), value: String(value[1]), class: 'num' })
	const sync = (edited: 'low' | 'high'): void => {
		const a = Math.max(min, Number(low.value) || 0), b = Math.max(min, Number(high.value) || 0)
		value[0] = edited === 'low' ? a : Math.min(a, b)
		value[1] = edited === 'high' ? b : Math.max(a, b)
		low.value = String(value[0])
		high.value = String(value[1])
		onInput()
	}
	low.addEventListener('change', () => sync('low'))
	high.addEventListener('change', () => sync('high'))
	return h('label', { class: 'field' }, label, low, '–', high, h('small', { textContent: unit }))
}

const initialState = (): EditorState => ({
	base: '',
	edited: false,
	effect: {},
	enabled: allEnabled(),
	selected: 'trail',
	intensity: 1,
	size: 1,
	tint: null,
	shape: ''
})

const restore = (key: string): EditorState => {
	try {
		const saved = localStorage.getItem(key)
		if(saved) return { ...initialState(), ...JSON.parse(saved) as Partial<EditorState> }
	} catch {
		// No storage (private window): start fresh.
	}
	return initialState()
}

export const createParticleEditor = (root: HTMLElement, handlers: ParticleEditorHandlers, settings: ParticleEditorOptions = {}): ParticleEditor => {
	const storageKey = settings.storageKey ?? DEFAULT_STORAGE_KEY
	const state = restore(storageKey)
	let timer: ReturnType<typeof setTimeout> | undefined

	const options = (): DiceParticleOptions | null => {
		if(!state.base) return null
		const off = MOMENTS.filter(moment => !state.enabled[moment.id]).map(moment => [moment.id, false] as const)
		return {
			effect: clone(state.effect) as ParticleEffectDefinition,
			intensity: state.intensity,
			size: state.size,
			...(state.tint ? { color: state.tint } : {}),
			...(state.shape ? { shape: state.shape } : {}),
			...(off.length ? { moments: Object.fromEntries(off) } : {})
		}
	}

	const save = (): void => {
		try {
			localStorage.setItem(storageKey, JSON.stringify(state))
		} catch {
			// Storage unavailable: the editor still works for this visit.
		}
	}

	/** Applies the edit (debounced: sliders fire on every step). */
	const changed = (edited = true): void => {
		if(edited && state.base) state.edited = true
		editedBadge.hidden = !state.edited
		save()
		clearTimeout(timer)
		timer = setTimeout(() => handlers.onChange(options()), 120)
	}

	const load = (preset: DiceParticlePreset | ''): void => {
		state.base = preset
		state.edited = false
		state.effect = preset ? clone(PARTICLE_PRESETS[preset]) as EditableEffect : {}
		state.enabled = allEnabled()
		if(preset && !state.effect[state.selected]) state.selected = MOMENTS.find(moment => state.effect[moment.id])?.id ?? 'trail'
		render()
		changed(false)
	}

	// ---------- top: base effect and global adjustments ----------
	const baseSelect = select<DiceParticlePreset | '' | 'custom'>([['', 'nenhum'], ...PRESETS, ['custom', 'personalizado (JSON)']], state.base, value => {
		if(value === 'custom') {
			state.base = 'custom'
			state.edited = true
			render()
			changed()
		} else load(value)
	})
	const editedBadge = h('span', { class: 'badge', textContent: 'editado', hidden: !state.edited })
	const resetButton = h('button', { type: 'button', textContent: '↺ restaurar', title: 'Volta o efeito base ao original' })
	resetButton.addEventListener('click', () => load(state.base === 'custom' ? '' : state.base))
	const rerollButton = h('button', { type: 'button', textContent: '▶ rolar de novo', title: 'Repete a mesma rolagem (mesma semente)' })
	rerollButton.addEventListener('click', () => handlers.onReroll())

	/** Adjustments over every emitter (the library's `intensity`, `size`, `color` and `shape`). */
	const globals = h('div')
	const renderGlobals = (): void => {
		const tintToggle = h('input', { type: 'checkbox', checked: Boolean(state.tint) })
		const tintColor = h('input', { type: 'color', value: state.tint ?? '#4cc9f0', ariaLabel: 'Cor de todas as partículas', disabled: !state.tint })
		const applyTint = (): void => {
			state.tint = tintToggle.checked ? tintColor.value : null
			tintColor.disabled = !tintToggle.checked
			changed()
		}
		tintToggle.addEventListener('change', applyTint)
		tintColor.addEventListener('input', applyTint)
		const shapeOverride = select<ParticleShape | ''>([['', 'de cada emissor'], ...SHAPES], state.shape, value => {
			state.shape = value
			changed()
		})
		globals.replaceChildren(
			h('div', { class: 'row' },
				slider('intensidade', state.intensity, 0, 3, 0.1, value => { state.intensity = value; changed() }),
				slider('tamanho', state.size, 0.2, 4, 0.1, value => { state.size = value; changed() })),
			h('div', { class: 'row' },
				h('label', {}, tintToggle, ' cor de tudo'), tintColor,
				h('label', {}, 'forma de tudo ', shapeOverride))
		)
	}

	const tabs = h('div', { class: 'moment-tabs' })
	const panel = h('div', { class: 'emitter' })
	const status = h('p', { class: 'hint editor-status' })

	// ---------- JSON import / export ----------
	const json = h('textarea', { rows: 6, spellcheck: false, placeholder: 'Cole aqui um ParticleEffectDefinition ou DiceParticleOptions' })
	const copyButton = h('button', { type: 'button', textContent: 'copiar JSON' })
	copyButton.addEventListener('click', () => {
		const text = JSON.stringify(options(), null, 2)
		json.value = text
		void navigator.clipboard?.writeText(text).then(() => { status.textContent = 'JSON copiado.' }, () => { status.textContent = 'JSON no campo abaixo (a cópia automática falhou).' })
	})
	const importButton = h('button', { type: 'button', textContent: 'aplicar JSON' })
	importButton.addEventListener('click', () => {
		try {
			const parsed = JSON.parse(json.value) as Record<string, unknown>
			const isOptions = 'effect' in parsed || 'preset' in parsed
			const effect = isOptions
				? (parsed.effect ?? (parsed.preset ? PARTICLE_PRESETS[parsed.preset as DiceParticlePreset] : {}))
				: parsed
			state.base = 'custom'
			state.edited = true
			state.effect = clone(effect) as EditableEffect
			state.enabled = allEnabled()
			if(isOptions) {
				state.intensity = typeof parsed.intensity === 'number' ? parsed.intensity : 1
				state.size = typeof parsed.size === 'number' ? parsed.size : 1
				state.tint = typeof parsed.color === 'string' ? parsed.color : null
				state.shape = typeof parsed.shape === 'string' ? parsed.shape as ParticleShape : ''
				for(const [moment, on] of Object.entries((parsed.moments ?? {}) as Record<string, boolean>)) {
					if(moment in state.enabled) state.enabled[moment as ParticleMoment] = on !== false
				}
			}
			status.textContent = 'JSON aplicado.'
			render()
			changed()
		} catch(error) {
			status.textContent = `JSON inválido: ${error instanceof Error ? error.message : String(error)}`
		}
	})

	root.append(
		h('div', { class: 'row' },
			h('label', {}, 'Efeito base ', baseSelect), editedBadge, resetButton, rerollButton),
		globals,
		tabs,
		panel,
		h('details', { class: 'json' }, h('summary', { textContent: 'JSON (copiar / colar efeito)' }),
			h('div', { class: 'row' }, copyButton, importButton), json),
		status
	)

	// ---------- moment tabs and the emitter panel ----------
	const renderTabs = (): void => {
		tabs.replaceChildren(...MOMENTS.map(moment => {
			const exists = Boolean(state.effect[moment.id])
			const toggle = h('input', { type: 'checkbox', checked: state.enabled[moment.id], disabled: !exists || !state.base, title: 'liga/desliga este momento' })
			toggle.addEventListener('change', () => {
				state.enabled[moment.id] = toggle.checked
				changed()
			})
			const name = h('button', { type: 'button', textContent: exists ? moment.label : `+ ${moment.label}`, class: moment.id === state.selected ? 'active' : '' })
			name.addEventListener('click', () => {
				state.selected = moment.id
				save()
				render()
			})
			return h('span', { class: `tab${exists ? '' : ' missing'}` }, toggle, name)
		}))
	}

	const colorList = (colors: string[], withAlpha: boolean, min: number): HTMLDivElement => {
		const list = h('div', { class: 'colors' })
		const draw = (): void => {
			list.replaceChildren(...colors.map((color, index) => {
				const { hex, alpha } = splitColor(color)
				const picker = h('input', { type: 'color', value: hex })
				const opacity = h('input', { type: 'range', min: '0', max: '1', step: '0.05', value: String(alpha), title: 'opacidade', class: 'alpha' })
				const update = (): void => {
					colors[index] = withAlpha ? joinColor(picker.value, Number(opacity.value)) : picker.value
					changed()
				}
				picker.addEventListener('input', update)
				opacity.addEventListener('input', update)
				const remove = h('button', { type: 'button', textContent: '×', title: 'remover', disabled: colors.length <= min })
				remove.addEventListener('click', () => {
					colors.splice(index, 1)
					draw()
					changed()
				})
				return h('span', { class: 'stop' }, picker, ...(withAlpha ? [opacity] : []), remove)
			}), (() => {
				const add = h('button', { type: 'button', textContent: '+', title: 'adicionar cor' })
				add.addEventListener('click', () => {
					colors.push(colors[colors.length - 1] ?? '#ffffff')
					draw()
					changed()
				})
				return add
			})())
		}
		draw()
		return list
	}

	const renderPanel = (): void => {
		const moment = MOMENTS.find(item => item.id === state.selected)!
		const emitter = state.effect[moment.id]
		const header = h('div', { class: 'row emitter-head' }, h('strong', { textContent: moment.label }), h('span', { class: 'hint', textContent: moment.hint }))
		if(!state.base) {
			panel.replaceChildren(h('p', { class: 'hint', textContent: 'Escolha um efeito base para editar (ou cole um JSON).' }))
			return
		}
		/** Takes this moment from another preset (e.g. confetti on impacts, fire as the trail). */
		const copyFrom = select<DiceParticlePreset | ''>([['', 'copiar de outro efeito…'], ...PRESETS], '', value => {
			if(!value) return
			const source = PARTICLE_PRESETS[value][moment.id]
			if(!source) return
			state.effect[moment.id] = clone(source) as EditableEmitter
			if(moment.id === 'aura' && PARTICLE_PRESETS[value].auraSeconds !== undefined) state.effect.auraSeconds = PARTICLE_PRESETS[value].auraSeconds
			state.enabled[moment.id] = true
			render()
			changed()
		})
		if(!emitter) {
			const create = h('button', { type: 'button', textContent: `criar emissor de ${moment.label}` })
			create.addEventListener('click', () => {
				state.effect[moment.id] = newEmitter(moment.id)
				state.enabled[moment.id] = true
				render()
				changed()
			})
			panel.replaceChildren(header, h('p', { class: 'hint', textContent: 'Este efeito não usa este momento.' }), h('div', { class: 'row' }, create, copyFrom))
			return
		}
		const test = h('button', { type: 'button', textContent: BURSTS.has(moment.id) ? '▶ testar nos dados' : '▶ testar (rola de novo)' })
		test.addEventListener('click', () => {
			if(BURSTS.has(moment.id)) handlers.onTest(moment.id as ParticleBurstMoment)
			else handlers.onReroll()
		})
		const remove = h('button', { type: 'button', textContent: 'remover emissor' })
		remove.addEventListener('click', () => {
			delete state.effect[moment.id]
			render()
			changed()
		})
		header.append(test, remove, copyFrom)

		const numeric = (key: 'gravity' | 'drag' | 'swirl' | 'grow' | 'flicker' | 'spin', label: string, fallback: number, min: number, max: number, step: number, title: string): HTMLLabelElement =>
			slider(label, emitter[key] ?? fallback, min, max, step, value => {
				emitter[key] = value
				changed()
			}, title)

		const usePalette = h('input', { type: 'checkbox', checked: Boolean(emitter.palette) })
		const paletteBox = h('div')
		const drawPalette = (): void => {
			paletteBox.replaceChildren(...(emitter.palette ? [colorList(emitter.palette, false, 1)] : []))
		}
		usePalette.addEventListener('change', () => {
			if(usePalette.checked) emitter.palette = ['#ff4d6d', '#ffd166', '#06d6a0', '#4cc9f0']
			else delete emitter.palette
			drawPalette()
			changed()
		})
		drawPalette()

		panel.replaceChildren(
			header,
			h('div', { class: 'row' },
				slider(`quantidade (${moment.unit})`, emitter.amount, 0, moment.id === 'trail' ? 300 : 150, 1, value => { emitter.amount = value; changed() })),
			h('div', { class: 'row' },
				pair('vida', emitter.life, 0.01, 0.05, 's', () => changed()),
				pair('tamanho', emitter.size, 0, 0.01, 'u', () => changed()),
				pair('velocidade', emitter.speed, 0, 0.1, 'u/s', () => changed())),
			h('div', { class: 'row' },
				h('label', {}, 'direção ', select(DIRECTIONS, emitter.direction ?? 'sphere', value => { emitter.direction = value; changed() })),
				h('label', {}, 'forma ', select(SHAPES, emitter.shape ?? 'soft', value => { emitter.shape = value; changed() })),
				h('label', {}, 'orientação ', select(ORIENTATIONS, emitter.orient ?? (emitter.shape === 'spark' || emitter.shape === 'bolt' ? 'motion' : 'random'), value => { emitter.orient = value; changed() })),
				h('label', {}, 'mistura ', select([['add', 'brilho (soma luz)'], ['alpha', 'opaca (cobre)']] as const, emitter.blend ?? 'add', value => { emitter.blend = value; changed() }))),
			h('div', { class: 'row' },
				numeric('gravity', 'gravidade', 0, -20, 20, 0.1, 'positivo cai, negativo sobe'),
				numeric('drag', 'arrasto', 0, 0, 10, 0.1, 'perda de velocidade por segundo'),
				numeric('swirl', 'redemoinho', 0, -12, 12, 0.1, 'giro em volta do eixo vertical (rad/s)')),
			h('div', { class: 'row' },
				numeric('grow', 'tamanho final', 0.3, 0, 5, 0.05, 'fator do tamanho no fim da vida'),
				numeric('flicker', 'cintilação', 0, 0, 1, 0.05, 'piscar aleatório'),
				numeric('spin', 'giro', 0, -20, 20, 0.5, 'rotação do sprite (rad/s); faíscas seguem o movimento')),
			h('div', { class: 'row' },
				h('label', {}, 'imagem (URL, troca a forma) ', h('input', { type: 'url', value: emitter.image ?? '', placeholder: 'https://…/sprite.png', onchange: (event: Event) => {
					const value = (event.target as HTMLInputElement).value.trim()
					if(value) emitter.image = value
					else delete emitter.image
					changed()
				} }))),
			h('div', { class: 'row colors-row' }, h('span', { textContent: 'cores ao longo da vida' }), colorList(emitter.colors, true, 1)),
			h('div', { class: 'row colors-row' }, h('label', {}, usePalette, ' paleta (cada partícula sorteia uma cor)'), paletteBox),
			...(moment.id === 'aura'
				? [h('div', { class: 'row' }, slider('duração da aura (s)', state.effect.auraSeconds ?? 2.5, 0, 10, 0.1, value => { state.effect.auraSeconds = value; changed() }))]
				: []),
			conditions(moment.id, emitter)
		)
	}

	/** The `when` conditions that make sense for this moment. */
	const conditions = (moment: ParticleMoment, emitter: EditableEmitter): HTMLElement => {
		const when = (): EditableCondition => (emitter.when ??= {})
		const tidy = (): void => {
			if(emitter.when && !Object.keys(emitter.when).length) delete emitter.when
			changed()
		}
		const setNumber = (key: 'minForce' | 'minSpeed' | 'chance' | 'cooldown', value: number, neutral: number): void => {
			if(value === neutral) delete when()[key]
			else when()[key] = value
			tidy()
		}
		const rows: HTMLElement[] = []
		if(moment === 'impact' || moment === 'collision') {
			rows.push(h('div', { class: 'row' },
				slider('força mínima', emitter.when?.minForce ?? 0, 0, 20, 0.5, value => setNumber('minForce', value, 0), 'velocidade do golpe × massa: toques leves ~1, arremessos fortes 8..15')))
		}
		if(BURSTS.has(moment) && moment !== 'aura') {
			rows.push(h('div', { class: 'row' },
				slider('intervalo por dado (s)', emitter.when?.cooldown ?? 0, 0, 3, 0.05, value => setNumber('cooldown', value, 0), 'tempo mínimo entre dois disparos do mesmo dado')))
		}
		if(moment === 'trail' || moment === 'ground') {
			rows.push(h('div', { class: 'row' },
				slider('velocidade mínima (u/s)', emitter.when?.minSpeed ?? 0, 0, 20, 0.5, value => setNumber('minSpeed', value, 0))))
		}
		const sideBoxes = SIDES.map(side => {
			const box = h('input', { type: 'checkbox', checked: emitter.when?.sides?.includes(side) ?? false })
			box.addEventListener('change', () => {
				const chosen = sideBoxes.filter(item => item.box.checked).map(item => item.side)
				if(chosen.length) when().sides = chosen
				else delete when().sides
				tidy()
			})
			return { side, box, label: h('label', {}, box, `d${side}`) }
		})
		const parseValues = (text: string): number[] => text.split(/[\s,;]+/).filter(Boolean).map(Number).filter(Number.isFinite)
		const faces = emitter.when?.faces
		const facesValues = h('input', { type: 'text', value: Array.isArray(faces) ? faces.join(', ') : '', placeholder: 'ex.: 1, 20', class: 'values', hidden: !Array.isArray(faces) })
		const facesSelect = select<'any' | 'max' | 'min' | 'list'>([['any', 'qualquer resultado'], ['max', 'face máxima (ex.: 20 natural)'], ['min', 'face mínima (1)'], ['list', 'valores…']],
			faces === undefined ? 'any' : Array.isArray(faces) ? 'list' : faces, value => {
				facesValues.hidden = value !== 'list'
				if(value === 'any') delete when().faces
				else if(value === 'list') when().faces = parseValues(facesValues.value)
				else when().faces = value
				tidy()
			})
		facesValues.addEventListener('change', () => {
			when().faces = parseValues(facesValues.value)
			tidy()
		})
		rows.push(
			h('div', { class: 'row' }, h('span', { textContent: 'só nos dados' }), ...sideBoxes.map(item => item.label), h('small', { class: 'hint', textContent: '(nenhum = todos)' })),
			h('div', { class: 'row' },
				h('label', {}, 'resultado ', facesSelect), facesValues,
				slider('chance', emitter.when?.chance ?? 1, 0, 1, 0.05, value => setNumber('chance', value, 1),
					BURSTS.has(moment) ? 'probabilidade a cada evento' : 'sorteada uma vez por dado e rolagem'))
		)
		return h('fieldset', { class: 'conditions' }, h('legend', { textContent: 'condições' }), ...rows)
	}

	const render = (): void => {
		baseSelect.value = state.base
		editedBadge.hidden = !state.edited
		renderGlobals()
		renderTabs()
		renderPanel()
	}

	/** Loads options from outside (a look file): the definition becomes a custom effect. */
	const loadOptions = (particles: DiceParticleOptions | null): void => {
		if(!particles) {
			Object.assign(state, initialState(), { selected: state.selected })
		} else {
			const effect = particles.effect ?? (particles.preset ? PARTICLE_PRESETS[particles.preset] : {})
			state.base = particles.effect ? 'custom' : particles.preset ?? ''
			state.edited = Boolean(particles.effect)
			state.effect = clone(effect) as EditableEffect
			state.enabled = allEnabled()
			for(const [moment, on] of Object.entries(particles.moments ?? {})) {
				if(moment in state.enabled) state.enabled[moment as ParticleMoment] = on !== false
			}
			state.intensity = particles.intensity ?? 1
			state.size = particles.size ?? 1
			state.tint = particles.color ?? null
			state.shape = particles.shape ?? ''
		}
		render()
		save()
		clearTimeout(timer)
		handlers.onChange(options())
	}

	render()
	return { options, load: loadOptions }
}
