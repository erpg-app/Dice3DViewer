export declare interface ClassifyTimelineEvent extends DiceTimelineEventBase {
    readonly type: 'classify';
    readonly outcome: 'success' | 'failure' | 'neutral' | 'critical-success' | 'critical-failure';
}

export declare interface CoinFaceTheme {
    readonly value: 1 | 2;
    readonly texture: string;
}

export declare interface CoinTheme {
    readonly front: CoinFaceTheme;
    readonly back: CoinFaceTheme;
    /** Uses each die's themeColor as the coin surface behind alpha-masked face artwork. */
    readonly colorize?: boolean;
    readonly edgeColor?: string;
    readonly diameter?: number;
    readonly thickness?: number;
}

export declare interface CollisionEvent {
    readonly action: 'collision';
    readonly body0Id?: string;
    readonly body1Id?: string;
    readonly force: number;
}

/** Wraps look parts into the versioned file format. */
export declare const createDiceLook: (parts: Omit<DiceLook, "format" | "version">) => DiceLook;

export declare const createMixedDisplayRequest: (input: MixedDisplayRequestInput) => DisplayRequest;

/**
 * Converts the structural SystemDieResult contract from @erpg/dicecore into
 * the display-only request consumed by DiceResultViewer.
 */
export declare const createSystemDisplayRequest: (input: SystemDisplayRequestInput) => DisplayRequest;

export declare const DEFAULT_TIMELINE_OPTIONS: NormalizedTimelineOptions;

export declare const DICE_LOOK_FORMAT = "dice3dview-look";

export declare const DICE_LOOK_VERSION = 1;

/** The dice emit their own light: a self-lit surface, a halo and a pool of light on the table. */
export declare interface DiceGlowOptions {
    /** Light color; each die's own color when omitted. */
    readonly color?: string;
    /** 0..3. Default `1`. */
    readonly intensity?: number;
    /** Pool of light cast on the table around each die. Default `true`. */
    readonly light?: boolean;
    /** Slow breathing of the light. Default `false`. */
    readonly pulse?: boolean;
}

/**
 * A complete dice look: color, skin, particle effect and glow. The workshop of
 * the test page exports it as a JSON file, ready to be stored and applied later.
 */
export declare interface DiceLook {
    readonly format: typeof DICE_LOOK_FORMAT;
    readonly version: typeof DICE_LOOK_VERSION;
    readonly name?: string;
    /** Dice color (`#rrggbb`); the viewer's color is kept when omitted. */
    readonly themeColor?: string;
    readonly skin?: DiceSkinOptions | null;
    readonly particles?: DiceParticleOptions | null;
    readonly glow?: DiceGlowOptions | null;
}

/** Viewer options a look sets. Parts the look leaves out are turned off. */
export declare interface DiceLookOptions {
    readonly themeColor?: string;
    readonly skin: DiceSkinOptions | null;
    readonly particles: DiceParticleOptions | null;
    readonly glow: DiceGlowOptions | null;
}

/**
 * Validates a look (an object or a parsed JSON file) and returns the viewer
 * options it sets, e.g. `viewer.updateOptions(diceLookOptions(json))`.
 * Invalid files throw with the offending field.
 */
export declare const diceLookOptions: (look: unknown) => DiceLookOptions;

export declare interface DiceParticleOptions {
    /** Built-in effect. Ignored when `effect` is given. */
    readonly preset?: DiceParticlePreset;
    /** Custom effect definition. */
    readonly effect?: ParticleEffectDefinition;
    /** Multiplies every emission (0..3). Default `1`. */
    readonly intensity?: number;
    /** Recolors every emitter with this hue, keeping its bright-to-dark ramp. */
    readonly color?: string;
    /** Draws every emitter with this sprite (emitters with an `image` keep their image). */
    readonly shape?: ParticleShape;
    /** Particle size multiplier (0.2..4). Default `1`. */
    readonly size?: number;
    /** Moments to play; all are on unless set to `false` (e.g. `{ ground: false }`). */
    readonly moments?: Readonly<Partial<Record<ParticleMoment, boolean>>>;
}

