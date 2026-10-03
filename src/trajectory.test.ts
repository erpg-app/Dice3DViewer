import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { Point3 as Vector3, estimateBallisticFlightSeconds } from './engine/launch'
import { createSeededRandom } from './random'
import {
	createScatteredLanding,
	createSideLaunch,
	createThrownLinearVelocity,
	createNaturalLaunchVelocity,
	createPresentationLaunchDynamics,
	createLaunchPacking,
	hasEnteredLaunchPortal,
	selectPresentationLandingOffset,
	selectPresentationLaunchEdge,
	type TrajectoryLayoutInput
} from './engine/launch'
import { DISPLAY_CAMERA_FOV, DISPLAY_CAMERA_HEIGHT } from './renderers/sceneEnvironment'
import {
	computeDisplayViewportBounds,
	getHorizontalCenterBounds,
	type DisplayViewportBounds
} from './renderers/viewportBounds'

const OBJECT_RADIUS = 0.817
const DEFAULT_SCALE = 6
const DEFAULT_STARTING_HEIGHT = 7.6
const DEFAULT_THROW_FORCE = 6.4
const DEFAULT_SPAWN_SPACING = 1.72

const createBounds = (width: number, height: number): DisplayViewportBounds =>
	computeDisplayViewportBounds({
		width,
		height,
		cameraHeight: DISPLAY_CAMERA_HEIGHT,
		cameraFov: DISPLAY_CAMERA_FOV,
		wallPadding: 0.25,
		minimumRadius: OBJECT_RADIUS
	})

const buildLayout = (seed: string, width = 1200, height = 800, count = 6) => {
	const random = createSeededRandom(seed)
	const bounds = createBounds(width, height)
	const launchEdge = selectPresentationLaunchEdge(seed, width, height)
	return Array.from({ length: count }, (_, index) => {
		const input: TrajectoryLayoutInput = {
			index,
			count,
			scale: DEFAULT_SCALE,
			startingHeight: DEFAULT_STARTING_HEIGHT,
			coin: false,
			objectRadius: OBJECT_RADIUS,
			bounds,
			launchEdge,
			spawnSpacing: DEFAULT_SPAWN_SPACING,
			spawnHeightStep: 0,
			spawnOverscan: 0.15
		}
		const landing = createScatteredLanding(input, random)
		return { input, landing, launch: createSideLaunch(input, landing, random) }
	})
}

const getPackingForEntry = (entry: ReturnType<typeof buildLayout>[number]) => {
	const airborneBounds = computeDisplayViewportBounds({
		width: entry.input.bounds.width,
		height: entry.input.bounds.height,
		cameraHeight: DISPLAY_CAMERA_HEIGHT,
		cameraFov: DISPLAY_CAMERA_FOV,
		planeY: entry.launch.y,
		minimumRadius: entry.input.objectRadius
	})
	const groundCenters = getHorizontalCenterBounds(entry.input.bounds, entry.input.objectRadius)
	const airborneCenters = getHorizontalCenterBounds(airborneBounds, entry.input.objectRadius)
	const tangentBounds = entry.input.launchEdge === 'left' || entry.input.launchEdge === 'right'
		? {
			minimum: Math.max(groundCenters.minZ, airborneCenters.minZ),
			maximum: Math.min(groundCenters.maxZ, airborneCenters.maxZ)
		}
		: {
			minimum: Math.max(groundCenters.minX, airborneCenters.minX),
			maximum: Math.min(groundCenters.maxX, airborneCenters.maxX)
		}
	return createLaunchPacking(entry.input, tangentBounds.minimum, tangentBounds.maximum)
}

type ProjectedWallOutcome = 'direct' | 'adjacent' | 'opposite' | 'corner'

