/* ============================================================================
   calibragem.js — mede quanto o som atrasa entre ser agendado e ser ouvido.

   POR QUE ISSO EXISTE. `AudioContext.outputLatency` deveria dizer o atraso da
   saída, mas na prática mente: no Windows costuma declarar uns 40 ms quando o
   real passa de 150, e em alguns navegadores nem existe. O jogador então bate
   junto com o que ouve e o jogo acusa atraso — parece que rouba.

   A única medida confiável é a do próprio jogador, no aparelho dele. O jogo
   toca um clique em instantes que ele conhece exatamente, o jogador bate junto,
   e a diferença é o atraso total da cadeia: saída de áudio, alto-falante ou
   Bluetooth, e o viés pessoal de quem toca.

   O QUE A MEDIDA INCLUI. Tudo. Por isso ela SUBSTITUI o palpite do navegador
   em vez de somar com ele — somar contaria a saída duas vezes.

   MEDIANA, NÃO MÉDIA. Uma batida perdida ou um clique que o jogador não ouviu
   estraga uma média e não mexe numa mediana.
   ========================================================================== */

import { synth } from './synth.js';
import { Musica } from './musica.js';

const INTERVALO = 0.6;      // segundos entre cliques — 100 BPM, confortável
const CLIQUES   = 16;       // dá para errar alguns e ainda sobrar amostra
const MINIMO    = 6;        // abaixo disto a mediana não vale nada
const TOLERANCIA = 0.35;    // acima disto o jogador bateu em outro clique

export const calibragem = {
  ativa: false,
  agendados: [],            // instantes (relógio do áudio) de cada clique
  desvios: [],
  fontes: [],
  aoAtualizar: null,        // (n, total) → void
  aoTerminar: null,         // (resultadoMs|null, dispersaoMs) → void
};

/** Começa a medição. Os cliques são AGENDADOS de uma vez, no relógio do
 *  áudio: é o mesmo motivo da trilha automática — se dependesse do laço de
 *  render, uma engasgada estragaria a medida. */
export async function iniciarCalibragem(aoAtualizar, aoTerminar){
  await synth.ligar();
  pararCalibragem();
  calibragem.aoAtualizar = aoAtualizar;
  calibragem.aoTerminar  = aoTerminar;

  const ctx = synth.ctx;
  const t0 = ctx.currentTime + 1.0;      // um segundo para o jogador se situar
  for (let i = 0; i < CLIQUES; i++){
    const t = t0 + i * INTERVALO;
    calibragem.agendados.push(t);
    const f = synth.tocar('ok', 0.9, t);
    if (f) calibragem.fontes.push(f);
  }
  calibragem.ativa = true;

  // Fecha sozinho um pouco depois do último clique, mesmo se o jogador parar.
  calibragem._fim = setTimeout(() => concluir(), (CLIQUES * INTERVALO + 1.8) * 1000);
}

/** Chamada a cada batida do jogador durante a medição — tecla, clique do
 *  mouse ou baqueta. Aceitar baqueta importa: a latência dentro do headset é
 *  outra, e é lá que o jogo é jogado de verdade. */
export function registrarBatida(){
  if (!calibragem.ativa) return false;
  const agora = synth.ctx.currentTime;

  // Clique mais próximo. O jogador pode adiantar ou atrasar; o sinal do
  // desvio importa, então não uso valor absoluto para escolher.
  let melhor = null, dist = Infinity;
  for (const t of calibragem.agendados){
    const d = Math.abs(agora - t);
    if (d < dist){ dist = d; melhor = t; }
  }
  if (melhor === null || dist > TOLERANCIA) return true;   // consome, descarta

  calibragem.desvios.push(agora - melhor);
  if (calibragem.aoAtualizar) calibragem.aoAtualizar(calibragem.desvios.length, CLIQUES);
  return true;
}

function concluir(){
  if (!calibragem.ativa) return;
  calibragem.ativa = false;
  clearTimeout(calibragem._fim);

  const d = calibragem.desvios.slice().sort((a,b) => a-b);
  if (d.length < MINIMO){
    if (calibragem.aoTerminar) calibragem.aoTerminar(null, 0);
    return;
  }
  const mediana = d[d.length >> 1];
  /* Dispersão pela distância interquartil, não pelo desvio padrão: ela também
     é imune às batidas perdidas, e é o que diz se a medida merece confiança. */
  const q1 = d[Math.floor(d.length * .25)], q3 = d[Math.floor(d.length * .75)];
  const disp = q3 - q1;

  /* Atraso negativo não existe fisicamente — o som não chega antes de ser
     agendado. Um valor negativo quer dizer que o jogador antecipa por hábito,
     e nesse caso compensar zero é mais honesto que compensar ao contrário. */
  const valor = Math.max(0, Math.min(mediana, 0.5));
  Musica.calibragem = valor;
  if (calibragem.aoTerminar) calibragem.aoTerminar(valor * 1000, disp * 1000);
}

/** Cancela e cala os cliques que ainda não soaram. */
export function pararCalibragem(){
  clearTimeout(calibragem._fim);
  for (const f of calibragem.fontes){ try { f.stop(); } catch { /* já soou */ } }
  calibragem.ativa = false;
  calibragem.agendados = [];
  calibragem.desvios = [];
  calibragem.fontes = [];
}

export { concluir as concluirCalibragem };
