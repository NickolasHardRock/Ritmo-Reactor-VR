# Testes (Etapa 8)

## Como rodar

```bash
npm run build
npm i -D playwright && npx playwright install chromium   # primeira vez
npm test                       # ou: node ferramentas/teste-jogo.mjs
```

O teste sobe um servidor que entrega o **build de produção** e a **API** no
mesmo domínio — exatamente o arranjo do Vercel — e dirige um Chromium de
verdade. Ou seja: testa o que vai para o ar, não uma aproximação. Sai com
código 1 se algum caso falhar, então serve para CI sem alteração.

## Casos automatizados

| # | Caso | O que verifica |
|---|---|---|
| CT-01 | Carregamento | cenário e bateria carregam sem erro |
| CT-02 | Detecção varrida | 7/7 peças acertadas de 1 a 12 m/s |
| CT-03 | RN03 | dez batidas no mesmo quadro registram uma só |
| CT-04 | Fase 1 — calibração | sete peças = 140 pontos; rótulos somem depois |
| CT-05 | Fase 2 — eco | padrão sorteado não repete a peça anterior |
| CT-06 | RN06 | batida errada conta erro e zera o combo |
| CT-07 | RF09/RF10 | resultado mostra pontos, combo máximo, precisão e estrelas |
| CT-07b | RN04 | tabela do multiplicador e barra do degrau |
| CT-08 | Desempenho | draw calls por quadro abaixo de 200 |
| CT-09 | RF11/RF12 | a partida chega à API, ao ranking e a tela confirma |
| CT-10 | Console | nenhum erro de JavaScript |

### CT-02 — o número que vale um slide na apresentação

