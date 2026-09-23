/* ============================================================================
   registro.js — o que acontece entre o fim da partida e a linha no banco.

   RN09. Toda partida concluída é gravada (RN07 não mudou). O que mudou é
   DE QUEM ela é: o jogo pergunta o nome quando a partida vira o recorde
   daquela música naquela dificuldade — e só então. Nas outras a linha vai
   com o último nome conhecido, sem parar o jogador para digitar.

   POR QUE NÃO PERGUNTAR SEMPRE. Um campo de texto no fim de cada partida é
   atrito em cima do melhor momento do jogo, e em VR é pior: digitar com
   teclado apontado custa uns vinte segundos. Perguntar só no recorde põe o
   pedido onde ele é uma recompensa em vez de um pedágio.

   O PISO DE PONTOS VEM DA API, não de uma constante daqui. É regra de
   negócio; duas cópias divergem, e a que está no navegador é justamente a
   que não vale nada — qualquer um edita.

   CICLO DE IMPORTAÇÃO, o motivo deste arquivo existir: `api.js` já importa
   `ui.js` (para escrever o status). Se a `ui.js` chamasse a `api.js` de
   volta, fecharia o ciclo. Então quem conhece as duas pontas é este módulo,
   que ninguém importa de volta — e o `main.js`, que liga os botões.
   ========================================================================== */

import { corpoDaPartida, buscarRecorde, enviarResultado,
         definirNome, nomeJogador } from './api.js';
import { pedirNome, fecharPedidoDeNome, statusApi } from './ui.js';

/** O piso, caso a API não tenha dito qual é. Só um seguro: em uso normal o
 *  valor vem no `minimo` da resposta. */
const PISO_PADRAO = 1000;

/** A partida que já terminou e está esperando ser gravada. `null` quando não
 *  há nada pendente — que é o caso da esmagadora maioria das partidas. */
let pendente = null;

/** Conta as partidas concluídas nesta sessão. Serve para uma resposta atrasada
 *  reconhecer que já não é da partida corrente e sair sem fazer nada. */
let geracao = 0;

/** Chamado por `concluir()`, em fases.js. RN07: partida concluída, nunca
 *  durante. */
export async function registrarPartida(){
  /* Antes de qualquer await: ver o comentário de `corpoDaPartida`. */
  const corpo = corpoDaPartida();
  const minha = ++geracao;

  /* A PARTIDA JÁ FICA PENDENTE AQUI, e não depois da consulta. A consulta
     leva o tempo que a rede levar, e nesse intervalo o jogador pode apertar
     "Jogar novamente": se `pendente` ainda fosse null, o `garantirRegistro()`
     desse botão não acharia nada para gravar e a partida sumiria — justamente
     a melhor delas, porque só o recorde faz o jogo esperar. */
  pendente = corpo;

  const r = await buscarRecorde(corpo.musica, corpo.nivel);

  /* Enquanto a resposta vinha, outro caminho resolveu esta partida (o botão
     de sair gravou) ou uma partida nova começou e terminou. Em qualquer um
     dos casos esta resposta está velha: agir nela abriria um pedido de nome
     por cima de outra tela. */
  if (minha !== geracao || pendente !== corpo) return;

  /* Sem resposta da API não dá para saber se é recorde. Grava assim mesmo —
     o POST vai falhar do mesmo jeito e a tela dirá isso — mas não pede nome:
     um teclado que aparece para uma gravação que não vai acontecer é pior do
     que não aparecer. */
  if (!r){ pendente = null; enviarResultado(corpo); return; }

  const minimo = Number(r.minimo) > 0 ? Number(r.minimo) : PISO_PADRAO;
  const atual  = r.recorde || null;
  const bateu  = corpo.pontos >= minimo
              && (!atual || corpo.pontos > Number(atual.pontos));

  if (!bateu){ pendente = null; enviarResultado(corpo); return; }

  /* A tela de resultado pode não estar mais no ar (o jogador saiu por um
     caminho que não passa por aqui). `pedirNome` devolve false nesse caso, e
     aí não há a quem perguntar: grava e pronto. */
  const perguntou = pedirNome({
    pontos:   corpo.pontos,
    nivel:    corpo.nivel,
    anterior: atual,
    sugestao: nomeJogador() === 'Jogador' ? '' : nomeJogador(),
  });
  if (!perguntou){ pendente = null; enviarResultado(corpo); return; }
  statusApi('novo recorde — informe o nome', 'var(--gold)');
}

/** O jogador confirmou o nome — na tela ou no teclado 3D. */
export function confirmarNome(nome){
  if (!pendente) return;
  const corpo = pendente; pendente = null;

  const limpo = String(nome ?? '').trim().replace(/\s+/g, ' ').slice(0, 60);
  if (limpo) definirNome(limpo);

  fecharPedidoDeNome();
  /* Devolve a promessa do POST: quem chamou pode atualizar a lista de
     recordes da tela inicial DEPOIS de a linha existir no banco, em vez de
     chutar um `setTimeout` e recarregar cedo demais. */
  return enviarResultado({ ...corpo, nome: limpo || nomeJogador() });
}

/** SAIR SEM DIGITAR NÃO PODE PERDER O RECORDE.
 *
 *  "Jogar novamente", "Menu", ou fechar o pedido: a partida já aconteceu e
 *  RN07 diz que partida concluída é registrada. Vai com o último nome
 *  conhecido. Perder a melhor partida do dia porque alguém apertou o botão
 *  errado seria o pior desfecho possível para uma tela que existe
 *  justamente para comemorar. */
export function garantirRegistro(){
  if (!pendente) return;
  const corpo = pendente; pendente = null;
  fecharPedidoDeNome();
  return enviarResultado(corpo);
}

/** Há uma partida esperando nome? (usado pelos testes e pelo `main.js`) */
export function esperandoNome(){ return pendente !== null; }
