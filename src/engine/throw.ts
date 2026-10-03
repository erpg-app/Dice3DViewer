import { createSeededRandom } from '../random'
import { computeDisplayViewportBounds, type DisplayViewportBounds } from '../renderers/viewportBounds'
import { DISPLAY_CAMERA_FOV, DISPLAY_CAMERA_HEIGHT } from '../renderers/sceneEnvironment'
import { createPresentationLaunchDynamics, planLaunch, selectPresentationLandingOffset, selectPresentationLaunchEdge, type LaunchEdge, type LaunchPlan } from './launch'
import { supportHeight, type DiceShape } from './shape'
import type { ReadonlyQuat, ReadonlyVec3 } from './vector'

/** One visual body of a throw (a d100 contributes two bodies). */
export interface ThrowBody {
	readonly shape: DiceShape
	readonly value: number
	/** Orientation that places `value` in reading position (landing height of the plan). */
	readonly canonicalTarget: ReadonlyQuat
	readonly coin: boolean
	readonly mass: number
	/** Face artwork "up" for `value`, used to present glyphs upright. */
	readonly readUp?: ReadonlyVec3
}

/** Viewer options consumed by the launch planner and the physics world. */
export interface ThrowOptions {
	readonly width: number
	readonly height: number
	readonly scale: number
	readonly startingHeight: number
	readonly spawnSpacing: number
	readonly spawnHeightStep: number
	readonly spawnOverscan: number
	readonly throwForce: number
	readonly spinForce: number
	readonly delay: number
	readonly aggressiveThrowChance: number
	readonly landingSpread: number
	readonly wallPadding: number
	readonly gravity: number
	readonly friction: number
	readonly restitution: number
	readonly linearDamping: number
	readonly angularDamping: number
	readonly settleTimeout: number
	readonly burstHeight: number
	readonly spread: number
}

export interface ThrowPlan {
	readonly edge: LaunchEdge
	readonly launches: readonly LaunchPlan[]
}

export const stageBounds = (options: Pick<ThrowOptions, 'width' | 'height' | 'wallPadding'>, radius: number): DisplayViewportBounds =>
	computeDisplayViewportBounds({
		width: options.width,
		height: options.height,
		cameraHeight: DISPLAY_CAMERA_HEIGHT,
		cameraFov: DISPLAY_CAMERA_FOV,
		wallPadding: options.wallPadding,
		minimumRadius: radius
	})

/** v2 createTrajectory for every body of one presentation (same seeded draws). */
export const planThrow = (bodies: readonly ThrowBody[], seed: string, options: ThrowOptions): ThrowPlan => {
	const random = createSeededRandom(seed)
	const edge = selectPresentationLaunchEdge(seed, options.width, options.height)
	const dynamics = createPresentationLaunchDynamics(seed, options.aggressiveThrowChance)
	const landingOffset = selectPresentationLandingOffset(seed, options.landingSpread)
	const launches = bodies.map((body, index) => planLaunch({
		seed,
		index,
		count: bodies.length,
		coin: body.coin,
		objectRadius: body.shape.radius,
		supportHeight: supportHeight(body.shape, body.canonicalTarget),
		bounds: stageBounds(options, body.shape.radius),
		launchEdge: edge,
		landingOffset,
		dynamics,
		random,
		options
	}))
	return { edge, launches }
}
