/* ============================================================================
   estado.js — os dados da partida, isolados do desenho e da interface.

   É este objeto que vira o corpo do POST /partidas no fim. Manter o estado
   separado é o que permite testar as regras sem abrir uma janela 3D.
   ========================================================================== */

import { ECO_RODADAS } from './config.js';

export const jogo = {
  ativo: false,
  livre: false,      // modo livre: toca à vontade, sem pontuar
  fase: 0,
  pontos: 0,
  combo: 0,
  comboMax: 0,
  perfeitas: 0,
  boas: 0,
  erros: 0,
  t0: 0,             // performance.now() do início
  duracao: 0,        // segundos, preenchido em concluir()
  reator: 0,         // 0..100 — a carga, derivada dos pontos
};

export const FASES = [
  { nome:'Calibração', desc:'acerte a peça indicada'     },
  { nome:'Eco',        desc:'repita o padrão do reator'  },
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
export const ritmo = { notas: [], auto: [], iAuto: 0, fim: 0,
                       t0: 0, ativo: false, construido: false };

/** Zera tudo para uma nova partida (RF02). */
export function reiniciarEstado(livre = false){
  Object.assign(jogo, {
    ativo: true, livre, fase: 0, pontos: 0, combo: 0, comboMax: 0,
    perfeitas: 0, boas: 0, erros: 0, t0: performance.now(),
    duracao: 0, reator: 0,
  });
  cal.fila = []; cal.atual = null;
  eco.rodada = 0; eco.padrao = []; eco.entrada = []; eco.tocando = false;
  ritmo.ativo = false; ritmo.auto = []; ritmo.iAuto = 0;
}

/** Precisão em %, usada na tela de resultado e enviada à API. */
export function precisao(){
  const total = jogo.perfeitas + jogo.boas + jogo.erros;
  return total ? Math.round((jogo.perfeitas + jogo.boas) / total * 100) : 0;
}
