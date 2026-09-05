# Drumfall — Bateria em WebXR

Jogo musical em realidade virtual pelo navegador. Uma bateria montada a céu
aberto, no meio de uma paisagem rochosa e industrial, cercada por
amplificadores. Sem missão e sem enredo: o jogador senta e toca, e a partida
termina numa avaliação de desempenho, de zero a cinco estrelas.

Roda em navegador comum (teclado e mouse) e em **Meta Quest 3**, onde os
controles viram baquetas e a força da batida conta.

- **Jogo:** https://ritmo-reactor-vr.vercel.app
- **API:** a mesma URL + `/api` — comece por `/api/saude`

---

## Integrantes

**Diego · Nickolas · Bruno · Danilo**

ADS — Senac Joinville · Profª Claudia Werlich

> O trabalho foi feito em conjunto: front-end, 3D e interação VR, back-end,
> banco, testes e deploy passaram pelas mãos de mais de um integrante, e por
> isso o grupo optou por não dividir o projeto em áreas isoladas.

---

## Tecnologias

| Camada | O quê | Por quê |
|---|---|---|
| Front-end | HTML5, CSS3, JavaScript (ES2022) | exigência do projeto |
| 3D | [Three.js](https://threejs.org) 0.185 | padrão de fato, WebXR embutido |
| VR | WebXR Device API (`immersive-vr`) | roda no navegador do Quest, sem instalar app |
| Build | [Vite](https://vite.dev) 6 | módulos ES em dev, bundle otimizado em produção |
| Áudio | Web Audio API (síntese) | zero arquivos, latência mínima — ver `src/synth.js` |
| Back-end | Node.js 20+ e Express 4 | tecnologia estudada no curso |
| Banco | PostgreSQL (memória como fallback) | ver `backend/db/` |
| Modelos | glTF 2.0 com Draco e KTX2/Basis | ver "Sobre os modelos" abaixo |
| Deploy | Vercel | HTTPS automático, exigido pelo WebXR |

---

## Requisitos para executar

- **Node.js 20 ou superior** — `node --version`
- Um navegador moderno
- Para o modo VR: **Meta Quest 3** e a aplicação publicada em **HTTPS**
  (WebXR não funciona em `file://` nem em `http://` fora de localhost)

---

## Instalação

```bash
git clone <url-do-repositorio>
cd ritmo-reactor-vr
npm install
```

O `npm install` cuida do front e do back (npm workspaces).

## Configuração

Só o back-end precisa de configuração, e ela é **opcional**:

```bash
cp backend/.env.exemplo backend/.env
```

Sem `DATABASE_URL` preenchida a API roda com banco **em memória** — os dados
somem ao reiniciar, mas tudo funciona. É o suficiente para desenvolver.
Para persistir de verdade, ver [docs/banco.md](docs/banco.md).

## Execução

Dois terminais:

```bash
npm run dev        # jogo em http://localhost:5173
npm run dev:api    # API em  http://localhost:3000/api/saude
```

O jogo funciona mesmo com a API desligada: a partida termina normalmente e a
tela de resultado apenas informa que não deu para salvar.

Para conferir o build de produção localmente:

```bash
npm run build && npm run preview
```

---

## Como jogar

### Navegador

| Tecla | Peça |
|---|---|
| `A` | Chimbal |
| `S` | Crash |
| `D` | Caixa |
| `F` | Tom 2 |
| `J` | Tom 1 |
| `K` | Surdo |
| `L` | Ride |

Arrastar o mouse gira a câmera; clicar direto na peça também bate.
`[` e `]` ajustam a altura da bateria.

### Meta Quest 3

1. Abra a URL do jogo no **Meta Quest Browser**.
2. A tarja na tela inicial deve ficar verde: *"VR disponível"*.
3. Toque em **ENTER VR**.
4. Seus controles são as baquetas — **bata de verdade**. A força conta.
5. A **alavanca direita ↑↓** ajusta a altura da bateria ao seu corpo.

Detalhes em [docs/vr.md](docs/vr.md).

---

## Os três desafios

| Fase | Mecânica | O que exercita |
|---|---|---|
| 1 — Calibração | acerte a peça indicada | reconhecer o instrumento, mirar |
| 2 — Eco | o jogo toca um padrão, você repete (3 rodadas) | memória sequencial |
| 3 — Ritmo | acerte as notas no tempo; combo multiplica | precisão temporal |

A partida termina com **precisão ponderada e de 0 a 5 estrelas**: um acerto
"bom" vale metade de um "perfeito", e o combo multiplica os pontos em degraus
(×2 aos 10 acertos seguidos, ×3 aos 20, ×4 aos 30). A regra vive isolada em
`frontend/src/pontuacao.js`, sem Three.js nem DOM, para poder ser conferida
com `node`.

---

## Estrutura do projeto

```
ritmo-reactor-vr/
├── frontend/               aplicação do jogo (Vite)
│   ├── index.html          markup das telas 2D
│   ├── public/modelos/     bateria_pratos.glb e cenario.glb (em uso),
│   │                       bateria.glb (scan inteiro, fonte do recorte)
│   ├── scripts/            copia os decodificadores de node_modules
│   └── src/
│       ├── config.js       ⇦ COMECE POR AQUI: tudo que se ajusta
│       ├── synth.js        Web Audio: kit sintetizado e kit por amostras
│       ├── musica.js       ⇦ O RELÓGIO: faixa, carta e compensação de atraso
│       ├── calibragem.js   mede o atraso de saída do equipamento do jogador
│       ├── pontuacao.js    a regra de pontuação, pura e conferível com node
│       ├── estado.js       os dados da partida
│       ├── cena.js         renderer, câmera, luzes, cenário, placas 3D
│       ├── kit.js          bateria, zonas de acerto, baquetas
│       ├── balanco.js      o balanço dos pratos na batida
│       ├── bichos.js       o indicador de nota que desce sobre a peça
│       ├── deteccao.js     ⇦ O NÚCLEO TÉCNICO: colisão varrida
│       ├── ui.js           interface 2D e as placas 3D do VR
│       ├── fases.js        as regras dos três desafios
│       ├── api.js          ponte com o back-end
│       └── main.js         amarra tudo e roda o laço
├── backend/                API Express
│   ├── app.js              o Express, sem subir servidor
│   ├── server.js           sobe localmente
│   ├── rotas/              partidas.js, ranking.js
│   └── db/                 adaptadores + schema.sql
├── api/index.js            adaptador do Express para o Vercel
├── ferramentas/            otimizador de cenário, recorte de peças,
│                           conversor de carta e testes automatizados
└── docs/                   documentação obrigatória
```

---

## Deploy (Vercel)

1. Suba o repositório para o GitHub.
2. Em [vercel.com](https://vercel.com) → **Add New → Project** → importe o
   repositório. Não mude nada: o `vercel.json` já define o build e a saída.
3. Adicione a variável `DATABASE_URL` em *projeto → Settings → Environment
   Variables*, tipo **Secret**, em Production e Preview. Use a string do
   **pooler de transação** (porta 6543) — a conexão direta do Supabase é
   IPv6 e o Vercel não sai por IPv6. Detalhes e armadilhas em
   [docs/banco.md](docs/banco.md).
   **A ordem importa:** variável primeiro, deploy depois. Salva depois, exige
   *Redeploy* com o cache de build desmarcado.

A partir daí, **todo push na branch principal republica automaticamente** —
que é o que permite testar no Quest a cada mudança.

> **Cartas e o que vai para o deploy.** A carta padrão é
> `cartas/colour-me-red.json` — Diesel13, multipista da biblioteca do
> Cambridge-MT, usada sob licença de uso didático, com crédito na abertura e
> no resultado e `robots.txt` fechado para buscadores. A nossa
> `cartas/teste.json` continua em `?carta=teste`, e vale manter: é a única que
> dispara as sete peças, já que a Colour Me Red usa quatro.
>
> **'Money For Nothing' não vai.** Master comercial, sem licença, e por isso
> está no `.gitignore`. Para tocar essa dentro do Quest sem publicar nada,
> ligue o headset por USB e use `adb reverse tcp:5173 tcp:5173`; no navegador
> do Quest, abra `http://localhost:5173`. Sendo `localhost`, o WebXR reconhece
> contexto seguro e o áudio não sai da sua máquina.

Confira o deploy abrindo `/api/saude`: ele responde qual banco está em uso.

---

## Testes

```bash
npm run build
npm i -D playwright && npx playwright install chromium   # só na primeira vez
node ferramentas/teste-jogo.mjs
```

São 10 casos, incluindo a integração front → API → banco. Detalhes e a
tabela de casos em [docs/testes.md](docs/testes.md).

Testes automatizados **não substituem** o teste no headset: conforto, escala
e enjoo só se avaliam lá.

---

## Sobre os modelos 3D

O `frontend/public/modelos/` contém os arquivos **já otimizados**, que são os
que o jogo carrega. Os originais do Sketchfab **não vão para o Git** (ver
`.gitignore`) — guardem-nos no Drive da equipe.

Para reprocessar um cenário novo:

```bash
node ferramentas/otimizar-cenario.mjs cenario-original.glb frontend/public/modelos/cenario.glb
```

O que importa não é o tamanho do arquivo, é a **VRAM**: um PNG 1024×1024 vira
5,59 MB na memória da GPU, sempre. O cenário original tinha 110 texturas
assim — 615 MB, inviável no Quest. Depois do tratamento com KTX2, **14 MB**.
Ver [docs/tecnica.md](docs/tecnica.md).

---

## Limitações conhecidas

- **O bumbo não é tocável.** O Quest 3 não rastreia os pés; só mãos e
  controles. Ele é decorativo.
- **Sem "afogar" o prato** (segurar depois de bater) — exigiria rastrear
  contato contínuo, não só o cruzamento.
- **Tom 1 e Tom 2 têm zonas que se sobrepõem** em cerca de 4 cm. Resolvido
  escolhendo a peça cruzada primeiro no trajeto, mas uma batida bem na
  fronteira é ambígua.
- **Sem modo canhoto.** O kit é destro: chimbal à esquerda, ride à direita.
- **Custo por quadro alto:** cerca de 400 mil triângulos, que dobram em VR.
  A bateria atual é um scan de fotogrametria e sozinha responde por 213 mil
  deles, com 64 MB de VRAM em texturas. Se o Quest engasgar, mexer em
  `QUALIDADE` no `src/config.js` — e ver "Sobre os modelos 3D" acima.