Compara a detecção **varrida** com a **ingênua** ("a ponta está encostando
agora?"):

| Velocidade | Deslocamento por quadro | Varrido | Ingênuo |
|---|---|---|---|
| 1 m/s | 1,4 cm | 7/7 | 7/7 |
| 2 m/s | 2,8 cm | 7/7 | **0/7** |
| 5 m/s | 6,9 cm | 7/7 | **0/7** |
| 12 m/s | 16,7 cm | 7/7 | **0/7** |

O método ingênuo só funciona no toque mais fraco possível — e falha
justamente nas batidas que o jogador mais quer acertar. Explicação em
`frontend/src/deteccao.js`.

### CT-07 e CT-07b — como a regra de pontuação é conferida

O CT-07 força um estado conhecido e confere a leitura da tela:

> 20 perfeitas, 6 boas, 3 erros → (20×100 + 6×50) / (29×100) = **79%** →
> **★★★☆☆** (o corte de 3 estrelas é 70%).

Os números foram escolhidos para cair no **meio** de uma faixa. Um caso na
borda testaria o arredondamento em vez da regra, e passaria a falhar por
motivo errado.

O CT-07b confere a RN04 direto no módulo puro, sem passar pela tela:

| entrada | saída esperada |
|---|---|
| combo `0, 9, 10, 19, 20, 29, 30, 99` | multiplicador `1, 1, 2, 2, 3, 3, 4, 4` |
| combo `0, 5, 10, 15, 30` | barra do degrau `0; 0,5; 0; 0,5; 1` |

A barra volta a zero a cada degrau alcançado — ela mede o caminho até o
**próximo** degrau, não o combo absoluto.

---

## Testes de interface (manuais)

| Item | Como verificar | OK? |
|---|---|---|
| Botões | Iniciar, Modo livre, Só a música, Calibrar, Jogar novamente, Menu | |
| Tela inicial | nome do jogo, instruções, equipe, professora | |
| HUD | pontos, combo e **multiplicador** atualizam durante a partida | |
| Crédito da faixa | autoria e licença da música aparecem na tela inicial | |
| Calibração | a contagem de três aparece antes do primeiro som de referência | |
| Ajuste fino | os botões de ±10 ms deslocam o julgamento na direção certa | |
| Feedback | acerto e erro produzem retorno visual e sonoro | |
| Balanço | ao bater, o prato inteiro oscila e volta ao repouso | |
| Responsividade | redimensionar a janela não quebra o layout | |
| Sem VR | aviso claro e jogo continua jogável no teclado | |

## Testes de VR (manuais — só no headset)

| Item | Como verificar | OK? |
|---|---|---|
| Entrada no modo VR | o botão aparece e a sessão inicia | |
| Escala | a bateria parece do tamanho de uma bateria de verdade | |
| Alcance | dá para acertar todas as peças sem andar | |
| Altura | a alavanca direita ajusta e a posição fica confortável | |
| Pular o tutorial | o botão **A** salta para a música sem tirar o headset | |
| Calibrar no headset | o botão **X** abre a calibragem dentro do VR | |
| Placas 3D | resultado e calibragem legíveis sem tirar o headset | |
| Batida | bater rápido registra; bater de leve também | |
| Dinâmica | bater forte soa mais brilhante, não mais agudo | |
| Vibração | os controles respondem ao acerto | |
| Fluidez | sem travadas — é a principal causa de mal-estar | |
| Olhar em volta | nenhum vazio visível ao virar a cabeça | |
| Saída | tirar o headset volta ao modo navegador sem quebrar | |

---

## Registro de problemas encontrados

O enunciado pede o histórico de problemas e correções. As datas e os commits
abaixo são verificáveis no `git log`.

| # | Problema | Onde | Correção | Data |
|---|---|---|---|---|
| 1 | Batidas rápidas não eram detectadas | `deteccao.js` | trocada a checagem pontual por colisão varrida no segmento entre quadros | |
| 2 | Cenário consumia 615 MB de VRAM | modelos | KTX2/Basis + poda de texturas sólidas → 14 MB | |
| 3 | Vazio visível ao olhar 90° para o lado | `cena.js` | casca ajustada ao contorno da sala | |
| 4 | Decodificadores vinham de CDN externo | `config.js` | passaram a ser servidos do próprio domínio | |
| 5 | A calibração falhava **calada**: o jogador calibrava e nada mudava | `calibragem.js` | três defeitos somados — o espaçamento de 0,6 s limitava a medida a 300 ms e virava 0 quando negativa; uma medida menor que o `outputLatency` substituía um palpite melhor; e fechar o painel descartava as amostras | 03/09 (`7ae0115`) |
| 6 | Mesmo calibrado, ainda faltavam ~40 ms | amostras | todo encoder MP3 insere ~26 ms (1152 amostras) de silêncio no início do arquivo. Isso é atraso puro e imune à calibragem. Amostras recortadas: pior caso caiu para 3,8 ms. **Sample novo entra em WAV** | 03/09 (`4c44197`) |
| 7 | Bater forte deixava o som mais **agudo**, como um brinquedo | `synth.js` | a força passou a abrir o brilho (`highshelf` com teto em zero) em vez de mexer no `playbackRate` | 04/09 (`3d0cc71`) |
| 8 | A API caía no primeiro POST depois de um tempo parada | `backend/db/index.js` | sem `pool.on('error')`, o erro de uma conexão ociosa que cai não tem tratamento e derruba o processo Node inteiro | 04/09 (`99f609d`) |
| 9 | O crash balançava **pela metade**, partido no ar | `ferramentas/cortar-peca.mjs` | o recorte usava uma faixa horizontal, e o prato veio do scan inclinado 35°: um disco de 0,23 m de raio nessa inclinação ocupa 0,28 m de altura contra os 0,15 m da faixa, então ela cortava as pontas *por construção*. A faixa passou a seguir o plano do próprio prato | 04/09 (`8295c60`) |
| 10 | | | | |

### Erros de método, que também custaram tempo

Vale registrar porque são o tipo de armadilha que se repete:

- **Corte por crescimento de região não serve num scan fundido.** A
  superfície do prato é contínua com o pedestal: ou o crescimento para cedo
  e sai um caco, ou vaza para a bateria inteira. Rodou nos três pratos e
  quebrou os três — inclusive o ride e o chimbal, que já estavam bons.
- **`src.stop()` antes de `src.start()`** lança `InvalidStateError`, e só
  nas batidas fracas. Apareceu renderizando num `OfflineAudioContext`, não
  jogando.
- **Amostrar uma oscilação em intervalos irregulares** produz aliasing que
  parece instabilidade numérica. Quase levou a "consertar" um oscilador que
  estava correto.
