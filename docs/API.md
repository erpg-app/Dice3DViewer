# Referência da API v3

[← Voltar ao README](../README.md)

Esta referência descreve a API pública de `@erpg/dice3dview` 3.0.0-alpha.0. A biblioteca é destinada ao navegador: a criação exige DOM; a inicialização do renderer exige WebGL (WebGL2, com fallback para WebGL1).

## Exports públicos

```ts
export default DiceResultViewer

export {
  createDiceLook,
  createMixedDisplayRequest,
  createSystemDisplayRequest,
  DEFAULT_TIMELINE_OPTIONS,
  DICE_LOOK_FORMAT,
  DICE_LOOK_VERSION,
  diceLookOptions,
  DiceResultViewer,
  DISPLAY_CANCELLED_CODE,
  DisplayCancelledError,
  isDisplayCancelledError,
  loadParticlePresets,
  PARTICLE_MOMENTS,
  PARTICLE_PRESET_NAMES,
  PARTICLE_SHAPES
}

export type {
  CoinFaceTheme,
  CoinTheme,
  CollisionEvent,
  DiceGlowOptions,
  DiceLook,
  DiceLookOptions,
  DiceParticleOptions,
  DiceParticlePreset,
  DiceSides,
  DiceSkinBlend,
  DiceSkinOptions,
  DisplayMode,
  DisplayRequest,
  DisplayResult,
  DisplayTimelineRequest,
  DisplayTimelineResult,
  DiceTimelineEvent,
  MixedDicePresentationOptions,
  MixedDiePresentationInput,
  MixedDisplayRequestInput,
  ParticleBlend,
  ParticleBurstMoment,
  ParticleCondition,
  ParticleEffectDefinition,
  ParticleEmitterOptions,
  ParticleMoment,
  ParticleShape,
  ResolvedDie,
  ResolvedThemeConfig,
  ThemeConfig,
  ThemeMaterialConfig,
  TimelineDieDefinition,
  TimelineEffectOptions,
  TimelineEffectName,
  TimelineOptions,
  TimelineProgressDie,
  TimelineProgressEvent,
  TimelineProgressStage,
  ViewerOptions
}
```

O CSS é um subpath público separado:

```ts
import '@erpg/dice3dview/style.css'
```

O pacote não tem dependências de runtime. `@erpg/dice3dview/external` continua
publicado como alias do entrypoint raiz para quem já o importava na v2. Os
adaptadores puros estão em `@erpg/dice3dview/adapters`, que não importa o
renderer.

## `DiceResultViewer`

```ts
class DiceResultViewer {
  readonly canvas: HTMLCanvasElement

  constructor(options?: ViewerOptions)
  init(): Promise<this>
  display(request: DisplayRequest): Promise<DisplayResult>
  displayTimeline(request: DisplayTimelineRequest): Promise<DisplayTimelineResult>
  clear(): void
  updateOptions(options: ViewerOptions): Promise<void>
  resize(): void
  dispose(): void
}
```

### `constructor(options)`

Cria e anexa imediatamente um canvas ao `container`. Embora `container` seja opcional no tipo por compatibilidade, ele precisa identificar um elemento existente.

Erros imediatos incluem ambiente sem `document`, container inexistente, modo
inválido, valores numéricos não finitos ou incoerentes e estruturas mínimas de
tema, material e moeda inválidas.

### `init()`

Cria o contexto WebGL, carrega o tema principal e os temas de `preloadThemes`, instala a observação de tamanho e devolve a própria instância. Chamadas repetidas são idempotentes.

`display()` chama `init()` automaticamente quando necessário.

### `display(request)`

Valida e normaliza os resultados, cancela qualquer apresentação ativa, simula o arremesso e o reproduz.

O retorno contém clones normalizados e congelados. Os números recebidos são preservados, mas os objetos não mantêm identidade referencial com os objetos de entrada.

```ts
const result = await viewer.display({
  id: 'ataque-7',
  dice: [{ id: 'd20-1', sides: 20, value: 18 }]
})

// {
//   id: 'ataque-7',
//   dice: [{
//     id: 'd20-1',
//     sides: 20,
//     value: 18,
//     discarded: false,
//     theme: 'default',
//     themeColor: '#2e8555'
//   }],
//   durationMs: ...
// }
```

