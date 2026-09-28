# Migração da v1 para a v2

[← Voltar ao README](../README.md)

A v2 é uma versão principal incompatível. Ela preserva o objetivo de exibir resultados resolvidos, mas substitui a fachada, os modos e a arquitetura herdada.

## Resumo das mudanças

| v1 | v2 |
|---|---|
| `DiceBox` / `WorldFacade` | `DiceResultViewer` |
| `displayRoll(request)` | `display(request)` |
| `updateConfig(options)` | `updateOptions(options)` |
| `forcedResultMode: "visual"` | sem equivalência 1:1; escolha o novo renderer pelo comportamento desejado |
| `forcedResultMode: "physics"` | `mode: "physics"` para preservar colisões e acomodação física |
| `hide()` / `show()` | controle o container pela aplicação |
| mundos onscreen/offscreen/none | um único ambiente visual |
| JavaScript sem tipos publicados | TypeScript estrito e `index.d.ts` |
| sem d2 | moeda d2 nativa |

Também foram removidos o worker OffscreenCanvas, infraestrutura/nomenclatura herdadas de “roll”, leitura da face como autoridade, `rollCollectionData`, builds paralelos minificado/não minificado e `@babylonjs/materials`.

## Antes

```ts
import DiceBox from '@erpg/dice3dview'

const diceBox = new DiceBox({
  container: '#dice-stage',
  assetPath: '/assets/dice-box/',
  forcedResultMode: 'physics'
})

await diceBox.init()

await diceBox.displayRoll({
  id: 'roll-1',
  dice: [
    { id: 'die-1', sides: 20, value: 17 }
  ]
})
```

## Depois

```ts
import { DiceResultViewer } from '@erpg/dice3dview'
import '@erpg/dice3dview/style.css'

const viewer = new DiceResultViewer({
  container: '#dice-stage',
  assetPath: '/assets/dice-box/',
  mode: 'physics'
})

await viewer.init()

await viewer.display({
  id: 'roll-1',
  dice: [
    { id: 'die-1', sides: 20, value: 17 }
  ]
})
```

## Passo a passo

### 1. Atualize a dependência

```json
{
  "dependencies": {
    "@erpg/dice3dview": "github:erpg-app/Dice3DViewer#main"
  }
}
```

O pacote ainda não está no registry público do npm.

### 2. Atualize os assets

Substitua a pasta antiga pelo conteúdo de:

```text
node_modules/@erpg/dice3dview/dist/assets/dice-box/
```

Remova assets de Ammo/worker que não sejam usados por outras dependências. Confirme a presença de:

```text
assets/dice-box/havok/HavokPhysics.wasm
assets/dice-box/themes/default/theme.config.json
assets/dice-box/themes/default/default.json
```

### 3. Importe o CSS público

```ts
import '@erpg/dice3dview/style.css'
```

Na v2.0.2 o CSS possui um subpath estável. O container ainda precisa ter dimensões definidas pela aplicação.

### 4. Troque a classe e os métodos

- importe `DiceResultViewer`;
- troque `displayRoll()` por `display()`;
- troque `updateConfig()` por `updateOptions()`;
- chame `dispose()` no cleanup do componente.

### 5. Migre o modo

Não existe equivalência direta entre `forcedResultMode: "visual"` e `mode: "kinematic"`. Na v1, `visual` ainda fazia parte do pipeline físico e mudava apenas a estratégia de correção final.

Na v2, escolha pelo comportamento:

```ts
// apresentação leve, dirigida e sem colisões
mode: 'kinematic'

// lançamento, gravidade, colisões e acomodação Havok
mode: 'physics'
```

`kinematic` agora é o padrão. Havok é carregado quando o renderer físico é inicializado.

#### Comportamento físico a partir da v2.0.4

Não há breaking change para consumidores da v2. O mesmo `display({ dice, mode: 'physics' })` passa a usar um preflight orientado ao resultado: a pose inicial e a trajetória quaternion `q(t)` são calculadas antes da criação do corpo, e um feed-forward acompanha o plano com microcorreções limitadas. A opção pública nova é `aggressiveThrowChance`; `wallBounceChance` permanece apenas como alias deprecated.

A resposta da v1.0.6 (`81c2ca9`) foi auditada antes da nova calibração. Ela não usava aceleração progressiva ou ease-in: a sensação de lançamento vinha de um kick descendente instantâneo e de torque excêntrico, com velocidades angulares observadas na faixa de aproximadamente `40–100 rad/s`. Copiar essa magnitude para a cena Havok atual produzia movimento instável. A v2.0.4 mantém o gesto, mas normaliza o tumble: no default são `2,35` voltas para os demais poliedros, `2,45` para o d20 e `2,5` para o d2, com velocidade média máxima de `20 rad/s` nos poliedros e `22 rad/s` na moeda. O eixo permanece predominantemente horizontal, com pequenas variações seedadas.

