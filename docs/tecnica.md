# Documentação técnica (item 17.2)

## Arquitetura

```
   NAVEGADOR / META QUEST BROWSER
   ┌──────────────────────────────────────────────┐
   │  frontend (Vite)                             │
   │                                              │
   │   main.js ── entrada, sessão VR, laço         │
   │      │                                       │
   │      ├── deteccao.js ── colisão varrida       │
   │      ├── fases.js ───── regras dos desafios   │
   │      ├── kit.js ─────── bateria e baquetas    │
   │      ├── cena.js ────── Three.js + WebXR      │
   │      ├── synth.js ───── Web Audio             │
   │      ├── ui.js ──────── HTML 2D + placas 3D   │
   │      └── api.js ─────── fetch                 │
   └────────────────────┬─────────────────────────┘
                        │ HTTPS, JSON
   ┌────────────────────▼─────────────────────────┐
   │  api/index.js  →  backend/app.js (Express)   │
   │     rotas/partidas.js   rotas/ranking.js     │
   │              │                               │
   │        backend/db/index.js                   │
   │        ├── adaptador memória                 │
   │        └── adaptador PostgreSQL              │
   └────────────────────┬─────────────────────────┘
                        │ SQL
                 ┌──────▼───────┐
                 │  PostgreSQL  │
                 └──────────────┘
```

No Vercel front e API vivem no **mesmo domínio**: o `vercel.json` reescreve
`/api/*` para a função serverless. Consequência prática: nada de CORS em
produção, e o front chama `/api` relativo.

## Decisões que valem explicar na apresentação

### 1. Colisão varrida, não pontual

O problema central de um jogo de bateria em VR não é o 3D — é detectar a
batida. A 72 Hz uma baqueta a 5 m/s percorre 6,9 cm entre quadros; a pele
tem 1 cm. Perguntar "está encostando agora?" perde quase tudo.

A solução trata o trajeto como um **segmento** e procura o cruzamento do
plano da pele, de cima para baixo, interpolando o ponto exato. Medição em
[testes.md](testes.md).

### 2. Som sintetizado, não gravado

Bumbo, caixa, toms, pratos e chimbal são feitos com osciladores e ruído
filtrado — técnica de caixa de ritmo dos anos 80. Zero arquivos para baixar,
zero CORS, latência de disparo mínima. Num jogo de ritmo, latência é a
diferença entre "responde" e "atrasa".

A sequência da fase Eco é agendada no **relógio do áudio**
(`audioContext.currentTime`), nunca em `setTimeout` — que erra dezenas de
milissegundos e isso é audível.

### 3. VRAM, não tamanho de arquivo

O laboratório do Sketchfab tinha 58 MB e 110 texturas 1024×1024. O que
inviabiliza no Quest não é o download: é que **a GPU descomprime cada PNG
para RGBA cru**, 5,59 MB por textura — 615 MB no total.

Só duas coisas cortam VRAM: baixar a resolução, ou usar **KTX2/Basis**, que
continua comprimida dentro da GPU.

| | VRAM |
|---|---|
| Original, PNG 1024 | 615 MB |
| PNG reduzido para 512/256 | 80,3 MB |
| **KTX2, mesma resolução** | **14,0 MB** |

Diferença visual medida: 1,3%. Ferramenta: `ferramentas/otimizar-cenario.mjs`.

### 4. O cenário se move, não o jogo

O laboratório veio em coordenadas próprias. Em vez de reescrever as posições
da bateria, giramos e deslocamos o **lab** para que o posto do baterista e o
tanque luminoso caiam onde o jogo já esperava o jogador e o reator
(`cena.js` → `encaixarLab`). Toda a lógica de posições continuou valendo.

O tanque do cenário virou o reator: três anéis de contenção o abraçam e uma
luz acende por dentro conforme a carga. O modelo faz o trabalho visual; o
jogo só o acende.

### 5. Câmera do headset, jogador em grupo

Dentro da sessão VR a posição da câmera é ditada pelo headset — mexer nela
causa náusea e é ignorado. Por isso a câmera é filha de um grupo `player`:
para mover o jogador, move-se o grupo. Há duas "molduras", uma para o
navegador (órbita a 2 m) e outra para VR (ao alcance do braço).

### 6. Decodificadores servidos do próprio domínio

Draco e Basis vinham de CDN. Rede que bloqueia CDN externo — e rede de
faculdade bloqueia — faria **nenhum modelo carregar**. Passaram a ser
copiados de `node_modules` para `public/libs/` antes do build.

## Custo por quadro

| Métrica | Valor |
|---|---|
| Triângulos | ~280 mil (dobram em VR) |
| Draw calls | ~72 |
| VRAM de textura | ~14 MB (cenário) |
| Modelo do lab | 12 MB, 28 draw calls |
| Modelo da bateria | 0,28 MB, 9 draw calls, 86 mil triângulos |

A bateria **não entra no mapa de sombra**: sozinha ela dobrava o custo de
geometria. A ancoragem visual vem de uma mancha no chão, que custa um quad.

## Ordem de leitura do código

1. `frontend/src/config.js` — tudo que se ajusta
2. `frontend/src/deteccao.js` — o problema técnico central
3. `frontend/src/fases.js` — as regras
4. `frontend/src/main.js` — o que liga uma coisa na outra
