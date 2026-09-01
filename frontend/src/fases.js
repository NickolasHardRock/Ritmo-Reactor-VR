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
import { PECAS, PORID, PONTOS_ALVO, BPM, PADRAO_RITMO } from './config.js';
import { jogo, cal, eco, ritmo, FASES, reiniciarEstado } from './estado.js';
import { synth } from './synth.js';
import { pistaG } from './cena.js';
import { zonas, mostrarRotulos, destacar } from './kit.js';
import { msg, julgamento, atualizarHUD, objetivo,
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
   As notas descem por faixas até a linha do alvo. Precisão temporal, com
   combo multiplicando os pontos.                                          */
const BAT = 60 / BPM;
const Z_ALVO = 0.15, Z_NASC = -2.9, VEL_PISTA = 1.35;   // m/s
const JANELA_PERFEITO = .09, JANELA_BOM = .24, JANELA_PERDA = .26;

function ritmoIniciar(){
  // limpa as notas da partida anterior (senão vazam malhas a cada replay)
  ritmo.notas.forEach(n => {
    if (n.mesh){ n.mesh.geometry.dispose(); n.mesh.material.dispose(); pistaG.remove(n.mesh); }
  });
  ritmo.notas = PADRAO_RITMO
    .map(([id, passo]) => ({ id, t: 2.2 + passo*BAT*0.5, mesh:null, julgada:false }))
    .sort((a, b) => a.t - b.t);

  if (!ritmo.construido){                         // a pista é montada uma vez só
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
  for (const n of ritmo.notas){
    const p = PORID[n.id];
    const m = new THREE.Mesh(
      new THREE.BoxGeometry(.15, .05, .09),
      new THREE.MeshStandardMaterial({ color:p.cor, emissive:p.cor,
        emissiveIntensity:.7, roughness:.3, transparent:true }));
    m.position.set(p._faixaX, 0, Z_NASC); m.visible = false;
    pistaG.add(m); n.mesh = m;
  }
  synth.ligar();
  ritmo.t0 = synth.agora;
  ritmo.ativo = true;
  objetivo('Acerte no tempo — combo multiplica', '#00d9ff');
}

function ritmoBatida(p){
  if (!ritmo.ativo) return;
  const agora = synth.agora - ritmo.t0;
  let alvo = null, menorDist = JANELA_BOM;
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
  if (menorDist < JANELA_PERFEITO){
    jogo.perfeitas++; pontuar(Math.round(25 * mult)); julgamento('PERFEITO', '#ffd34d');
  } else {
    jogo.boas++;      pontuar(Math.round(12 * mult)); julgamento('BOM', '#3ddc97');
  }
}

/** Move as notas e detecta as que passaram batido. Roda a cada quadro. */
export function ritmoAtualizar(){
  if (!ritmo.ativo) return;
  const agora = synth.agora - ritmo.t0;
  let restantes = 0;
  for (const n of ritmo.notas){
    if (n.julgada) continue;
    const dt = n.t - agora;
    if (dt > 2.6){ restantes++; continue; }        // ainda não nasceu
    if (dt < -JANELA_PERDA){                       // passou batido
      n.julgada = true; n.mesh.visible = false;
      erro(); julgamento('PERDEU', '#ff4d6d'); atualizarHUD();
      continue;
    }
    restantes++;
    n.mesh.visible = true;
    n.mesh.position.z = Z_ALVO - dt * VEL_PISTA;
    n.mesh.material.opacity = THREE.MathUtils.clamp(1 - (dt - 2) / .6, .15, 1);
  }
  if (!restantes){ ritmo.ativo = false; setTimeout(concluir, 900); }
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

/** RF02 — inicia uma nova partida. `livre` = modo treino, sem pontuar. */
export function iniciar(livre = false){
  reiniciarEstado(livre);
  ritmo.notas.forEach(n => n.mesh && (n.mesh.visible = false));
  destacar(null);
  mostrarRotulos(true);
  telaJogando();
  synth.ligar();
  atualizarHUD();
  if (livre) objetivo('Modo livre — toque à vontade', '#8c9bb5');
  else { objetivo('Fase 1 — Calibração', '#00d9ff'); calibracaoIniciar(); }
}

/** RF09/RF10 — fecha a partida, mostra o placar e só ENTÃO registra (RN07). */
export function concluir(){
  jogo.duracao = (performance.now() - jogo.t0) / 1000;
  jogo.ativo = false;
  ritmo.ativo = false;
  telaResultado();
  synth.tocar('nivel');
  setTimeout(() => synth.tocar('ok'), 240);
  enviarResultado();          // RN07: só depois de concluída
}