export declare type DiceParticlePreset = 'sparkle' | 'fire' | 'arcane' | 'frost' | 'dust' | 'confetti' | 'electric' | 'smoke' | 'lava' | 'storm' | 'holy' | 'shadow' | 'poison' | 'nature' | 'cosmic' | 'lightning' | 'blizzard' | 'hearts';

declare class DiceResultViewer {
    #private;
    readonly canvas: HTMLCanvasElement;
    constructor(options?: ViewerOptions);
    init(): Promise<this>;
    display(request: DisplayRequest): Promise<DisplayResult>;
    displayTimeline(request: DisplayTimelineRequest): Promise<DisplayTimelineResult>;
    clear(): void;
    updateOptions(options: ViewerOptions): Promise<void>;
    /**
     * Applies a complete look (color, skin, particles and glow), e.g. a JSON
     * file exported by the workshop. Invalid looks throw before anything changes.
     */
    applyLook(look: unknown): Promise<void>;
    /**
     * Plays a particle moment now on the dice on the table (all of them, or the
     * given die ids), ignoring the emitters' `when` conditions. Uses the current
     * `particles` option; does nothing without one.
     */
    playParticles(moment: ParticleBurstMoment, options?: {
        readonly dice?: readonly string[];
    }): void;
    resize(): void;
    dispose(): void;
}
export { DiceResultViewer }
export default DiceResultViewer;

export declare type DiceSides = 2 | 4 | 6 | 8 | 10 | 12 | 20 | 100;

/** How the skin image combines with the die color underneath (image editor layer modes). */
export declare type DiceSkinBlend = 'normal' | 'multiply' | 'screen' | 'overlay';

/**
 * Custom surface for the dice body, layered like an image editor: the die
 * color (`themeColor`) is the base layer and the image goes on top with a
 * blend mode and an opacity — e.g. a blue die with a marble layer in
 * `multiply` becomes blue marble. The image is wrapped around each die with a
 * triplanar projection (independent of the face atlas), and the theme's
 * numbers and symbols stay above both layers. Applies to themes of material
 * type `color`; full-color atlases (`standard`) keep their own artwork.
 */
export declare interface DiceSkinOptions {
    /** Image URL; `data:` and `blob:` URLs (e.g. an uploaded file) are accepted. */
    readonly texture: string;
    /** Repetitions of the image across one die. Default `1`. */
    readonly scale?: number;
    /** Blend of the image over the die color. Default `normal` (the image alone). */
    readonly blend?: DiceSkinBlend;
    /** Opacity of the image layer, 0..1 (0 = only the color). Default `1`. */
    readonly opacity?: number;
    /** Color of numbers and symbols; `auto` picks by the image brightness. Default `auto`. */
    readonly labels?: 'auto' | 'light' | 'dark';
}

export declare type DiceTimelineEvent = RollTimelineEvent | RerollTimelineEvent | ExplodeTimelineEvent | TransformTimelineEvent | IncludeTimelineEvent | ExcludeTimelineEvent | ClassifyTimelineEvent;

declare interface DiceTimelineEventBase {
    readonly sequence: number;
    readonly subject?: 'die';
    readonly dieId: string;
    readonly parentDieId: string | null;
    readonly rollIndex: number;
    readonly sourceNodeId: string;
}

export declare const DISPLAY_CANCELLED_CODE: "DISPLAY_CANCELLED";

export declare class DisplayCancelledError extends Error {
    readonly code: "DISPLAY_CANCELLED";
    constructor(message?: string);
}

/** v3 presents every result with the physics engine. */
export declare type DisplayMode = 'physics';

export declare interface DisplayRequest {
    readonly id: string;
    readonly dice: readonly ResolvedDie[];
    readonly seed?: string;
    /** @deprecated Every presentation is physical in v3; kept for v2 compatibility. */
    readonly mode?: DisplayMode | LegacyDisplayMode;
}

export declare interface DisplayResult {
    readonly id: string;
    readonly dice: readonly ResolvedDie[];
    readonly durationMs: number;
}

