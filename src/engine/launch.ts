import { createSeededRandom } from '../random'
import { datan2, dcos, dsin } from './dmath'
import {
	clampHorizontalPosition,
	clampValue,
	computeDisplayViewportBounds,
	getHorizontalCenterBounds,
	type DisplayViewportBounds
} from '../renderers/viewportBounds'
import { DISPLAY_CAMERA_FOV, DISPLAY_CAMERA_HEIGHT } from '../renderers/sceneEnvironment'

/**
 * Launch choreography shared by both display modes.
 *
 * Ported from the v2 kinematic renderer without Babylon: one presentation is
 * one throw from a seeded edge, packed in radius-aware lanes, rows and waves,
 * with a continuous seeded energy/heading envelope. v3 keeps these rules so
 * the throw reads exactly as before; the new physics takes over at release.
 */

/** Mutable point with the small Vector3 surface the launch planner needs. */
export class Point3 {
	constructor(public x = 0, public y = 0, public z = 0) {}
	static Zero(): Point3 { return new Point3() }
	static Up(): Point3 { return new Point3(0, 1, 0) }
	static Distance(a: Point3, b: Point3): number { return a.subtract(b).length() }
	set(x: number, y: number, z: number): this { this.x = x; this.y = y; this.z = z; return this }
	copyFrom(other: Point3): this { return this.set(other.x, other.y, other.z) }
	clone(): Point3 { return new Point3(this.x, this.y, this.z) }
	add(other: Point3): Point3 { return new Point3(this.x + other.x, this.y + other.y, this.z + other.z) }
	addInPlace(other: Point3): this { return this.set(this.x + other.x, this.y + other.y, this.z + other.z) }
	subtract(other: Point3): Point3 { return new Point3(this.x - other.x, this.y - other.y, this.z - other.z) }
	scale(s: number): Point3 { return new Point3(this.x * s, this.y * s, this.z * s) }
	scaleInPlace(s: number): this { return this.set(this.x * s, this.y * s, this.z * s) }
	// Math.sqrt is correctly rounded everywhere; Math.hypot is not, so it would break cross-browser determinism.
	length(): number { return Math.sqrt(this.lengthSquared()) }
	lengthSquared(): number { return this.x * this.x + this.y * this.y + this.z * this.z }
	normalize(): this {
		const l = this.length()
		return l > 0 ? this.scaleInPlace(1 / l) : this
	}
	toArray(): [number, number, number] { return [this.x, this.y, this.z] }
	asArray(): number[] { return [this.x, this.y, this.z] }
}

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5))
const MINIMUM_LAUNCH_HEIGHT = 2.8
const MAXIMUM_LAUNCH_HEIGHT = DISPLAY_CAMERA_HEIGHT * 0.27
const MAXIMUM_AXIAL_LAUNCH_ROWS = 2
export const MINIMUM_PORTAL_SPEED = 2.4

export type LaunchEdge = 'left' | 'right' | 'north' | 'south'

/** Wall index used by the simulation for each launch edge. */
export const LAUNCH_EDGE_WALL: Readonly<Record<LaunchEdge, number>> = Object.freeze({ left: 0, right: 1, north: 2, south: 3 })

export const selectPresentationLaunchEdge = (
	seed: string,
	_width: number,
	_height: number
): LaunchEdge => {
	// Isolated stream: choosing the group edge never changes the established
	// seeded landing, yaw or spin sequence.
	const edgeRandom = createSeededRandom(`${seed}:launch-edge`)
	return (['left', 'right', 'north', 'south'] as const)[
		Math.min(3, Math.floor(edgeRandom.next() * 4))
	]!
}

/** Seeded shift of a presentation's landing cluster, as a fraction (-1..1) of
 * the free room left on each axis once the cluster fits the table. */
export interface LandingOffset {
	readonly x: number
	readonly z: number
}

const CENTERED_LANDING: LandingOffset = Object.freeze({ x: 0, z: 0 })

/** One landing spot per presentation; spread 0 keeps the historical centered throw. */
export const selectPresentationLandingOffset = (seed: string, spread: number): LandingOffset => {
	const amount = Number.isFinite(spread) ? clampValue(spread, 0, 1) : 0
	if(amount <= 0) return CENTERED_LANDING
	// Isolated stream: the landing spot never changes the established seeded
	// landing, yaw or spin sequence.
	const random = createSeededRandom(`${seed}:landing-offset`)
	return { x: random.range(-1, 1) * amount, z: random.range(-1, 1) * amount }
}

