# Métricas de bundle e carregamento

[← Voltar ao README](../README.md)

A v3 distribui um módulo ES sem dependências de runtime. O Worker e o
fallback compartilham o mesmo arquivo de física e WebGL. Os dois carregam o
motor de partículas e os presets sob demanda. Os números históricos estão em
[`bundle-baseline.json`](../benchmarks/bundle-baseline.json); os da v2 foram
preservados em [`bundle-baseline-v2.json`](../benchmarks/bundle-baseline-v2.json)
para comparação.

## Como medir

```bash
npm run build:bundles
npm run bundle:metrics            # imprime
node scripts/bundle-metrics.mjs --write
npm run bundle:check
```

`bundle:metrics` informa bytes raw, gzip (nível 9) e Brotli e a quantidade de
arquivos para a biblioteca, o entrypoint `adapters`, os assets, `dist` e o
pacote npm (`npm pack --dry-run`).

`bundle:check` valida a topologia e os orçamentos:

- o renderizador compartilhado e os efeitos ficam fora do grafo estático;
- nenhum JavaScript referencia Babylon, Havok ou `.wasm`, e `dist` não contém WebAssembly;
- `package.json` não declara dependências de runtime e todos os exports existem;
- `adapters` não contém código de renderização;
- módulo principal até 15 KiB gzip, renderizador até 36 KiB, motor de partículas até 8 KiB, presets até 5 KiB e `adapters` até 3 KiB;
- definições completas de efeitos carregam só o motor de partículas. Usar um preset carrega também o arquivo de presets.

O build remove espaços dos chunks finais e compacta os shaders GLSL. O shader
de partículas é compilado no primeiro efeito.

## Medição inicial da 3.0.0-alpha.0

| Artefato | Arquivos | Raw | Gzip | Brotli |
|---|---:|---:|---:|---:|
| biblioteca (`dice3dview.es.js`) | 1 | 127.656 B | 43.608 B | 38.022 B |
| motor de partículas (sob demanda) | 1 | 10.945 B | 4.328 B | 3.868 B |
| 15 presets de partículas (sob demanda) | 1 | 18.936 B | 3.558 B | 3.037 B |
| `adapters` | 1 | 4.416 B | 1.494 B | 1.354 B |
| assets (temas, modelos, atlas) | 25 | 401.020 B | 196.250 B | 182.059 B |

O pacote npm tem 52 arquivos: 332.309 B compactado e 826.489 B descompactado
(a v2.6.0 tinha 125 arquivos, 1.612.802 B e 5.979.069 B).

## Comparação com a v2

| Primeira carga | v2 | v3 | Redução |
|---|---:|---:|---:|
| modo físico (Babylon + Havok JS + WASM), gzip | 1.158.986 B | 43.608 B | 26,6× |
| modo físico, Brotli | 879.619 B | 38.022 B | 23,1× |
| só o modo cinemático da v2, gzip | 438.335 B | 43.608 B | 10,1× |

Compilação e CPU estão em [Benchmarks: v2 × v3](BENCHMARKS.md).

Na v2, o modo físico ainda baixava o `HavokPhysics.wasm` (2.094.566 B raw) por
URL e compilava WebAssembly antes do primeiro arremesso. Na v3 a física faz
parte do mesmo módulo: não há segunda requisição nem compilação de WASM antes do
primeiro dado aparecer.

## Interpretação

A comparação usa a v2 no mesmo formato de medição (gzip nível 9 e Brotli dos
arquivos que o navegador realmente baixa na primeira apresentação). O tamanho de
`dist` inclui assets compartilhados e não representa bytes transferidos por uma
aplicação: os temas são carregados sob demanda, um por vez.

Registre execuções frias e quentes, bytes transferidos, requests e tempos de
import, `init()` e primeira apresentação no mesmo ambiente quando comparar
integrações; números coletados com hardware, cache ou compressão diferentes não
são equivalentes.
