# Testes (Etapa 8)

## Como rodar

```bash
npm run build
npm i -D playwright && npx playwright install chromium   # primeira vez
node ferramentas/teste-jogo.mjs
```

O teste sobe um servidor que entrega o **build de produção** e a **API** no
mesmo domínio — exatamente o arranjo do Vercel — e dirige um Chromium de
verdade. Ou seja: testa o que vai para o ar, não uma aproximação.

## Casos automatizados

| # | Caso | O que verifica |
|---|---|---|
| CT-01 | Carregamento | cenário e bateria carregam sem erro |
| CT-02 | Detecção varrida | 7/7 peças acertadas de 1 a 12 m/s |
| CT-03 | RN03 | dez batidas no mesmo quadro registram uma só |
| CT-04 | Fase 1 | sete peças = 140 pontos; rótulos somem depois |
| CT-05 | Fase 2 | padrão sorteado não repete a peça anterior |
| CT-06 | RN06 | batida errada conta erro e zera o combo |
| CT-07 | RF09/RF10 | tela de resultado com pontos, precisão e combo |
| CT-08 | Desempenho | draw calls por quadro dentro do razoável |
| CT-09 | RF11/RF12 | a partida chega à API e aparece no ranking |
| CT-10 | Console | nenhum erro de JavaScript |

### O número que vale um slide na apresentação

CT-02 compara a detecção **varrida** com a **ingênua** ("a ponta está
encostando agora?"):

| Velocidade | Deslocamento por quadro | Varrido | Ingênuo |
|---|---|---|---|
| 1 m/s | 1,4 cm | 7/7 | 7/7 |
| 2 m/s | 2,8 cm | 7/7 | **0/7** |
| 5 m/s | 6,9 cm | 7/7 | **0/7** |
| 12 m/s | 16,7 cm | 7/7 | **0/7** |

O método ingênuo só funciona no toque mais fraco possível — e falha
justamente nas batidas que o jogador mais quer acertar. Explicação em
`frontend/src/deteccao.js`.

---

## Testes de interface (manuais)

| Item | Como verificar | OK? |
|---|---|---|
| Botões | Iniciar, Modo livre, Jogar novamente, Menu | |
| Tela inicial | nome do jogo, instruções, equipe, professora | |
| HUD | pontos, combo e carga atualizam durante a partida | |
| Feedback | acerto e erro produzem retorno visual e sonoro | |
| Responsividade | redimensionar a janela não quebra o layout | |
| Sem VR | aviso claro e jogo continua jogável no teclado | |

## Testes de VR (manuais — só no headset)

| Item | Como verificar | OK? |
|---|---|---|
| Entrada no modo VR | o botão aparece e a sessão inicia | |
| Escala | a bateria parece do tamanho de uma bateria de verdade | |
| Alcance | dá para acertar todas as peças sem andar | |
| Altura | a alavanca direita ajusta e a posição fica confortável | |
| Batida | bater rápido registra; bater de leve também | |
| Vibração | os controles respondem ao acerto | |
| Fluidez | sem travadas — é a principal causa de mal-estar | |
| Olhar em volta | nenhum vazio visível ao virar a cabeça | |
| Saída | tirar o headset volta ao modo navegador sem quebrar | |

---

## Registro de problemas encontrados

O enunciado pede o histórico de problemas e correções. Anotem **no momento
em que acontecem** — reconstruir isso no fim é sofrimento.

| # | Problema | Onde | Correção | Data |
|---|---|---|---|---|
| 1 | Batidas rápidas não eram detectadas | `deteccao.js` | trocada a checagem pontual por colisão varrida no segmento entre quadros | |
| 2 | Cenário consumia 615 MB de VRAM | modelos | KTX2/Basis + poda de texturas sólidas → 14 MB | |
| 3 | Vazio visível ao olhar 90° para o lado | `cena.js` | casca ajustada ao contorno da sala | |
| 4 | Decodificadores vinham de CDN externo | `config.js` | passaram a ser servidos do próprio domínio | |
| 5 | | | | |