export declare interface DisplayTimelineRequest {
    readonly id: string;
    readonly dice: readonly TimelineDieDefinition[];
    readonly events: readonly DiceTimelineEvent[];
    readonly seed?: string;
    /** @deprecated Every presentation is physical in v3; kept for v2 compatibility. */
    readonly mode?: DisplayMode | LegacyDisplayMode;
}

export declare interface DisplayTimelineResult extends DisplayResult {
    readonly eventCount: number;
    readonly phaseCount: number;
    readonly degraded: boolean;
}

export declare interface ExcludeTimelineEvent extends DiceTimelineEventBase {
    readonly type: 'exclude';
    readonly reason: 'drop' | 'keep' | 'compound-absorbed';
}

export declare interface ExplodeTimelineEvent extends DiceTimelineEventBase {
    readonly type: 'explode';
    readonly childDieId: string;
    readonly value: number;
    readonly reason: 'explode' | 'compound' | 'penetrate';
}

export declare const getSystemThemeProfile: (profileId: string) => Readonly<{
    theme: "vampire-v5-normal";
    themeColor: "#20242e";
    sides: 10;
}> | Readonly<{
    theme: "vampire-v5-hunger";
    themeColor: "#761827";
    sides: 10;
}> | Readonly<{
    theme: "assimilation";
    sides: 6;
}> | Readonly<{
    theme: "assimilation";
    sides: 10;
}> | Readonly<{
    theme: "assimilation";
    sides: 12;
}> | Readonly<{
    theme: "fate";
    sides: 6;
}> | Readonly<{
    theme: "default-v2";
    themeColor: "#ff0a7a";
    sides: 12;
}> | Readonly<{
    theme: "default-v2";
    themeColor: "#00f585";
    sides: 12;
}>;

export declare interface IncludeTimelineEvent extends DiceTimelineEventBase {
    readonly type: 'include';
    readonly contribution: number;
}

export declare const isDisplayCancelledError: (error: unknown) => error is DisplayCancelledError;

export declare const isSystemDiceProfileId: (value: unknown) => value is SystemDiceProfileId;

/** @deprecated v3 removed the kinematic renderer; `'kinematic'` is accepted and presented physically. */
declare type LegacyDisplayMode = 'kinematic';

/**
 * The built-in particle effects (definitions for every preset name). They are
 * a separate chunk, downloaded on the first call, so apps can list or remix
 * them (e.g. in their own editor) without weighing on the core module.
 */
export declare const loadParticlePresets: () => Promise<Readonly<Record<DiceParticlePreset, ParticleEffectDefinition>>>;

export declare interface MixedDicePresentationOptions extends SystemDicePresentationOptions {
    /**
     * Unsupported generic dice (for example dF or d7) are omitted by default.
     * System profiles are always validated and never silently omitted.
     */
    readonly unsupportedDice?: 'omit' | 'error';
    readonly theme?: string;
}

export declare interface MixedDiePresentationInput {
    readonly id: string;
    readonly sides: number | string;
    readonly value: number;
    readonly rawValue?: number;
    readonly physicalValue?: number;
    readonly profileId?: string | null;
    readonly included?: boolean;
    readonly discarded?: boolean;
    readonly theme?: string;
    readonly themeColor?: string;
}

export declare interface MixedDisplayRequestInput extends MixedDicePresentationOptions {
    readonly id: string;
    readonly dice: readonly MixedDiePresentationInput[];
    readonly seed?: string;
    readonly mode?: DisplayMode;
}

declare interface NormalizedTimelineBadgeEffectOptions extends NormalizedTimelineEffectOptions {
    readonly showBadge: boolean;
}

declare interface NormalizedTimelineCriticalEffectOptions extends NormalizedTimelineEffectOptions {
    readonly pulses: number;
}

declare interface NormalizedTimelineEffectOptions {
    readonly enabled: boolean;
    readonly delayMs: number;
    readonly durationMs: number;
    readonly intensity: number;
    readonly color: string;
}