export interface TrajectoryLayoutInput {
	readonly index: number
	readonly count: number
	readonly scale: number
	readonly startingHeight: number
	readonly coin: boolean
	readonly objectRadius: number
	readonly bounds: DisplayViewportBounds
	readonly launchEdge: LaunchEdge
	readonly spawnSpacing: number
	readonly spawnHeightStep: number
	readonly spawnOverscan: number
	readonly landingOffset?: LandingOffset | undefined
}

export interface LaunchPacking {
	readonly tangent: number
	readonly row: number
	readonly wave: number
	readonly waveCapacity: number
	readonly spacing: number
}

/** Packs a throw into radius-aware tangent lanes and up to two rows behind the
 * clipped edge; later waves reuse the slots once the portal is clear. */
export const createLaunchPacking = (
	input: TrajectoryLayoutInput,
	minimumTangent: number,
	maximumTangent: number
): LaunchPacking => {
	const spacing = Math.max(0.01, input.spawnSpacing, input.objectRadius * 2.1, input.scale * 0.286)
	const span = Math.max(0, maximumTangent - minimumTangent)
	const tangentSlots = Math.max(1, Math.floor(span / spacing) + 1)
	const waveCapacity = tangentSlots * MAXIMUM_AXIAL_LAUNCH_ROWS
	const localIndex = input.index % waveCapacity
	const row = Math.floor(localIndex / tangentSlots)
	const tangentSlot = localIndex % tangentSlots
	const usedSpan = (tangentSlots - 1) * spacing
	const tangentStart = (minimumTangent + maximumTangent - usedSpan) / 2
	return {
		tangent: clampValue(tangentStart + tangentSlot * spacing, minimumTangent, maximumTangent),
		row,
		wave: Math.floor(input.index / waveCapacity),
		waveCapacity,
		spacing
	}
}

export interface PresentationLaunchDynamics {
	readonly aggressive: boolean
	readonly intensity: number
	readonly energyScale: number
	readonly headingRadians: number
}

/** One shared throw character per presentation. */
export const createPresentationLaunchDynamics = (
	seed: string,
	aggressiveChance: number
): PresentationLaunchDynamics => {
	const random = createSeededRandom(`${seed}:launch-dynamics`)
	const chance = Number.isFinite(aggressiveChance) ? clampValue(aggressiveChance, 0, 1) : 0
	const aggressive = random.next() < chance
	const intensity = aggressive ? random.range(0.55, 1) : 0
	const normalEnergy = 0.9 + 0.18 * ((random.next() + random.next()) / 2)
	const headingEnvelope = (10 + (aggressive ? 46 * intensity : 0)) * Math.PI / 180
	return {
		aggressive,
		intensity,
		energyScale: normalEnergy + (aggressive ? 0.62 * intensity : 0),
		headingRadians: (random.next() + random.next() - 1) * headingEnvelope
	}
}

const normalizeAngle = (angle: number): number => {
	let normalized = angle
	while(normalized > Math.PI) normalized -= Math.PI * 2
	while(normalized < -Math.PI) normalized += Math.PI * 2
	return normalized
}

/** Varies the real launch vector continuously inside a 45° inward cone. */
export const createNaturalLaunchVelocity = (
	start: Point3,
	landing: Point3,
	random: ReturnType<typeof createSeededRandom>,
	throwForce: number,
	dynamics: PresentationLaunchDynamics
): Point3 => {
	const base = createThrownLinearVelocity(start, landing, throwForce)
	const horizontalSpeed = Math.sqrt(base.x * base.x + base.z * base.z)
	if(horizontalSpeed <= 1e-6) return base
	const deltaX = landing.x - start.x
	const deltaZ = landing.z - start.z
	const inwardAngle = Math.abs(deltaX) >= Math.abs(deltaZ)
		? deltaX >= 0 ? 0 : Math.PI
		: deltaZ >= 0 ? Math.PI / 2 : -Math.PI / 2
	const baseAngle = datan2(base.z, base.x)
	const bodyHeadingJitter = (random.next() + random.next() - 1) * 4 * Math.PI / 180
	const desiredRelativeAngle = normalizeAngle(baseAngle + dynamics.headingRadians + bodyHeadingJitter - inwardAngle)
	const maximumInwardAngle = 45 * Math.PI / 180
	const finalAngle = inwardAngle + clampValue(desiredRelativeAngle, -maximumInwardAngle, maximumInwardAngle)
	const bodyEnergy = 0.96 + 0.08 * ((random.next() + random.next()) / 2)
	let finalSpeed = Math.min(19.5, horizontalSpeed * dynamics.energyScale * bodyEnergy)
	const baseInwardSpeed = dcos(normalizeAngle(baseAngle - inwardAngle)) * horizontalSpeed
	const plannedInwardSpeed = dcos(finalAngle - inwardAngle) * finalSpeed
	if(plannedInwardSpeed > 1e-6 && plannedInwardSpeed < baseInwardSpeed) {
		finalSpeed = Math.min(19.5, finalSpeed * baseInwardSpeed / plannedInwardSpeed)
	}
	return new Point3(dcos(finalAngle) * finalSpeed, base.y, dsin(finalAngle) * finalSpeed)
}

