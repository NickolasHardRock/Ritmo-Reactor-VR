/* ============================================================================
   fases.js — as regras do jogo. Três desafios de tipos diferentes (RF07),
   a pontuação (RF08) e a conclusão (RF09).

   Regras de negócio que moram aqui:
     RN02 — cada desafio concluído gera uma quantidade determinada de pontos
     RN03 — um desafio não é contabilizado duas vezes
     RN05 — toda interação válida gera retorno visual
     RN06 — o sistema informa quando a interação não é permitida
     RN07 — o resultado só é registrado depois da conclusão
   ========================================================================== */

import * as THREE from 'three';
import { PECAS, PORID, PONTOS_ALVO, CARTA_URL,
         NIVEIS, nivelAtual } from './config.js';
import { musica, notasDoRecorte } from './musica.js';
import { registrarBatida } from './calibragem.js';
import { jogo, cal, eco, ritmo, FASES, reiniciarEstado } from './estado.js';
import { synth } from './synth.js';
import { pistaG } from './cena.js';
import { zonas, mostrarRotulos, destacar } from './kit.js';
import { msg, julgamento, atualizarHUD, objetivo, statusApi,
         telaJogando, telaResultado } from './ui.js';
import { enviarResultado } from './api.js';

/* --------------------------------------------------------- pontuação ----- */
function pontuar(n){
  jogo.pontos += n;
  jogo.reator = Math.min(100, jogo.pontos / PONTOS_ALVO * 100);   // RN04
  atualizarHUD();
}
function acerto(){
  jogo.combo++;
  jogo.comboMax = Math.max(jogo.comboMax, jogo.combo);
}
function erro(){ jogo.combo = 0; jogo.erros++; }

/* ============================== A BATIDA ==================================
   Ponto único de entrada: venha do VR (baqueta), do teclado ou do mouse,
   toda batida passa por aqui. É o que garante que as três formas de jogar
   sigam exatamente as mesmas regras.                                      */
export function bater(zona, força = .8){
  const p = zona.p;
  synth.tocar(p.som, força);
  /* Durante a calibragem a batida é a amostra, não jogada. Aceitar baqueta
     importa: a latência dentro do headset é outra, e é lá que se joga. */
  if (registrarBatida()) return;
  zona.brilho = 1;                       // RN05 — retorno visual
  zona.disco.material.opacity = .55;

  if (!jogo.ativo || jogo.livre) return;
  if      (jogo.fase === 0) calibracaoBatida(p);
  else if (jogo.fase === 1) ecoBatida(p);
  else                      ritmoBatida(p);
}

/* ====================== FASE 1 — CALIBRAÇÃO ===============================
   Ensina a bateria: o jogo pede uma peça, o jogador acerta. Serve de
   tutorial sem parecer tutorial.                                          */
function calibracaoIniciar(){
  cal.fila = PECAS.map(p => p.id).sort(() => Math.random() - .5);
  calibracaoProxima();
}
function calibracaoProxima(){
  cal.atual = cal.fila.shift();
  if (!cal.atual){ proximaFase(); return; }
  const p = PORID[cal.atual];
  objetivo(`Acerte: ${p.nome.toUpperCase()}`, '#' + p.cor.toString(16).padStart(6,'0'));
  destacar(cal.atual);
}
function calibracaoBatida(p){
  if (p.id === cal.atual){
    pontuar(20); acerto(); jogo.perfeitas++;
    julgamento('OK', '#3ddc97');
    destacar(null);
    calibracaoProxima();
  } else {
    erro();                                        // RN06
    julgamento('ERRADO', '#ff4d6d');
    synth.tocar('erro', .6);
    atualizarHUD();
  }
}

/* ============================ FASE 2 — ECO ================================
   O reator toca um padrão, o jogador repete. Memória sequencial, três
   rodadas crescentes.                                                     */
const INTERVALO_ECO = 0.55;   // segundos entre notas do padrão

function ecoIniciar(){ eco.rodada = 0; ecoNovaRodada(); }

function ecoNovaRodada(){
  if (eco.rodada >= eco.tamanhos.length){ proximaFase(); return; }
  const n = eco.tamanhos[eco.rodada];
  const pool = PECAS.map(p => p.id);
  eco.padrao = [];
  while (eco.padrao.length < n){                  // sem repetir a peça anterior
    const id = pool[Math.floor(Math.random() * pool.length)];
    if (id !== eco.padrao[eco.padrao.length - 1]) eco.padrao.push(id);
  }
  eco.entrada = [];
  ecoTocarPadrao();
}

