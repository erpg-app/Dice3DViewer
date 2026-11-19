/**
 * Dice built in code instead of coming from the theme model: the uncommon
 * shapes sold as "Zocchi dice" (the funky dice of Dungeon Crawl Classics).
 * Their geometry lives in `proceduralDice.ts`, fetched on first use.
 */
export const PROCEDURAL_SIDES = [3, 5, 7, 14, 16, 24, 30] as const
export type ProceduralSides = typeof PROCEDURAL_SIDES[number]
export type ProceduralDieType = `d${ProceduralSides}`

export const isProceduralSides = (sides: number): sides is ProceduralSides =>
	(PROCEDURAL_SIDES as readonly number[]).includes(sides)