declare interface NormalizedTimelineExplodeEffectOptions extends NormalizedTimelineEffectOptions {
    readonly origin: 'source' | 'edge';
    readonly burstHeight: number;
    readonly spread: number;
}

declare interface NormalizedTimelineOptions {
    readonly enabled: boolean;
    readonly maxEvents: number;
    readonly maxDurationMs: number;
    readonly phaseGapMs: number;
    readonly effects: {
        readonly explode: NormalizedTimelineExplodeEffectOptions;
        readonly compound: NormalizedTimelineBadgeEffectOptions;
        readonly penetrate: NormalizedTimelineBadgeEffectOptions;
        readonly reroll: NormalizedTimelineRerollEffectOptions;
        readonly unique: NormalizedTimelineRerollEffectOptions;
        readonly keep: NormalizedTimelineEffectOptions;
        readonly drop: NormalizedTimelineEffectOptions;
        readonly success: NormalizedTimelineEffectOptions;
        readonly failure: NormalizedTimelineEffectOptions;
        readonly neutral: NormalizedTimelineEffectOptions;
        readonly criticalSuccess: NormalizedTimelineCriticalEffectOptions;
        readonly criticalFailure: NormalizedTimelineCriticalEffectOptions;
    };
}

declare interface NormalizedTimelineRerollEffectOptions extends NormalizedTimelineEffectOptions {
    readonly style: 'hop' | 'edge' | 'spin';
    readonly hopHeight: number;
}

export declare const PARTICLE_MOMENTS: readonly ParticleMoment[];

export declare const PARTICLE_ORIENTATIONS: readonly ParticleOrientation[];

/** Built-in effects; their definitions load with the particle engine (render/particlePresets). */
export declare const PARTICLE_PRESET_NAMES: readonly DiceParticlePreset[];

export declare const PARTICLE_SHAPES: readonly ParticleShape[];

export declare type ParticleBlend = 'add' | 'alpha';

/** Moments that play once per event (the ones `playParticles` can trigger). */
export declare type ParticleBurstMoment = 'impact' | 'collision' | 'settle' | 'aura' | 'explode' | 'critical';

/**
 * When an emitter plays. Every condition given must hold; faces and sides
 * refer to the whole die (a d100 is one die with values 1..100).
 */
export declare interface ParticleCondition {
    /** Impact and collision: minimum hit force (impact speed × mass; soft touches ~1, hard throws 8..15). */
    readonly minForce?: number;
    /** Trail and ground: minimum die speed in world units per second. */
    readonly minSpeed?: number;
    /** Only dice with these numbers of sides (e.g. `[20]`). */
    readonly sides?: readonly number[];
    /** Only these results: `max` (highest face), `min` (lowest) or a list of values. */
    readonly faces?: 'max' | 'min' | readonly number[];
    /** Probability of each event, 0..1 (continuous moments decide once per die and roll). Default `1`. */
    readonly chance?: number;
    /** Impact and collision: minimum seconds between two bursts of the same die. */
    readonly cooldown?: number;
}

/** A particle effect: each emitter reacts to one moment of the roll. */
export declare interface ParticleEffectDefinition {
    /** While a die travels. */
    readonly trail?: ParticleEmitterOptions;
    /** Marks left on the table along the path while a die rolls; `amount` is per unit of distance. */
    readonly ground?: ParticleEmitterOptions;
    /** A die landing hard on the table. */
    readonly impact?: ParticleEmitterOptions;
    /** Two dice hitting each other (the burst appears between them). */
    readonly collision?: ParticleEmitterOptions;
    /** When a die comes to rest. */
    readonly settle?: ParticleEmitterOptions;
    /** Around resting dice, fading out over `auraSeconds`. */
    readonly aura?: ParticleEmitterOptions;
    /** An explosion child bursting from its parent. */
    readonly explode?: ParticleEmitterOptions;
    /** Critical success or failure. */
    readonly critical?: ParticleEmitterOptions;
    /** How long the aura lasts after a die rests. Default `2.5`. */
    readonly auraSeconds?: number;
    /**
     * Energy between dice: while they roll (and `linkSeconds` after the last
     * one rests) every pair closer than `linkDistance` emits `amount`
     * particles per second at its middle, turned along the pair and as long as
     * the gap times `size` (`[1.1, 1.1]` reaches both dice). Suits `bolt` and
     * `arc` with a short life.
     */
    readonly link?: ParticleEmitterOptions;
    /** Largest gap (world units, a die is about 1.2 across) a link crosses. Default `5`. */
    readonly linkDistance?: number;
    /** Seconds links keep going after the dice rest. Default `2`. */
    readonly linkSeconds?: number;
}