function ecoTocarPadrao(){
  eco.tocando = true;
  objetivo(`Rodada ${eco.rodada + 1}/${eco.tamanhos.length} — ouça…`, '#ffd34d');
  synth.ligar();
  // Agendado no relógio do ÁUDIO, não em setTimeout: setTimeout erra dezenas
  // de milissegundos e num jogo de ritmo isso é audível.
  const t0 = synth.agora + .5;
  eco.padrao.forEach((id, i) => {
    synth.tocar(PORID[id].som, .9, t0 + i*INTERVALO_ECO);
    // o brilho visual acompanha; aí sim setTimeout serve, é só estética
    setTimeout(() => {
      const z = zonas.find(z => z.p.id === id);
      z.brilho = 1; z.disco.material.opacity = .6; destacar(id);
    }, (t0 - synth.agora + i*INTERVALO_ECO) * 1000);
  });
  setTimeout(() => {
    eco.tocando = false; destacar(null);
    objetivo('Sua vez — repita', '#00d9ff');
  }, (t0 - synth.agora + eco.padrao.length*INTERVALO_ECO + .35) * 1000);
}

function ecoBatida(p){
  if (eco.tocando){ msg('Espere o padrão terminar.', 'bad', 1.2); return; }
  const esperado = eco.padrao[eco.entrada.length];
  if (p.id !== esperado){                          // RN06
    erro();
    julgamento('ERRADO', '#ff4d6d');
    synth.tocar('erro', .7);
    eco.entrada = [];
    msg('Sequência quebrada — ouça de novo.', 'bad');
    atualizarHUD();
    setTimeout(ecoTocarPadrao, 900);
    return;
  }
  eco.entrada.push(p.id);
  acerto(); jogo.perfeitas++; pontuar(15);
  julgamento('OK', '#3ddc97');
  if (eco.entrada.length === eco.padrao.length){
    eco.rodada++; pontuar(40); synth.tocar('nivel');
    msg(`Rodada ${eco.rodada}/${eco.tamanhos.length} concluída  +40`, 'gold');
    setTimeout(ecoNovaRodada, 1100);
  }
}

/* =========================== FASE 3 — RITMO ===============================
   As notas descem por faixas até a linha do alvo. O que manda aqui é o
   relógio da MÚSICA (musica.tempo), não o de render nem `setTimeout`: os
   dois derrapam dezenas de milissegundos e o jogador ouve a diferença.

   Todos os tempos — das notas e do relógio — são segundos ABSOLUTOS da
   faixa. Ter uma escala de tempo só, em vez de converter para "tempo de
   recorte", elimina uma classe inteira de bug de meio compasso.

   A trilha AUTOMÁTICA é o bumbo. O Quest não rastreia os pés, então ele não
   é tocável; mas numa levada de rock o bumbo é metade da música, e sem ele
   a coisa fica irreconhecível. Então o jogo toca. Ela é agendada com
   antecedência no relógio do áudio, nunca disparada no quadro — agendar é o
   que garante que caia no lugar mesmo se o render engasgar.               */

const Z_ALVO = 0.15, Z_NASC = -2.9, VEL_PISTA = 1.35;      // m/s
const ANTECEDENCIA = (Z_ALVO - Z_NASC) / VEL_PISTA;        // ~2,3 s de pista
const JANELA_PERFEITO = .09, JANELA_BOM = .24, JANELA_PERDA = .26;
/* Multiplicadas pelo nível escolhido — ver NIVEIS em config.js. */
let JP = JANELA_PERFEITO, JB = JANELA_BOM, JX = JANELA_PERDA;

/* Espera antes de o som entrar, para as primeiras notas já estarem descendo
   quando a música começa. Sem isto a primeira nota nasce em cima da linha. */
const ESPERA_INICIAL = ANTECEDENCIA + 0.8;

/* A trilha automática é agendada TODA DE UMA VEZ, no início da fase, e não
   quadro a quadro.

   Agendar por quadro parece mais econômico e está errado: `requestAnimationFrame`
   congela quando a aba sai de foco ou o jogador tira o headset, e aí o bumbo
   simplesmente para e não volta. Já o relógio do áudio continua andando — a
   música seguiria sem a levada.

   São umas dezenas de notas por música; o Web Audio agenda isso sem suar. O
   preço é ter de guardar as fontes para poder cancelar se a fase reiniciar. */

