/* ============================================================================
   registro.js — o que acontece entre o fim da partida e a linha no banco.

   RN09. Toda partida concluída é gravada (RN07 não mudou). O que mudou é
   QUANDO o jogo para para perguntar quem jogou: só quando a partida vira o
   recorde daquela música naquele nível. Nas outras a linha vai com o nome que
   já estava salvo, sem interromper ninguém.

   POR QUE NÃO PERGUNTAR SEMPRE. Um campo de texto no fim de cada partida é
   atrito em cima do melhor momento do jogo, e com teclado apontado — que é
   como se digita no headset — custa uns vinte segundos. Perguntar só no
   recorde põe o pedido onde ele é recompensa em vez de pedágio. Quem quiser
   deixar o nome pronto antes continua tendo o campo do alto da página.

   O PISO DE PONTOS VEM DA API, não de uma constante daqui. É regra de
   negócio; duas cópias divergem, e a que fica no navegador é justamente a que
   não vale nada, porque qualquer um edita.

   O ENVIO PASSA PELO `enviarResultadoUmaVez`, nunca pelo `enviarResultado`
   direto: é o guarda de envio único do `api.js` que garante que a partida
   entre UMA vez, venha o disparo daqui, do botão "Jogar novamente" ou do
   "Menu". Este módulo controla a TELA; quem controla o envio é aquele guarda.

   CICLO DE IMPORTAÇÃO, o motivo deste arquivo existir: `api.js` já importa
   `ui.js` (para escrever o status). Se a `ui.js` chamasse a `api.js` de
   volta, fecharia o ciclo. Então quem conhece as duas pontas é este módulo,
   que ninguém importa de volta — e o `main.js`, que liga os botões.
   ========================================================================== */

import { corpoDaPartida, buscarRecorde, enviarResultadoUmaVez,
         nomeEscolhido } from './api.js';
import { pedirNome, fecharPedidoDeNome, statusApi } from './ui.js';

/** O piso, caso a API não tenha dito qual é. Só um seguro: em uso normal o
 *  valor vem no `minimo` da resposta. */
const PISO_PADRAO = 1000;

/** Está a tela esperando alguém digitar um nome? `false` na esmagadora
 *  maioria das partidas. */
let pedindo = false;

/** Conta as partidas concluídas nesta sessão, para uma resposta atrasada
 *  reconhecer que já não é da partida corrente e sair sem fazer nada. */
let geracao = 0;

/** Chamado por `concluir()`, em fases.js. RN07: partida concluída, nunca
 *  durante. */
export async function registrarPartida(){
  /* Antes de qualquer await: o jogador pode apertar "Jogar novamente" durante
     a consulta, e aí `jogo` já foi zerado. O corpo montado agora é o que
     impede uma partida de ser gravada com os números da seguinte. */
  const corpo = corpoDaPartida();
  const minha = ++geracao;
  pedindo = false;

  /* Partida sem música escolhida não cai em recorde nenhum — não há balde em
     que "o melhor" queira dizer alguma coisa. Grava e pronto. */
  if (!corpo.musica || !corpo.nivel){ enviarResultadoUmaVez(); return; }

  const r = await buscarRecorde(corpo.musica, corpo.nivel);

  /* Enquanto a resposta vinha, outra partida começou (e talvez terminou).
     Esta resposta está velha: agir nela abriria um teclado por cima de outra
     tela. O envio desta partida já foi resolvido por quem a interrompeu. */
  if (minha !== geracao) return;

  /* Sem resposta da API não dá para saber se é recorde. Grava assim mesmo —
     o POST vai falhar do mesmo jeito e a tela dirá isso —, mas não pede nome:
     um teclado que aparece para uma gravação que não vai acontecer é pior do
     que não aparecer. */
  if (!r){ enviarResultadoUmaVez(); return; }

  const minimo = Number(r.minimo) > 0 ? Number(r.minimo) : PISO_PADRAO;
  const atual  = r.recorde || null;
  const bateu  = corpo.pontos >= minimo
              && (!atual || corpo.pontos > Number(atual.pontos));

  if (!bateu){ enviarResultadoUmaVez(); return; }

  /* A tela de resultado pode não estar mais no ar. `pedirNome` devolve false
     nesse caso, e aí não há a quem perguntar. */
  const perguntou = pedirNome({
    pontos:   corpo.pontos,
    nivel:    corpo.nivel,
    anterior: atual,
    sugestao: nomeEscolhido(),
  });
  if (!perguntou){ enviarResultadoUmaVez(); return; }

  pedindo = true;
  statusApi('novo recorde — informe o nome', 'var(--gold)');
}

/** O jogador confirmou o nome, no teclado 3D. */
export function confirmarNome(nome){
  if (!pedindo) return;
  pedindo = false;
  fecharPedidoDeNome();
  const limpo = String(nome ?? '').trim().replace(/\s+/g, ' ');
  /* `enviarResultadoUmaVez` salva o nome ANTES de montar o corpo, então o
     recorde sai com ele. Nome vazio cai no que já estava salvo. */
  return enviarResultadoUmaVez(limpo || undefined);
}

/** SAIR SEM CONFIRMAR NÃO PODE PERDER O RECORDE.
 *
 *  "Jogar de novo", "Menu", entrar ou sair do VR: a partida já aconteceu, e
 *  RN07 diz que partida concluída é registrada. Vai com o nome que já estava
 *  salvo. Perder a melhor partida do dia porque alguém apertou o botão errado
 *  seria o pior desfecho possível para uma tela que existe para comemorar. */
export function garantirRegistro(){
  if (!pedindo) return;
  pedindo = false;
  fecharPedidoDeNome();
  return enviarResultadoUmaVez();
}

/** Há uma partida esperando nome? (usado pelo `main.js` e pelos testes) */
export function esperandoNome(){ return pedindo; }
