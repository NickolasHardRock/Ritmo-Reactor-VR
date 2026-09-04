# Documento de conceito (Etapa 1)

> **Este documento é da equipe.** O que está aqui como *[preencher]* depende
> de decisão de vocês, não de código. É entrega obrigatória.

## Identificação

- **Nome do jogo:** Drum Reactivate
- **Tema:** Estação espacial / laboratório sci-fi
- **Equipe:** _[preencher]_
- **Disciplina:** ADS — Senac Joinville · Profª Claudia Werlich

## Público-alvo

_[preencher — quem joga? faixa etária, familiaridade com VR, contexto]_

## Objetivo

Proporcionar uma experiência musical em realidade virtual na qual o gesto do
jogador — bater com a baqueta — é o próprio mecanismo do jogo, e não um
comando abstrato mapeado num botão.

## História

O reator da estação parou. O núcleo só volta a oscilar se receber um pulso
rítmico preciso, e o único emissor a bordo é uma bateria de calibração
esquecida no laboratório. O jogador precisa tocá-la para religar a estação.

_[expandir se quiserem: quem é o jogador? por que a estação parou?]_

## Personagens

_[preencher — mesmo que seja só "o técnico de plantão", vale definir]_

## Cenário

Laboratório da estação: um tanque de contenção luminoso ao centro, parede de
consoles à direita, comporta pressurizada, maquinário e tubulações à
esquerda. O jogador fica de frente para o tanque, que é o reator.

## Mecânicas

- Bater nas peças da bateria com os controles, que funcionam como baquetas
- A força da batida (velocidade real do braço) modula som e vibração
- Três tipos de desafio, em ordem crescente de exigência
- Precisão e multiplicador ficam sempre no HUD; a barra do rodapé mostra
  quantos acertos faltam para o próximo degrau do multiplicador

## Desafios

| Fase | Mecânica | Pontuação |
|---|---|---|
| 1 — Calibração | acertar cada peça indicada | jogada perfeita |
| 2 — Eco | repetir o padrão do tanque (3 rodadas) | jogada perfeita por nota + 200 de bônus por rodada |
| 3 — Ritmo | acertar as notas no tempo | perfeita dentro de 90 ms, boa até 240 ms |

## Pontuação

Uma escala só para as três fases, em `frontend/src/pontuacao.js`. Antes cada
fase tinha a sua (20, 15, 25/12) e a soma só fazia sentido por acidente.

| Jogada | Valor base |
|---|---|
| Perfeita | 100 |
| Boa | 50 |
| Errada, fora de hora, ou nota perdida | 0 |

**Pontos** = valor base × multiplicador, somados. O multiplicador sobe de dez
em dez acertos seguidos — x1, x2, x3, x4 — e volta a x1 no primeiro erro.

**Precisão** = média do valor base das jogadas julgadas, em %. Não depende do
tamanho da carta: 90% numa carta de 40 notas vale o mesmo que numa de 500. Os
bônus de rodada ficam fora dessa média, porque não são batidas.

**Estrelas**, da precisão: 5 a partir de 95%, 4 de 85%, 3 de 70%, 2 de 50%,
1 acima de zero.

As três medidas respondem perguntas diferentes — precisão é a medida justa,
pontos são o placar do ranking, e o multiplicador é a tensão do momento. Por
isso são três, e não uma.

## Regras de negócio

| # | Regra | Onde está implementada |
|---|---|---|
| RN01 | Só conclui cumprindo os objetivos obrigatórios | `fases.js` → `proximaFase` |
| RN02 | Cada desafio gera pontos determinados | `pontuacao.js` → `valorDaJogada`; aplicado em `fases.js` → `marcar` |
| RN03 | Um desafio não conta duas vezes | `deteccao.js` anti-repique + `nota.julgada` |
| RN04 | A pontuação final segue as regras da equipe | `pontuacao.js` — módulo puro, conferível com `node` |
| RN05 | Feedback visual em interação válida | `fases.js` → `bater` |
| RN06 | Aviso quando a interação não é permitida | `julgamento('ERRADO')`, `msg(...,'bad')` |
| RN07 | Resultado registrado só após a conclusão | `fases.js` → `concluir` chama `enviarResultado` |
| RN08 | Critério do ranking | melhor partida por jogador — `rotas/ranking.js` |
| RN09 | Modo VR só com suporte técnico | `main.js` → `isSessionSupported` |
| RN10 | Alternativa sem VR | modo teclado e mouse |

## Requisitos funcionais

| # | Requisito | Situação |
|---|---|---|
| RF01 | Tela inicial | ✅ _(falta preencher os nomes)_ |
| RF02 | Início da partida | ✅ |
| RF03 | Ambiente 3D | ✅ |
| RF04 | Movimentação / observação | ✅ |
| RF05 | Interação com 3+ elementos | ✅ 7 peças |
| RF06 | Objetivo claro | ✅ precisão e multiplicador sempre no HUD, e a barra do rodapé mostra o próximo degrau |
| RF07 | Três desafios pontuados | ✅ |
| RF08 | Pontuação | ✅ |
| RF09 | Conclusão | ✅ |
| RF10 | Resultado | ✅ estrelas, pontos, precisão, combo, tempo |
| RF11 | Persistência | ✅ |
| RF12 | API | ✅ |
| RF13 | Modo convencional | ✅ |
| RF14 | Modo VR | ✅ |
| RF15 | Compatibilidade | ✅ |

## Requisitos não funcionais

| # | Requisito | Como é atendido |
|---|---|---|
| RNF01 | Usabilidade | objetivo sempre na tela; rótulos nas peças na fase de aprendizado |
| RNF02 | Desempenho | ver "Custo por quadro" em [tecnica.md](tecnica.md) |
| RNF03 | Responsividade | layout fluido; `resize` reajusta a câmera |
| RNF04 | Segurança | validação no servidor, sem stack trace ao cliente, `.env` fora do Git |
| RNF05 | Disponibilidade | deploy contínuo no Vercel |
| RNF06 | Compatibilidade | testado em navegador e Quest 3 |
| RNF07 | Manutenibilidade | código em módulos por responsabilidade |
| RNF08 | Versionamento | Git |
| RNF09 | Documentação | este diretório |
| RNF10 | Acessibilidade | _[a melhorar — ver abaixo]_ |

### Acessibilidade: o que ainda falta

Ponto honesto para a apresentação. Hoje o jogo depende de **cor** para
distinguir as peças, e de **áudio** para a fase Eco. Melhorias possíveis:
contraste maior nos rótulos, indicação por forma além de cor, e uma pista
visual redundante na fase Eco para quem não ouve bem.