/** One particle emitter. Ranges are `[min, max]`, distances in world units, times in seconds. */
export declare interface ParticleEmitterOptions {
    /** Trails and auras: particles per second (trails scale with the die speed). Bursts: particles per event. */
    readonly amount: number;
    readonly life: readonly [number, number];
    /** Particle diameter. */
    readonly size: readonly [number, number];
    readonly speed: readonly [number, number];
    /** Initial direction: `up` cone, `out` along the table, `sphere` any way, `back` against the motion. Default `sphere`. */
    readonly direction?: 'up' | 'out' | 'sphere' | 'back';
    /** Positive falls, negative rises. Default `0`. */
    readonly gravity?: number;
    /** Velocity loss per second. Default `0`. */
    readonly drag?: number;
    /** Turns around the vertical axis per second (radians). Default `0`. */
    readonly swirl?: number;
    /** Color stops over the particle life (`#rgb`, `#rrggbb` or `#rrggbbaa`). */
    readonly colors: readonly string[];
    /** `add` glows (fire, sparkles); `alpha` covers (smoke, dust). Default `add`. */
    readonly blend?: ParticleBlend;
    /** Size factor at the end of life. Default `0.3`. */
    readonly grow?: number;
    /** Random twinkle, 0..1. Default `0`. */
    readonly flicker?: number;
    /** Sprite drawn for each particle. Default `soft`. */
    readonly shape?: ParticleShape;
    /**
     * Image drawn for each particle instead of `shape` (URL of a PNG/WebP with
     * transparency, loaded with CORS). The colors multiply the image: keep them
     * white to show it as is. Up to 16 different images per viewer; until one
     * loads its particles are invisible, and a broken one falls back to a glow.
     */
    readonly image?: string;
    /** How the sprite is turned. Default `motion` for sparks and bolts, `random` otherwise. */
    readonly orient?: ParticleOrientation;
    /** Rotation speed in radians per second (confetti, stars). Particles turned along their motion ignore it. */
    readonly spin?: number;
    /** Each particle takes one of these colors; `colors` then only fades it over its life. */
    readonly palette?: readonly string[];
    /** Conditions for playing (force, speed, faces, sides, chance, cooldown). Default: always. */
    readonly when?: ParticleCondition;
}

/** Moments of a roll an effect can react to. */
export declare type ParticleMoment = 'trail' | 'ground' | 'impact' | 'collision' | 'settle' | 'aura' | 'explode' | 'critical' | 'link';

/**
 * How a particle sprite is turned: `random` starts at any angle (then `spin`),
 * `upright` starts straight up on screen (images, hearts), `motion` points
 * along the particle's own movement (sparks, bolts, comets).
 */
export declare type ParticleOrientation = 'random' | 'upright' | 'motion';

/**
 * Sprite of a particle: `soft` round glow, `spark` streak along the motion,
 * `star` four-point twinkle, `ring` hollow circle, `confetti` spinning
 * paper, `smoke` soft irregular puff, `bolt` jagged lightning along the
 * motion, `arc` crackling electric filaments, `flame` tongue of fire,
 * `snowflake` six-armed crystal, `heart`, `diamond` faceted gem, `triangle`
 * and `cross`. Bolts and arcs redraw their zigzag several times per second.
 */
export declare type ParticleShape = 'soft' | 'spark' | 'star' | 'ring' | 'confetti' | 'smoke' | 'bolt' | 'arc' | 'flame' | 'snowflake' | 'heart' | 'diamond' | 'triangle' | 'cross';