/** Immediate descending release: the body enters fast and gravity adds speed. */
export const createThrownLinearVelocity = (
	start: Point3,
	end: Point3,
	throwForce: number
): Point3 => {
	const force = Number.isFinite(throwForce) ? Math.max(0, throwForce) : 0
	const horizontal = new Point3(end.x - start.x, 0, end.z - start.z)
	const distance = horizontal.length()
	if(distance <= 0.0001 || force <= 0) return Point3.Zero()
	const forceRatio = Math.min(2, force / 4.55)
	const minimumImpulse = (3.4 + Math.min(distance, 3.3) * 0.5) * Math.min(1.15, force / 6.4)
	const horizontalSpeed = Math.min(17.5, Math.max(distance * force * 0.22, minimumImpulse))
	horizontal.normalize().scaleInPlace(horizontalSpeed)
	horizontal.y = -Math.min(6, (1.4 + force * 0.38) * Math.sqrt(forceRatio))
	return horizontal
}

export const createScatteredLanding = (
	input: TrajectoryLayoutInput,
	random: ReturnType<typeof createSeededRandom>
): Point3 => {
	const naturalSpacing = Math.max(0.78, input.scale * (input.coin ? 0.25 : 0.29))
	const fittedSpacing = Math.min(naturalSpacing, 7.2 / Math.sqrt(Math.max(1, input.count)))
	const radius = input.count === 1
		? random.range(0.15, 0.55)
		: fittedSpacing * Math.sqrt(input.index + 0.65)
	const angle = input.index * GOLDEN_ANGLE + random.range(-0.38, 0.38)
	const jitter = fittedSpacing * 0.16
	const rawX = dcos(angle) * radius + random.range(-jitter, jitter)
	const rawZ = dsin(angle) * radius + random.range(-jitter, jitter)
	const maximumRawRadius = input.count === 1
		? 0.55 + jitter
		: fittedSpacing * Math.sqrt(input.count - 0.35) + jitter
	const centerBounds = getHorizontalCenterBounds(input.bounds, input.objectRadius)
	const availableX = Math.max(0, (centerBounds.maxX - centerBounds.minX) / 2)
	const availableZ = Math.max(0, (centerBounds.maxZ - centerBounds.minZ) / 2)
	const fitX = Math.min(1, availableX / Math.max(0.01, maximumRawRadius))
	const fitZ = Math.min(1, availableZ / Math.max(0.01, maximumRawRadius))
	// The whole cluster moves together, only as far as the room it leaves free.
	const offset = input.landingOffset ?? CENTERED_LANDING
	const landing = new Point3(
		rawX * fitX + offset.x * Math.max(0, availableX - maximumRawRadius * fitX),
		input.coin ? input.scale * 0.01 : input.scale * 0.12,
		rawZ * fitZ + offset.z * Math.max(0, availableZ - maximumRawRadius * fitZ)
	)
	clampHorizontalPosition(landing, input.bounds, input.objectRadius)
	return landing
}

