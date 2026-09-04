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

/* O ESPAÇAMENTO DOS CLIQUES É O TETO DA MEDIDA. Com cliques de 0,6 s, uma
   batida 0,4 s atrasada fica mais perto do clique SEGUINTE e é medida como
   0,2 s adiantada — e adiantado vira zero no fim desta função. Ou seja: quem
   mais precisa de correção era justamente quem não conseguia medir. Com 1,0 s
   a medida vai até meio segundo sem ambiguidade, que cobre Bluetooth. */
const INTERVALO = 1.0;      // segundos entre cliques — 60 BPM
const CLIQUES   = 12;       // 12 s de medição; dá para errar alguns
const MINIMO    = 6;        // abaixo disto a mediana não vale nada
const TOLERANCIA = 0.45;    // metade do intervalo, menos uma folga

/* CONTAGEM DE ENTRADA. Sem ela o primeiro som chega sem aviso, e a primeira
   batida do jogador é sempre um chute — o que suja a amostra justamente no
   começo, quando ele ainda está pegando o tempo.

   A contagem vem no MESMO intervalo dos cliques, porque é isso que ensina o
   andamento: quando o "1" aparece, o jogador já sabe exatamente quando cai o
   próximo. E vem com som DIFERENTE, chimbal em vez de caixa, que é como um
   baterista conta a entrada — não dá para confundir contagem com medida. As
   três não entram em `agendados`, então uma batida em cima delas fica a um
   segundo inteiro do primeiro clique medido, muito além da TOLERANCIA, e é
   descartada sozinha. Não precisa de estado novo para isso.

   O som importa mais que o número: dentro do headset o painel é HTML e não
   aparece, então a contagem audível é a única que chega lá. */
const CONTAGEM = 3;
const RESPIRO  = 0.6;       // pausa antes de a contagem começar

export const calibragem = {
  ativa: false,
  agendados: [],            // instantes (relógio do áudio) de cada clique
  desvios: [],
  fontes: [],
  aoAtualizar: null,        // (n, total) → void
  aoTerminar: null,         // (resultadoMs|null, dispersaoMs, detalhe) → void
  aoContar: null,           // (n) → void — 3, 2, 1 e depois 0 = "bata"
  inicio: 0,                // instante do PRIMEIRO clique medido
};

/** Começa a medição. Os cliques são AGENDADOS de uma vez, no relógio do
 *  áudio: é o mesmo motivo da trilha automática — se dependesse do laço de
 *  render, uma engasgada estragaria a medida. */
export async function iniciarCalibragem(aoAtualizar, aoTerminar, aoContar){
  await synth.ligar();
  pararCalibragem();
  calibragem.aoAtualizar = aoAtualizar;
  calibragem.aoTerminar  = aoTerminar;
  calibragem.aoContar    = aoContar;

  const ctx = synth.ctx;
  const inicioContagem = ctx.currentTime + RESPIRO;
  const t0 = inicioContagem + CONTAGEM * INTERVALO;   // primeiro clique medido
  calibragem.inicio = t0;

  for (let i = 0; i < CONTAGEM; i++){
    const f = synth.tocar('chimbal', 0.5, inicioContagem + i * INTERVALO);
    if (f) calibragem.fontes.push(f);
  }
  desenharContagem();

  for (let i = 0; i < CLIQUES; i++){
    const t = t0 + i * INTERVALO;
    calibragem.agendados.push(t);
    /* O som de referência é a CAIXA, não o bipe de interface. Dois motivos:
       ele passa pelo mesmo caminho das amostras que o jogo toca de verdade
       (o bipe é oscilador, e ataque de oscilador não é ataque de tambor), e
       o ouvido marca o tempo de um tambor num instante um pouco diferente do
       de um tom puro. Medir com o som que se vai tocar tira essa diferença
       da conta em vez de deixá-la sobrando para o ajuste fino. */
    const f = synth.tocar('caixa', 0.9, t);
    if (f) calibragem.fontes.push(f);
  }
  calibragem.ativa = true;

  // Fecha sozinho um pouco depois do último clique, mesmo se o jogador parar.
  calibragem._fim = setTimeout(() => concluir(),
    (RESPIRO + CONTAGEM * INTERVALO + CLIQUES * INTERVALO + 1.8) * 1000);
}

/* O número na tela é lido do RELÓGIO DO ÁUDIO a cada quadro, não disparado
   por `setTimeout`. Não é preciosismo: é o que mantém o número colado no som
   que o jogador ouve. Um `setTimeout` de 1 s numa aba ocupada chega quando
   chega, e aí o "1" apareceria fora do tempo do chimbal — ensinando o
   andamento errado, que é o oposto do que a contagem existe para fazer.
   (Aqui o laço de quadro é seguro: se ele travar, o pior que acontece é o
   número atrasar. Nada do que é MEDIDO passa por ele.) */
function desenharContagem(){
  const ctx = synth.ctx;
  const passo = () => {
    if (!calibragem.ativa && !calibragem.inicio) return;
    const falta = calibragem.inicio - ctx.currentTime;
    if (falta <= 0){
      calibragem.aoContar?.(0);          // "bata junto"
      return;
    }
    /* Durante o RESPIRO ainda não soou nada, e mostrar número aí faria a
       contagem começar em 4: `falta` vale 3,6 e o arredondamento para cima
       sobe um. Número sem som correspondente é pior que tela vazia — ensina
       um andamento que não existe. Então só conta a partir do primeiro
       chimbal, quando `falta` cabe nos CONTAGEM intervalos. */
    if (falta <= CONTAGEM * INTERVALO)
      calibragem.aoContar?.(Math.ceil(falta / INTERVALO));
    requestAnimationFrame(passo);
  };
  requestAnimationFrame(passo);
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
     agendado. Um valor negativo quer dizer que o jogador antecipa por hábito.

     E aqui está o segundo cuidado: o `outputLatency` do navegador é um PISO,
     não um palpite solto — é a parte da cadeia que ele realmente conhece. Se
     a medida do jogador ficar abaixo dele, quem errou foi a medida (antecipação
     ou batidas perdidas), não o navegador. Guardar o menor dos dois deixaria o
     jogo PIOR calibrado do que estava antes de calibrar, que é exatamente o
     tipo de conserto que ninguém desconfia. Então fica o maior. */
  const ctx = synth.ctx;
  const piso = ctx ? (ctx.outputLatency || ctx.baseLatency || 0) : 0;
  const medida = Math.max(0, Math.min(mediana, 0.5));
  const valor  = Math.max(medida, piso);
  Musica.calibragem = valor;
  if (calibragem.aoTerminar)
    calibragem.aoTerminar(valor * 1000, disp * 1000, {
      medida: medida * 1000, piso: piso * 1000, usouPiso: valor > medida,
      amostras: d.length,
    });
}

/** Cancela e cala os cliques que ainda não soaram. */
export function pararCalibragem(){
  clearTimeout(calibragem._fim);
  for (const f of calibragem.fontes){ try { f.stop(); } catch { /* já soou */ } }
  calibragem.ativa = false;
  calibragem.agendados = [];
  calibragem.desvios = [];
  calibragem.fontes = [];
  calibragem.inicio = 0;
}

export { concluir as concluirCalibragem };
