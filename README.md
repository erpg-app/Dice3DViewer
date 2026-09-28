# @erpg/dice3dview

Camada TypeScript de apresentação 3D para resultados de dados já resolvidos.

O `@erpg/dicecore` interpreta a fórmula e decide os resultados; o `@erpg/dice3dview` recebe esses valores prontos e apenas os apresenta. A biblioteca não interpreta notação, não sorteia valores e não usa a face física como fonte do resultado.

Versão atual: **3.0.0-alpha.0**.

> A v3 é um upgrade major: a mesma API pública, sem Babylon.js e sem Havok.
> Um renderizador WebGL próprio e um motor de física determinístico para dados
> cabem em um único módulo de **44 KB gzip** (a v2 no modo físico carregava
> cerca de 1,16 MB gzip entre Babylon, Havok JS e WASM). O motor de
> partículas (4 KB) e os 15 presets (4 KB) são baixados só quando usados.

## Documentação

- [Referência completa da API](docs/API.md)
- [Criação e hospedagem de temas](docs/THEMES.md)
- [Dados simbólicos: Vampiro V5, Assimilação e Fate](docs/SYMBOLIC_DICE.md)
- [Migração da v2 para a v3](docs/MIGRATION_V3.md)
- [Migração da v1 para a v2](docs/MIGRATION_V2.md)
- [Devlog da v3](DEVLOG_V3.md) e [devlog da v2](DEVLOG_V2.md)
- [Changelog](CHANGELOG.md)
- [Métricas de bundle e carregamento](docs/BUNDLE_METRICS.md)
- [Desempenho da física](docs/PHYSICS_PERFORMANCE.md)
- [Benchmarks: v2 × v3](docs/BENCHMARKS.md)
- [Origem e diferenças do fork](FORK.md) e [avisos de terceiros](THIRD_PARTY_NOTICES.md)

## O que muda na v3

- **Sem dependências de runtime.** Babylon.js e Havok saíram; o pacote é um
  único módulo ES com renderizador WebGL2 (e fallback WebGL1) e física própria.
- **Só física, sempre.** Toda apresentação é simulada: colisões entre dados,
  paredes, pilhas, explosões e rerolagens. O modo `kinematic` da v2 foi
  removido; `mode: 'kinematic'` continua aceito e é apresentado com física.