export const createSideLaunch = (
	input: TrajectoryLayoutInput,
	landing: Point3,
	_random: ReturnType<typeof createSeededRandom>
): Point3 => {
	const fromLeft = input.launchEdge === 'left'
	const fromRight = input.launchEdge === 'right'
	const fromNorth = input.launchEdge === 'north'
	// startingHeight is the actual release plane.
	const baseHeight = Number.isFinite(input.startingHeight) ? input.startingHeight : 7.6
	const launchHeight = clampValue(
		baseHeight + Math.min(input.index, 3) * Math.max(0, input.spawnHeightStep),
		MINIMUM_LAUNCH_HEIGHT,
		MAXIMUM_LAUNCH_HEIGHT
	)
	const groundCenters = getHorizontalCenterBounds(input.bounds, input.objectRadius)
	const airborneBounds = computeDisplayViewportBounds({
		width: input.bounds.width,
		height: input.bounds.height,
		cameraHeight: DISPLAY_CAMERA_HEIGHT,
		cameraFov: DISPLAY_CAMERA_FOV,
		planeY: launchHeight,
		minimumRadius: input.objectRadius
	})
	const airborneCenters = getHorizontalCenterBounds(airborneBounds, input.objectRadius)
	const minX = Math.max(groundCenters.minX, airborneCenters.minX)
	const maxX = Math.min(groundCenters.maxX, airborneCenters.maxX)
	const minZ = Math.max(groundCenters.minZ, airborneCenters.minZ)
	const maxZ = Math.min(groundCenters.maxZ, airborneCenters.maxZ)
	const safeMinX = minX <= maxX ? minX : 0
	const safeMaxX = minX <= maxX ? maxX : 0
	const safeMinZ = minZ <= maxZ ? minZ : 0
	const safeMaxZ = minZ <= maxZ ? maxZ : 0
	// The whole body starts beyond the launch-plane projection, so it visibly
	// crosses the page edge instead of appearing fully formed.
	const overscan = input.objectRadius * (1 + Math.max(0, input.spawnOverscan))
	if(fromLeft || fromRight) {
		const packing = createLaunchPacking(input, safeMinZ, safeMaxZ)
		const startX = fromLeft
			? -airborneBounds.visibleHalfX - overscan - packing.row * packing.spacing
			: airborneBounds.visibleHalfX + overscan + packing.row * packing.spacing
		const axialSpan = Math.max(0, groundCenters.maxX - groundCenters.minX)
		const minimumTravel = Math.min(3.1, axialSpan * 0.46)
		const groundSpan = Math.max(0.0001, groundCenters.maxX - groundCenters.minX)
		const landingRatio = clampValue((landing.x - groundCenters.minX) / groundSpan, 0, 1)
		if(fromLeft) {
			const minimumLanding = Math.min(groundCenters.maxX, startX + minimumTravel)
			landing.x = minimumLanding + (groundCenters.maxX - minimumLanding) * landingRatio
		} else {
			const maximumLanding = Math.max(groundCenters.minX, startX - minimumTravel)
			landing.x = groundCenters.minX + (maximumLanding - groundCenters.minX) * landingRatio
		}
		const startTangent = packing.tangent
		const axialDistance = Math.abs(landing.x - startX)
		landing.z = clampValue(
			landing.z,
			Math.max(groundCenters.minZ, startTangent - axialDistance),
			Math.min(groundCenters.maxZ, startTangent + axialDistance)
		)
		clampHorizontalPosition(landing, input.bounds, input.objectRadius)
		return new Point3(startX, launchHeight, startTangent)
	}
	const packing = createLaunchPacking(input, safeMinX, safeMaxX)
	const startZ = fromNorth
		? -airborneBounds.visibleHalfZ - overscan - packing.row * packing.spacing
		: airborneBounds.visibleHalfZ + overscan + packing.row * packing.spacing
	const axialSpan = Math.max(0, groundCenters.maxZ - groundCenters.minZ)
	const minimumTravel = Math.min(3.1, axialSpan * 0.46)
	const groundSpan = Math.max(0.0001, groundCenters.maxZ - groundCenters.minZ)
	const landingRatio = clampValue((landing.z - groundCenters.minZ) / groundSpan, 0, 1)
	if(fromNorth) {
		const minimumLanding = Math.min(groundCenters.maxZ, startZ + minimumTravel)
		landing.z = minimumLanding + (groundCenters.maxZ - minimumLanding) * landingRatio
	} else {
		const maximumLanding = Math.max(groundCenters.minZ, startZ - minimumTravel)
		landing.z = groundCenters.minZ + (maximumLanding - groundCenters.minZ) * landingRatio
	}
	const startTangent = packing.tangent
	const axialDistance = Math.abs(landing.z - startZ)
	landing.x = clampValue(
		landing.x,
		Math.max(groundCenters.minX, startTangent - axialDistance),
		Math.min(groundCenters.maxX, startTangent + axialDistance)
	)
	clampHorizontalPosition(landing, input.bounds, input.objectRadius)
	return new Point3(startTangent, launchHeight, startZ)
}

/** True once an off-screen body has completely crossed the launch wall. */
export const hasEnteredLaunchPortal = (
	position: Pick<Point3, 'x' | 'z'>,
	bounds: DisplayViewportBounds,
	radius: number,
	edge: LaunchEdge
): boolean => {
	const centers = getHorizontalCenterBounds(bounds, radius)
	if(edge === 'left') return position.x >= centers.minX
	if(edge === 'right') return position.x <= centers.maxX
	if(edge === 'north') return position.z >= centers.minZ
	return position.z <= centers.maxZ
}

