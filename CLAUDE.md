# Drumfall — contexto para o Claude Code

Jogo de bateria em WebXR. ADS Senac Joinville, Profª Claudia Werlich.
Equipe: Diego, Nickolas, Bruno, Danilo.
Produção: https://ritmo-reactor-vr.vercel.app

## Nomes, para não se perder

- O jogo chama-se **Drumfall**. O repositório e a URL continuam
  `Ritmo-Reactor-VR` **de propósito**: renomear quebraria a URL já entregue e
  o `remote` de git de todos. Não "corrija" isso.
- O cenário é `frontend/public/modelos/cenario.glb`. Já se chamou `lab.glb` e
  o código dizia "laboratório", mas **nunca foi um laboratório**: é o modelo
  "World of Metal", paisagem industrial a céu aberto. O nome errado custou
  horas — foi preciso medir duas caixas envolventes para descobrir que
  `lab.glb` e `world_of_metal_otimizado.glb` eram o mesmo arquivo.
- **Não existe mecânica de reator.** Existiu; foi removida. Se aparecer
  "reator" em algum lugar, é resíduo histórico ou comentário explicativo.

## Como rodar

```bash
npm run dev        # front (Vite) em :5173
npm run dev:api    # API em :3000  — precisa de backend/.env com DATABASE_URL
npm run build
npm test           # arnês Playwright: sobe build + API e dirige um Chromium
```

`npm test` é o portão. Ele confere detecção varrida, regra de pontuação
(estrelas e multiplicador), custo por quadro e a gravação na API. Sai com
código 1 se falhar. **Rode antes de qualquer push.**

## Armadilhas conhecidas

- **O relógio é o do áudio, nunca o da tela.** `AudioContext.currentTime` é a
  única fonte de tempo. `requestAnimationFrame` congela em aba oculta e
  `setTimeout` erra dezenas de ms. Um jogo de ritmo agendado neles desanda.
- **Latência de saída:** `musica.tempo` **SUBTRAI** a latência;
  `quandoNoAudio` **NÃO**. A calibragem do jogador **SUBSTITUI**
  `ctx.outputLatency`, nunca soma. Confundir isso inverte o erro.
- **Sample novo entra em WAV, não MP3.** Todo encoder MP3 insere ~26 ms
  (1152 amostras) de silêncio no início do arquivo. É atraso puro, invisível
  no código e imune à calibragem.
- **`pool.on('error')` em `backend/db/index.js` não é opcional.** Sem ele, o
  erro de uma conexão ociosa que cai vira exceção não capturada e mata o
  processo Node inteiro.
- **O esquema do banco existe em dois arquivos** e precisam continuar iguais:
  `backend/db/schema.sql` (começa com `DROP TABLE`, roda à mão) e o
  `iniciar()` de `db/index.js` (`CREATE TABLE IF NOT EXISTS`, roda na subida
  da API). Já divergiram. Mexeu num, confira o outro.
- **`DATABASE_URL` tem de ser a do pooler de transação do Supabase** (porta
  6543). A conexão direta é IPv6 e o Vercel não sai por IPv6.
- **`.gitattributes` sem `* text=auto eol=lf`:** 41 arquivos aparecem
  modificados com zero linhas de diferença (CRLF do Windows).
- **A fonte do cenário não vem no clone.** `world_of_metal_otimizado.glb`
  está no `.gitignore`. Peça à equipe se precisar refazer o `cenario.glb`.

## Onde as coisas estão

```
frontend/src/
  config.js      ⇦ tudo que se ajusta, num lugar só
  deteccao.js    ⇦ o núcleo técnico: colisão varrida no segmento entre quadros
  musica.js      ⇦ o relógio do áudio e a compensação de atraso
  pontuacao.js      regra de pontuação — módulo PURO, conferível com node
  calibragem.js     mede o atraso de saída do equipamento do jogador
  desempenho.js     contador de tempo de quadro (ver abaixo)
  cena.js           renderer, câmera, luzes, cenário, placas 3D
  kit.js            bateria, zonas de acerto, baquetas
  balanco.js        balanço dos pratos (oscilador amortecido)
  bichos.js         indicador de nota que desce sobre a peça
  fases.js          as regras das três fases
  main.js           amarra tudo e roda o laço
backend/            Express + dois adaptadores (memória / PostgreSQL)
ferramentas/        cortar-peca, otimizar-cenario, midi-para-carta, teste-jogo
docs/               tecnica, api, banco, testes, vr, conceito
```