function montarPista(){
  if (ritmo.construido) return;
  const linha = new THREE.Mesh(
    new THREE.BoxGeometry(2.0, .012, .02),
    new THREE.MeshBasicMaterial({ color:0x00d9ff }));
  linha.position.set(0, 0, Z_ALVO); pistaG.add(linha);
  for (let i = 0; i < PECAS.length; i++){
    const x = -0.9 + i * (1.8 / (PECAS.length - 1));
    const faixa = new THREE.Mesh(
      new THREE.BoxGeometry(.012, .008, 3.1),
      new THREE.MeshBasicMaterial({ color:PECAS[i].cor, transparent:true, opacity:.16 }));
    faixa.position.set(x, 0, (Z_ALVO + Z_NASC) / 2); pistaG.add(faixa);
    PECAS[i]._faixaX = x;
  }
  ritmo.construido = true;
}

function limparNotas(){
  pararAuto();
  for (const n of ritmo.notas){
    if (!n.mesh) continue;
    n.mesh.geometry.dispose(); n.mesh.material.dispose(); pistaG.remove(n.mesh);
  }
  ritmo.notas = [];
}

export async function ritmoIniciar(){
  limparNotas();                       // senão vazam malhas a cada replay
  montarPista();

  /* Dificuldade: rala as peças de marcação e alarga as janelas. Feito aqui,
     na hora de tocar, e não na carta — assim a mesma carta serve para os dois
     níveis e trocar de nível não exige reconverter nada. */
  const nivel = NIVEIS[nivelAtual()] || NIVEIS.normal;
  JP = JANELA_PERFEITO * nivel.janela;
  JB = JANELA_BOM      * nivel.janela;
  JX = JANELA_PERDA    * nivel.janela;

  let recorte;
  try {
    const carta = await musica.carregarCarta(CARTA_URL);
    recorte = notasDoRecorte(carta);
    objetivo((carta.titulo ? `♪ ${carta.titulo}` : 'Acerte no tempo')
             + ` — ${nivel.nome}`, '#00d9ff');
  } catch (e){
    // Carta ou faixa faltando não pode derrubar a partida: sem a fase 3 o
    // jogador ainda tem calibração e eco, e o resultado é registrado.
    console.warn('[ritmo] carta não carregou:', e);
    msg('A fase de ritmo não pôde carregar', '#ff4d6d', 2.4);
    setTimeout(concluir, 1200);
    return;
  }

  const OSTINATO = ['chimbal', 'ride'];        // as peças de marcação
  let k = 0;
  const escolhidas = recorte.notas.filter(n => {
    if (!OSTINATO.includes(n.peca)) return true;
    if (nivel.semOstinato) return false;
    return (k++ % nivel.ostinato) === 0;
  });

  ritmo.notas = escolhidas.map(n => ({
    t: n.t, id: n.peca, forca: n.forca ?? .85, mesh: null, julgada: false,
  }));
  ritmo.auto  = recorte.auto.slice();
  ritmo.iAuto = 0;
  ritmo.fim   = recorte.fim;

  for (const n of ritmo.notas){
    const p = PORID[n.id];
    if (!p) continue;                  // carta pede peça que não existe: ignora
    const m = new THREE.Mesh(
      new THREE.BoxGeometry(.15, .05, .09),
      new THREE.MeshStandardMaterial({ color:p.cor, emissive:p.cor,
        emissiveIntensity:.7, roughness:.3, transparent:true }));
    m.position.set(p._faixaX, 0, Z_NASC); m.visible = false;
    pistaG.add(m); n.mesh = m;
  }

  musica.tocar(recorte.inicio, ESPERA_INICIAL);
  agendarAuto();
  ritmo.ativo = true;
}

/** Agenda a trilha automática inteira e guarda as fontes para cancelamento. */
function agendarAuto(){
  pararAuto();
  for (const a of ritmo.auto){
    const f = synth.tocar(a.som || 'bumbo', a.forca ?? .9, musica.quandoNoAudio(a.t));
    if (f) ritmo.fontesAuto.push(f);
  }
  ritmo.iAuto = ritmo.auto.length;
}

/** Cancela o que ainda não soou. Sem isto, reiniciar a fase deixa a trilha
 *  antiga tocando por cima da nova. */
function pararAuto(){
  for (const f of ritmo.fontesAuto){ try { f.stop(); } catch { /* já soou */ } }
  ritmo.fontesAuto = [];
  ritmo.iAuto = 0;
}