`durationMs` inclui inicialização lazy, carregamento de temas, simulação e animação.

Depois que a entrada foi validada, falhas gráficas ou de asset são
best-effort em `display()`: são registradas e o resultado externo normalizado
continua sendo devolvido. A biblioteca nunca recalcula ou substitui uma face.

### `displayTimeline(request)`

Apresenta um journal semântico já resolvido. Cada definição possui apenas identidade, lados e tema; as faces vêm dos eventos `roll`/`reroll`. O método valida todo o journal antes de limpar a cena: IDs, sequências positivas estritamente crescentes, rolls iniciais, referências, linhagem, ciclos e transições.

```ts
const result = await viewer.displayTimeline({
  id: 'explosao-1',
  dice: [
    { id: 'root', sides: 6 },
    { id: 'child', sides: 6 }
  ],
  events: [
    { sequence: 1, type: 'roll', subject: 'die', dieId: 'root', parentDieId: null, rollIndex: 1, sourceNodeId: 'n1', value: 6 },
    { sequence: 2, type: 'roll', subject: 'die', dieId: 'child', parentDieId: 'root', rollIndex: 1, sourceNodeId: 'n1', value: 4 },
    { sequence: 3, type: 'explode', subject: 'die', dieId: 'root', parentDieId: null, rollIndex: 1, sourceNodeId: 'n1', childDieId: 'child', value: 4, reason: 'explode' }
  ]
})
```

O retorno acrescenta `eventCount`, `phaseCount` e `degraded` ao contrato de `DisplayResult`. `dice` contém faces físicas válidas e estado final de descarte. Totais `compound` e ajustes `penetrate` nunca viram faces inexistentes: o dado mantém a face física e pulsa na cor do efeito.

Ao contrário de `display()`, `displayTimeline()` propaga falhas gráficas e de
asset. Uma timeline parcialmente executada não é reportada como sucesso.

Como cada fase é apresentada:

| Fase | Apresentação |
|---|---|
| explosões iniciais | os filhos nascem dentro da mesma simulação do arremesso, assim que o pai estabiliza: o pai dá um flash, um anel se expande no chão e o filho sai de dentro dele crescendo |
| explosões tardias | os pais brilham e tremem (antecipação); nova simulação em que o filho nasce do pai (ou entra pela borda) e os dados já na mesa são obstáculos imóveis |
| `reroll`, `unique` | o dado brilha e treme, decola com um anel no chão e é relançado a partir de onde está; os demais ficam imóveis |
| `compound`, `penetrate` | pulso na cor do efeito |
| `keep`, `drop`, absorção do compound | os descartados perdem a saturação (a opacidade não muda); em keep/drop, os que sobraram respondem com um brilho na cor de `keep` |
| classificações e críticos | pulsos na cor do efeito (`pulses` nos críticos); críticos também emitem um anel no chão |

Dados com `discarded: true` em `display()` usam o mesmo visual dos descartados da timeline. Uma nova apresentação tira os dados anteriores com um fade de 280 ms enquanto o próximo arremesso entra; `clear()` continua removendo tudo de imediato. O relógio da animação avança no máximo 50 ms por quadro: um travamento momentâneo atrasa o movimento em vez de fazer os dados saltarem.

Configure `onTimelineProgress` no viewer para sincronizar a interface com a
estabilização visual, sem estimar tempos no consumidor:

```ts
const viewer = new DiceResultViewer({
  container: '#dice-stage',
  onTimelineProgress(progress) {
    // progress.dice é o snapshot visível e imutável desta etapa.
    renderSubtotal(progress.dice)
  }
})
```

O callback recebe `initial` quando os dados-raiz param, `phase` durante a
progressão semântica e `complete` ao final. Uma explosão libera o dado-filho
assim que o dado-pai estabiliza, mesmo que outros dados da mesma fase ainda
estejam em movimento, e emite seu snapshot quando o filho para. Em explosões no
próprio arremesso, o filho que pousar antes de todos os dados-raiz é reportado
logo depois de `initial`, na ordem em que pousou. Cada snapshot informa `id`,
`phaseIndex` zero-based (ou `null`), `phaseCount`, `phaseId`, `effect`,
`revealedDieIds`, os dados visíveis `{ id, value, discarded }` e
`completedEventSequences` cumulativo. Em uma apresentação degradada/plana,
somente `initial` e `complete` são emitidos. Exceções do callback são isoladas
e nunca cancelam a animação.

