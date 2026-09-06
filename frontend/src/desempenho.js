/* ============================================================================
   desempenho.js — contador de tempo de quadro, para medir DENTRO do headset.

   POR QUE ISTO EXISTE. Nenhuma ferramenta de fora alcança o Quest: o DevTools
   do desktop mede a GPU do desktop, e a extensão de navegador não entra na
   sessão imersiva. A única medida honesta é o jogo se medir sozinho e mostrar
   o número onde o jogador está olhando.

   MOSTRA MILISSEGUNDOS, NÃO FPS. FPS é média e esconde justamente o que
   importa: o engasgo. A 72 Hz o orçamento é 13,9 ms por quadro; a 90 Hz é
   11,1 ms. Um pico isolado de 30 ms é visível no headset e desaparece numa
   média de "68 FPS". Por isso o painel mostra mediana, p95 e o pior da
   janela — e a mediana usa ORDENAÇÃO, não média, para um único quadro
   monstruoso não contaminar a leitura central.

   O QUE O NÚMERO INCLUI. É o intervalo entre o início de um quadro e o do
   seguinte, medido com `performance.now()`. Ou seja: a nossa lógica, o
   desenho e a espera pelo compositor. Se o valor colar exatamente no
   orçamento (13,9 ms) e não passar, não estamos no limite — estamos
   sincronizados, e sobra folga. O problema aparece quando ele ULTRAPASSA.

   EM VR OS NÚMEROS DE `renderer.info` CONTAM OS DOIS OLHOS. Um mesmo objeto
   aparece duas vezes em draw calls e triângulos. É esperado; não divida por
   dois na hora de comparar com o desktop, compare com o próprio VR.

   COMO LIGAR
     • `?perf=1` na URL   — funciona no navegador do Quest, que é onde importa
     • tecla P            — liga e desliga a qualquer momento no desktop

   Fica desligado por padrão: é instrumento de medição, não parte do jogo.
   ========================================================================== */

import * as THREE from 'three';
import { renderer, camera, placa } from './cena.js';

/* Janela de amostras. 120 quadros são ~1,7 s a 72 Hz: curto o bastante para
   reagir enquanto se joga, longo o bastante para o p95 significar algo. */
const JANELA = 120;
const amostras = new Float32Array(JANELA);
let n = 0, cursor = 0, ultimo = 0;

/* Atualiza o texto ~4x por segundo. Repintar o canvas todo quadro custaria
   caro justamente na medição — o instrumento não pode ser o gargalo. */
const INTERVALO_TEXTO = 0.25;
let proximoTexto = 0;

let ligado = false;
let elDom = null;      // canto da tela, no desktop
let placaVR = null;    // presa à câmera, dentro do headset

/* ------------------------------------------------------------- ligar ----- */
function criarDom(){
  if (elDom) return;
  elDom = document.createElement('div');
  elDom.id = 'perf';
  elDom.style.cssText = [
    'position:fixed', 'top:8px', 'left:8px', 'z-index:9999',
    'font:600 11px/1.35 ui-monospace, SFMono-Regular, Menlo, monospace',
    'color:#cfe6ff', 'background:rgba(8,12,20,.82)',
    'border:1px solid rgba(0,217,255,.30)', 'border-radius:6px',
    'padding:5px 8px', 'white-space:pre', 'pointer-events:none',
    'letter-spacing:.02em',
  ].join(';');
  document.body.appendChild(elDom);
}

function criarPlacaVR(){
  if (placaVR) return;
  /* Presa à CÂMERA, não à cena: em VR o painel tem de acompanhar a cabeça,
     senão para lê-lo o jogador precisa procurar onde ele ficou. Pequeno e
     no alto à esquerda, fora do caminho das baquetas e do kit. */
  placaVR = placa(0.17, 0.085, 420);
  placaVR.position.set(-0.155, 0.105, -0.42);
  placaVR.renderOrder = 999;
  placaVR.material.depthTest = false;   // nunca sumir atrás de geometria
  camera.add(placaVR);
}

export function ligar(v = true){
  ligado = v;
  if (ligado){ criarDom(); criarPlacaVR(); n = 0; cursor = 0; ultimo = 0; }
  if (elDom)   elDom.style.display  = ligado ? 'block' : 'none';
  if (placaVR) placaVR.visible = ligado;
}
export function alternar(){ ligar(!ligado); }
export const estaLigado = () => ligado;

/* ------------------------------------------------------------ medir ------ */
function percentil(ordenado, p){
  if (!ordenado.length) return 0;
  const i = Math.min(ordenado.length - 1, Math.floor(p * ordenado.length));
  return ordenado[i];
}

/** Chamar UMA vez por quadro, no início do laço. */
export function medir(){
  if (!ligado) return;
  const agora = performance.now();
  if (ultimo){
    amostras[cursor] = agora - ultimo;
    cursor = (cursor + 1) % JANELA;
    if (n < JANELA) n++;
  }
  ultimo = agora;

  const seg = agora / 1000;
  if (seg < proximoTexto || n < 8) return;
  proximoTexto = seg + INTERVALO_TEXTO;

  const orden = Array.from(amostras.subarray(0, n)).sort((a, b) => a - b);
  const med  = percentil(orden, 0.50);
  const p95  = percentil(orden, 0.95);
  const pior = orden[orden.length - 1];

  const info = renderer.info.render;
  const vr   = renderer.xr.isPresenting;
  /* Orçamento pela taxa real: em VR pergunta ao runtime; fora dele, 60 Hz é
     a suposição segura. Comparar contra um número fixo daria falso alarme
     num monitor de 144 Hz e falso alívio num Quest a 72. */
  const hz  = vr ? (renderer.xr.getSession()?.frameRate || 72) : 60;
  const orc = 1000 / hz;

  const cor = pior > orc * 1.5 ? '#ff6b6b' : p95 > orc ? '#ffd166' : '#8de08d';
  const linhas = [
    `${med.toFixed(1)} ms  med`,
    `${p95.toFixed(1)} / ${pior.toFixed(1)}  p95/pior`,
    `${orc.toFixed(1)} ms  orcamento (${hz} Hz)`,
    `${info.calls} draws  ${(info.triangles/1000).toFixed(0)}k tris${vr ? '  (2 olhos)' : ''}`,
  ];

  if (elDom && !vr){
    elDom.style.color = cor;
    elDom.textContent = linhas.join('\n');
  }
  if (placaVR && vr){
    placaVR.userData.pintar(linhas, {
      tam: 0.62, peso: 700,
      cores: [cor, cor, '#9fb3c8', '#9fb3c8'],
      fundo: 'rgba(8,12,20,.82)', borda: 'rgba(0,217,255,.30)',
    });
  }
}

/* ------------------------------------------------------- inicialização --- */
if (typeof window !== 'undefined'){
  const q = new URLSearchParams(location.search);
  if (q.get('perf') === '1' || q.has('perf')) ligar(true);
  addEventListener('keydown', (e) => {
    if (e.key === 'p' || e.key === 'P'){
      /* Não roubar a tecla de quem está digitando o nome no formulário. */
      const alvo = e.target;
      if (alvo && /^(INPUT|TEXTAREA)$/.test(alvo.tagName)) return;
      alternar();
    }
  });
}
