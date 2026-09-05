# Documentação técnica (item 17.2)

## Arquitetura

```
   NAVEGADOR / META QUEST BROWSER
   ┌────────────────────────────────────────────────────────┐
   │  frontend (Vite)                                       │
   │                                                        │
   │   main.js ──── entrada, sessão VR, laço de render      │
   │      │                                                 │
   │      ├── cena.js ────── Three.js, WebXR, placas 3D     │
   │      ├── kit.js ─────── bateria, baquetas, zonas       │
   │      ├── deteccao.js ── colisão varrida                │
   │      ├── fases.js ───── regras dos desafios            │
   │      ├── musica.js ──── faixa, carta, relógio do áudio │
   │      ├── calibragem.js  medida da latência do jogador  │
   │      ├── pontuacao.js ─ módulo puro: pontos e estrelas │
   │      ├── synth.js ───── Web Audio: síntese e amostras  │
   │      ├── balanco.js ─── oscilador dos pratos           │
   │      ├── estado.js ──── estado da partida              │
   │      ├── ui.js ──────── HTML 2D + HUD                  │
   │      └── api.js ─────── fetch                          │
   └───────────────────────┬────────────────────────────────┘
                           │ HTTPS, JSON
   ┌───────────────────────▼────────────────────────────────┐
   │  api/index.js  →  backend/app.js (Express)             │
   │     rotas/partidas.js      rotas/ranking.js            │
   │              │                                         │
   │        backend/db/index.js                             │
   │        ├── adaptador memória (sem DATABASE_URL)        │
   │        └── adaptador PostgreSQL (node-postgres)         │
   └───────────────────────┬────────────────────────────────┘
                           │ SQL, pooler de transação
                    ┌──────▼────────┐
                    │  PostgreSQL   │  Supabase
                    └───────────────┘
```

No Vercel front e API vivem no **mesmo domínio**: o `vercel.json` reescreve
`/api/*` para a função serverless. Consequência prática: nada de CORS em
produção, e o front chama `/api` relativo.

---

## Decisões que valem explicar na apresentação

### 1. Colisão varrida, não pontual

O problema central de um jogo de bateria em VR não é o 3D — é detectar a
batida. A 72 Hz uma baqueta a 5 m/s percorre 6,9 cm entre quadros; a pele
tem 1 cm de espessura. Perguntar "está encostando agora?" perde quase tudo.

A solução trata o trajeto entre dois quadros como um **segmento** e procura
o cruzamento do plano da pele, de cima para baixo, interpolando o ponto
exato do contato. A velocidade nesse instante vira a força da batida.
Medição em [testes.md](testes.md): 7/7 peças detectadas de 1 a 12 m/s.

### 2. Tudo no relógio do áudio, nada no relógio da tela

Esta é a decisão que mais afeta a sensação do jogo, e a mais fácil de errar.

`requestAnimationFrame` **não é um relógio**. Ele para quando a aba perde o
foco, varia com a carga da GPU e não tem relação com o áudio. `setTimeout`
erra dezenas de milissegundos. Um jogo de ritmo agendado por qualquer um dos
dois desanda em segundos.

Por isso a única fonte de tempo é `AudioContext.currentTime`. A faixa é
agendada nele, as notas são julgadas contra ele, e o laço de render só
**lê** esse relógio para desenhar — nunca o avança.

### 3. Latência de saída: por que o jogo parecia injusto

Entre agendar um som e ele chegar ao ouvido existe um atraso real: buffer da
placa, do sistema, do Bluetooth. No Quest passa fácil de 100 ms. O jogador
reage ao que **ouve**, então o tempo musical percebido está atrasado em
relação ao `currentTime`. Sem compensar, o jogo acusa adiantamento em quem
está batendo certo.

A regra, em `musica.js`:

- `musica.tempo` (o tempo que a pista mostra) **SUBTRAI** a latência;
- `quandoNoAudio` (o instante em que um som deve sair) **NÃO** subtrai.

Confundir os dois inverte o erro em vez de corrigi-lo.

A latência vem de duas fontes, e elas **não se somam**: a medida do jogador
em `calibragem.js` já cobre a cadeia inteira, então ela **substitui** o
palpite do navegador. Somar contaria duas vezes. Sem calibragem sobra
`ctx.outputLatency`, que no Windows costuma declarar ~40 ms quando o real
passa de 150 — é exatamente por isso que o jogo parece atrasado antes de
calibrar.