Esses números de voltas são deliberadamente não inteiros. Como o preflight inverte o giro planejado a partir da pose de contato, uma quantidade inteira poderia deixar a face resolvida apontada para cima tanto no início quanto no fim. O novo plano começa visualmente afastado do resultado, gira durante a queda e ainda completa exatamente a orientação solicitada.

O kick linear continua imediato. Com os defaults atuais, `startingHeight: 7.6` eleva o plano fixo e `throwForce: 6.4` usa coeficiente horizontal base `0.22`, cap base `17.5` e cap final `19.5` depois da variação de energia. Forças maiores aumentam o alcance. `aggressiveThrowChance: 0.12` é sorteado uma vez por apresentação e só seleciona a cauda de maior energia e direção da distribuição contínua; não escolhe parede nem garante contato.

Uma única borda comum é escolhida pela `seed` entre as quatro possibilidades, sem restringir esquerda/direita a telas largas ou topo/baixo a telas verticais. Aim e landing de cada corpo continuam internos. Na distribuição validada com os defaults, 75–93% das trajetórias projetadas permanecem diretas; as demais podem ter alcance para uma parede adjacente, a oposta ou um canto. Isso descreve a projeção do vetor, não um impacto garantido: somente a simulação Havok decide o contato real.

O corpo continua nascendo totalmente fora da projeção com `spawnOverscan: 0.15`, mas o portal físico ficou seletivo. Desde a liberação, o dado colide com outros dados, com o piso e com as três paredes que não são a origem. Somente o bit da parede de lançamento é retirado da máscara; ele é restaurado quando o collider entra por completo. As camadas `DICE`, `FLOOR` e uma camada exclusiva para cada parede impedem que abrir o portal desative colisões dado-dado.

O feed-forward angular permanece em plateau até 72% do voo e desacelera apenas nos 28% finais. A curva e sua integral analítica alimentam o mesmo preflight, garantindo que a desaceleração não mude a rotação total planejada; o spin de contato é limitado a `2,6 rad/s`. O preflight agora deriva a viagem horizontal de `velocity × ETA`, em vez de assumir o vetor até o landing, para acompanhar a direção real da soltura. O controller preserva twist/yaw em torno da face resolvida e remove apenas tilt perturbador. A frenagem linear começa tarde conforme a geometria — de 80% do voo no d2 a 92% no d20 — e conserva no mínimo `max(2.2, 40% da velocidade horizontal inicial)`. Antes do primeiro contato ela ainda pode suavizar a aproximação; depois de tocar parede, piso ou outro dado, deixa de sobrescrever `x/z` e preserva a resposta linear do Havok. O dado chega com giro residual e uma inclinação segura de aresta/canto; depois do impacto, uma sustentação angular decrescente nos primeiros 60% da acomodação impede a parada precoce.

O lock não alinha mais yaw ou pose perfeitamente: ele só pode começar depois da janela mínima do perfil e preserva a orientação física assim que a face correta está segura no topo. No caminho normal, as velocidades são zeradas nessa pose e o corpo segue diretamente para `STATIC`, sem transição `ANIMATED`; isso evita interpolar dados através de seus vizinhos e conserva stacking. Apenas o fallback de timeout usa `finalLock` animado. `TELEPORT` continua reservado à recuperação de corpo fora do palco ou transformação inválida. As janelas são 1.900 ms para d2, 2.400 ms para d4/d20 e 2.300 ms para os demais formatos.

No modo `kinematic`, o settle para a face conhecida também foi adiado: o objeto mantém o giro livre durante 84% da trajetória e interpola para o resultado somente nos 16% finais. Isso não altera `duration`, `delay` ou o contrato determinístico do modo.

Não restaure `forcedResultMode`, leitura da face superior ou troca de textura no frontend. A face correta agora participa da coreografia desde o lançamento, enquanto o valor recebido continua sendo a única autoridade.

### 6. Garanta um ID de request

`request.id` é obrigatório e não pode estar vazio. Ele também vira o `seed` visual quando `seed` não é fornecido.

```ts
const id = crypto.randomUUID()

await viewer.display({
  id,
  seed: id,
  dice: resolvedDice
})
```

### 7. Passe somente resultados resolvidos

Toda fórmula deve ser resolvida antes da apresentação:

```ts
const roll = rollRpgDice('2d20kh1 + 5')

await viewer.display({
  id: crypto.randomUUID(),
  dice: roll.dice
    .filter(die => typeof die.sides === 'number' && die.sides === 20)
    .map(die => ({
      id: die.id,
      sides: 20,
      value: die.value,
      discarded: !die.included
    }))
})
```

O viewer nunca deve receber a fórmula para interpretá-la.

### 8. Trate cancelamento

