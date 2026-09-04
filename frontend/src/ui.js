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
import { painelHUD, painelObj, painelFim, flash, flashEstado,
         renderer } from './cena.js';
import { multiplicador, progressoDoDegrau, estrelas,
         estrelasEmTexto, veredito } from './pontuacao.js';
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
  const mult = multiplicador(jogo.combo);
  const prec = precisao();

  $('h-pontos').textContent = jogo.pontos;
  $('h-combo').textContent  = jogo.combo;
  $('h-mult').textContent   = 'x' + mult;
  $('h-mult').classList.toggle('ativo', mult > 1);
  $('h-prec').textContent   = prec;
  /* A barra do rodapé mostra o caminho até o PRÓXIMO degrau do
     multiplicador. Era a carga do reator, que não existe mais — e o degrau
     é a informação de momento que o jogador precisa: quantos acertos faltam
     para dobrar. */
  $('mult-i').style.width   = (progressoDoDegrau(jogo.combo) * 100) + '%';
  $('h-fase').textContent   = jogo.livre
    ? 'Modo livre'
    : `Fase ${jogo.fase + 1}/3 — ${FASES[jogo.fase].nome}`;

  painelHUD.userData.pintar(
    [`PRECISÃO  ${prec}%   ·   x${mult}`,
     `${jogo.pontos} pts · combo ${jogo.combo}`],
    { cores:['#00d9ff','#e8eef8'], tam:.58 });
}

/** O objetivo do momento — RF06: o jogador nunca fica sem saber o que fazer. */
export function objetivo(txt, cor = '#e8eef8'){
  painelObj.userData.pintar(txt, { tam:.5, cor });
}

/* ------------------------------------------------------------- telas ----- */
/** Some com o painel de resultado — chamado ao começar outra partida, senão
 *  o placar da anterior fica pendurado no ar durante a nova. */
export function esconderResultado3D(){ painelFim.visible = false; }

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
  const prec = precisao();
  const n    = estrelas(prec);
  const v    = veredito(n);

  $('f-estrelas').textContent = estrelasEmTexto(n);
  $('f-pontos').textContent = jogo.pontos;
  $('f-prec').textContent   = prec + '%';
  $('f-combo').textContent  = jogo.comboMax + 'x';
  $('f-tempo').textContent  = jogo.duracao.toFixed(1) + 's';
  $('f-perf').textContent   = jogo.perfeitas;
  $('f-bom').textContent    = jogo.boas;
  $('f-erro').textContent   = jogo.erros;

  $('fim-tag').textContent  = `${n} de 5 estrelas`;
  $('fim-tag').style.color  = n >= 4 ? 'var(--ok)' : n >= 2 ? 'var(--cyan)' : 'var(--warn)';
  $('fim-titulo').textContent = v.titulo;
  /* Crédito da faixa. A carta traz o campo desde sempre e nada o mostrava —
     e crédito que não aparece não é crédito. Quando a faixa é de outra
     pessoa, é isto que sustenta o direito de usá-la. */
  mostrarCreditos();

  $('fim-sub').textContent = `Precisão de ${prec}%. ${v.sub}`;

  objetivo(`${estrelasEmTexto(n)}  ${prec}%`,
           n >= 4 ? '#3ddc97' : n >= 2 ? '#00d9ff' : '#ffb84d');

  /* O MESMO resultado, em 3D, para quem está no headset. Pintado sempre,
     não só quando `isPresenting`: se o jogador entrar no VR depois de
     terminar uma partida, o painel já está certo em vez de mostrar a
     partida anterior. */
  const cor = n >= 4 ? '#3ddc97' : n >= 2 ? '#00d9ff' : '#ffb84d';
  /* Crédito COMPACTO: no painel 3D cabe o essencial da atribuição — faixa,
     autor e de onde veio. O texto inteiro continua na tela HTML e na carta.
     `creditos` começa pelo autor, antes do primeiro travessão; a fonte sai
     do domínio, quando a carta declara um. */
  const cr = (musica.carta && musica.carta.creditos) || '';
  const autor = cr.split(/\s+—\s+/)[0].trim();
  const fonte = (cr.match(/\(([\w.-]+\.\w{2,})\)/) || [])[1] || '';
  const credito = musica.carta && musica.carta.titulo
    ? `♪ ${musica.carta.titulo} — ${autor}${fonte ? ' · ' + fonte : ''}`
    : '';
  painelFim.userData.pintar([
    estrelasEmTexto(n),
    v.titulo,
    `precisão ${prec}%   ·   ${jogo.pontos} pts`,
    `combo máx ${jogo.comboMax}   ·   ${jogo.duracao.toFixed(0)}s`,
    `${jogo.perfeitas} perfeitas   ${jogo.boas} boas   ${jogo.erros} erros`,
    credito,
  ], {
    cores: [cor, cor, '#e8eef8', '#e8eef8', '#8c9bb5', '#6f7f96'],
    tams:  [0.92, 0.62, 0.50, 0.44, 0.38, 0.26],
    borda: 'rgba(0,217,255,.45)',
  });
  painelFim.visible = true;

  if (!renderer.xr.isPresenting){
    mostrar('tela-fim', true);
    mostrar('hud', false);
    mostrar('teclas', false);
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