function ritmoBatida(p){
  if (!ritmo.ativo) return;
  const agora = musica.tempo;
  let alvo = null, menorDist = JB;
  for (const n of ritmo.notas){
    if (n.julgada || n.id !== p.id) continue;
    const d = Math.abs(n.t - agora);
    if (d < menorDist){ menorDist = d; alvo = n; }
  }
  if (!alvo){                                      // RN06 — bateu fora de hora
    erro(); julgamento('FORA', '#ff4d6d'); atualizarHUD(); return;
  }
  alvo.julgada = true;                             // RN03
  alvo.mesh.visible = false;
  acerto();
  const mult = 1 + Math.min(jogo.combo, 20) * .05;
  if (menorDist < JP){
    jogo.perfeitas++; pontuar(Math.round(25 * mult)); julgamento('PERFEITO', '#ffd34d');
  } else {
    jogo.boas++;      pontuar(Math.round(12 * mult)); julgamento('BOM', '#3ddc97');
  }
}

/** Move as notas e detecta as que passaram batido. Roda a cada quadro. */
export function ritmoAtualizar(){
  if (!ritmo.ativo) return;
  const agora = musica.tempo;
  let restantes = 0;
  for (const n of ritmo.notas){
    if (n.julgada) continue;
    const dt = n.t - agora;
    if (dt > ANTECEDENCIA){ restantes++; continue; }   // ainda não nasceu
    if (dt < -JX){                           // passou batido
      n.julgada = true; n.mesh.visible = false;
      erro(); julgamento('PERDEU', '#ff4d6d'); atualizarHUD();
      continue;
    }
    restantes++;
    n.mesh.visible = true;
    n.mesh.position.z = Z_ALVO - dt * VEL_PISTA;
    n.mesh.material.opacity = THREE.MathUtils.clamp(1 - (dt - ANTECEDENCIA + .6) / .6, .15, 1);
  }

  // Acaba quando não há mais nota E a faixa passou do fim do recorte: sem a
  // segunda condição a música seria cortada no meio do último compasso.
  if (!restantes && agora >= ritmo.fim){
    ritmo.ativo = false;
    pararAuto();
    musica.parar();
    setTimeout(concluir, 900);
  }
}

/* ======================== FLUXO DA PARTIDA ================================ */
function proximaFase(){
  jogo.fase++;
  if (jogo.fase >= 1) mostrarRotulos(false);       // já aprendeu as peças
  if (jogo.fase >= 3){ concluir(); return; }
  synth.tocar('nivel');
  msg(`Fase ${jogo.fase + 1}: ${FASES[jogo.fase].nome}`, 'gold', 2.4);
  atualizarHUD();
  setTimeout(() => { jogo.fase === 1 ? ecoIniciar() : ritmoIniciar(); }, 1600);
}

/** RF02 — inicia uma nova partida.
 *  @param livre  modo treino: toca à vontade, sem pontuar
 *  @param direto pula calibração e eco e cai na fase de ritmo. Serve para
 *         testar a música sem jogar 40 segundos antes, e para demonstrar em
 *         sala. Uma partida assim NÃO vai para o ranking: ela pulou dois
 *         terços do jogo e a pontuação não é comparável com as completas. */
export function iniciar(livre = false, direto = false){
  reiniciarEstado(livre, direto);
  ritmo.notas.forEach(n => n.mesh && (n.mesh.visible = false));
  destacar(null);
  mostrarRotulos(true);
  telaJogando();
  synth.ligar();
  atualizarHUD();
  if (livre){ objetivo('Modo livre — toque à vontade', '#8c9bb5'); return; }
  if (direto){
    jogo.fase = 2;
    mostrarRotulos(false);          // quem vem direto não está aprendendo o kit
    atualizarHUD();
    ritmoIniciar();
    return;
  }
  objetivo('Fase 1 — Calibração', '#00d9ff');
  calibracaoIniciar();
}

/** RF09/RF10 — fecha a partida, mostra o placar e só ENTÃO registra (RN07). */
export function concluir(){
  jogo.duracao = (performance.now() - jogo.t0) / 1000;
  jogo.ativo = false;
  ritmo.ativo = false;
  telaResultado();
  synth.tocar('nivel');
  setTimeout(() => synth.tocar('ok'), 240);
  // RN07: só depois de concluída — e só partida completa. Atalho não entra
  // no ranking, senão as pontuações deixam de ser comparáveis entre si.
  if (jogo.atalho) statusApi('atalho de teste — não registrado no ranking', 'var(--warn)');
  else enviarResultado();
}