```ts
import { isDisplayCancelledError } from '@erpg/dice3dview'

void viewer.display(request).catch(error => {
  if(isDisplayCancelledError(error)) return
  console.error(error)
})
```

Iniciar uma nova apresentação ou chamar `clear()` cancela a anterior.

### 9. Revise `maxDice`

O default passou de 999 para 120 corpos visuais. Um d100 conta como dois. Para apresentações maiores:

```ts
const viewer = new DiceResultViewer({
  container: '#dice-stage',
  maxDice: 240,
  enableShadows: false
})
```

Avalie memória e FPS antes de elevar o limite.

### 10. Migre d2 e d3

d2 agora deve ser enviado diretamente:

```ts
{ id: 'coin', sides: 2, value: 1 }
```

O contrato visual é frente/local `+Y` = valor `1` (`Identity`) e verso/local `−Y` = valor `2` (rotação `π`). Temas podem trocar as imagens, mas não devem inverter esse referencial.

d3 ainda não é suportado nativamente. Uma adaptação temporária pode usar d6:

```ts
const displayDie = die.sides === 3
  ? { ...die, sides: 6 as const, value: Math.min(3, die.value) }
  : die
```

Essa conversão pertence à aplicação, não à biblioteca visual.

## Mudanças no retorno

`display()` devolve:

```ts
interface DisplayResult {
  id: string
  dice: readonly ResolvedDie[]
  durationMs: number
}
```

O array e seus objetos são cópias normalizadas e congeladas. A garantia é de igualdade dos valores resolvidos, não de identidade dos objetos.

## Opções de layout e compatibilidade

Desde a v2.0.3, `wallPadding` controla o recuo interno entre a borda visível do canvas e a área útil, em unidades do palco. Na calibração atual seu default é `0.25`. O valor é aplicado a lançamentos, pousos, piso e quatro barreiras físicas; não é necessário recalcular esse recuo em pixels no frontend.

Ao migrar configurações físicas copiadas de releases anteriores, reavalie overrides. Os defaults de piso/dado continuam `gravity: 1.3`, `friction: 0.54`, `restitution: 0.29`, `linearDamping: 0.10` e `angularDamping: 0.08`. As paredes invisíveis não reutilizam esse material: possuem collider de `0.25` unidade, fricção `0.10` e restituição `0.54`, permitindo resposta lateral viva quando um contato emerge sem obrigar a trajetória a alcançá-las.

`delay` usa default de `10` ms e libera os corpos sequencialmente tanto em `kinematic` quanto em `physics`; corpos físicos pendentes permanecem invisíveis e sem colisão. `spawnSpacing` subiu para `1.72` e agora participa de um packing radius-aware: o renderer preenche lanes tangenciais, usa até duas rows atrás da borda recortada e cria waves posteriores quando não restam slots simultâneos. A separação efetiva nunca fica abaixo do diâmetro seguro do collider, e cada wave espera a anterior liberar o portal antes de reutilizar seus slots. `spawnHeightStep` permanece `0` por padrão. Todos os corpos ainda usam a mesma borda e o mesmo caráter de lançamento por apresentação.

`aggressiveThrowChance` é a opção nova, com default `0.12` e intervalo válido `0–1`. Ela é avaliada por apresentação, não por corpo. `wallBounceChance` continua aceito para compatibilidade, mas está deprecated e funciona apenas como alias; apesar do nome legado, nunca promete colisão. Se as duas opções forem fornecidas, prefira `aggressiveThrowChance`.

`startingHeight` continua representando um plano real e fixo, mas seu default subiu de `6.4` para `7.6`; `throwForce` subiu de `5.15` para `6.4`, com cap horizontal de `19.5`. Depois de um possível `spawnHeightStep`, a altura efetiva permanece limitada internamente a `2.8–8.1`. Remova overrides que compensavam a antiga altura baixa ou mantenha um `spawnHeightStep` positivo somente se a variação vertical for intencional.

Temas podem conter `extends` e `specularPower`, que não têm efeito na 2.0.4. Não baseie um novo código nessas propriedades reservadas.

## Checklist final

- [ ] dependência aponta para a v2;
- [ ] assets novos foram copiados;
- [ ] CSS público foi importado;
- [ ] `DiceResultViewer` substituiu a fachada antiga;
- [ ] `display()` substituiu `displayRoll()`;
- [ ] `mode` substituiu `forcedResultMode`;
- [ ] `wallBounceChance` foi substituído por `aggressiveThrowChance` quando havia override legado;
- [ ] todo request possui ID;
- [ ] somente valores resolvidos são enviados;
- [ ] cancelamentos são ignorados de forma tipada;
- [ ] d2 não é mais filtrado no frontend;
- [ ] d3 recebe adaptação externa, se necessário;
- [ ] cleanup chama `dispose()`;
- [ ] fluxo foi testado nos dois modos.