## Performance — o assunto do momento

**Medir antes de cortar.** Nenhuma ferramenta de fora alcança o Quest: o
DevTools do desktop mede a GPU do desktop, e extensão de navegador não entra
na sessão imersiva. Por isso o jogo se mede sozinho.

`frontend/src/desempenho.js` mostra tempo de quadro. Ligar com **`?perf=1`**
na URL (funciona no navegador do Quest) ou com a **tecla P** no desktop.
Mostra mediana, p95, pior da janela, o orçamento da taxa real e draw
calls/triângulos. **Em milissegundos, não FPS** — FPS é média e esconde o
engasgo, que é o que se sente no headset. A 72 Hz o orçamento é 13,9 ms.

Números de arquivo **medidos**, não estimados — `node
ferramentas/inventario-modelos.mjs` os reproduz a qualquer hora. Continuam
sendo peso de arquivo, **não** medida de quadro:

| | valor |
|---|---|
| bateria `bateria_pratos.glb` | 10,2 MB, **212.594** triângulos, 4 primitivas |
| cenário `cenario.glb` | 11,6 MB, **154.361** triângulos, 72 primitivas |
| total | **366.955** triângulos — dobra em VR, um desenho por olho |
| VRAM de textura da bateria | **64,0 MB** (três JPEG 2048², sem KTX2) |
| VRAM de textura do cenário | **33,3 MB** (21 texturas, já em KTX2) |

Duas correções que a medição trouxe: a VRAM do cenário era estimada em ~14 MB
e são **33,3 MB** — errava por 2,4×. E as "88 primitivas" do cenário eram a
contagem em CENA, não no arquivo: são 72 malhas no `.glb`, e viram 88 objetos
porque nós diferentes reaproveitam a mesma malha. A bateria, essa, a
estimativa acertou em cheio.

**Uma malha transparente é desenhada DUAS vezes.** Material `transparent` com
`side = DoubleSide` faz o three desenhar de costas e depois de frente
(`WebGLRenderer.js:2133`). Hoje isso atinge 62 das 88 malhas do cenário e 7
das 19 da bateria: **106.059 triângulos por olho, por quadro**, e o dobro
disso em VR. Ninguém pediu essa transparência — exportador de glTF marca
`transparent` sempre que o material declara alpha, mesmo com alpha 1.
`forceSinglePass = true` desliga a segunda passada. O `npm test` imprime a
conta a cada rodada, no CT-08, para ninguém precisar redescobrir.

Candidatos, na ordem em que eu apostaria:

1. **Texturas da bateria em KTX2/UASTC** — 64 MB → ~8 MB. É o maior custo
   isolado que sobrou, e a Meta recomenda KTX2/Basis explicitamente para
   WebXR no Quest. `ferramentas/otimizar-cenario.mjs` faz KTX2 — **mas
   precisa do binário `ktx` do KTX-Software**, e existe um pacote npm
   chamado `ktx` que é outra ferramenta e ocupa o mesmo nome no PATH. Se
   `ktx --version` não disser KTX-Software, é o impostor: baixe o de verdade
   em github.com/KhronosGroup/KTX-Software/releases. Sem ele o script avisa e
   sai em PNG, em vez de quebrar. Usar UASTC e não ETC1S: a bateria fica a
   60 cm do rosto.
2. **`simplify` do meshoptimizer** no scan da bateria.
3. **Reconsiderar o scan.** A bateria antiga tinha 86 mil triângulos, 9 draw
   calls e ZERO textura, e já estava validada no headset. A troca foi
   estética. É decisão da equipe, não técnica.

Em VR, `renderer.info` conta **os dois olhos** — não divida por dois para
comparar com o desktop; compare VR com VR.

## Regras de trabalho neste repositório

- Nada de commit ou push sem o Diego pedir.
- **Só entra no repositório o áudio que a gente tem direito de distribuir.**
  A `colour-me-red` tem: uso educacional licenciado, e creditado na tela
  inicial. `frontend/public/sounds/som.mp3` e as cartas derivadas dele não
  têm — ficam só na máquina de quem trabalha com eles. O `.gitignore` já
  cobre os dois (`sounds/som.mp3` e `cartas/money*.json`); não desfaça isso.
- Antes de dizer que algo está certo, rode. `node --check` só vê sintaxe.