export declare interface RerollTimelineEvent extends DiceTimelineEventBase {
    readonly type: 'reroll';
    readonly from: number;
    readonly to: number;
    readonly reason: 'reroll' | 'reroll-once' | 'unique' | 'unique-once';
}

export declare interface ResolvedDie {
    readonly id: string;
    readonly sides: DiceSides;
    readonly value: number;
    readonly discarded?: boolean;
    readonly theme?: string;
    readonly themeColor?: string;
}

export declare interface ResolvedThemeConfig extends ThemeConfig {
    readonly theme: string;
    readonly basePath: string;
    readonly meshName: string;
    readonly meshFilePath: string;
    readonly coin: CoinTheme;
}

export declare interface RollTimelineEvent extends DiceTimelineEventBase {
    readonly type: 'roll';
    readonly value: number;
}

/**
 * 3D presentation of each system die. Profiles with a `themeColor` carry a
 * color with meaning (V5 normal vs. hunger, Daggerheart hope vs. fear); the
 * others (Fate, Assimilação) follow the requested color, then the viewer's.
 */
export declare const SYSTEM_THEME_PROFILES: Readonly<{
    readonly 'vampire-v5-normal-d10': Readonly<{
        theme: "vampire-v5-normal";
        themeColor: "#20242e";
        sides: 10;
    }>;
    readonly 'vampire-v5-hunger-d10': Readonly<{
        theme: "vampire-v5-hunger";
        themeColor: "#761827";
        sides: 10;
    }>;
    readonly 'assimilation-d6': Readonly<{
        theme: "assimilation";
        sides: 6;
    }>;
    readonly 'assimilation-d10': Readonly<{
        theme: "assimilation";
        sides: 10;
    }>;
    readonly 'assimilation-d12': Readonly<{
        theme: "assimilation";
        sides: 12;
    }>;
    readonly 'fate-df': Readonly<{
        theme: "fate";
        sides: 6;
    }>;
    readonly 'daggerheart-hope-d12': Readonly<{
        theme: "default-v2";
        themeColor: "#ff0a7a";
        sides: 12;
    }>;
    readonly 'daggerheart-fear-d12': Readonly<{
        theme: "default-v2";
        themeColor: "#00f585";
        sides: 12;
    }>;
}>;

export declare interface SystemDicePresentationOptions {
    /**
     * Assimilação selection IDs. When supplied, every non-selected die is
     * presented as discarded. Both semantic IDs and sourceDieIds are accepted.
     */
    readonly keptIds?: readonly string[];
    readonly themeColors?: Readonly<Partial<Record<SystemDiceProfileId, string>>>;
    /**
     * Color for profiles without a meaningful color (Fate, Assimilação). When
     * absent, those dice take the viewer's `themeColor`.
     */
    readonly themeColor?: string;
}

export declare type SystemDiceProfileId = keyof typeof SYSTEM_THEME_PROFILES;

export declare interface SystemDiePresentationInput {
    readonly id: string;
    readonly sourceDieId?: string;
    readonly sides: number;
    readonly value: number;
    readonly profileId: string;
    readonly discarded?: boolean;
    /** Explicit color for this die (wins over every profile color). */
    readonly themeColor?: string;
}

export declare interface SystemDisplayRequestInput extends SystemDicePresentationOptions {
    readonly id: string;
    readonly dice: readonly SystemDiePresentationInput[];
    readonly seed?: string;
    readonly mode?: DisplayMode;
}

export declare interface ThemeConfig {
    readonly name?: string;
    readonly systemName?: string;
    readonly extends?: string;
    readonly meshFile?: string;
    readonly material: ThemeMaterialConfig;
    readonly diceAvailable: readonly string[];
    readonly faceAtlas?: ThemeFaceAtlasConfig;
    readonly faceMetadata?: ThemeFaceMetadata;
    readonly coin?: CoinTheme;
    readonly [key: string]: unknown;
}