export const estimateBallisticFlightSeconds = (
	startHeight: number,
	supportHeight: number,
	initialVerticalVelocity: number,
	gravity: number
): number => {
	const height = Math.max(0, startHeight - supportHeight)
	const downwardGravity = Math.max(0.001, Math.abs(gravity))
	const velocity = Number.isFinite(initialVerticalVelocity) ? initialVerticalVelocity : 0
	return clampValue((velocity + Math.sqrt(Math.max(0, velocity * velocity + 2 * downwardGravity * height))) / downwardGravity, 0.05, 4)
}

export interface LaunchPlanInput {
	readonly seed: string
	readonly index: number
	readonly count: number
	readonly coin: boolean
	readonly objectRadius: number
	readonly supportHeight: number
	readonly bounds: DisplayViewportBounds
	readonly launchEdge: LaunchEdge
	readonly landingOffset?: LandingOffset
	readonly dynamics: PresentationLaunchDynamics
	readonly random: ReturnType<typeof createSeededRandom>
	readonly options: {
		readonly scale: number
		readonly startingHeight: number
		readonly spawnSpacing: number
		readonly spawnHeightStep: number
		readonly spawnOverscan: number
		readonly throwForce: number
		readonly delay: number
	}
}

export interface LaunchPlan {
	readonly start: Point3
	readonly end: Point3
	readonly velocity: Point3
	/** Seeded yaw applied around the resting face (v2 target yaw). */
	readonly yaw: number
	/** Seeded tumble angles: x = pitch, y = yaw, z = roll (v2 spinX/Y/Z). */
	readonly spin: readonly [number, number, number]
	readonly delayMs: number
	readonly packing: LaunchPacking
}

/** Start, landing target, release velocity and delay for one body (v2 createTrajectory). */
export const planLaunch = (input: LaunchPlanInput): LaunchPlan => {
	const layout: TrajectoryLayoutInput = {
		index: input.index,
		count: input.count,
		scale: input.options.scale,
		startingHeight: input.options.startingHeight,
		coin: input.coin,
		objectRadius: input.objectRadius,
		bounds: input.bounds,
		launchEdge: input.launchEdge,
		spawnSpacing: input.options.spawnSpacing,
		spawnHeightStep: input.options.spawnHeightStep,
		spawnOverscan: input.options.spawnOverscan,
		landingOffset: input.landingOffset
	}
	const end = createScatteredLanding(layout, input.random)
	end.y = input.supportHeight
	const start = createSideLaunch(layout, end, input.random)
	// Same draw order as v2 createTrajectory: yaw, tumble, then velocity.
	const yaw = input.random.range(-Math.PI, Math.PI)
	const signedSpin = (minimum: number, maximum: number): number =>
		input.random.range(minimum, maximum) * Math.PI * (input.random.next() < 0.5 ? -1 : 1)
	const spinX = signedSpin(input.coin ? 8 : 3, input.coin ? 14 : 7)
	const spinY = signedSpin(2, 7)
	const spinZ = signedSpin(2, 7)
	const velocity = createNaturalLaunchVelocity(start, end, input.random, input.options.throwForce, input.dynamics)
	const groundCenters = getHorizontalCenterBounds(input.bounds, input.objectRadius)
	const airborneCenters = getHorizontalCenterBounds(computeDisplayViewportBounds({
		width: input.bounds.width,
		height: input.bounds.height,
		cameraHeight: DISPLAY_CAMERA_HEIGHT,
		cameraFov: DISPLAY_CAMERA_FOV,
		planeY: start.y,
		minimumRadius: input.objectRadius
	}), input.objectRadius)
	const horizontalEdge = input.launchEdge === 'left' || input.launchEdge === 'right'
	let minimum = horizontalEdge ? Math.max(groundCenters.minZ, airborneCenters.minZ) : Math.max(groundCenters.minX, airborneCenters.minX)
	let maximum = horizontalEdge ? Math.min(groundCenters.maxZ, airborneCenters.maxZ) : Math.min(groundCenters.maxX, airborneCenters.maxX)
	if(minimum > maximum) {
		minimum = 0
		maximum = 0
	}
	const packing = createLaunchPacking(layout, minimum, maximum)
	const minimumWaveGapMs = packing.spacing / MINIMUM_PORTAL_SPEED * 1000 * 1.12
	const configuredDelayMs = Math.max(0, input.options.delay)
	const automaticWaveDelayMs = Math.max(0, minimumWaveGapMs - packing.waveCapacity * configuredDelayMs)
	return {
		start,
		end,
		velocity,
		yaw,
		spin: [spinX, spinY, spinZ],
		delayMs: input.index * configuredDelayMs + packing.wave * automaticWaveDelayMs,
		packing
	}
}
