import { rollRpgDice } from '../../rpg-dice-roller/src/index'
import type { DiceResultViewer, DiceSides, DiceTimelineEvent, TimelineDieDefinition } from '../src'

/**
 * Test rolls of the workshop: every value comes from @erpg/dicecore (sibling
 * repository) and dice3dview only presents it.
 */

const SUPPORTED_SIDES: ReadonlySet<number> = new Set([2, 3, 4, 5, 6, 7, 8, 10, 12, 14, 16, 20, 24, 30, 100])

type DiceEvent = { readonly subject: string; readonly type: string; readonly reason?: string; readonly outcome?: string }

const eventKinds = (events: readonly DiceEvent[]): Set<string> =>
	new Set(events.filter(event => event.subject === 'die').map(event => `${event.type}:${event.reason ?? event.outcome ?? ''}`))

/** A seed whose result contains `shows` (e.g. `explode:explode`), so the test roll plays that moment. */
export const seedShowing = (notation: string, shows: string | undefined, base: string): string => {
	if(!shows) return base
	for(let attempt = 0; attempt < 500; attempt++) {
		const seed = attempt ? `${base}~${attempt}` : base
		if(eventKinds(rollRpgDice(notation, { seed }).events as readonly DiceEvent[]).has(shows)) return seed
	}
	return base
}

/** Rolls the notation with dicecore and presents it as a timeline; returns the dicecore output. */
export const rollTimeline = async (viewer: DiceResultViewer, notation: string, seed: string): Promise<string> => {
	const result = rollRpgDice(notation, { seed })
	const supported = result.dice.filter(die => typeof die.sides === 'number' && SUPPORTED_SIDES.has(die.sides))
	if(!supported.length) throw new Error(`${result.output}\nNenhum dado com modelo 3D (d2–d8, d10, d12, d14, d16, d20, d24, d30, d100).`)
	const ids = new Set(supported.map(die => die.id))
	const dice: TimelineDieDefinition[] = supported.map(die => ({ id: die.id, sides: die.sides as DiceSides }))
	const events = result.events.filter(event => event.subject === 'die' && ids.has(event.dieId)) as unknown as DiceTimelineEvent[]
	await viewer.displayTimeline({ id: `workshop-${seed}`, seed, dice, events })
	return result.output
}