const classifyProjectedWallOutcome = (
	entry: ReturnType<typeof buildLayout>[number],
	velocity: Vector3
): ProjectedWallOutcome => {
	const contactSeconds = estimateBallisticFlightSeconds(
		entry.launch.y,
		entry.landing.y,
		velocity.y,
		9.81 * 1.3
	)
	const projectedContact = entry.launch.add(velocity.scale(contactSeconds))
	const centers = getHorizontalCenterBounds(entry.input.bounds, entry.input.objectRadius)
	const opposite = entry.input.launchEdge === 'left'
		? projectedContact.x > centers.maxX
		: entry.input.launchEdge === 'right'
			? projectedContact.x < centers.minX
			: entry.input.launchEdge === 'north'
				? projectedContact.z > centers.maxZ
				: projectedContact.z < centers.minZ
	const adjacent = entry.input.launchEdge === 'left' || entry.input.launchEdge === 'right'
		? projectedContact.z < centers.minZ || projectedContact.z > centers.maxZ
		: projectedContact.x < centers.minX || projectedContact.x > centers.maxX
	if(opposite && adjacent) return 'corner'
	if(opposite) return 'opposite'
	if(adjacent) return 'adjacent'
	return 'direct'
}

const assertInside = (
	position: { readonly x: number; readonly z: number },
	bounds: DisplayViewportBounds,
	radius: number,
	label: string
): void => {
	const centers = getHorizontalCenterBounds(bounds, radius)
	assert.ok(position.x >= centers.minX - 1e-9, `${label}.x=${position.x} crossed left=${centers.minX}`)
	assert.ok(position.x <= centers.maxX + 1e-9, `${label}.x=${position.x} crossed right=${centers.maxX}`)
	assert.ok(position.z >= centers.minZ - 1e-9, `${label}.z=${position.z} crossed north=${centers.minZ}`)
	assert.ok(position.z <= centers.maxZ + 1e-9, `${label}.z=${position.z} crossed south=${centers.maxZ}`)
}

