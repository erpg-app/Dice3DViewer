# Changelog

Todas as mudanças relevantes deste projeto são registradas aqui. O formato segue [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/) e a versão usa [Semantic Versioning](https://semver.org/lang/pt-BR/).

## [Não publicado]

### Adicionado

- formas de partícula `bolt` (raio com bifurcação), `arc` (filamentos
  elétricos), `flame`, `snowflake`, `heart`, `diamond`, `triangle` e `cross`;
  raios e arcos redesenham o zigue-zague 14 vezes por segundo;
- partículas de imagem: `image` no emissor desenha uma URL no lugar da forma
  (até 16 imagens por viewer num atlas 4 × 4, tingidas pelas cores);
- `orient` no emissor: `random`, `upright` (em pé na tela) ou `motion`
  (aponta para onde a partícula vai);
- momento `link`: energia entre cada par de dados (partículas no meio do par,
  viradas ao longo dele e do tamanho da distância) enquanto rolam e
  `linkSeconds` depois; `linkDistance` limita o alcance;
- presets `lightning` (com raios entre os dados), `blizzard` e `hearts`;
- `landingSpread` (`0–1`, default `0`): desloca o aglomerado de pouso de
  cada apresentação para um ponto seedado da mesa, em vez de mirar sempre o
  centro. Com `0` nada muda; em mesas largas, `1` usa a mesa inteira.

### Corrigido

- `onTimelineProgress`: em lances com explosões no próprio arremesso, `initial`
  era emitido antes de os dados saírem, entregando os valores dos dados-raiz
  ainda no ar. Agora sai quando os dados-raiz param, como nos demais lances, e
  os filhos que pousarem antes disso são reportados logo em seguida, na ordem.

## [3.0.0-alpha.0] - 2026-09-23

Upgrade major: mesma API pública, sem Babylon.js e sem Havok. Veja o
[guia de migração](docs/MIGRATION_V3.md) e o [devlog da v3](DEVLOG_V3.md).

### Adicionado

- renderizador WebGL próprio (WebGL2 com fallback WebGL1) que reproduz os
  materiais da v2: cor com máscara de textura, `standard`, bump, specular e
  moedas com arte ou cor do tema;
- motor de física determinístico para dados: casco convexo a partir do collider
  do tema, contatos especulativos, SAT com manifold recortado, pilhas, paredes
  e explosões que nascem do dado-pai;
- resultado exato por rotação de simetria do poliedro aplicada só ao desenho,
  sem guiar o dado; a mesma `seed` gera quadros idênticos em qualquer navegador;
- rerolagens (`hop`, `spin`, `edge`) e explosões tardias simuladas, com os
  demais dados como obstáculos imóveis;
- cálculo da trajetória em fatias de 8 ms, sem travar a página em lances grandes;
- `faceAtlas.orientation` e `glyph-orientation.json` para apresentar glifos em
  pé; `npm run themes:align` alinha atlas SVG simbólicos às faces;
- transições da timeline: anel de choque no chão em explosões, rerolagens e
  críticos; antecipação (brilho e tremor) antes de rerolagens e explosões
  tardias; filhos de explosão saindo de dentro do pai; fade dos dados anteriores
  quando uma nova apresentação começa;
- `skin`: textura personalizada no corpo dos dados (URL, data: ou blob: de um
  upload), projetada por mapeamento triplanar e combinada com `themeColor` como
  camada (`normal`, `multiply`, `screen`, `overlay` e opacidade), com cor e
  contorno automáticos para os números;
- `particles`: efeitos de partículas nos momentos da rolagem (voo, rastro na
  mesa, impacto na mesa, colisão entre dados, repouso, aura, explosões e
  críticos), com 15 presets que reagem a todos os momentos — `sparkle`,
  `fire`, `arcane`, `frost`, `electric`, `confetti`, `smoke`, `dust` e os
  combinados `lava`, `storm`, `holy`, `shadow`, `poison`, `nature` e
  `cosmic` — ou definições declarativas próprias; o motor e os presets são
  dois chunks carregados sob demanda, e `loadParticlePresets()` expõe as
  definições para editores próprios;
- emissores com seis formas (`soft`, `spark` alinhada ao movimento, `star`,
  `ring`, `confetti` e `smoke`), rotação (`spin`), paleta por partícula e
  condições `when` (força mínima, velocidade mínima, tipos de dado, faces,
  chance e intervalo por dado);
- ajustes rápidos de `particles`: `color` (recolore mantendo a rampa de
  brilho), `shape`, `size` e `moments`; trocar o efeito vale na hora para o
  que ainda está emitindo;
- `viewer.playParticles(moment, { dice })` toca um momento na hora nos dados
  da mesa;
- `glow`: luz própria dos dados (corpo iluminado, halo e luz na mesa), com cor,
  intensidade e pulsação;
- visuais (`DiceLook`): cor, skin, partículas e brilho num arquivo JSON
  versionado, com `createDiceLook()`, `diceLookOptions()` (validação com o
  campo culpado) e `viewer.applyLook()`;
- marcador de impacto na mesa emitido pela simulação;
- página de teste `demo/` com campo de notação resolvido pelo `@erpg/dicecore`,
  18 skins procedurais, upload de textura, editor completo de partículas (por
  momento, com condições, teste na hora e JSON) e controles de brilho;
- oficina de visuais (`demo/oficina.html`): 15 visuais prontos, mistura de
  momentos de efeitos diferentes, condições por momento, teste em rolagens
  reais e exportação/importação do arquivo JSON;
- `npm run benchmark:physics` com cenários de d20 a 120d6, e comparação com a
  v2 (`npm run benchmark:compare`: download e compilação;
  `npm run benchmark:browser`: página que roda v2 e v3 no mesmo navegador).

### Alterado

- toda apresentação é física; o renderer cinemático foi removido e
  `mode: 'kinematic'` é aceito e apresentado com física (aviso único);
- `DisplayMode` passa a ser `'physics'`; os campos `mode` aceitam também o
  literal legado `'kinematic'`, marcado como deprecated;
- licença: a partir da 3.0.0 o pacote usa a Licença de Uso Aberto e
  Autorizado ERPG (livre para projetos de código aberto, autorização por
  escrito para os demais usos); as partes do `@3d-dice/dice-box` seguem sob a
  licença MIT original (`THIRD_PARTY_NOTICES.md`) e as versões 1.x e 2.x
  continuam MIT;
- a biblioteca é um único módulo ES de 44 KB gzip (saída compactada), sem dependências de runtime
  nem WebAssembly (v2 no modo físico: ~1,16 MB gzip); só as partículas
  opcionais ficam num chunk à parte;
- `@erpg/dice3dview/external` passa a ser alias do entrypoint raiz;
- waves de lançamento de lances grandes são espaçadas pela velocidade real de
  lançamento (120 dados: ~12 s em vez de ~19 s);
- efeitos da timeline usam um contorno de brilho e um tom contido na superfície
  no lugar do HighlightLayer;
- sombras são sombras de contato suaves sob cada dado;
- dados descartados (keep/drop, absorção do compound e `discarded: true`)
  perdem a saturação em vez de ficarem translúcidos; em keep/drop os que
  sobraram brilham, e a duração padrão de `keep`/`drop` passou para 450 ms;
- os atlas de Vampiro V5, Assimilação e Fate foram realinhados às faces;
- dados Fate e Assimilação (perfis neutros) seguem a cor do tema em vez de um
  azul fixo; Vampiro V5 e Daggerheart mantêm as cores que carregam significado.

### Removido

- Babylon.js, Havok e `HavokPhysics.wasm` (a pasta `assets/dice-box/havok/`
  não é mais necessária);
- badges `Σ` (compound) e `−n` (penetrate) da timeline;
- chunks lazy de física, sombras, profiling e highlight, e o profiler
  `__DICE3DVIEW_PHYSICS_PROFILE__`.

### Descontinuado

- `mode: 'kinematic'`, `duration`, `physicsWasmUrl`, `shadowResolution` e
  `showBadge`: aceitos para compatibilidade e ignorados.

### Corrigido

- dados esmaecidos não mostram mais as faces internas;
- o brilho dos efeitos não lava mais a face do dado;
- filhos de explosão apareciam por um quadro no centro da tela e subiam
  atravessando a mesa;
- um quadro lento (primeiro uso de shader, main thread ocupada) fazia os dados
  saltarem: o relógio da animação avança no máximo 50 ms por quadro;
- moedas recebem a skin e a luz da cena como os dados (antes a cor era
  chapada, sem iluminação, e a textura não aparecia), e a marca da moeda fica
  legível em corpos claros;
- o brilho próprio e os destaques da timeline apareciam só como um fio na
  borda das moedas: o halo agora cresce a moeda inteira, como a casca dos dados;
- animações podiam parar no meio: a simulação era cortada no `settleTimeout`
  (arremesso inicial) ou em 3,5 s (rerolagens e explosões tardias), e filhos de
  cadeias longas de explosões nunca nasciam. O tempo agora é um orçamento:
  passado dele, os dados perdem energia aos poucos até repousar, e cada filho
  de explosão ganha o próprio orçamento a partir do nascimento.

## [2.6.0] - 2026-08-08

### Adicionado

- subpaths `@erpg/dice3dview/external`, com a API v2 e dependências gráficas
  externas, e `@erpg/dice3dview/adapters`, sem renderer;
- manifesto de chunks e métricas separadas para grafo inicial, física, sombras,
  timeline, profiling, WASM, assets, pacote e integrações consumidoras;
- perfis `daggerheart-hope-d12` e `daggerheart-fear-d12` para os dois d12 de
  Duality Dice, com d12 fisicos e cores distintas substituiveis por perfil.

### Alterado

- o hot path físico usa índices diretos entre entries, nodes e corpos, reutiliza
  estado vetorial por corpo e evita buscas, ordenações e coleções temporárias
  por frame;
- substeps físicos passam de 180 Hz para 120 Hz após apoio real e para 90 Hz
  quando resta um corpo, reduzindo o trabalho de `12d6` sem alterar os timings
  visuais; o benchmark móvel fica versionado para futuras regressões;
- Babylon atualizado para `@babylonjs/core` 9.18.0; o frontend usa o entrypoint
  `external` e mantém o bundle raiz como fallback CDN;
- o build legado preserva o WASM como asset estável único, removendo sua cópia
  base64 do chunk Havok, e o profiler físico virou um chunk opt-in;
- o frontend gera `HavokPhysics-*.wasm.br` no build web e o serve por negociação
  de conteúdo no Worker, com validação e fallback para o WASM original;
- inicialização do renderer e preloads de temas agora ocorre concorrentemente;
- `ShadowGenerator` e `HighlightLayer` passam a ser carregados somente quando
  sombras ou um efeito da timeline realmente os exigem;
- a moeda numérica padrão agora usa SVGs transparentes contendo somente `1` e
  `2`, e aplica `themeColor` ao corpo e ao aro para acompanhar a skin equipada;
- temas de moeda com arte completa podem preservar textura e `edgeColor` usando
  `colorize: false`;
- os atlas normal e de Fome de Vampiro V5 agora usam os quatro SVGs fornecidos
  pelo projeto para Sucesso, Crítico, Falha de Fome e Crítico de Fome;
- `npm run themes:generate:vampire` recompõe deterministicamente as faces 1,
  6–9 e 10 sem alterar o valor físico dos d10.

### Corrigido

- caches de modelos, pools e orientações agora usam o `meshFilePath` completo,
  evitando colisão entre temas externos com nomes de arquivo iguais;
- opções numéricas e estruturas de temas, materiais e moedas recebem validação
  consistente; `updateOptions()` rejeitado preserva a configuração anterior.

### Documentado

- `display()` mantém falhas gráficas como best-effort; `displayTimeline()`
  propaga essas falhas para não reportar uma timeline parcialmente executada.

## [2.5.0] - 2026-07-31

### Adicionado

- `createMixedDisplayRequest()` e `toMixedResolvedDice()` para apresentar
  dados genéricos, Vampiro V5, Fate e Assimilação no mesmo lançamento;
- suporte estrutural direto a `rollMixedDice().dice`, incluindo
  `physicalValue`, `profileId`, descarte e ordem original;
- conversão documentada de d3 genérico para d6 e política configurável
  `unsupportedDice: 'omit' | 'error'`.

### Segurança e compatibilidade

- o viewer continua sem interpretar notação nem recalcular resultados;
- perfis de sistema desconhecidos geram erro e nunca caem silenciosamente no
  tema genérico;
- o `dF` genérico sem face física é omitido por padrão; `fate()` continua
  usando o perfil d6 apropriado.

## [2.4.0] - 2026-07-31

### Adicionado

- perfil `fate-df` compatível com o resultado estrutural de `rollFateDice()`;
- tema Fate d6 com duas faces “−”, duas vazias e duas “+”;
- metadados acessíveis para −1, 0 e +1, demonstração 4dF e instruções de personalização.

### Segurança e compatibilidade

- a face física 1–6 permanece autoritativa para orientação 3D; o total Fate continua sendo calculado exclusivamente pelo core;
- o tema usa sinais geométricos originais e não inclui logotipos ou ilustrações editoriais.

### Validado

- cobertura do perfil, das seis faces, do atlas claro/escuro e da integração estrutural com `@erpg/dicecore`.

## [2.3.0] - 2026-07-31

### Adicionado

- temas simbólicos originais e não oficiais para dados normais/de Fome de Vampiro V5 e d6/d10/d12 de Assimilação;
- perfis estruturais compatíveis com os resultados de sistema do `@erpg/dicecore`;
- `createSystemDisplayRequest()`, seleção visual por `keptIds` e cores substituíveis por perfil;
- metadados tipados de faces e atlas para acessibilidade, documentação e validação;
- gerador que deriva as ilhas UV do modelo/collider e verifica se os assets versionados estão atualizados.

### Segurança e compatibilidade

- os novos temas não copiam arte oficial e não reutilizam o normal map que contém números em relevo;
- valores numéricos externos continuam sendo a única autoridade da apresentação;
- `colliderFaceMap`, meshes, colliders e orientação física permanecem inalterados.

### Validado

- cobertura dos cinco perfis, lados, valores, cores, seleção e IDs duplicados;
- atlas claro/escuro inspecionado para todas as faces simbólicas;
- geração determinística incluída no preflight do build.

## [2.2.3] - 2026-07-13

### Corrigido

- dados apoiados com uma pequena inclinação causada por colisões agora podem estabilizar e liberar explosões ou rerolls sem aguardar o timeout;
- a d2 usa um cone de inferência próprio, mais amplo, sem confundir a face oposta nem aceitar a moeda apoiada de lado.

### Validado

- cobertura de assentamento inclinado para d2, d4, d6, d8, d10, d12, d20 e d100;
- os cones aceitos permanecem menores que metade da distância angular até a face vizinha em todos os modelos poliédricos.

## [2.2.2] - 2026-07-13

### Alterado

- explosões físicas agora são encadeadas por dado: cada filho é lançado assim que o respectivo pai estabiliza, sem aguardar o restante da rolagem;
- `onTimelineProgress` pode emitir progresso parcial para uma ação de explosão dentro da fase, mantendo o card sincronizado com cada dado.

### Validado

- cobertura do agendador causal para pais simultâneos, descendentes e notificações duplicadas;
- cobertura de snapshots independentes para explosões irmãs dentro da mesma fase.

## [2.2.1] - 2026-07-13

### Corrigido

- filhos explosivos agora reservam um destino livre entre os corpos já assentados, evitando dados e moedas visualmente sobrepostos;
- quando a região acima do pai está ocupada, o filho cai pelo alto sobre o destino reservado antes de recorrer à borda;
- o brilho do cue de explosão usa a cor efetiva de cada dado, incluindo a cor da borda para moedas, com a cor configurada do efeito como fallback.

### Validado

- cadeias de moedas explosivas permanecem faseadas e revelam um filho por vez;
- testes de clearance cobrem queda superior e múltiplos destinos anexados sem sobreposição.

## [2.2.0] - 2026-07-12

### Adicionado

- callback opcional `onTimelineProgress` com snapshots imutáveis após a rolagem inicial, cada fase semântica e a conclusão;
- progresso informa dados visíveis, dados afetados, efeito atual e sequências do journal já concluídas para cards incrementais sem temporizadores.

### Corrigido

- preflight físico de filhos explosivos agora considera todos os corpos assentados e outros filhos da fase;
- quando o ponto acima do pai está ocupado, o spawn sobe até uma altura segura ou usa o lançamento original pela borda, evitando que o novo dado fique bloqueado em pools grandes como `6d6!`.

### Validado

- cobertura do subtotal inicial, progressão por fase, callbacks isolados e apresentações degradadas;
- regressão física reproduzida com seis d6 de escala 6 e filho explosivo, incluindo fallback pela borda.

## [2.1.1] - 2026-07-12

### Corrigido

- registro do `EffectLayerSceneComponent` do Babylon antes de criar os highlights usados pelos cues da timeline;
- falhas de renderização da timeline agora são propagadas ao consumidor em vez de resolver a apresentação parcialmente como sucesso.

### Validado

- teste de regressão com `NullEngine` confirma que o highlight da explosão pode ser criado sem a exceção de side effect;
- reprodução física de `3d6!` confirma que o filho explosivo aparece depois dos três corpos iniciais.

## [2.1.0] - 2026-07-12

### Adicionado

- `displayTimeline()` para journals estruturais compatíveis com `@erpg/dicecore`, sem dependência de runtime;
- planner causal com validação de IDs, sequência, transições, referências e ciclos, agrupando ações independentes;
- animações configuráveis de explosão, reroll/unique, compound/penetrate, keep/drop e classificações nos modos cinemático e físico;
- badges opcionais para compound e penetrate e estilos `hop`, `edge` e `spin` para relançamentos;
- `ViewerOptions.timeline`, defaults públicos e merge profundo por efeito em `updateOptions()`.

### Segurança e compatibilidade

- `display()` permanece inalterado e todo resultado continua externo e autoritativo;
- efeitos desativados preservam faces e estados finais, enquanto estouros de orçamento degradam antes do início para uma apresentação plana;
- explosões físicas acrescentam filhos sem remover corpos, colisores ou observers já estabilizados;
- `clear()`, cancelamento e `dispose()` removem corpos e efeitos temporários da timeline.

### Validado

- cobertura de explosões causais, rerolls desativados, compound, descartes tardios, batches de target, orçamento, opções e append físico.

## [2.0.5] - 2026-07-12

### Corrigido

- registro antecipado dos shaders `StandardMaterial` e `ShadowMap` e de seus includes antes da primeira compilação WebGL;
- metadado `sideEffects` dos chunks de distribuição para impedir que bundlers consumidores removam os registradores modulares do Babylon;
- fallback indevido para arquivos de desenvolvimento `/src/Shaders/**/*.fx`, que em hosts SPA podia receber `index.html` e inserir HTML dentro do GLSL.

### Validado

- teste de regressão confirma o registro dos shaders principais, shaders de sombra e declarações UBO no `ShaderStore`;
- build consumidor de produção confirmado sem requisições runtime para arquivos `.fx`.

## [2.0.4] - 2026-07-12

### Adicionado

- preflight orientado ao resultado que calcula pose inicial, duração balística e plano angular antes de criar o corpo físico;
- trajetória quaternion `q(t)` com plateau angular até 72% do voo, desaceleração somente no trecho final e integral exata compartilhada pelo preflight;
- decomposição da perturbação angular que preserva twist/yaw em torno da face planejada e remove somente o tilt indesejado;
- soft landing por perfil, com limite de descida e convergência horizontal no pouso disperso para d2, d4, d6, d8, d10, d12, d20 e d100;
- testes de integração com Havok e o collider d20 serializado do tema padrão;
- aproximação de pouso com inclinação segura de aresta/canto e giro residual por perfil no primeiro contato;
- sustentação angular limitada e decrescente nos primeiros 60% da acomodação, sem apagar velocidades maiores produzidas pelas colisões;
- impulso linear imediato inspirado na v1.0.6 (`81c2ca9`) e conversão do antigo torque excêntrico em um plano determinístico de tumble antes do preflight;
- variação contínua e seedada de energia/direção, com cauda agressiva selecionada por apresentação;
- packing radius-aware em lanes, até duas rows e waves temporizadas para liberar o portal;
- camadas de colisão distintas para `DICE`, `FLOOR` e cada uma das quatro paredes.

### Alterado

- `angularDamping` fica desativado durante o voo pré-calculado e é aplicado somente depois do primeiro impacto real;
- o guidance pós-impacto ganhou força angular maior para poliedros, mantendo limites explícitos de velocidade e aceleração por subpasso;
- o `finalLock` `ANIMATED` passou a ser exclusivo do fallback e dura no mínimo 220 ms, adaptando-se ao ângulo restante e à velocidade visual máxima;
- o commit normal preserva a posição e o quaternion reais do repouso, zera as velocidades e congela diretamente o corpo como `STATIC`, sem transição `ANIMATED`; `TELEPORT` ficou reservado à recuperação de corpos fora do palco ou com transformação inválida;
- cada apresentação escolhe uma única borda pela `seed` entre esquerda, direita, topo e baixo, independentemente do aspect ratio;
- todos os corpos do grupo compartilham a mesma dinâmica de energia/direção, com impulso mínimo para dentro, vetor contínuo e variações tangenciais limitadas a um cone de 45 graus;
- o timeout deixou de liberar os critérios normais de alinhamento, apoio, velocidade e estabilidade;
- as durações de guidance passaram a 1.450 ms (d2), 1.900 ms (d4), 1.850 ms (d6), 1.800 ms (d8/d12), 1.750 ms (d10/d100) e 1.700 ms (d20);
- o lock normal só pode começar após 1.900 ms no d2, 2.400 ms no d4/d20 e 2.300 ms nos demais formatos;
- os defaults físicos foram recalibrados para gravidade `1.3`, fricção de piso `0.54`, restituição `0.29`, damping linear `0.10` e damping angular `0.08`;
- `wallPadding` passou a `0.25`; as barreiras invisíveis usam collider de `0.25` unidade e material próprio agora calibrado com fricção `0.10` e restituição `0.54`;
- `delay` passou a `10` ms e agora escalona corpos tanto em `kinematic` quanto em `physics`; corpos pendentes ficam invisíveis e sem colisão até sua liberação;
- `spawnSpacing` passou de `0.72` para `1.72` e agora define a separação mínima de um packing que também respeita o raio dos colliders;
- `startingHeight` passou de `6.4` para `7.6` como plano real e fixo de liberação; a altura efetiva continua limitada internamente a `2.8–8.1`;
- `spawnHeightStep` passou a usar default `0`; offsets verticais continuam disponíveis por configuração explícita;
- `spawnOverscan: 0.15` passou a posicionar o corpo inteiro fora da projeção, com margem adicional equivalente a 15% do seu raio;
- `throwForce` passou de `5.15` para `6.4`; a velocidade horizontal usa coeficiente base `0.22`, cap base `17.5` e cap final `19.5`, e forças maiores aumentam o alcance;
- `aggressiveThrowChance: 0.12` passou a selecionar, uma vez por apresentação, somente a cauda de maior energia e variação direcional;
- `wallBounceChance` foi mantido como alias deprecated de `aggressiveThrowChance`, sem selecionar parede nem garantir contato;
- landing e aim permanecem internos; trajetórias capazes de alcançar parede adjacente, oposta ou canto emergem apenas da força e da direção contínuas, e o Havok decide qualquer contato;
- o preflight angular passou a derivar a viagem horizontal de `velocity × ETA`, mantendo o tumble coerente com o vetor real;
- o preset físico do frontend local foi sincronizado com `startingHeight: 7.6`, `throwForce: 6.4`, `spawnSpacing: 1.72`, `aggressiveThrowChance: 0.12` e `spawnOverscan: 0.15`;
- o freio de pouso começa em 80% do voo no d2, 83% no d4, 85% no d10/d100, 86% no perfil base e 92% no d20; o d20 aceita descida de até `3.6` antes do contato;
- durante o freio, a velocidade horizontal mínima passou a `max(2.2, 40% da velocidade inicial)`;
- a auditoria da v1 mediu picos angulares de aproximadamente `40–100 rad/s`; a v2 passou a usar `2,35` voltas nos demais poliedros, `2,45` no d20 e `2,5` no d2, com velocidade média limitada a `20 rad/s` nos poliedros e `22 rad/s` na moeda;
- o eixo de tumble passou a ser predominantemente horizontal, com variações seedadas menores na direção da viagem e no twist;
- o spin planejado no primeiro contato passou a ter cap de `2,6 rad/s`, sem alterar o ângulo total resolvido pelo preflight;
- o renderer `kinematic` passou a iniciar o settle para a face solicitada somente em 84% da trajetória;
- depois do primeiro contato, o soft landing deixa de sobrescrever a resposta linear `x/z` calculada pelo Havok;
- durante a entrada, a máscara exclui apenas a parede-portal e mantém piso, outras paredes e colisões dado-dado ativos desde a liberação.

### Corrigido

- ordem de ativação do Havok no lançamento: corpos agora mudam de `ALWAYS_INACTIVE` para `ALWAYS_ACTIVE` antes de receber velocidade linear e angular, preservando o impulso real;
- admissão física no portal: um corpo atrasado aguarda novos subpassos quando sua posição inicial ainda está ocupada pelo envelope de outro dado;
- resolução física adaptativa de `180 Hz` para grupos de 2–24 corpos e `120 Hz` para grupos maiores, mantendo `90 Hz` para apresentações unitárias;
- fallbacks de timeout agora são serializados, esperam o fim de colisões recentes e retornam a `DYNAMIC` se uma correção `ANIMATED` tocar outro dado;
- sobreposição congelada ao final de grupos densos, causada por vários `finalLock` animados simultâneos e pela perda do impulso de entrada;
- erro acumulado entre o preflight e o primeiro contato causado pelo amortecimento angular do Havok;
- dados que chegavam em uma face vizinha e permaneciam nela até uma correção tardia no timeout;
- guidance de voo que perseguia a pose final antes da hora e anulava parte da sensação natural de giro;
- impactos verticais fortes que podiam tombar uma face já alinhada para uma vizinha;
- dados apoiados sobre outro corpo agora reconhecem esse contato como suporte e não aguardam o fallback de timeout;
- remoção abrupta do giro quando a face já estava alinhada, preservando o twist visual compatível com o plano;
- alinhamento matematicamente perfeito no último trecho: o guidance agora possui zona morta natural e encerra assim que a face correta está segura no topo;
- parada precoce logo após o impacto, que eliminava a sensação de o dado continuar rolando sobre o piso;
- limites percebidos como paredes grossas e pouco responsivas por causa do recuo excessivo e do material compartilhado com o chão;
- entrada sem sensação de arremesso, causada pela ausência do kick descendente e do tumble imediato que produziam a resposta visual da v1;
- entrada mais baixa do que o `startingHeight` configurado, causada pelo uso do valor apenas como limite superior de uma altura aleatória;
- dados que surgiam já formados dentro do canvas; o spawn agora começa totalmente fora do recorte e atravessa a extremidade de modo progressivo;
- colisão prematura com a parede de lançamento; somente essa parede fica fora da máscara até o collider inteiro entrar no palco;
- dados liberados juntos que atravessavam uns aos outros enquanto a máscara completa permanecia zerada no portal;
- respostas laterais e impulsos de separação apagados pela convergência horizontal sintética depois do contato;
- commit normal `ANIMATED` que podia interpolar corpos através de vizinhos e achatar pilhas;
- sobreposição de colliders em lanes fixas quando grupos grandes excediam a largura disponível;
- dados que atravessavam a queda com pouco giro visível por causa da convergência antecipada para o resultado;
- face resolvida já apontada para cima no início do voo quando o preflight usava um número inteiro de voltas;
- mapeamento invertido da moeda: frente/local `+Y` agora corresponde ao valor `1` (`Identity`) e verso/local `−Y` ao valor `2` (rotação `π`).

### Validado

- 72 testes em 18 suítes;
- direção comum, determinismo, impulso e limites do arremesso validados em desktop e retrato com até 120 corpos;
- convergência pura a 90 Hz em 48 combinações de perfil e pose de face;
- matriz de compatibilidade d20 validada em 6 de 6 resultados variados (`1`, `4`, `7`, `10`, `13` e `20`) com a calibração anterior fixa (`startingHeight: 6.4`, `throwForce: 5.15`), todos chegando ao contato entre `0.7–0.95` segundo e repousando na face solicitada;
- guidance Havok em contato com piso de alta fricção sem salto final visível;
- limite de soft landing e limites de aceleração angular confirmados matematicamente;
- trajetória angular validada por rotação acumulada do corpo, viagem acumulada da normal da face, afastamento da face resolvida no instante inicial e resultado final após o contato;
- distribuição estatística e determinismo de `aggressiveThrowChance`, com 75–93% de trajetórias projetadas diretas e alcance não garantido para paredes adjacente/oposta e cantos;
- landing interno, vetor contínuo e aumento de alcance com `throwForce` maior;
- packing sem sobreposição por raio em desktop e retrato, incluindo até duas rows e múltiplas waves;
- máscaras de portal validadas bit a bit e colisões reais entre múltiplos dados desde a liberação;
- stacking Havok validado sem interpenetração nem achatamento no commit normal;
- quatro barreiras validadas com impactos de até `18` unidades por segundo;
- rolagem `1d2[2]` confirmada visualmente com a textura correta do valor `2`.

## [2.0.3] - 2026-07-12

### Adicionado

- barreiras físicas e piso responsivos ao tamanho e à proporção reais do canvas;
- observação automática do container com `ResizeObserver`, mantendo o fallback de `window.resize`;
- uso efetivo de `wallPadding` como recuo interno da área útil, medido em unidades do palco.

### Alterado

- lançamentos laterais e pousos dispersos agora são confinados aos limites visíveis do palco;
- as paredes são reconstruídas quando o canvas, o aspect ratio ou as opções físicas mudam;
- corpos ativos são reposicionados para dentro da nova área útil quando o container é redimensionado.

### Corrigido

- dados que escapavam pelas bordas visíveis da página porque os colliders ainda usavam dimensões fixas;
- piso e paredes que não acompanhavam viewers compactos, overlays e layouts responsivos;
- pontos iniciais ou finais que podiam ficar fora das barreiras em telas estreitas.

## [2.0.2] - 2026-07-12

### Adicionado

- documentação completa em português para API, assets, temas e migração;
- devlog técnico e changelog da v2;
- subpath público estável `@erpg/dice3dview/style.css`;
- export público do tipo `ThemeMaterialConfig`.

### Corrigido

- consumidores agora podem importar o CSS extraído pelo build sem depender de um nome de arquivo com hash.

## [2.0.1] - 2026-07-12

### Adicionado

- perfis físicos pré-calculados para d2, d4, d6, d8, d10, d12, d20 e d100;
- máquina de estados `freeFall → guidedSettle → finalLock → commit → complete`;
- motor angular quaternion no corpo Havok;
- multiplicadores de massa por geometria;
- cálculo e cache da altura de apoio por collider, face e orientação;
- recuperação de corpos não finitos ou fora do volume físico;
- testes de bounds, segurança, trajetória, guidance e todas as 60 faces poliedrais.

### Alterado

- a física usa os colliders dedicados dos modelos;
- a simulação usa subpassos de 90 Hz;
- o chão físico passou a cobrir todo o plano visual e ganhou maior espessura;
- dados partem alternadamente das laterais e repousam em dispersão natural determinística;
- a câmera foi afastada mantendo o enquadramento do chão;
- a orientação final recebe yaw global sem mudar a face selecionada;
- meshes reutilizados recebem escala absoluta, evitando acúmulo no pool.

### Corrigido

- composição de `themeColor` com a máscara alfa das texturas, sem reintroduzir `@babylonjs/materials`;
- orientação de texturas diffuse, normal e specular;
- dados que atravessavam o chão ou escapavam indefinidamente;
- tamanho aparente exagerado no início do lançamento;
- alinhamento artificial em grade ao fim da apresentação;
- divergência entre o valor resolvido e a face física visível;
- correção visual tardia que era sobrescrita pela sincronização do Havok;
- altura final genérica que fazia objetos flutuarem ou interceptarem o piso.

### Validado

- 33 testes em 11 suítes;
- 60 faces nativas verificadas matematicamente;
- d20, múltiplos d6/d20 e d100 conferidos no frontend local;
- commit final confirmado depois de um subpasso físico real.

## [2.0.0] - 2026-07-12

### Adicionado

- `DiceResultViewer` com `init`, `display`, `clear`, `updateOptions`, `resize` e `dispose`;
- API TypeScript estrita com declarações publicadas;
- contratos `DisplayRequest`, `ResolvedDie` e `DisplayResult`;
- modo `kinematic` como renderer padrão;
- modo `physics` e Havok carregados por chunk lazy;
- d2 como moeda procedural configurável por tema;
- fallback numérico da moeda no tema padrão;
- suporte a d2, d4, d6, d8, d10, d12, d20 e d100;
- `DisplayCancelledError`, código `DISPLAY_CANCELLED` e helper de reconhecimento;
- caches de configurações, modelos e materiais;
- pools de meshes e moedas;
- distribuição ESM com chunks lazy e tipos TypeScript;
- verificação automatizada de orçamento e ausência de Havok no grafo cinemático.

### Alterado

- a biblioteca passou a ser exclusivamente visual;
- valores resolvidos pelo chamador se tornaram a única autoridade;
- `seed` passou a controlar somente a apresentação;
- d100 passou a ser tratado como um resultado semântico com dois corpos visuais;
- falhas gráficas passaram a preservar e devolver os resultados autoritativos.

### Removido

- `WorldFacade`, `displayRoll()` e nomenclatura herdada de rolagem;
- `forcedResultMode`;
- infraestrutura e nomenclatura herdadas de “roll” que não pertenciam à apresentação;
- leitura da face superior como autoridade do resultado;
- `rollCollectionData` e estruturas herdadas relacionadas;
- mundos onscreen, offscreen e none duplicados;
- worker OffscreenCanvas;
- builds paralelos minificado/não minificado;
- dependência `@babylonjs/materials`;
- assets antigos de Ammo.

### Desempenho

- `dist` reduzido de 15.955.179 para 7.803.079 bytes no lançamento da v2;
- quantidade de artefatos significativamente reduzida;
- orçamento total definido em 8 MiB.

## [1.0.6] - 2026-05-30

### Adicionado

- primeira implementação ERPG de física guiada com parâmetros por tipo de dado, introduzida no commit `7462f2c` em 23/05/2026;
- correção assistida de resultados externos nos modos `physics` e `visual`.

### Alterado

- tema `default-v2` consolidado no baseline `81c2ca9` em 30/05/2026.

[Não publicado]: https://github.com/erpg-app/Dice3DViewer/compare/v2.6.0...HEAD
[2.6.0]: https://github.com/erpg-app/Dice3DViewer/compare/v2.2.3...v2.6.0
[2.5.0]: https://github.com/erpg-app/Dice3DViewer/commit/7c1462e
[2.2.3]: https://github.com/erpg-app/Dice3DViewer/compare/v2.2.2...v2.2.3
[2.2.2]: https://github.com/erpg-app/Dice3DViewer/compare/v2.2.1...v2.2.2
[2.2.1]: https://github.com/erpg-app/Dice3DViewer/compare/v2.2.0...v2.2.1
[2.2.0]: https://github.com/erpg-app/Dice3DViewer/compare/v2.1.1...v2.2.0
[2.1.1]: https://github.com/erpg-app/Dice3DViewer/compare/v2.1.0...v2.1.1
[2.1.0]: https://github.com/erpg-app/Dice3DViewer/compare/v2.0.5...v2.1.0
[2.0.5]: https://github.com/erpg-app/Dice3DViewer/compare/v2.0.4...v2.0.5
[2.0.4]: https://github.com/erpg-app/Dice3DViewer/compare/v2.0.3...v2.0.4
[2.0.3]: https://github.com/erpg-app/Dice3DViewer/compare/v2.0.2...v2.0.3
[2.0.2]: https://github.com/erpg-app/Dice3DViewer/compare/v2.0.1...v2.0.2
[2.0.1]: https://github.com/erpg-app/Dice3DViewer/compare/v2.0.0...v2.0.1
[2.0.0]: https://github.com/erpg-app/Dice3DViewer/compare/81c2ca948d6de742ea43b836848524a43019d50f...v2.0.0
[1.0.6]: https://github.com/erpg-app/Dice3DViewer/commit/81c2ca948d6de742ea43b836848524a43019d50f