### `clear()`

Cancela a apresentação ativa, para o laço de renderização e limpa a cena. A Promise da apresentação cancelada rejeita com `DisplayCancelledError`.

### `updateOptions(options)`

Mescla opções com a configuração atual, atualiza o repositório de temas e aplica as opções ao renderer. Luz e sombra valem no próximo quadro; opções de arremesso e de timeline, na próxima apresentação.

Para alterar `container`, `id`, `antialias` (atributo do contexto WebGL) ou a raiz/definição de assets já carregados, descarte a instância e crie outra. `preloadThemes` só é consumido por `init()`.

### `applyLook(look)`

Aplica um visual completo (cor, skin, partículas e brilho), como um arquivo JSON exportado pela oficina. Equivale a `updateOptions(diceLookOptions(look))`: o arquivo é validado antes e, se for inválido, nada muda. Veja [Visuais](#visuais-arquivos-da-oficina).

### `playParticles(moment, options?)`

Toca na hora um momento de partículas (`impact`, `collision`, `settle`, `aura`, `explode` ou `critical`) nos dados que estão na mesa, ou só em `options.dice` (ids). Ignora as condições `when` dos emissores e usa o efeito atual de `particles`; sem efeito configurado, não faz nada. Serve para a aplicação comemorar um resultado que ela mesma decidiu.

```ts
viewer.playParticles('critical')
viewer.playParticles('settle', { dice: ['d-1', 'd-3'] })
```

### `resize()`

Recalcula o tamanho usando o canvas ou o elemento pai. Depois de `init()`, a instância observa automaticamente o container com `ResizeObserver` e também responde a `window.resize` como fallback. A resolução do canvas acompanha o `devicePixelRatio`, limitada a 2×, e o palco da próxima apresentação é calculado pelo novo tamanho.

### `dispose()`

Cancela a apresentação, remove o listener, libera texturas, buffers e o contexto WebGL, e remove o canvas. `dispose()` é idempotente. Depois dele, não reutilize a instância; `init()`, `display()` e `updateOptions()` impedem explicitamente o reuso.

## Contratos de dados

```ts
type DiceSides = 2 | 4 | 6 | 8 | 10 | 12 | 20 | 100
type DisplayMode = 'physics'

interface ResolvedDie {
  readonly id: string
  readonly sides: DiceSides
  readonly value: number
  readonly discarded?: boolean
  readonly theme?: string
  readonly themeColor?: string
}

interface DisplayRequest {
  readonly id: string
  readonly dice: readonly ResolvedDie[]
  readonly seed?: string
  /** @deprecated Toda apresentação é física na v3. */
  readonly mode?: DisplayMode | 'kinematic'
}

interface DisplayResult {
  readonly id: string
  readonly dice: readonly ResolvedDie[]
  readonly durationMs: number
}
```

### `createMixedDisplayRequest(input)`

Aceita diretamente a lista achatada de `rollMixedDice().dice`:

```ts
const mixed = rollMixedDice(
  '2d20+5; v5(7,3,4); fate(4); assim(2,1,1,1)'
)

await viewer.display(createMixedDisplayRequest({
  id: 'mixed-42',
  dice: mixed.dice,
  unsupportedDice: 'omit'
}))
```

Para dados com `profileId`, o adaptador aplica o tema simbólico e valida os
lados do perfil. Para dados genéricos, usa `physicalValue`, depois `rawValue`
e por último `value`. d3 usa a geometria d6; lados sem geometria, inclusive o
`dF` genérico, são omitidos por padrão. `unsupportedDice: 'error'` transforma
essa omissão em erro. IDs duplicados no lote são rejeitados.

### Normalização e validação

- `request.id` deve ser uma string não vazia;
- `dice` deve conter ao menos um item;
- `mode` pode ser omitido, `'physics'` ou o legado `'kinematic'`, que é apresentado com física e gera um aviso único no console; outros valores são rejeitados;
- os únicos lados são d2, d4, d6, d8, d10, d12, d20 e d100;
- `value` deve ser inteiro finito entre `1` e `sides`;
- d2 aceita exclusivamente `1` ou `2`;
- um ID de dado vazio recebe `${request.id}-die-${index}`;
- `seed` usa `request.id` quando ausente;
- `discarded` usa `false` quando ausente;
- `theme` e `themeColor` usam os defaults do viewer;
- IDs duplicados não são rejeitados;
- em runtime, lados e valores passam por `Number()`, embora TypeScript exija números.

`maxDice` conta corpos visuais. d2–d20 usam um corpo; cada d100 usa dois.

Na moeda d2, a frente cuja normal local é `+Y` representa o valor `1` e usa quaternion `Identity`. O verso cuja normal local é `−Y` representa o valor `2` e usa rotação `π`. Esse referencial é fixo mesmo quando o tema troca as texturas por cara/coroa ou outros símbolos.

## `ViewerOptions`

### Timeline

`timeline.enabled` usa `true`; `maxEvents`, `maxDurationMs` e `phaseGapMs` usam `500`, `12000` e `180`. Cada efeito aceita `enabled`, `delayMs`, `durationMs`, `intensity` (`0..1`) e `color`. Nos efeitos físicos (`explode`, `reroll`, `unique`), `durationMs` controla o pulso de aviso; o movimento dura o que a física precisar. Opções especializadas:

| Efeito | Opções adicionais | Default |
|---|---|---|
| `explode` | `origin: 'source' \| 'edge'`, `burstHeight`, `spread` | `source`, `1.6`, `0.8` |
| `reroll`, `unique` | `style: 'hop' \| 'edge' \| 'spin'`, `hopHeight` | `hop`, `2.2` |
| `compound`, `penetrate` | `showBadge` (deprecated, ignorado) | `true` |
| `criticalSuccess`, `criticalFailure` | `pulses` | `2` |

Também existem `keep`, `drop`, `success`, `failure` e `neutral`. Todos vêm ativos; `neutral` usa intensidade reduzida. Configurações inválidas são rejeitadas no construtor ou em `updateOptions()` sem substituir a configuração válida anterior.

```ts
await viewer.updateOptions({
  timeline: {
    maxDurationMs: 16_000,
    effects: {
      criticalSuccess: { enabled: false },
      reroll: { style: 'edge' },
      explode: { origin: 'edge' }
    }
  }
})
```

O merge é profundo por efeito: no exemplo, mudar `style` não apaga `enabled`, cor, duração ou intensidade. `timeline.enabled: false` e estouros de orçamento usam a apresentação plana final e retornam `degraded: true`.

### Núcleo e temas

| Opção | Tipo | Default | Observação |
|---|---|---:|---|
| `id` | `string` | `dice-canvas-${Date.now()}` | ID do canvas; construção |
| `container` | `string \| HTMLElement \| null` | `null` | obrigatório na prática; construção |
| `assetPath` | `string` | `/assets/dice-box/` | raiz pública dos assets |
| `origin` | `string` | `window.location.origin` | origem para assets internos |
| `mode` | `DisplayMode` | `physics` | deprecated: toda apresentação é física |
| `theme` | `string` | `default` | tema padrão |
| `preloadThemes` | `readonly string[]` | `[]` | carregados durante `init()` |
| `externalThemes` | `Record<string, string>` | `{}` | mapa tema → URL base |
| `themeColor` | `string` | `#2e8555` | cor padrão dos poliedros |
| `maxDice` | `number` | `120` | inteiro positivo; conta corpos |

### Renderização

| Opção | Tipo | Default | Observação |
|---|---|---:|---|
| `enableShadows` | `boolean` | `true` | sombras de contato suaves sob cada dado |
| `shadowTransparency` | `number` | `0.8` | intensidade das sombras |
| `lightIntensity` | `number` | `1` | multiplicador das luzes |
| `antialias` | `boolean` | `true` | atributo do contexto WebGL; construção |
| `scale` | `number` | `5` | escala dos objetos |
| `delay` | `number` | `10` ms | intervalo de liberação por corpo |
| `wallPadding` | `number` | `0.25` | recuo interno entre a borda visível e a área útil, em unidades do palco |
| `spawnSpacing` | `number` | `1.72` | separação mínima solicitada para o packing de lanes na extremidade comum |
| `spawnHeightStep` | `number` | `0` | offset vertical opcional entre as primeiras entradas; zero mantém o grupo no mesmo plano |
| `spawnOverscan` | `number` | `0.15` | margem extra fora da projeção, como fração do raio, além do raio completo necessário para ocultar o corpo |
| `shadowResolution` | `number` | — | deprecated: sem shadow map na v3; ignorada |
| `duration` | `number` | — | deprecated: duração do modo cinemático da v2; ignorada |

Cada apresentação escolhe pela `seed` uma única borda comum entre esquerda, direita, topo e baixo. O vetor principal sempre aponta para dentro dentro de um cone de 45 graus. O packing usa o raio real do collider para calcular o espaçamento efetivo, nunca menor que `spawnSpacing`, e preenche lanes tangenciais com até duas rows sucessivas atrás da borda recortada. Quando esses slots acabam, novos corpos entram em waves; na v3 cada wave sai assim que a anterior liberou o portal, pela velocidade real de lançamento.

O centro inicial é colocado além da projeção no plano da altura de lançamento por `raio × (1 + max(0, spawnOverscan))`. Assim, nenhuma parte do dado está visível antes de entrar. Somente a parede de lançamento é ignorada até o corpo cruzar a borda; piso, outros dados e as três paredes restantes colidem desde a liberação.

### Física

| Opção | Tipo | Default | Observação |
|---|---|---:|---|
| `gravity` | `number` | `1.3` | multiplica a gravidade `9.81` (a escala do mundo da v3 foi recalibrada) |
| `mass` | `number` | `1.08` | massa base, multiplicada pelo perfil do dado |
| `startingHeight` | `number` | `7.6` | plano de liberação; após offsets opcionais, a altura efetiva é limitada a `2.8–8.1` |
| `spinForce` | `number` | `5.8` | velocidade angular de liberação |
| `throwForce` | `number` | `6.4` | alcance do lançamento e força das explosões |
| `aggressiveThrowChance` | `number` | `0.12` | chance seedada por apresentação, entre `0` e `1`, de usar a cauda de maior energia; não seleciona paredes |
| `wallBounceChance` | `number` | alias deprecated | compatibilidade para `aggressiveThrowChance` |
| `colliderScale` | `number` | `1.02` | escala do collider dos poliedros; não altera a moeda |
| `friction` | `number` | `0.54` | atrito do piso |
| `restitution` | `number` | `0.29` | elasticidade do piso |
| `linearDamping` | `number` | `0.10` | amortecimento linear |
| `angularDamping` | `number` | `0.08` | amortecimento angular |
| `settleTimeout` | `number` | `4200` ms | orçamento de acomodação depois da última liberação (e de cada filho de explosão, a partir do nascimento); passado o orçamento, os dados perdem energia aos poucos até repousar, nunca são cortados; nunca decide o valor |
| `physicsWasmUrl` | `string` | — | deprecated: a v3 não usa WebAssembly; ignorada |

### Motor físico da v3

A trajetória inteira é calculada antes da reprodução, em fatias de 8 ms que não bloqueiam a página:

1. o plano de lançamento da v2 (borda, lanes, rows, waves, pouso disperso e velocidade natural) define posições, atrasos e velocidades; na física, cada dado mira parcialmente o centro do grupo e recebe ±22% de energia;
2. o casco convexo de cada dado vem do collider do tema; os contatos usam planos para piso e paredes e teste de eixos separadores com manifold recortado entre dados;
3. os contatos são especulativos (um dado rápido não atravessa outro) e a restituição roda em um passe separado; a penetração residual é corrigida em posição;
4. um dado adormece quando fica parado numa janela de tempo; em repouso sobre uma face ele adormece rápido, inclinado precisa ficar parado mais tempo;
5. quando todos estão parados, cada dado recebe a rotação de simetria *G* que leva a face do resultado à face que ficou para cima. *G* mapeia o casco sobre si mesmo, então é aplicada ao desenho durante toda a trajetória sem alterar silhueta, contatos ou movimento;
6. se algum dado terminar inclinado, fora do palco ou sem leitura, a coreografia é recalculada com `seed#n`. Os valores nunca mudam.

A política varia com a quantidade de corpos:

| Corpos | Tentativas | Passo | Dados inclinados aceitos |
|---:|---:|---:|---|
| até 16 | até 6 | 1/120 s, 12 iterações | nenhum |
| 17–40 | até 2 | 1/120 s, 10 iterações | até 6% |
| mais de 40 | 1 | 1/90 s, 8 iterações | pilha livre; dados parados passam a sustentar os seguintes |

Em rerolagens, o dado parte do repouso, então *G* não pode existir desde o primeiro quadro. O motor registra a janela em que o dado está no ar (sem contato) e mistura *G* apenas nesse intervalo, sem salto visível.

O laço usa apenas `+ − × ÷` e `√`: com a mesma `seed`, os mesmos dados e o mesmo tamanho de palco, os quadros são idênticos em qualquer navegador.

### Skin, partículas e brilho

As três são opcionais (`null` por padrão) e podem ser trocadas por `updateOptions()`. A skin vale a partir da próxima apresentação; partículas e brilho mudam na hora (o que ainda está emitindo passa a usar o novo efeito).

```ts
type DiceSkinBlend = 'normal' | 'multiply' | 'screen' | 'overlay'

interface DiceSkinOptions {
  readonly texture: string        // URL, data: ou blob:
  readonly scale?: number         // repetições por dado (0.05–20), padrão 1
  readonly blend?: DiceSkinBlend  // camada sobre themeColor, padrão normal
  readonly opacity?: number       // 0–1, padrão 1 (0 = só a cor)
  readonly labels?: 'auto' | 'light' | 'dark'
}

type DiceParticlePreset =
  | 'sparkle' | 'fire' | 'arcane' | 'frost' | 'dust' | 'confetti' | 'electric' | 'smoke'
  | 'lava' | 'storm' | 'holy' | 'shadow' | 'poison' | 'nature' | 'cosmic'
  | 'lightning' | 'blizzard' | 'hearts'
type ParticleShape =
  | 'soft' | 'spark' | 'star' | 'ring' | 'confetti' | 'smoke'
  | 'bolt' | 'arc' | 'flame' | 'snowflake' | 'heart' | 'diamond' | 'triangle' | 'cross'
type ParticleOrientation = 'random' | 'upright' | 'motion'
type ParticleMoment = 'trail' | 'ground' | 'impact' | 'collision' | 'settle' | 'aura' | 'explode' | 'critical' | 'link'

interface DiceParticleOptions {
  readonly preset?: DiceParticlePreset
  readonly effect?: ParticleEffectDefinition  // tem precedência sobre preset
  readonly intensity?: number                 // 0–3, padrão 1 (multiplica a quantidade)
  readonly size?: number                      // 0.2–4, padrão 1 (multiplica o tamanho)
  readonly color?: string                     // recolore todos os emissores mantendo a rampa de brilho
  readonly shape?: ParticleShape              // mesma forma para todos os emissores (imagens ficam)
  readonly moments?: Partial<Record<ParticleMoment, boolean>>  // false desliga o momento
}

interface ParticleEffectDefinition {
  readonly trail?: ParticleEmitterOptions     // voo (proporcional à velocidade, cheio a 6 u/s)
  readonly ground?: ParticleEmitterOptions    // rastro na mesa; amount por unidade percorrida
  readonly impact?: ParticleEmitterOptions    // dado batendo forte na mesa
  readonly collision?: ParticleEmitterOptions // dados se chocando (a 70% da força, entre os dois)
  readonly settle?: ParticleEmitterOptions    // repouso
  readonly aura?: ParticleEmitterOptions      // dados parados, por auraSeconds
  readonly explode?: ParticleEmitterOptions   // filho de explosão nascendo
  readonly critical?: ParticleEmitterOptions  // críticos da timeline
  readonly auraSeconds?: number               // padrão 2,5
  readonly link?: ParticleEmitterOptions      // entre cada par de dados; size multiplica a distância
  readonly linkDistance?: number              // maior distância ligada, padrão 5
  readonly linkSeconds?: number               // quanto dura depois que os dados param, padrão 2
}

interface ParticleEmitterOptions {
  readonly amount: number                     // por segundo (trail, aura), por unidade (ground) ou por evento
  readonly life: readonly [number, number]    // segundos
  readonly size: readonly [number, number]    // diâmetro, unidades do mundo
  readonly speed: readonly [number, number]
  readonly direction?: 'up' | 'out' | 'sphere' | 'back'
  readonly gravity?: number                   // positivo cai, negativo sobe
  readonly drag?: number
  readonly swirl?: number                     // radianos por segundo
  readonly colors: readonly string[]          // #rgb, #rrggbb ou #rrggbbaa ao longo da vida
  readonly palette?: readonly string[]        // cada partícula sorteia uma cor; colors só esmaece
  readonly blend?: ParticleBlend              // add (brilho) ou alpha (fumaça, confete)
  readonly grow?: number                      // tamanho final relativo, padrão 0.3
  readonly flicker?: number                   // cintilação 0–1
  readonly shape?: ParticleShape              // padrão soft; bolt e arc redesenham o zigue-zague
  readonly image?: string                     // URL (CORS) desenhada no lugar da forma; cores multiplicam
  readonly orient?: ParticleOrientation       // padrão motion para spark/bolt, random para o resto
  readonly spin?: number                      // rotação do sprite, rad/s
  readonly when?: ParticleCondition           // quando o emissor toca (padrão: sempre)
}

interface ParticleCondition {
  readonly minForce?: number                  // impact/collision: força mínima (velocidade × massa)
  readonly minSpeed?: number                  // trail/ground: velocidade mínima (u/s)
  readonly sides?: readonly number[]          // só estes tipos de dado, ex. [20]
  readonly faces?: 'max' | 'min' | readonly number[]  // só estes resultados do dado inteiro
  readonly chance?: number                    // 0–1 por evento (momentos contínuos: uma vez por dado e rolagem)
  readonly cooldown?: number                  // impact/collision: segundos entre disparos do mesmo dado
}

interface DiceGlowOptions {
  readonly color?: string                     // padrão: a cor de cada dado
  readonly intensity?: number                 // 0–3, padrão 1
  readonly light?: boolean                    // luz na mesa, padrão true
  readonly pulse?: boolean                    // respiração lenta, padrão false
}
```

A skin é projetada no corpo do dado por mapeamento triplanar (independente do atlas) e combinada com `themeColor` como camada: `normal` mostra só a imagem, `multiply` escurece (ex.: mármore sobre azul vira mármore azul), `screen` clareia e `overlay` preserva o contraste. Com `labels: 'auto'`, a cor dos números segue o brilho médio resultante e um contorno de contraste é desenhado em volta deles. A imagem é redimensionada para 512² (vale qualquer tamanho, inclusive em WebGL1) e precisa permitir CORS quando vem de outra origem. Skins valem para temas de material `color`.

Moedas coloridas recebem a mesma skin na face e na borda; quando o corpo fica claro (pela skin ou pela cor), a marca neutra da moeda é invertida para escuro, como o atlas dos dados.

`faces` e `sides` se referem ao dado inteiro: um d100 é um dado de 100 lados com valores 1–100 (as duas peças contam juntas) e `'max'` significa o valor igual ao número de lados. Numa colisão, basta um dos dois dados atender. `playParticles()` ignora as condições.

O brilho ilumina o corpo em modo *screen* (dados escuros ganham a cor da luz, dados claros não estouram), soma um halo na silhueta e, com `light`, uma poça de luz na mesa que se abre e esmaece com a altura do dado. Dados descartados perdem o brilho junto com a saturação.

As partículas são cosméticas, mas seguem a `seed` da apresentação. O motor (até 4.000 partículas vivas, point sprites) é um chunk importado na primeira apresentação que usa `particles`; os 15 presets são outro chunk, importado só quando um `preset` é usado (`loadParticlePresets()` também os carrega, para editores próprios). Todo preset define os oito momentos. Partículas vivas da rolagem anterior continuam se apagando quando uma nova começa. Opções inválidas são rejeitadas com o caminho do campo (por exemplo `Viewer option particles.effect.trail.colors[0] must be #rgb, #rrggbb or #rrggbbaa.`).

### Visuais (arquivos da oficina)

Um visual junta cor, skin, partículas e brilho num objeto versionado, pronto para virar arquivo JSON:

```ts
interface DiceLook {
  readonly format: 'dice3dview-look'          // DICE_LOOK_FORMAT
  readonly version: 1                         // DICE_LOOK_VERSION
  readonly name?: string
  readonly themeColor?: string                // #rrggbb; mantém a cor atual quando ausente
  readonly skin?: DiceSkinOptions | null
  readonly particles?: DiceParticleOptions | null
  readonly glow?: DiceGlowOptions | null
}

createDiceLook(parts): DiceLook               // valida e acrescenta format e version
diceLookOptions(look: unknown): DiceLookOptions // valida um objeto ou JSON lido; devolve { themeColor?, skin, particles, glow }
viewer.applyLook(look): Promise<void>         // diceLookOptions + updateOptions
```

Partes que o visual não traz são desligadas (`null`), então aplicar um visual sempre substitui o anterior. Erros citam o campo (`Dice look format must be 'dice3dview-look'.`, `Viewer option particles.intensity …`). A oficina da página de teste exporta a textura dentro do arquivo (WebP de até 512 px) e as partículas como definição completa (`effect`), então o arquivo não depende de URLs externas nem do chunk de presets.

### Callbacks

```ts
interface CollisionEvent {
  readonly action: 'collision'
  readonly body0Id?: string
  readonly body1Id?: string
  readonly force: number
}
```

| Callback | Momento |
|---|---|
| `onCollision(event)` | impacto entre dois dados (um evento por par e episódio); `force` é a velocidade de aproximação vezes a menor massa |
| `onThemeConfigLoaded(theme)` | configuração resolvida quando ainda não estava no cache |
| `onThemeLoaded(theme)` | uma vez por tema distinto usado na apresentação |

Todos usam uma função vazia por padrão.

## Cancelamento

```ts
import {
  DISPLAY_CANCELLED_CODE,
  DisplayCancelledError,
  isDisplayCancelledError
} from '@erpg/dice3dview'
```

`DISPLAY_CANCELLED_CODE` vale `DISPLAY_CANCELLED`.

Uma nova apresentação ou `clear()` aborta a anterior, inclusive durante o cálculo da trajetória. O helper reconhece tanto uma instância da classe quanto um objeto externo que contenha o mesmo código:

```ts
try {
  await viewer.display(request)
} catch(error) {
  if(isDisplayCancelledError(error)) return
  throw error
}
```

## Falhas e autoridade do resultado

Existem quatro categorias:

1. **Entrada inválida:** rejeita antes da apresentação.
2. **Cancelamento:** rejeita com `DisplayCancelledError`.
3. **Falha gráfica ou de asset em `display()`:** registra o erro e devolve o resultado normalizado.
4. **Falha durante `displayTimeline()`:** propaga o erro para impedir sucesso parcial.

Em nenhum caso a biblioteca sorteia um valor substituto. O resultado do chamador continua autoritativo.

## Assets e resolução de URLs

Por padrão:

```text
tema interno:  ${origin}${assetPath}themes/${theme}/theme.config.json
modelo padrão: ${origin}${assetPath}themes/default/default.json
```

Exemplo com CDN:

```ts
const viewer = new DiceResultViewer({
  container: '#dice-stage',
  origin: 'https://static.example.com',
  assetPath: '/erpg/dice-box/',
  externalThemes: {
    bronze: 'https://static.example.com/themes/bronze'
  }
})
```

O servidor deve permitir CORS para temas externos: modelos e texturas são lidos pelo WebGL.

## SSR e frameworks

O módulo pode ser referenciado por tipos em código universal, mas a instância precisa ser criada no cliente:

```ts
if(typeof window !== 'undefined') {
  const { DiceResultViewer } = await import('@erpg/dice3dview')
  const viewer = new DiceResultViewer({ container: '#dice-stage' })
  await viewer.init()
}
```

Em React, Vue ou Svelte, crie a instância após o elemento existir e chame `dispose()` no cleanup.