- **Resultado exato sem "guiar" o dado.** A simulação corre livre; o valor é
  aplicado por uma rotação de simetria do poliedro que só existe no desenho
  (detalhes em [Física determinística](#física-determinística)).
- **Determinística.** A mesma `seed` produz exatamente os mesmos quadros em
  qualquer navegador.
- **Timeline física.** Explosões nascem do dado-pai; rerolagens relançam o
  dado de verdade a partir de onde ele está, enquanto os demais ficam imóveis.
  Os badges da v2 (`Σ`, `−1`) foram removidos: o dado pulsa na cor do efeito.
- **Temas preservados.** Os mesmos `theme.config.json`, modelos `.babylon`,
  atlas e materiais da v2 (cor com máscara, texturas, bump, specular, moedas).
  Os atlas simbólicos (V5, Assimilação, Fate) ganharam glifos alinhados às
  faces e orientação publicada (`faceAtlas.orientation`).

A lista completa de mudanças e o que foi descontinuado estão no
[guia de migração](docs/MIGRATION_V3.md).

## Instalação

Instale a versão publicada no npm:

```bash
npm install @erpg/dice3dview
```

Para consumir diretamente uma tag do repositório:

```bash
npm install github:arkanus-app/dice-box-erpg#v3.0.0-alpha.0
```

```ts
import { DiceResultViewer } from '@erpg/dice3dview'
import { createMixedDisplayRequest } from '@erpg/dice3dview/adapters'
```

O subpath `@erpg/dice3dview/external` continua existindo e aponta para o mesmo
módulo (na v3 não há dependências a externalizar). `@erpg/dice3dview/adapters`
continua sem renderizador, para conversões em código que não desenha.

## Assets obrigatórios

O JavaScript não embute modelos nem texturas. Disponibilize o conteúdo abaixo na aplicação consumidora:

```text
node_modules/@erpg/dice3dview/dist/assets/dice-box/
```

No caminho público correspondente, por padrão:

```text
public/assets/dice-box/
└── themes/
    ├── default/
    ├── default-v2/
    ├── vampire-v5-normal/
    ├── vampire-v5-hunger/
    ├── assimilation/
    └── fate/
```

A pasta `havok/` da v2 não é mais necessária. Também importe o CSS estável do canvas:

```ts
import '@erpg/dice3dview/style.css'
```

Se os arquivos forem hospedados em outro endereço, configure `assetPath` ou `origin`. Consulte [Assets e resolução de URLs](docs/API.md#assets-e-resolução-de-urls).

## Início rápido

```html
<div id="dice-stage"></div>

<style>
  #dice-stage {
    position: fixed;
    inset: 0;
    overflow: hidden;
    pointer-events: none;
  }
</style>
```

```ts
import { DiceResultViewer, isDisplayCancelledError } from '@erpg/dice3dview'
import '@erpg/dice3dview/style.css'

const viewer = new DiceResultViewer({
  container: '#dice-stage',
  assetPath: '/assets/dice-box/',
  theme: 'default',
  themeColor: '#ff0a7a'
})

await viewer.init()

try {
  const presentation = await viewer.display({
    id: 'resultado-42',
    seed: 'animacao-42',
    dice: [
      { id: 'moeda', sides: 2, value: 1 },
      { id: 'ataque', sides: 20, value: 17 },
      { id: 'descartado', sides: 6, value: 2, discarded: true }
    ]
  })

  console.log(presentation.dice, presentation.durationMs)
} catch(error) {
  if(!isDisplayCancelledError(error)) throw error
}
```

`container` aparece como opcional no tipo por compatibilidade de construção, mas é obrigatório na prática: ele deve apontar para um elemento existente quando o viewer for criado.

## Integração com `@erpg/dicecore`

Para rolagens genéricas, o adaptador continua deliberadamente na aplicação. Isso mantém parsing, regras, explosões, rerolls e descartes fora do renderer:

```ts
import { rollRpgDice } from '@erpg/dicecore'
import { DiceResultViewer, type DiceSides } from '@erpg/dice3dview'

const supportedSides = new Set<DiceSides>([2, 4, 6, 8, 10, 12, 20, 100])

const isDisplaySide = (value: unknown): value is DiceSides =>
  typeof value === 'number' && supportedSides.has(value as DiceSides)

const roll = rollRpgDice('4d6kh3 + 2')
const requestId = crypto.randomUUID()

const dice = roll.dice.flatMap(die => isDisplaySide(die.sides)
  ? [{
      id: die.id,
      sides: die.sides,
      value: die.value,
      discarded: !die.included
    }]
  : [])

if(dice.length > 0) {
  await viewer.display({ id: requestId, seed: requestId, dice })
}
```

O `seed` nunca altera `value`. Ele determina a coreografia inteira: com a mesma
`seed`, os mesmos dados e o mesmo tamanho de palco, trajetórias, colisões e
posições finais são idênticos em qualquer navegador.

### Rolagens mistas

`@erpg/dicecore` 3.4.0 separa fórmulas e sistemas por `;`. O resultado
achatado entra diretamente no adaptador misto:

```ts
import { rollMixedDice } from '@erpg/dicecore'
import { createMixedDisplayRequest } from '@erpg/dice3dview'

const mixed = rollMixedDice(
  '2d20+5; v5(7,3,4); fate(4); assim(2,1,1,1); daggerheart(modifier=2,difficulty=15)',
  { seed: 'sessao-42' }
)

await viewer.display(createMixedDisplayRequest({
  id: 'misto-42',
  seed: 'misto-42',
  dice: mixed.dice
}))
```

O adaptador preserva a ordem e `physicalValue`, aplica automaticamente os
temas de `profileId`, converte d3 genérico para a geometria d6 e omite por
padrão formatos genéricos sem representação física, como `dF`. Use
`unsupportedDice: 'error'` para rejeitá-los em vez de omitir. Para Fate 3D,
use `fate()` na notação mista: ele preserva a face d6, enquanto o `dF`
genérico expõe apenas −1, 0 ou +1.

### Timeline semântica

Quando o journal de `@erpg/dicecore` está disponível, passe as definições e os eventos diretamente para `displayTimeline()`. O pacote é estruturalmente compatível com os eventos, mas não depende do core em runtime:

```ts
const viewer = new DiceResultViewer({
  container: '#dice-stage',
  onTimelineProgress(progress) {
    // Cada filho de uma explosão é revelado assim que o dado-pai estabiliza.
    updateRollCard(progress.dice, progress.stage)
  },
  timeline: {
    effects: {
      criticalSuccess: { enabled: false },
      explode: { origin: 'source' },
      reroll: { style: 'hop', hopHeight: 2.2 }
    }
  }
})

await viewer.displayTimeline({
  id: requestId,
  seed: requestId,
  dice: roll.dice.flatMap(die => isDisplaySide(die.sides)
    ? [{ id: die.id, sides: die.sides }]
    : []),
  events: roll.events.filter(event => event.subject === 'die')
})
```

Como cada efeito é apresentado na v3:

| Evento | Apresentação |
|---|---|
| `explode` | o pai dá um flash e um anel se expande no chão; o filho sai de dentro dele, crescendo (`origin: 'source'`), ou entra pela borda do lançamento (`'edge'`) |
| `reroll` / `unique` | o dado brilha e treme (antecipação), decola com um anel no chão e é relançado de verdade: `hop` (salto), `spin` (salto curto girando) ou `edge` (sai e volta a ser lançado da borda) |
| `compound` / `penetrate` | pulso na cor do efeito; o dado absorvido pelo compound perde a cor |
| `keep` / `drop` | os descartados perdem a cor (continuam opacos) e os que sobraram respondem com um brilho suave |
| classificações e críticos | pulsos na cor do efeito; críticos também emitem um anel no chão |

Durante uma rerolagem ou explosão tardia, os dados que já estão na mesa são
obstáculos imóveis: o que já foi mostrado nunca muda. Uma nova apresentação tira
os dados anteriores com um fade curto enquanto o próximo arremesso entra, e o
relógio da animação nunca salta: um quadro lento atrasa o movimento em vez de
teletransportar os dados. Todos os efeitos podem ser
desligados ou ajustados por instância. `updateOptions({ timeline: ... })` faz
merge profundo por efeito. Desligar um efeito remove apenas sua coreografia; a
face física, o descarte e o resultado final continuam autoritativos. Se
`timeline.enabled` for `false`, o journal exceder `maxEvents` ou a duração
estimada exceder `maxDurationMs`, a apresentação degrada antes de começar para
uma rolagem plana com o estado final.

`onTimelineProgress` é opcional e também pode ser trocado por
`updateOptions()`. Ele recebe snapshots imutáveis em `initial`, durante cada
`phase` e em `complete`, incluindo os dados visíveis e as sequências do journal
já concluídas. Erros do callback são isolados da animação.

## Skins, partículas e brilho

Os três recursos são opcionais e podem ser ligados, trocados ou desligados a
qualquer momento com `updateOptions()`. A skin vale a partir da próxima rolagem;
partículas e brilho mudam na hora, inclusive nos dados que já estão na mesa.

### Skin: textura em camadas sobre a cor

A skin é uma imagem aplicada ao corpo do dado como uma camada sobre a cor
(`themeColor`), no estilo de um editor de imagens. Os números e símbolos do tema
ficam por cima. A imagem envolve cada dado por projeção triplanar, então
funciona com qualquer foto ou textura, sem depender do layout do atlas de faces.

```ts
// Dado azul marmorizado: cor azul + camada de mármore em "multiply".
await viewer.updateOptions({
  themeColor: '#2a5bd7',
  skin: {
    texture: '/texturas/marmore.jpg', // URL, data: ou blob: (upload do usuário)
    blend: 'multiply',                // normal | multiply | screen | overlay
    opacity: 1,                       // 0 = só a cor
    scale: 1,                         // repetições da imagem por dado
    labels: 'auto'                    // auto | light | dark
  }
})

// Imagem enviada pelo usuário:
input.addEventListener('change', () => {
  const file = input.files?.[0]
  if(file) void viewer.updateOptions({ skin: { texture: URL.createObjectURL(file) } })
})

await viewer.updateOptions({ skin: null }) // volta à superfície do tema
```

Com `labels: 'auto'`, a cor dos números acompanha o brilho resultante das camadas,
e um contorno fino de contraste mantém a leitura em texturas movimentadas. A skin
vale para temas de material `color` (o atlas guarda só os números) e para as
moedas coloridas (face e borda recebem a mesma camada; a marca da moeda fica
escura quando o corpo fica claro). Temas com atlas colorido completo
(`standard`), como Vampiro V5, mantêm a própria arte.

### Partículas

```ts
await viewer.updateOptions({ particles: { preset: 'fire', intensity: 1 } })
```

Os 15 presets reagem a todos os momentos da rolagem (inclusive o rastro no chão):

| Preset | Efeito |
|---|---|
| `sparkle` | estrelas douradas no voo, faíscas nos impactos, purpurina no chão |
| `fire` | chamas no voo, brasas nos impactos e no chão, chamas nos dados parados |
| `arcane` | partículas lilás em espiral, anéis mágicos nos impactos |
| `frost` | cristais de gelo, estilhaços nos impactos, geada no chão |
| `electric` | faíscas elétricas crepitando |
| `confetti` | confete colorido girando, papel no chão (comemoração nos críticos) |
| `smoke` | fumaça escura |
| `dust` | poeira realista quando os dados batem na mesa |
| `lava` | fogo + terra: gotas de magma, poças incandescentes, erupção no crítico |
| `storm` | raio + nuvem: nuvens de tempestade, descargas, anel de trovão |
| `holy` | luz + estrelas: estrelas douradas, anéis de luz, pilar de luz no crítico |
| `shadow` | vazio + arcano: escuridão rastejante com faíscas violeta |
| `poison` | ácido + fumaça: névoa tóxica, poças ácidas, bolhas e vapores |
| `nature` | folhas + pólen: folhas no voo, vaga-lumes, flores no crítico |
| `cosmic` | estrelas + nebulosa: poeira estelar, rastro de nebulosa, galáxia no crítico |
| `lightning` | arcos elétricos em volta do dado, raios em cada impacto e no crítico |
| `blizzard` | flocos de neve girando no voo, geada no chão |
| `hearts` | corações subindo dos dados, sempre em pé |

Ajustes rápidos por cima de qualquer efeito:

```ts
await viewer.updateOptions({
  particles: {
    preset: 'sparkle',
    intensity: 1.5,           // 0..3, multiplica a quantidade
    size: 1.4,                // 0.2..4, multiplica o tamanho
    color: '#4cc9f0',         // recolore tudo mantendo a rampa de brilho
    shape: 'star',            // soft | spark | star | ring | confetti | smoke | bolt | arc | flame
                              // | snowflake | heart | diamond | triangle | cross
    moments: { ground: false } // desliga momentos específicos
  }
})
```

Cada efeito reage a momentos da rolagem:

| Momento | Quando |
|---|---|
| `trail` | enquanto o dado voa (proporcional à velocidade) |
| `ground` | rastro na mesa enquanto o dado rola nela (`amount` por unidade percorrida) |
| `impact` | o dado bate forte na mesa |
| `collision` | dois dados se chocam (a explosão sai entre eles) |
| `settle` | o dado para |
| `aura` | em volta do dado parado, apagando em `auraSeconds` |
| `explode` | um dado explodido nasce do pai (timeline) |
| `critical` | sucesso ou falha crítica (timeline) |
| `link` | energia entre cada par de dados enquanto rolam e `linkSeconds` depois (`size` multiplica a distância) |

Efeitos próprios são declarativos: um emissor por momento, com forma, rotação,
rampa de cores, paleta e **condições** (`when`) que decidem quando ele toca.

```ts
await viewer.updateOptions({
  particles: {
    effect: {
      trail: { amount: 90, life: [0.3, 0.7], size: [0.1, 0.25], speed: [0.2, 0.8],
               direction: 'up', gravity: -4, drag: 2, colors: ['#ffffff', '#4ade80aa', '#16653400'] },
      ground: { amount: 14, life: [1, 1.8], size: [0.1, 0.2], speed: [0, 0.1], direction: 'out',
                colors: ['#bbf7d0', '#22c55e88', '#16653400'] },
      // Só colisões fortes, no máximo uma a cada 0,3 s por dado.
      collision: { amount: 16, life: [0.1, 0.3], size: [0.2, 0.35], speed: [3, 6], direction: 'out',
                   shape: 'spark', colors: ['#ffffff', '#86efac', '#22c55e00'],
                   when: { minForce: 5, cooldown: 0.3 } },
      // Confete só no 20 natural de um d20.
      settle: { amount: 60, life: [1, 1.8], size: [0.1, 0.17], speed: [1.5, 3.5], direction: 'up',
                gravity: 5, drag: 1.4, shape: 'confetti', spin: 10, blend: 'alpha',
                colors: ['#ffffff', '#ffffff', '#ffffff00'], palette: ['#ff4d6d', '#ffd166', '#4cc9f0'],
                when: { sides: [20], faces: 'max' } }
    }
  }
})
```

Condições disponíveis em `when`: `minForce` (impacto e colisão), `minSpeed`
(rastros), `sides` (tipos de dado), `faces` (`'max'`, `'min'` ou lista de
valores), `chance` (0..1) e `cooldown` (segundos entre dois disparos do mesmo dado).

Para disparar um momento na hora, nos dados que estão na mesa (por exemplo, para
comemorar um resultado decidido pela aplicação):

```ts
viewer.playParticles('critical')                 // todos os dados
viewer.playParticles('settle', { dice: ['d-1'] }) // só alguns
```

O motor de partículas é um chunk separado, baixado só quando `particles` é
usado pela primeira vez; os presets são outro chunk, baixado só quando um
`preset` é usado. Um efeito dado como definição completa (como os que a
oficina exporta) nem baixa os presets. Para montar editores próprios,
`loadParticlePresets()` devolve as definições de todos os presets.

### Oficina de visuais e arquivos de visual

Um **visual** junta cor, skin, partículas e brilho num arquivo JSON versionado,
para guardar e aplicar depois (por exemplo, visuais de jogador no ERPG):

```ts
import { diceLookOptions } from '@erpg/dice3dview'

const look = await (await fetch('/visuais/coracao-de-lava.dice-look.json')).json()
await viewer.applyLook(look)                      // valida e aplica
await viewer.updateOptions(diceLookOptions(look)) // equivalente
```

```json
{
  "format": "dice3dview-look",
  "version": 1,
  "name": "Coração de lava",
  "themeColor": "#2a0f0a",
  "skin": { "texture": "data:image/webp;base64,…", "blend": "normal", "scale": 1, "opacity": 1, "labels": "auto" },
  "particles": { "effect": { "trail": { … }, "impact": { … }, "collision": { … } }, "intensity": 1, "size": 1 },
  "glow": { "color": "#ff5a1a", "intensity": 1.2, "light": true, "pulse": true }
}
```

Arquivos inválidos são rejeitados com o campo culpado, antes de mudar qualquer
coisa. A textura viaja dentro do arquivo (WebP de até 512 px), então o visual
funciona sem hospedar imagens.

A **oficina** (`npm run dev` → `/demo/oficina.html`) cria esses arquivos: 15
visuais prontos para começar (lava, tempestade, relíquia sagrada, vazio…), 18
texturas procedurais ou uma imagem do computador, cor e mistura em camadas, um
editor de partículas por momento (cada momento pode vir de um efeito diferente,
como confete no impacto e fogo no rastro, e tem as próprias condições), brilho,
teste em rolagens reais (dados, moedas, explosões, críticos) e exportação ou
importação do JSON. O editor fica só na demo; a biblioteca recebe o arquivo.

### Brilho dos dados

Os dados podem emitir luz própria: o corpo se ilumina, um halo contorna a
silhueta e uma poça de luz aparece na mesa em volta de cada dado.

```ts
await viewer.updateOptions({
  glow: {
    color: '#ffd166', // sem cor: cada dado brilha na própria cor
    intensity: 1,     // 0..3
    light: true,      // luz na mesa
    pulse: false      // respiração lenta
  }
})
await viewer.updateOptions({ glow: null }) // desliga
```

Dados descartados (keep/drop) apagam o brilho junto com a cor, destacando os que
ficaram.

## Dados suportados

| Tipo | Valores aceitos | Representação |
|---|---:|---|
| d2 | 1–2 | moeda procedural; `1` é frente e `2` é verso |
| d4 | 1–4 | poliedro |
| d6 | 1–6 | poliedro |
| d8 | 1–8 | poliedro |
| d10 | 1–10 | poliedro |
| d12 | 1–12 | poliedro |
| d20 | 1–20 | poliedro |
| d100 | 1–100 | um resultado semântico apresentado por dois corpos |

Valores precisam ser inteiros finitos dentro do intervalo. O d2 aceita exclusivamente `1` ou `2`. Não há d3 nativo; se necessário, a aplicação pode apresentá-lo em um d6, mantendo o valor 1–3.

O limite padrão é de 120 **corpos visuais**. Como um d100 usa dois corpos, 60d100 atingem esse limite.

## Física determinística

A v3 simula os dados com um motor próprio, feito só para eles:

- **Colisões reais.** Casco convexo de cada dado a partir do collider do tema,
  teste de eixos separadores com manifold recortado entre dados, contatos
  especulativos (dados rápidos não se atravessam), restituição em passe
  separado e correção de posição sem injetar energia.
- **O valor não é "guiado".** O dado corre livre até parar. Depois, o motor
  escolhe uma rotação *G* do grupo de simetria do poliedro que leva a face do
  resultado até a face que ficou para cima. Como *G* mapeia o casco sobre si
  mesmo, aplicá-la ao desenho do começo ao fim não muda silhueta, contatos nem
  trajetória. O dado mostra o valor pedido sem ímã, motor ou troca de textura
  no último quadro.
- **Glifos em pé.** Em temas que publicam a orientação da arte
  (`faceAtlas.orientation`), *G* é a que deixa o glifo mais legível; nos
  demais, a mais natural (menor rotação), como um dado real.
- **Determinismo bit a bit.** O laço usa só `+ − × ÷` e `√`, então a mesma
  `seed` gera os mesmos quadros em qualquer motor JavaScript.
- **Coreografia da v2.** A escolha de borda, lanes, rows e waves de entrada,
  o pouso disperso e a velocidade natural de lançamento são os mesmos da v2.
  Na física, os dados miram parcialmente o centro do grupo para se encontrarem,
  e cada um sai com energia ±22% diferente.
- **Re-amostragem limpa.** Se um dado terminar inclinado sobre outro, fora do
  palco ou sem leitura, a coreografia é recalculada com `seed#n`; os valores
  nunca mudam.
- **Mesas lotadas.** Acima de 16 corpos, alguns dados apoiados em outros são
  aceitos; acima de 40, o passo fica mais grosso e dados que param viram parte
  da pilha. O cálculo roda em fatias de 8 ms, então lances grandes não travam a
  página.

A trajetória é calculada antes da reprodução. Medido em Node sem limitação de
CPU: 1,8 ms para um d20, 15 ms para 12d6, 50 ms para 24d6 e 124 ms para 60d6
(mediana). Detalhes em [Desempenho da física](docs/PHYSICS_PERFORMANCE.md).

As opções de arremesso da v2 continuam valendo (`throwForce`, `spinForce`,
`startingHeight`, `gravity`, `friction`, `restitution`, `linearDamping`,
`angularDamping`, `settleTimeout`, `aggressiveThrowChance`, `wallPadding`,
`spawnSpacing`, `spawnOverscan`, `delay`, `mass`, `colliderScale`), agora
recalibradas para o motor da v3.

## d2 como moeda

A moeda usa cilindro e duas faces gerados em runtime, sem adicionar uma nova malha ao modelo principal:

```json
{
  "coin": {
    "front": { "value": 1, "texture": "coin-heads.webp" },
    "back": { "value": 2, "texture": "coin-tails.webp" },
    "colorize": false,
    "edgeColor": "#c89b3c",
    "diameter": 1,
    "thickness": 0.12
  }
}
```

Temas podem usar números, cara/coroa, brasões ou qualquer outra arte. Os valores internos continuam sendo `1` e `2`. Se o bloco `coin` não existir, o tema recebe a moeda numérica padrão.

A moeda numérica padrão usa SVGs transparentes contendo somente `1` e `2`. Com
`colorize: true`, o renderer aplica `themeColor` ao corpo e ao aro da moeda;
assim, o d2 acompanha a mesma skin de cor dos demais dados. Temas com arte
completa devem usar `colorize: false` e podem continuar definindo `edgeColor`.

Veja a configuração completa em [Temas](docs/THEMES.md).

## Ciclo de vida

```ts
await viewer.init()
await viewer.display(request)
viewer.clear()
await viewer.updateOptions({ themeColor: '#7c3aed' })
viewer.resize()
viewer.dispose()
```

- uma nova chamada a `display()` cancela a apresentação anterior;
- `clear()` também cancela e limpa os objetos visuais;
- mudanças no tamanho do container são detectadas automaticamente com `ResizeObserver`;
- `wallPadding` define o recuo entre a borda visível e a área útil, em unidades do palco; o default é `0.25`;
- o cancelamento rejeita com `DisplayCancelledError` e código `DISPLAY_CANCELLED`;
- `dispose()` é idempotente e remove canvas, listener, loops e o contexto WebGL;
- depois de `dispose()`, a instância não pode ser reutilizada.

Falhas de entrada continuam rejeitando normalmente. Falhas gráficas ou de tema durante a apresentação são tratadas como best-effort: são registradas no console e a biblioteca ainda devolve uma cópia normalizada e congelada dos resultados resolvidos.

Esse comportamento best-effort vale para `display()`. `displayTimeline()`
propaga falhas gráficas e de asset, pois devolver sucesso depois de uma
execução parcial deixaria o journal visual em um estado enganoso.

## Tamanho

| Artefato | v2 | v3 |
|---|---:|---:|
| primeira carga, modo físico (gzip) | 1.158.986 B | 43.608 B |
| primeira carga, só cinemático da v2 (gzip) | 438.335 B | 43.608 B |
| motor de partículas (sob demanda, gzip) | — | 4.328 B |
| 15 presets de partículas (sob demanda, gzip) | — | 3.558 B |
| compilação JS da primeira carga (V8) | 34 ms | 6,8 ms |
| WebAssembly | Havok (~2 MB) | nenhum |
| dependências de runtime | Babylon + Havok | nenhuma |

Consulte [Métricas de bundle e carregamento](docs/BUNDLE_METRICS.md).

## Desenvolvimento local

```bash
npm install
npm run typecheck
npm test
npm run build
npm run benchmark:physics
```

`npm run dev` abre o Vite; a página de teste fica em `/demo/`. Ela aceita
notação: cada fórmula é resolvida pelo `@erpg/dicecore` e apresentada pela
biblioteca, com atalhos para explosão, compound, penetrate, rerolagem, keep/drop,
críticos, sistemas e mesas grandes. A demo espera o repositório
`rpg-dice-roller` ao lado deste (`../rpg-dice-roller`).

### Exemplo integrado com o dicecore

O arquivo [`example/index.html`](example/index.html) importa os builds locais de
`@erpg/dicecore` e `@erpg/dice3dview`. A própria página recebe uma fórmula,
resolve a rolagem, mostra o total e apresenta os dados em 3D.

Com este repositório e `rpg-dice-roller` lado a lado, gere os dois builds e abra
o exemplo:

```bash
cd ../rpg-dice-roller
npm run build
cd ../dice-box-erpg
npm run build
npm run example
```

O servidor abre `http://localhost:5173/example/index.html`. O exemplo precisa
ser servido por HTTP; módulos ESM e assets 3D não funcionam corretamente ao
abrir o HTML diretamente com `file://`.

## Estado e próximos passos

A v3 está em alpha. Itens em aberto estão no [devlog da v3](DEVLOG_V3.md#próximos-passos).

## Licença

A partir da 3.0.0 o pacote usa a [Licença de Uso Aberto e Autorizado ERPG](LICENSE):

- **projetos de código aberto** (código-fonte completo público sob uma licença
  aprovada pela OSI ou reconhecida pela FSF) podem usar, modificar e
  distribuir livremente, mantendo a licença e os avisos;
- **qualquer outro uso** (produto fechado ou comercial, SaaS com código não
  público, ferramenta interna de empresa) precisa de **autorização por
  escrito** da Arkanus, pedida pelos canais do
  [repositório](https://github.com/arkanus-app/dice-box-erpg).

As versões 1.x e 2.x continuam sob a licença MIT com que foram publicadas.

## Atribuição

Este pacote começou como fork do projeto MIT `@3d-dice/dice-box`, da 3Ddice. O
formato de tema e os assets dos temas padrão continuam sob a licença MIT
original, reproduzida em [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). A
origem e as mudanças estruturais estão em [FORK.md](FORK.md).
