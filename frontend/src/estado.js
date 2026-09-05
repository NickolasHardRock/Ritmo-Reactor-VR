/* ============================================================================
   estado.js — os dados da partida, isolados do desenho e da interface.

   É este objeto que vira o corpo do POST /partidas no fim. Manter o estado
   separado é o que permite testar as regras sem abrir uma janela 3D.
   ========================================================================== */

import { ECO_RODADAS } from './config.js';
import { precisaoPonderada } from './pontuacao.js';

export const jogo = {
  ativo: false,
  livre: false,      // modo livre: toca à vontade, sem pontuar
  atalho: false,     // pulou calibração e eco: não entra no ranking
  fase: 0,
  pontos: 0,
  combo: 0,
  comboMax: 0,
  perfeitas: 0,
  boas: 0,
  erros: 0,
  t0: 0,             // performance.now() do início
  duracao: 0,        // segundos, preenchido em concluir()
};

export const FASES = [
  { nome:'Calibração', desc:'acerte a peça indicada'     },
  { nome:'Eco',        desc:'repita o padrão tocado'     },
  { nome:'Ritmo',      desc:'acerte no tempo'            },
];

/** Fase 1 — a fila de peças que o jogador ainda precisa acertar. */
export const cal = { fila: [], atual: null };

/** Fase 2 — o padrão sorteado e o que o jogador já respondeu. */
export const eco = {
  rodada: 0, padrao: [], entrada: [], tocando: false,
  tamanhos: ECO_RODADAS,
};

/** Fase 3 — as notas da pista e o instante zero no relógio do áudio. */
export const ritmo = { notas: [], auto: [], iAuto: 0, fim: 0, fontesAuto: [],
                       t0: 0, ativo: false, construido: false };

/** Zera tudo para uma nova partida (RF02). */
export function reiniciarEstado(livre = false, atalho = false){
  Object.assign(jogo, {
    ativo: true, livre, atalho, fase: 0, pontos: 0, combo: 0, comboMax: 0,
    perfeitas: 0, boas: 0, erros: 0, t0: performance.now(),
    duracao: 0,
  });
  cal.fila = []; cal.atual = null;
  eco.rodada = 0; eco.padrao = []; eco.entrada = []; eco.tocando = false;
  ritmo.ativo = false; ritmo.auto = []; ritmo.iAuto = 0;
}

/** Precisão em %, usada na tela de resultado, nas estrelas e na API.
 *
 *  Ponderada: um BOM vale metade de um PERFEITO. A conta mora em
 *  `pontuacao.js`, que não depende de tela nenhuma e por isso pode ser
 *  conferida com `node`. */
export function precisao(){
  return precisaoPonderada(jogo.perfeitas, jogo.boas, jogo.erros);
}