**Armadilha achada na prática:** os primeiros samples eram MP3, e todo
encoder MP3 insere um silêncio de codificação de ~26 ms (1152 amostras) no
início do arquivo. Isso vira atraso puro, invisível no código e imune à
calibragem. Os oito samples foram recortados e o pior caso caiu para 3,8 ms.
**Sample novo entra em WAV, não em MP3.**

### 4. Som: síntese para o kit padrão, amostras para a música

O kit padrão é **sintetizado** — osciladores e ruído filtrado, técnica de
caixa de ritmo dos anos 80. Zero arquivos, zero CORS, disparo imediato.

Quando uma carta traz um kit próprio (`kit` no JSON da música), `synth.js`
troca os timbres por amostras daquela gravação e restaura o padrão depois.
Assim a bateria que o jogador toca soa como a da faixa que está tocando.

A força da batida muda o **timbre**, não a altura: um `highshelf` com teto
em zero abre o brilho conforme a força, e um desafino aleatório de ±1,2%
evita o efeito de metralhadora quando a mesma amostra repete. Alterar
`playbackRate` pela força, que era a versão anterior, soava como um brinquedo.

A saída passa por um **clipador suave** (`WaveShaper`, linear até 0,7 e
depois tanh) em vez de um compressor: `DynamicsCompressorNode` tem
pré-atraso, e num jogo de ritmo isso é justamente o que não se pode ter.

### 5. Pontuação como módulo puro

`pontuacao.js` não importa Three.js nem toca no DOM. É aritmética pura, o
que permite conferir a regra de negócio (RN04) com `node`, sem navegador e
sem headset:

| conceito | valor |
|---|---|
| acerto perfeito / bom / erro | 100 / 50 / 0 |
| degraus do multiplicador | combo 10, 20, 30 → ×2, ×3, ×4 |
| bônus por rodada limpa | 200 |
| estrelas, por precisão ponderada | 95% ★★★★★ · 85% ★★★★ · 70% ★★★ · 50% ★★ |

A precisão é ponderada — um "bom" vale metade de um "perfeito" —, então a
nota final mede execução, não persistência. O erro zera o combo mas não
subtrai pontos: punir duas vezes desestimula tentar as viradas.

> Nota para a defesa: o RF06 pedia um indicador de progresso sempre visível.
> Na versão anterior isso era a carga do reator. Com a troca do reator pelo
> modelo de pontuação, quem cumpre o RF06 agora é o **HUD**, que mostra
> pontos, combo e multiplicador o tempo todo.

### 6. VRAM, não tamanho de arquivo

O cenário do Sketchfab tinha 58 MB e 110 texturas 1024×1024. O que
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

### 7. O cenário se move, não o jogo

O cenário veio em coordenadas próprias. Em vez de reescrever as posições da
bateria, giramos e deslocamos o **cenário** para que o posto do baterista
caísse onde o jogo já esperava o jogador (`cena.js` → `encaixarCenario`).
Toda a lógica de posições continuou valendo.

Isso é mais barato do que parece porque **o cenário não sustenta nada**:
medindo coluna por coluna, não há chão contínuo sob o posto — a paisagem é
irregular e há vazio bem embaixo do jogador. Quem segura a bateria é o
estrado que o próprio jogo desenha. Trocar de cenário não quebra geometria
nenhuma.

**O reator saiu inteiro.** Ele era um grupo desenhado por código — três anéis
em volta de um tanque, uma luz interna e um aro no chão — e a carga subia com
a pontuação. Quando a pontuação virou um modelo próprio, o `cena.js` passou a
fazer `reator.visible = false` assim que o cenário carregava: os objetos só
apareceriam se o modelo falhasse ao baixar. Ficaram assim por dois dias, meio
vivos, até serem removidos de vez.

Vale como lição de leitura de código: procurando "o que desenha o reator" a
resposta parecia estar ali, viva, com animação por quadro e tudo. O que
decidia de fato era uma linha solta dentro do `onload` do carregador.

### 8. Câmera do headset, jogador em grupo

