/* ============================================================================
   regras.js — as regras de negócio do registro, em funções puras.

   Sem Express, sem banco, sem DOM: dá para conferir com `node` e é o que o
   `npm test` exercita sem precisar de rede.

   RN09 — QUANDO UMA PARTIDA VIRA RECORDE
   O jogo só pede o nome de quem jogou quando a partida entra para a história
   daquela música NAQUELA dificuldade. Duas condições, as duas obrigatórias:

     1. bater a melhor pontuação já registrada em (música, dificuldade);
     2. fazer pelo menos PONTOS_MINIMOS pontos.

   A segunda existe porque a primeira, sozinha, se resolve com uma partida
   vazia: no banco recém-criado QUALQUER resultado é recorde, e o jogo pararia
   para pedir um nome depois de uma partida de 40 pontos abandonada no meio. O
   piso transforma "é o primeiro" em "é bom o bastante para valer um nome".

   O PISO NÃO APARECE NA TELA, de propósito. Ele é critério nosso, não meta do
   jogador: anunciar "faltam 1000 pontos" criaria um segundo objetivo ao lado
   das estrelas, e é justamente o tipo de número que envelhece mal quando a
   carta muda de tamanho. Quem não alcança simplesmente não vê o pedido.
   ========================================================================== */

/** Piso de pontuação para uma partida ser considerada recorde (RN09). */
export const PONTOS_MINIMOS = 1000;

/**
 * @param {number} pontos       pontuação da partida que acabou
 * @param {{pontos:number}|null} recorde  o recorde atual, ou null se não há
 * @param {number} minimo       piso; parametrizado para o teste não depender
 *                              da constante e poder exercitar a borda
 * @returns {boolean}
 */
export function ehRecorde(pontos, recorde, minimo = PONTOS_MINIMOS){
  const p = Number(pontos);
  if (!Number.isFinite(p) || p < minimo) return false;
  if (!recorde) return true;                 // nenhum registro ainda
  return p > Number(recorde.pontos);         // empate NÃO desbanca o primeiro
}