describe('natural presentation layout', () => {
	it('scatters resting positions instead of placing dice in rows', () => {
		const entries = buildLayout('layout-seed')
		const xPositions = new Set(entries.map(entry => entry.landing.x.toFixed(3)))
		const zPositions = new Set(entries.map(entry => entry.landing.z.toFixed(3)))
		assert.ok(xPositions.size >= 5)
		assert.ok(zPositions.size >= 5)
	})

	it('launches the whole presentation from beyond one seeded responsive edge', () => {
		const entries = buildLayout('launch-seed')
		assert.equal(new Set(entries.map(entry => entry.input.launchEdge)).size, 1)
		entries.forEach(({ input, launch, landing }) => {
			const airborneBounds = computeDisplayViewportBounds({
				width: input.bounds.width,
				height: input.bounds.height,
				cameraHeight: DISPLAY_CAMERA_HEIGHT,
				cameraFov: DISPLAY_CAMERA_FOV,
				planeY: launch.y,
				minimumRadius: input.objectRadius
			})
			if(input.launchEdge === 'left' || input.launchEdge === 'right') {
				assert.ok(input.launchEdge === 'left'
					? launch.x + input.objectRadius < -airborneBounds.visibleHalfX
					: launch.x - input.objectRadius > airborneBounds.visibleHalfX)
				assert.equal(
					Math.sign(landing.x - launch.x),
					input.launchEdge === 'left' ? 1 : -1
				)
			} else {
				assert.ok(input.launchEdge === 'north'
					? launch.z + input.objectRadius < -airborneBounds.visibleHalfZ
					: launch.z - input.objectRadius > airborneBounds.visibleHalfZ)
				assert.equal(
					Math.sign(landing.z - launch.z),
					input.launchEdge === 'north' ? 1 : -1
				)
			}
			assert.equal(hasEnteredLaunchPortal(
				landing,
				input.bounds,
				input.objectRadius,
				input.launchEdge
			), true)
		})
	})

	it('chooses all four edges deterministically without mixing directions inside a throw', () => {
		const seenLandscapeEdges = new Set<string>()
		const seenPortraitEdges = new Set<string>()
		for(let index = 0; index < 96; index += 1) {
			const seed = `edge-seed-${String(index)}`
			const landscape = buildLayout(seed, 1200, 800)
			const portrait = buildLayout(seed, 390, 844)
			seenLandscapeEdges.add(landscape[0]!.input.launchEdge)
			seenPortraitEdges.add(portrait[0]!.input.launchEdge)
			assert.equal(new Set(landscape.map(entry => entry.input.launchEdge)).size, 1)
			assert.equal(new Set(portrait.map(entry => entry.input.launchEdge)).size, 1)
		}
		const allEdges = ['left', 'north', 'right', 'south']
		assert.deepEqual([...seenLandscapeEdges].sort(), allEdges)
		assert.deepEqual([...seenPortraitEdges].sort(), allEdges)
	})

	it('recreates the immediate descending kick of the v1 launch', () => {
		const gravity = 9.81 * 1.3
		const checkpoints = [
			{ seconds: 0.1, inward: 0.35, drop: 0.3 },
			{ seconds: 0.2, inward: 0.7, drop: 0.75 },
			{ seconds: 0.4, inward: 1.4, drop: 1.95 }
		] as const
		for(const viewport of [{ width: 1200, height: 800 }, { width: 390, height: 844 }]) {
			for(const entry of buildLayout('impulse-seed', viewport.width, viewport.height, 8)) {
				const velocity = createThrownLinearVelocity(entry.launch, entry.landing, DEFAULT_THROW_FORCE)
				const horizontalSpeed = Math.hypot(velocity.x, velocity.z)
				assert.ok(horizontalSpeed >= 4)
				const inwardComponent = entry.input.launchEdge === 'left'
					? velocity.x
					: entry.input.launchEdge === 'right'
						? -velocity.x
						: entry.input.launchEdge === 'north'
							? velocity.z
							: -velocity.z
				assert.ok(inwardComponent > 0)
				assert.ok(velocity.y <= -2.5)
				const speedRatio = horizontalSpeed / Math.abs(velocity.y)
				assert.ok(speedRatio >= 0.75 && speedRatio <= 5.5)
				for(const checkpoint of checkpoints) {
					assert.ok(inwardComponent * checkpoint.seconds >= checkpoint.inward)
					const downwardTravel = -velocity.y * checkpoint.seconds
						+ gravity * checkpoint.seconds * checkpoint.seconds / 2
					assert.ok(downwardTravel >= checkpoint.drop)
				}
				const contactSeconds = estimateBallisticFlightSeconds(
					entry.launch.y,
					entry.landing.y,
					velocity.y,
					gravity
				)
				assert.ok(contactSeconds >= 0.65 && contactSeconds <= 0.9)
			}
		}
	})

	it('lets wall contacts emerge from seeded launch direction and energy', () => {
		const outcomes: Record<ProjectedWallOutcome, number> = {
			direct: 0,
			adjacent: 0,
			opposite: 0,
			corner: 0
		}
		const samples = 2400
		for(let index = 0; index < samples; index += 1) {
			const seed = `natural-contact-${String(index)}`
			const portrait = index % 2 === 0
			const entry = buildLayout(seed, portrait ? 390 : 1200, portrait ? 844 : 800, 1)[0]!
			const landingBefore = entry.landing.clone()
			const dynamics = createPresentationLaunchDynamics(seed, 0.12)
			const repeatedDynamics = createPresentationLaunchDynamics(seed, 0.12)
			const randomSeed = `${seed}:body-direction`
			const velocity = createNaturalLaunchVelocity(
				entry.launch,
				entry.landing,
				createSeededRandom(randomSeed),
				DEFAULT_THROW_FORCE,
				dynamics
			)
			const repeatedVelocity = createNaturalLaunchVelocity(
				entry.launch,
				entry.landing,
				createSeededRandom(randomSeed),
				DEFAULT_THROW_FORCE,
				repeatedDynamics
			)
			assert.deepEqual(dynamics, repeatedDynamics)
			assert.deepEqual(velocity.asArray(), repeatedVelocity.asArray())
			assert.deepEqual(entry.landing.asArray(), landingBefore.asArray())
			const inwardComponent = entry.input.launchEdge === 'left'
				? velocity.x
				: entry.input.launchEdge === 'right'
					? -velocity.x
					: entry.input.launchEdge === 'north'
						? velocity.z
						: -velocity.z
			const inwardShare = inwardComponent / Math.hypot(velocity.x, velocity.z)
			assert.ok(
				inwardShare >= Math.cos(58 * Math.PI / 180) - 1e-9,
				`${entry.input.launchEdge} escaped the inward cone: ${String(inwardShare)}`
			)
			outcomes[classifyProjectedWallOutcome(entry, velocity)]++
		}
		const directRatio = outcomes.direct / samples
		assert.ok(
			directRatio >= 0.75 && directRatio <= 0.93,
			`expected mostly direct throws, observed ${directRatio.toFixed(3)}: ${JSON.stringify(outcomes)}`
		)
		assert.ok(outcomes.adjacent > 0, `no adjacent-wall trajectory: ${JSON.stringify(outcomes)}`)
		assert.ok(outcomes.opposite > 0, `no opposite-wall trajectory: ${JSON.stringify(outcomes)}`)
		assert.ok(outcomes.corner > 0, `no corner trajectory: ${JSON.stringify(outcomes)}`)
	})

	it('makes stronger releases travel farther without forcing a wall collision', () => {
		let gentleWallContacts = 0
		let strongWallContacts = 0
		for(let index = 0; index < 360; index += 1) {
			const seed = `force-reach-${String(index)}`
			const entry = buildLayout(seed, 1200, 800, 1)[0]!
			const dynamics = createPresentationLaunchDynamics(seed, 0.12)
			const directionSeed = `${seed}:body-direction`
			const gentle = createNaturalLaunchVelocity(
				entry.launch,
				entry.landing,
				createSeededRandom(directionSeed),
				4.2,
				dynamics
			)
			const strong = createNaturalLaunchVelocity(
				entry.launch,
				entry.landing,
				createSeededRandom(directionSeed),
				DEFAULT_THROW_FORCE,
				dynamics
			)
			const gentleFlight = estimateBallisticFlightSeconds(
				entry.launch.y,
				entry.landing.y,
				gentle.y,
				9.81 * 1.3
			)
			const strongFlight = estimateBallisticFlightSeconds(
				entry.launch.y,
				entry.landing.y,
				strong.y,
				9.81 * 1.3
			)
			const gentleReach = Math.hypot(gentle.x, gentle.z) * gentleFlight
			const strongReach = Math.hypot(strong.x, strong.z) * strongFlight
			assert.ok(
				strongReach > gentleReach,
				`force did not increase reach for seed ${seed}: ${gentleReach} -> ${strongReach}`
			)
			if(classifyProjectedWallOutcome(entry, gentle) !== 'direct') gentleWallContacts++
			if(classifyProjectedWallOutcome(entry, strong) !== 'direct') strongWallContacts++
		}
		assert.ok(strongWallContacts > gentleWallContacts)
		assert.ok(strongWallContacts < 360, 'strong release made every trajectory hit a wall')
	})

	it('crosses the clipped edge and physical launch portal promptly', () => {
		for(const viewport of [{ width: 1440, height: 720 }, { width: 390, height: 844 }]) {
			for(const count of [1, 6, 20, 120]) {
				for(const entry of buildLayout(
					`portal-${String(viewport.width)}-${String(count)}`,
					viewport.width,
					viewport.height,
					count
				)) {
					const velocity = createThrownLinearVelocity(entry.launch, entry.landing, DEFAULT_THROW_FORCE)
					const startsInsidePortal = hasEnteredLaunchPortal(
						entry.launch,
						entry.input.bounds,
						entry.input.objectRadius,
						entry.input.launchEdge
					)
					const airborneBounds = computeDisplayViewportBounds({
						width: entry.input.bounds.width,
						height: entry.input.bounds.height,
						cameraHeight: DISPLAY_CAMERA_HEIGHT,
						cameraFov: DISPLAY_CAMERA_FOV,
						planeY: entry.launch.y,
						minimumRadius: entry.input.objectRadius
					})
					const axisStart = entry.input.launchEdge === 'left' || entry.input.launchEdge === 'right'
						? entry.launch.x
						: entry.launch.z
					const axisVelocity = entry.input.launchEdge === 'left' || entry.input.launchEdge === 'right'
						? velocity.x
						: velocity.z
					const visibleEdge = entry.input.launchEdge === 'left' || entry.input.launchEdge === 'north'
						? -(entry.input.launchEdge === 'left'
							? airborneBounds.visibleHalfX
							: airborneBounds.visibleHalfZ)
						: entry.input.launchEdge === 'right'
							? airborneBounds.visibleHalfX
							: airborneBounds.visibleHalfZ
					const firstVisibleCenter = visibleEdge + (
						entry.input.launchEdge === 'left' || entry.input.launchEdge === 'north'
							? -entry.input.objectRadius
							: entry.input.objectRadius
					)
					const firstVisibleSeconds = (firstVisibleCenter - axisStart) / axisVelocity
					const contactSeconds = estimateBallisticFlightSeconds(
						entry.launch.y,
						entry.landing.y,
						velocity.y,
						9.81 * 1.3
					)
					const visibleDeadlineSeconds = Math.min(0.65, contactSeconds * 0.82)
					assert.ok(
						firstVisibleSeconds > 0 && firstVisibleSeconds <= visibleDeadlineSeconds,
						`${entry.input.launchEdge} first visible=${firstVisibleSeconds.toFixed(3)} viewport=${String(viewport.width)}x${String(viewport.height)} count=${String(count)}`
					)
					const portalCenters = getHorizontalCenterBounds(
						entry.input.bounds,
						entry.input.objectRadius
					)
					const portalAxis = entry.input.launchEdge === 'left'
						? portalCenters.minX
						: entry.input.launchEdge === 'right'
							? portalCenters.maxX
							: entry.input.launchEdge === 'north'
								? portalCenters.minZ
								: portalCenters.maxZ
					const portalSeconds = (portalAxis - axisStart) / axisVelocity
					const portalDeadlineSeconds = Math.min(0.8, contactSeconds * 0.98)
					if(startsInsidePortal) {
						assert.ok(portalSeconds <= 0)
						continue
					}
					assert.ok(
						portalSeconds > 0 && portalSeconds <= portalDeadlineSeconds,
						`${entry.input.launchEdge} portal=${portalSeconds.toFixed(3)} visible=${firstVisibleSeconds.toFixed(3)} viewport=${String(viewport.width)}x${String(viewport.height)} count=${String(count)}`
					)
					const portalPosition = entry.launch.add(velocity.scale(portalSeconds + 1e-5))
					assert.equal(hasEnteredLaunchPortal(
						portalPosition,
						entry.input.bounds,
						entry.input.objectRadius,
						entry.input.launchEdge
					), true)
				}
			}
		}
	})

	it('packs every simultaneously released wave without collider overlap', () => {
		const minimumSpawnDistance = OBJECT_RADIUS * 2.1
		for(const viewport of [
			{ width: 1440, height: 720 },
			{ width: 390, height: 844 }
		]) {
			for(let seedIndex = 0; seedIndex < 12; seedIndex += 1) {
				const entries = buildLayout(
					`non-overlap-${String(viewport.width)}-${String(seedIndex)}`,
					viewport.width,
					viewport.height,
					12
				)
				const waves = entries.map(entry => getPackingForEntry(entry).wave)
				for(let left = 0; left < entries.length; left += 1) {
					for(let right = left + 1; right < entries.length; right += 1) {
						if(waves[left] !== waves[right]) continue
						const distance = Vector3.Distance(entries[left]!.launch, entries[right]!.launch)
						assert.ok(
							distance >= minimumSpawnDistance - 1e-9,
							`spawn overlap at ${String(viewport.width)}x${String(viewport.height)}, seed ${String(seedIndex)}, bodies ${String(left)}/${String(right)}: ${distance.toFixed(3)} < ${minimumSpawnDistance.toFixed(3)}`
						)
					}
				}
			}
		}
	})

	it('uses radius-aware launch slots from one fixed higher release plane', () => {
		for(const viewport of [{ width: 1440, height: 720 }, { width: 390, height: 844 }]) {
			const entries = buildLayout('launch-lanes', viewport.width, viewport.height, 8)
			const uniqueSlots = new Set(entries.map(entry => [
				entry.launch.x.toFixed(2),
				entry.launch.z.toFixed(2)
			].join('|')))
			const waveCapacity = getPackingForEntry(entries[0]!).waveCapacity
			assert.ok(uniqueSlots.size >= Math.min(entries.length, waveCapacity))
			const heights = entries.map(entry => entry.launch.y)
			assert.deepEqual([...new Set(heights.map(height => height.toFixed(2)))], ['7.60'])
		}
	})

	it('keeps every launch inside one inward cone even for large presentations', () => {
		const minimumInwardDot = Math.cos(Math.PI / 4)
		for(const viewport of [{ width: 1440, height: 720 }, { width: 390, height: 844 }]) {
			for(const count of [1, 6, 20, 120]) {
				for(const entry of buildLayout(
					`cone-${String(viewport.width)}-${String(count)}`,
					viewport.width,
					viewport.height,
					count
				)) {
					const direction = entry.landing.subtract(entry.launch)
					direction.y = 0
					assert.ok(direction.length() > 0.01)
					direction.normalize()
					const inward = entry.input.launchEdge === 'left'
						? { x: 1, z: 0 }
						: entry.input.launchEdge === 'right'
							? { x: -1, z: 0 }
							: entry.input.launchEdge === 'north'
								? { x: 0, z: 1 }
								: { x: 0, z: -1 }
					const inwardDot = direction.x * inward.x + direction.z * inward.z
					assert.ok(
						inwardDot >= minimumInwardDot - 1e-9,
						`d${String(count)} ${entry.input.launchEdge} escaped the throw cone: ${String(inwardDot)}`
					)
				}
			}
		}
	})

	it('remains deterministic for the visual seed', () => {
		const first = buildLayout('repeatable').map(entry => entry.launch.asArray())
		const second = buildLayout('repeatable').map(entry => entry.launch.asArray())
		assert.deepEqual(first, second)
	})

	it('keeps launch perspective close to the resting dice size', () => {
		for(const scale of [5.1, 6]) {
			const random = createSeededRandom(`perspective-${scale}`)
			const bounds = createBounds(1200, 800)
			const launchEdge = selectPresentationLaunchEdge(`perspective-${scale}`, 1200, 800)
			for(let index = 0; index < 12; index += 1) {
				const input: TrajectoryLayoutInput = {
					index,
					count: 12,
					scale,
					startingHeight: DEFAULT_STARTING_HEIGHT,
					coin: false,
					objectRadius: OBJECT_RADIUS,
					bounds,
					launchEdge,
					spawnSpacing: DEFAULT_SPAWN_SPACING,
					spawnHeightStep: 0,
					spawnOverscan: 0.15
				}
				const landing = createScatteredLanding(input, random)
				const launch = createSideLaunch(input, landing, random)
				const apparentScale = (DISPLAY_CAMERA_HEIGHT - landing.y) / (DISPLAY_CAMERA_HEIGHT - launch.y)
				assert.ok(apparentScale <= 1.36, `launch scale ${apparentScale.toFixed(3)} for scale ${scale}`)
			}
		}
	})

	it('keeps off-screen launches directed toward landings inside the barriers', () => {
		for(const viewport of [
			{ label: 'desktop', width: 1440, height: 720 },
			{ label: 'portrait', width: 390, height: 844 }
		]) {
			const entries = buildLayout(`bounded-${viewport.label}`, viewport.width, viewport.height, 120)
			for(const [index, entry] of entries.entries()) {
				assertInside(entry.landing, entry.input.bounds, entry.input.objectRadius, `${viewport.label} landing ${index}`)
				assert.ok(Number.isFinite(entry.launch.x) && Number.isFinite(entry.launch.z))
			}
		}
	})

	it('reflows the same seeded presentation when the canvas is resized', () => {
		const desktop = buildLayout('resize-seed', 1440, 720, 20)
		const portrait = buildLayout('resize-seed', 390, 844, 20)
		const desktopCenters = getHorizontalCenterBounds(desktop[0].input.bounds, OBJECT_RADIUS)
		const portraitCenters = getHorizontalCenterBounds(portrait[0].input.bounds, OBJECT_RADIUS)

		assert.ok(desktopCenters.maxX > portraitCenters.maxX * 3)
		assert.ok(desktop.some((entry, index) => Math.abs(entry.landing.x - portrait[index].landing.x) > 0.5))
		portrait.forEach((entry, index) => {
			assertInside(entry.landing, entry.input.bounds, OBJECT_RADIUS, `resized landing ${index}`)
			assert.ok(Number.isFinite(entry.launch.x) && Number.isFinite(entry.launch.z))
		})
	})

	it('keeps a non-inverted enclosure when the host is narrower than one body', () => {
		const radius = 0.9
		const bounds = computeDisplayViewportBounds({
			width: 80,
			height: 800,
			cameraHeight: DISPLAY_CAMERA_HEIGHT,
			cameraFov: DISPLAY_CAMERA_FOV,
			wallPadding: 1.35,
			minimumRadius: radius
		})
		const centers = getHorizontalCenterBounds(bounds, radius)
		assert.ok(bounds.halfX >= radius)
		assert.ok(centers.minX <= centers.maxX)
		assert.ok(centers.minZ <= centers.maxZ)
	})

	it('preserves the existing ground framing with the more distant camera', () => {
		const verticalHalfSpan = DISPLAY_CAMERA_HEIGHT * Math.tan(DISPLAY_CAMERA_FOV / 2)
		assert.ok(verticalHalfSpan > 4.1)
		assert.ok(verticalHalfSpan < 4.4)
	})
})
describe('landing spread', () => {
	const layoutFor = (seed: string, spread: number, width = 1752, height = 942, count = 2) => {
		const random = createSeededRandom(seed)
		const bounds = createBounds(width, height)
		const landingOffset = selectPresentationLandingOffset(seed, spread)
		return Array.from({ length: count }, (_, index) => createScatteredLanding({
			index,
			count,
			scale: DEFAULT_SCALE,
			startingHeight: DEFAULT_STARTING_HEIGHT,
			coin: false,
			objectRadius: OBJECT_RADIUS,
			bounds,
			launchEdge: selectPresentationLaunchEdge(seed, width, height),
			spawnSpacing: DEFAULT_SPAWN_SPACING,
			spawnHeightStep: 0,
			spawnOverscan: 0.15,
			landingOffset
		}, random))
	}

	it('keeps the historical centered landing at spread 0', () => {
		for(let index = 0; index < 40; index += 1) {
			const seed = `centered-${index}`
			const random = createSeededRandom(seed)
			const bounds = createBounds(1752, 942)
			const legacy = createScatteredLanding({
				index: 0, count: 2, scale: DEFAULT_SCALE, startingHeight: DEFAULT_STARTING_HEIGHT,
				coin: false, objectRadius: OBJECT_RADIUS, bounds,
				launchEdge: selectPresentationLaunchEdge(seed, 1752, 942),
				spawnSpacing: DEFAULT_SPAWN_SPACING, spawnHeightStep: 0, spawnOverscan: 0.15
			}, random)
			assert.deepEqual(layoutFor(seed, 0)[0], legacy)
		}
	})

	it('reaches every side of a wide table and stays inside the barriers', () => {
		const bounds = createBounds(1752, 942)
		const centers = getHorizontalCenterBounds(bounds, OBJECT_RADIUS)
		let minX = Infinity
		let maxX = -Infinity
		for(let index = 0; index < 200; index += 1) {
			for(const landing of layoutFor(`spread-${index}`, 1)) {
				assertInside(landing, bounds, OBJECT_RADIUS, `spread landing ${index}`)
				minX = Math.min(minX, landing.x)
				maxX = Math.max(maxX, landing.x)
			}
		}
		assert.ok(minX < centers.minX * 0.8, `leftmost landing ${minX.toFixed(2)} of ${centers.minX.toFixed(2)}`)
		assert.ok(maxX > centers.maxX * 0.8, `rightmost landing ${maxX.toFixed(2)} of ${centers.maxX.toFixed(2)}`)
	})

	it('moves the whole presentation together', () => {
		const [first, second] = layoutFor('together', 1)
		const [centeredFirst, centeredSecond] = layoutFor('together', 0)
		assert.ok(Math.abs((first!.x - second!.x) - (centeredFirst!.x - centeredSecond!.x)) < 1e-9)
		assert.ok(Math.abs((first!.z - second!.z) - (centeredFirst!.z - centeredSecond!.z)) < 1e-9)
	})
})