Dentro da sessão VR a posição da câmera é ditada pelo headset — mexer nela
causa náusea e é ignorado pelo runtime. Por isso a câmera é filha de um
grupo `player`: para mover o jogador, move-se o grupo. Há duas "molduras",
uma para o navegador (órbita a 2 m) e outra para VR (ao alcance do braço).

### 9. Decodificadores servidos do próprio domínio

Draco e Basis vinham de CDN. Rede que bloqueia CDN externo — e rede de
faculdade bloqueia — faria **nenhum modelo carregar**. Passaram a ser
copiados de `node_modules` para `public/libs/` antes do build.

### 10. Recortar peças de um scan para poder animá-las

O modelo da bateria é um scan de fotogrametria: uma malha, uma primitiva,
sem nome de peça. Não existe "o prato" para girar, então nenhuma animação
por código era possível.

`ferramentas/cortar-peca.mjs` separa cada prato num node próprio, com a
origem no centro dele, e `balanco.js` o gira como um **oscilador harmônico
amortecido** (`a'' = −k·a − c·a'`), com rigidez e amortecimento por peça —
o chimbal quase não balança, o crash oscila largo.

Dois detalhes que custaram caro:

- O recorte usa o plano **do próprio prato**, não a horizontal. O crash veio
  do scan inclinado 35°, e um disco de 0,23 m de raio inclinado 35° ocupa
  0,28 m de altura: uma faixa horizontal de 0,15 m cortava as pontas *por
  construção*, e metade do prato ficava parada.
- A integração é Euler explícito, que só é estável enquanto `dt < 2/√k`. Um
  quadro perdido estoura o limite e o prato sai voando, então o passo é
  fixado em no máximo 40 ms.

### 11. Serverless muda como se fala com o banco

Duas coisas que não apareceriam num servidor comum:

- **A conexão direta do Supabase não serve.** `db.<ref>.supabase.co:5432` só
  resolve em IPv6 e o runtime do Vercel não tem saída IPv6 — dá
  `ENETUNREACH`. É preciso o **pooler de transação** (porta 6543, IPv4).
- **Um pool sem ouvinte de erro derruba o processo.** Se uma conexão ociosa
  cai e não há `pool.on('error')`, o node-postgres emite um erro sem
  tratamento e o Node inteiro morre — na prática, a API caía no primeiro
  POST depois de um tempo parada. Detalhes em [banco.md](banco.md).

---

## Custo por quadro

| Métrica | Valor |
|---|---|
| Triângulos | ~400 mil por olho — **800 mil por quadro em VR** |
| Draw calls | ~72 |
| VRAM de textura, cenário | ~14 MB (KTX2) |
| VRAM de textura, bateria | **~64 MB** (três JPEG 2048², ainda sem KTX2) |
| Modelo do cenário | 12,2 MB, 158 mil triângulos, 88 primitivas |
| Modelo da bateria | 10,2 MB, ~213 mil triângulos, 4 nodes |

O número de triângulos subiu com o scan: eram ~280 mil quando a bateria
tinha 86 mil. Hoje ela sozinha responde por 213 mil dos ~400 mil. O CT-08
imprime o valor medido de verdade a cada execução — se este número aqui
divergir do que ele mostra, o certo é o do teste.

Os 4 nodes da bateria são `kit_resto` (163.903 triângulos) e os três pratos
recortados: ride (23.924), chimbal (13.832) e crash (10.935).

A bateria **não entra no mapa de sombra**: sozinha ela dobrava o custo de
geometria. A ancoragem visual vem de uma mancha no chão, que custa um quad.

> Ponto honesto para a apresentação: a bateria antiga tinha 86 mil
> triângulos e nenhuma textura. O scan atual é bem mais caro e a troca foi
> estética. Se o Quest engasgar, `simplify` do meshoptimizer no scan é o
> primeiro lugar onde mexer.

## Ordem de leitura do código

1. `frontend/src/config.js` — tudo que se ajusta num lugar só
2. `frontend/src/deteccao.js` — o problema técnico central
3. `frontend/src/musica.js` — o relógio do áudio e a compensação de latência
4. `frontend/src/pontuacao.js` — a regra de negócio, isolada e testável
5. `frontend/src/fases.js` — como as regras viram partida
6. `frontend/src/main.js` — o que liga uma coisa na outra
