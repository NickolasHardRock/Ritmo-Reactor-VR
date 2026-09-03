/* ============================================================================
   ui.js — tudo que o jogador lê. Em DOIS lugares ao mesmo tempo:

     no navegador → elementos HTML (#hud, #msg, #julg)
     dentro do VR → placas 3D na cena (painelHUD, painelObj, flash)

   Isso não é duplicação por descuido: HTML simplesmente NÃO aparece dentro
   do headset. Toda informação que o jogador precisa ver em VR tem de ser um
   objeto 3D. Manter as duas saídas na mesma função evita que uma delas
   fique para trás.
   ========================================================================== */

import { jogo, FASES, precisao } from './estado.js';
import { painelHUD, painelObj, flash, flashEstado,
         atualizarAroCarga, renderer } from './cena.js';
import { CARGA_MINIMA } from './config.js';
import { musica } from './musica.js';

export const $ = id => document.getElementById(id);
const mostrar = (id, v) => $(id).classList.toggle('hidden', !v);

/* ------------------------------------------------------------ avisos ----- */
let _tMsg;
/** Aviso passageiro. `tipo`: 'ok' | 'bad' | 'gold' */
export function msg(texto, tipo = 'ok', seg = 2){
  const e = $('msg');
  e.textContent = texto;
  e.className = 'show ' + tipo;
  clearTimeout(_tMsg);
  _tMsg = setTimeout(() => { e.className = ''; }, seg * 1000);

  flash.userData.pintar(texto, { tam:.46,
    cor: tipo === 'bad' ? '#ff4d6d' : tipo === 'gold' ? '#ffd34d' : '#3ddc97' });
  flash.visible = true;
  flashEstado.ate = performance.now() + seg * 1000;
}

let _tJulg;
/** O "PERFEITO / BOM / ERRADO" que pisca no centro. */
export function julgamento(txt, cor){
  const e = $('julg');
  e.textContent = txt; e.style.color = cor; e.style.opacity = '1';
  clearTimeout(_tJulg);
  _tJulg = setTimeout(() => { e.style.opacity = '0'; }, 260);
}

/* --------------------------------------------------------------- HUD ----- */
export function atualizarHUD(){
  $('h-pontos').textContent = jogo.pontos;
  $('h-combo').textContent  = jogo.combo;
  $('h-reator').textContent = Math.floor(jogo.reator);
  $('carga-i').style.width  = jogo.reator + '%';
  $('h-fase').textContent   = jogo.livre
    ? 'Modo livre'
    : `Fase ${jogo.fase + 1}/3 — ${FASES[jogo.fase].nome}`;

  painelHUD.userData.pintar(
    [`REATOR  ${Math.floor(jogo.reator)}%`,
     `${jogo.pontos} pts · combo ${jogo.combo}x`],
    { cores:['#00d9ff','#e8eef8'], tam:.58 });

  atualizarAroCarga(jogo.reator);
}

/** O objetivo do momento — RF06: o jogador nunca fica sem saber o que fazer. */
export function objetivo(txt, cor = '#e8eef8'){
  painelObj.userData.pintar(txt, { tam:.5, cor });
}

/* ------------------------------------------------------------- telas ----- */
export function telaJogando(){
  mostrar('tela-inicio', false);
  mostrar('tela-fim', false);
  mostrar('hud', true);
  mostrar('teclas', true);
}
export function telaInicio(){
  mostrar('tela-fim', false);
  mostrar('tela-inicio', true);
  mostrar('hud', false);
  mostrar('teclas', false);
}
export function telaCarregada(){
  mostrar('load', false);
  mostrar('tela-inicio', true);
}

/** RF10 — pontuação, resultado, tempo e opção de jogar de novo. */
/** Escreve o crédito da faixa nas duas telas onde alguém pode lê-lo: a de
 *  abertura (antes de jogar) e a de resultado (depois). Silencioso quando a
 *  carta não declara crédito — caso das faixas que são nossas. */
export function mostrarCreditos(){
  const c = musica.carta && musica.carta.creditos;
  const t = musica.carta && musica.carta.titulo;
  const txt = c ? (t ? `♪ ${t} — ${c}` : c) : '';
  for (const id of ['fim-creditos', 'inicio-creditos']){
    const el = $(id); if (el) el.textContent = txt;
  }
}

export function telaResultado(){
  const religou = jogo.reator >= CARGA_MINIMA;
  $('f-pontos').textContent = jogo.pontos;
  $('f-prec').textContent   = precisao() + '%';
  $('f-combo').textContent  = jogo.comboMax + 'x';
  $('f-tempo').textContent  = jogo.duracao.toFixed(1) + 's';
  $('f-perf').textContent   = jogo.perfeitas;
  $('f-bom').textContent    = jogo.boas;
  $('f-erro').textContent   = jogo.erros;

  $('fim-tag').textContent  = religou ? 'reator religado' : 'energia insuficiente';
  $('fim-tag').style.color  = religou ? 'var(--ok)' : 'var(--warn)';
  $('fim-titulo').textContent = religou ? 'Missão concluída' : 'Missão incompleta';
  /* Crédito da faixa. A carta traz o campo desde sempre e nada o mostrava —
     e crédito que não aparece não é crédito. Quando a faixa é de outra
     pessoa, é isto que sustenta o direito de usá-la. */
  mostrarCreditos();

  $('fim-sub').textContent = `O núcleo chegou a ${Math.floor(jogo.reator)}% de carga.` +
    (religou ? ' A estação volta a operar.'
             : ` Precisa de ${CARGA_MINIMA}% para religar.`);

  objetivo(religou ? 'REATOR RELIGADO' : 'ENERGIA INSUFICIENTE',
           religou ? '#3ddc97' : '#ffb84d');

  // Dentro do VR o jogador não vê HTML: o resultado fica no painel 3D.
  if (!renderer.xr.isPresenting){
    mostrar('tela-fim', true);
    mostrar('hud', false);
    mostrar('teclas', false);
  } else {
    msg('Missão encerrada — tire o headset para ver o placar.', 'gold', 4);
  }
}

/** Estado da persistência na tela de resultado (RF11/RF12). */
export function statusApi(texto, cor){
  $('f-api').textContent = texto;
  $('f-api').style.color = cor;
}

/** Detecção de suporte a VR (RF14/RF15): o botão só aparece se houver
 *  sessão immersive-vr; sem ela o jogo segue jogável e o aviso é claro. */
export function statusXR(ok, texto){
  $('xr-dot').className = 'dot ' + (ok ? 'ok' : 'no');
  $('xr-msg').textContent = texto;
}

export function falhaCarregamento(html){ $('load-txt').innerHTML = html; }
export function progressoCarregamento(pct, rotulo){
  $('load-bar').style.width = pct + '%';
  if (rotulo) $('load-txt').textContent = rotulo;
}