export declare interface ThemeFaceAtlasConfig {
    readonly layoutId: string;
    readonly width: number;
    readonly height: number;
    readonly model?: string;
    /**
     * Optional JSON (relative to the theme) with the local "up" direction of
     * each face artwork, per die type and value. Used to present symbolic faces
     * upright whenever the die's symmetry allows it.
     */
    readonly orientation?: string;
}

export declare interface ThemeFaceDefinition {
    readonly label: string;
    readonly symbols: readonly string[];
}

export declare interface ThemeFaceMetadata {
    readonly schemaVersion: 1;
    readonly mappingId: string;
    readonly symbols: Readonly<Record<string, ThemeSymbolDefinition>>;
    readonly dice: Readonly<Record<string, Readonly<Record<string, ThemeFaceDefinition>>>>;
}

export declare interface ThemeMaterialConfig {
    readonly type: 'color' | 'standard';
    readonly diffuseTexture?: string | Readonly<{
        light: string;
        dark: string;
    }>;
    readonly bumpTexture?: string;
    readonly specularTexture?: string;
    readonly diffuseLevel?: number;
    readonly bumpLevel?: number;
    readonly specularPower?: number;
}

export declare interface ThemeSymbolDefinition {
    readonly label: string;
}

export declare interface TimelineBadgeEffectOptions extends TimelineEffectOptions {
    /** @deprecated v3 draws no badges; the die pulses in the effect color. Accepted and ignored. */
    readonly showBadge?: boolean;
}

export declare interface TimelineCriticalEffectOptions extends TimelineEffectOptions {
    readonly pulses?: number;
}

export declare interface TimelineDieDefinition {
    readonly id: string;
    readonly sides: DiceSides;
    readonly theme?: string;
    readonly themeColor?: string;
}

export declare type TimelineEffectName = keyof NormalizedTimelineOptions['effects'];

export declare interface TimelineEffectOptions {
    readonly enabled?: boolean;
    readonly delayMs?: number;
    readonly durationMs?: number;
    readonly intensity?: number;
    readonly color?: string;
}

export declare interface TimelineEffectsOptions {
    readonly explode?: TimelineExplodeEffectOptions;
    readonly compound?: TimelineBadgeEffectOptions;
    readonly penetrate?: TimelineBadgeEffectOptions;
    readonly reroll?: TimelineRerollEffectOptions;
    readonly unique?: TimelineRerollEffectOptions;
    readonly keep?: TimelineEffectOptions;
    readonly drop?: TimelineEffectOptions;
    readonly success?: TimelineEffectOptions;
    readonly failure?: TimelineEffectOptions;
    readonly neutral?: TimelineEffectOptions;
    readonly criticalSuccess?: TimelineCriticalEffectOptions;
    readonly criticalFailure?: TimelineCriticalEffectOptions;
}

export declare interface TimelineExplodeEffectOptions extends TimelineEffectOptions {
    readonly origin?: 'source' | 'edge';
    readonly burstHeight?: number;
    readonly spread?: number;
}

export declare interface TimelineOptions {
    readonly enabled?: boolean;
    readonly maxEvents?: number;
    readonly maxDurationMs?: number;
    readonly phaseGapMs?: number;
    readonly effects?: TimelineEffectsOptions;
}

export declare interface TimelineProgressDie {
    readonly id: string;
    readonly value: number;
    readonly discarded: boolean;
}

/**
 * Immutable presentation snapshot. The initial snapshot announces the root
 * dice when playback starts; physical explosion snapshots may represent one
 * settled die within a semantic phase. `phaseIndex` is zero-based and is
 * `null` for the initial and final snapshots.
 */
export declare interface TimelineProgressEvent {
    readonly id: string;
    readonly stage: TimelineProgressStage;
    readonly phaseIndex: number | null;
    readonly phaseCount: number;
    readonly phaseId: string | null;
    readonly effect: TimelineEffectName | null;
    readonly revealedDieIds: readonly string[];
    readonly dice: readonly TimelineProgressDie[];
    readonly completedEventSequences: readonly number[];
}

export declare type TimelineProgressStage = 'initial' | 'phase' | 'complete';

export declare interface TimelineRerollEffectOptions extends TimelineEffectOptions {
    readonly style?: 'hop' | 'edge' | 'spin';
    readonly hopHeight?: number;
}

/**
 * Converts the flattened `rollMixedDice().dice` contract into one 3D request.
 * Generic and profiled dice preserve their original order and physical faces.
 */
export declare const toMixedResolvedDice: (dice: readonly MixedDiePresentationInput[], options?: MixedDicePresentationOptions) => readonly ResolvedDie[];

export declare const toSystemResolvedDice: (dice: readonly SystemDiePresentationInput[], options?: SystemDicePresentationOptions) => readonly ResolvedDie[];

export declare const toSystemResolvedDie: (die: SystemDiePresentationInput, options?: SystemDicePresentationOptions) => ResolvedDie;

export declare interface TransformTimelineEvent extends DiceTimelineEventBase {
    readonly type: 'transform';
    readonly from: number;
    readonly to: number;
    readonly reason: 'minimum' | 'maximum' | 'penetrate' | 'compound';
}

export declare interface ViewerOptions {
    readonly id?: string;
    readonly container?: string | HTMLElement | null;
    readonly assetPath?: string;
    readonly origin?: string;
    /** @deprecated Every presentation is physical in v3; kept for v2 compatibility. */
    readonly mode?: DisplayMode | LegacyDisplayMode;
    readonly theme?: string;
    readonly preloadThemes?: readonly string[];
    readonly externalThemes?: Readonly<Record<string, string>>;
    readonly themeColor?: string;
    readonly maxDice?: number;
    readonly enableShadows?: boolean;
    readonly shadowTransparency?: number;
    /** @deprecated v3 uses soft contact shadows without a shadow map; ignored. */
    readonly shadowResolution?: number;
    readonly lightIntensity?: number;
    readonly antialias?: boolean;
    readonly scale?: number;
    /** @deprecated Travel time of the v2 kinematic mode; ignored in v3. */
    readonly duration?: number;
    readonly delay?: number;
    readonly gravity?: number;
    readonly mass?: number;
    readonly startingHeight?: number;
    readonly spinForce?: number;
    readonly throwForce?: number;
    /** Seeded per-presentation chance (0..1) of using the high-energy launch tail. */
    readonly aggressiveThrowChance?: number;
    /** @deprecated Use aggressiveThrowChance. This never guarantees a wall collision. */
    readonly wallBounceChance?: number;
    readonly wallPadding?: number;
    readonly colliderScale?: number;
    readonly spawnSpacing?: number;
    readonly spawnHeightStep?: number;
    /** Extra off-screen margin, expressed as a fraction of the body radius. */
    readonly spawnOverscan?: number;
    readonly friction?: number;
    readonly restitution?: number;
    readonly linearDamping?: number;
    readonly angularDamping?: number;
    readonly settleTimeout?: number;
    /** @deprecated v3 physics is plain JavaScript (no WebAssembly); ignored. */
    readonly physicsWasmUrl?: string;
    /** Custom texture for the dice body (`null` = theme surface). */
    readonly skin?: DiceSkinOptions | null;
    /** Particle effect played with the rolls (`null` = none). */
    readonly particles?: DiceParticleOptions | null;
    /** Light emitted by the dice (`null` = none). */
    readonly glow?: DiceGlowOptions | null;
    /**
     * Reduced motion: the dice appear at rest with a short fade, without the
     * throw, trembles, rings, particles or pulsing light. `auto` follows the
     * system setting (`prefers-reduced-motion`). Default `auto`.
     */
    readonly reducedMotion?: 'auto' | 'always' | 'never';
    readonly onCollision?: (event: CollisionEvent) => void;
    readonly onThemeConfigLoaded?: (theme: ResolvedThemeConfig) => void;
    readonly onThemeLoaded?: (theme: ResolvedThemeConfig) => void;
    readonly onTimelineProgress?: (event: TimelineProgressEvent) => void;
    readonly timeline?: TimelineOptions;
}

export { }
