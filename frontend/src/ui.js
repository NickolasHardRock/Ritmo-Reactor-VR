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
import { painelHUD, painelObj, painelCentro, flash, flashEstado,
         renderer } from './cena.js';
import { multiplicador, progressoDoDegrau, estrelas,
         estrelasEmTexto, veredito } from './pontuacao.js';
import { musica } from './musica.js';
import { NIVEIS } from './config.js';
/* As três telas de HTML têm agora uma contraparte em 3D, para quem está de
   headset. Elas são trocadas SEMPRE JUNTAS, daqui — foi a lição do teste de
   08/09, em que o jogador de VR caía numa partida sem ter visto menu nenhum e
   terminava a música sem nenhuma saída. Ver menu3d.js. */
import * as menu3d from './menu3d.js';

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
/** Some com o painel central — chamado ao começar outra partida, senão o
 *  placar da anterior fica pendurado no ar durante a nova. */
export function esconderResultado3D(){
  painelCentro.visible = false;
  /* Os botões do resultado moram fora do painel e não somem com ele. E o
     teclado do nome também é "tela de fim": sair para outra partida com ele
     aberto deixaria as letras pairando sobre a bateria. */
  const t = menu3d.telaAtual();
  if (t === 'fim' || t === 'nome') menu3d.mostrar(null);
  /* O bloco de HTML do nome vive DENTRO de `#tela-fim`, então ele some junto
     com a tela — mas a classe fica. Limpar aqui evita que ele reapareça na
     próxima vez que a tela de resultado abrir. Quem ainda deve uma gravação
     é problema do `registro.js`; aqui só se apaga o que está desenhado. */
  const bloco = $('fim-nome'); if (bloco) bloco.classList.add('hidden');
}

/** Desenha a calibragem no painel central, para quem está no headset.
 *
 *  A tela de calibragem é HTML: dentro do VR o jogador ouvia os chimbais e as
 *  caixas, batia, e não via contagem, nem quantas batidas entraram, nem o
 *  valor medido no fim. Media às cegas — e é justamente no headset que a
 *  medida importa mais, porque a latência lá é maior e o golpe vem da baqueta,
 *  não da tecla.
 *
 *  @param {string[]|null} linhas texto a mostrar; null esconde o painel */
export function calibragem3D(linhas, cor = '#00d9ff'){
  if (!linhas){ painelCentro.visible = false; return; }
  const arr = [].concat(linhas);
  painelCentro.userData.pintar(arr, {
    cor,
    /* A primeira linha é o número da contagem ou o valor medido: é o que o
       jogador procura de relance, e por isso vem grande. */
    tams: arr.length > 1 ? [0.95, 0.44, 0.36].slice(0, arr.length) : [0.95],
    cores: arr.length > 1 ? [cor, '#e8eef8', '#8c9bb5'].slice(0, arr.length) : [cor],
    borda: 'rgba(0,217,255,.45)',
  });
  painelCentro.visible = true;
}


/* ===================== O AVISO DO CENTRO DA TELA =========================
   "PREPARE-SE" e a contagem antes da música. Escreve nos DOIS lugares de
   propósito: o overlay HTML, para quem está no monitor, e o `painelCentro`
   em 3D, porque dentro do headset nenhum `<div>` aparece — e o jogador de VR
   não pode ser o único a não saber que a música vai começar.

   É o mesmo painel 3D da calibragem e do resultado. Os três nunca acontecem
   juntos: um está antes da música, outro na medição de atraso e o terceiro
   depois do fim.

   O PAINEL 3D SÓ APARECE DENTRO DO VR, e isto é correção de um defeito que
   só se vê na tela: escrevendo nos dois incondicionalmente, o jogador de
   monitor lia "prepare-se" e a contagem DUAS vezes — a placa 3D pairando
   sobre a bateria e o texto de HTML por cima dela. A calibragem e o resultado
   não sofrem disso porque a versão HTML dos dois é um modal que cobre a cena;
   este aviso é transparente de propósito, e por isso deixa o 3D à vista.

   Dentro do headset é o inverso: nenhum `<div>` aparece, então lá a placa é a
   única coisa que existe.

   @param {string[]|null} linhas  [grande, pequena]; null apaga os dois. */
export function avisoCentro(linhas, cor = '#00d9ff'){
  const cx = $('centro-aviso'), c1 = $('centro-1'), c2 = $('centro-2');
  const emVR = renderer.xr.isPresenting;
  if (!linhas){
    if (cx) cx.classList.add('hidden');
    painelCentro.visible = false;
    return;
  }
  const arr = [].concat(linhas);
  /* Número vai no corpo grande, palavra no menor. Quem está prestes a bater
     no tempo lê o número de relance e não procura texto. */
  const numero = /^\d+$/.test(arr[0]);
  if (c1 && c2){
    c1.textContent = numero ? (arr[1] || '') : arr[0];
    c2.textContent = numero ? arr[0] : '';
    c2.style.color = cor;
    /* Reinicia a animação de pulso a cada número: sem isto o CSS só anima na
       primeira aparição e a contagem fica estática de 3 a 1. */
    if (numero){ c2.style.animation = 'none'; void c2.offsetWidth; c2.style.animation = ''; }
    cx.classList.remove('hidden');
  }
  if (!emVR){ painelCentro.visible = false; return; }
  painelCentro.userData.pintar(arr, {
    cor,
    tams:  arr.length > 1 ? [0.95, 0.42] : [0.8],
    cores: arr.length > 1 ? [cor, '#e8eef8'] : [cor],
    borda: 'rgba(0,217,255,.45)',
  });
  painelCentro.visible = true;
}

/** O botão de pular o tutorial, nos DOIS lugares.
 *
 *  Ele era só de HTML, e em VR o mesmo salto era o botão A do controle
 *  direito — o que só existe para quem leu o `docs/vr.md`. Desde 09/09 o
 *  Pular é um botão 3D de verdade, apontado com o controle (menu3d.js). O A
 *  continua valendo como atalho para quem já o conhece. */
export function mostrarPular(v){
  const b = $('btn-pular'); if (b) b.classList.toggle('hidden', !v);
  menu3d.mostrarPular3D(v);
}

/** Sair no meio da partida. Não existia: uma vez começada, a única saída era
 *  terminar a música ou recarregar a página — e de dentro do headset nem
 *  recarregar dá. */
export function mostrarSair(v){
  const b = $('btn-sair'); if (b) b.classList.toggle('hidden', !v);
}

export function telaJogando(){
  mostrar('tela-inicio', false);
  mostrar('tela-fim', false);
  mostrar('hud', true);
  mostrar('teclas', true);
  mostrarSair(true);
  menu3d.mostrar('jogo');
}
export function telaInicio(){
  mostrar('tela-fim', false);
  mostrar('tela-inicio', true);
  mostrar('hud', false);
  mostrar('teclas', false);
  /* Voltar ao menu tem de limpar o que era da partida: sem isto o "Pular" e a
     contagem ficam pendurados por cima da tela inicial. */
  mostrarPular(false);
  mostrarSair(false);
  avisoCentro(null);
  menu3d.mostrar('menu');
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
  /* O pedido de nome da partida ANTERIOR, se ainda estiver na tela. Ele é
     fechado por todos os caminhos de saída, mas esta tela é desenhada uma vez
     por partida e é o lugar certo para garantir que começa limpa — um "novo
     recorde" herdado da partida passada seria mentira na cara do jogador. */
  const bloco = $('fim-nome'); if (bloco) bloco.classList.add('hidden');

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
  painelCentro.userData.pintar([
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
  painelCentro.visible = true;
  /* JOGAR DE NOVO e MENU em 3D, logo abaixo do placar. Sem eles o jogador de
     headset lia o resultado e ficava preso ali: os dois botões equivalentes
     de HTML não aparecem dentro do VR. */
  mostrarSair(false);
  menu3d.mostrar('fim');

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

/* ===================== O NOME DE QUEM FEZ O RECORDE ======================
   RN09. Só aparece quando a partida bateu a melhor marca da música naquela
   dificuldade — a decisão é do `registro.js`, aqui só se desenha.

   NOS DOIS LUGARES, pela mesma razão de sempre: o `<input>` não existe
   dentro do headset. Lá o pedido é um teclado 3D (menu3d.js), apontado com
   o controle. Sem ele, quem jogasse de óculos faria o recorde e veria o
   jogo gravar com o nome de outra pessoa — a última que digitou no monitor.

   O PLACAR 3D SAI DE CENA enquanto se digita. O painel do resultado ocupa
   de y=1,20 a 2,24 e é exatamente onde o teclado cabe; deixar os dois
   ligados deixaria as teclas atravessadas pelas estrelas. O texto do
   resultado continua pintado e volta intacto quando o pedido fecha.       */

/** @param {{pontos:number, nivel:string, anterior:object|null,
 *           sugestao:string}} info
 *  @returns {boolean} false quando não havia mais tela de resultado para
 *           receber o pedido — quem chamou grava sem perguntar. */
export function pedirNome(info){
  /* A CONSULTA AO RECORDE É ASSÍNCRONA e a resposta pode chegar depois de o
     jogador já ter saído dali: começado outra partida, voltado ao menu,
     entrado no VR. Abrir o pedido nessa hora poria 42 teclas 3D por cima da
     bateria no meio da música seguinte. A tela de resultado é a única em que
     este pedido faz sentido, então ela é a condição. */
  if (menu3d.telaAtual() !== 'fim') return false;

  const bloco = $('fim-nome');
  const ant   = info.anterior
    ? `Recorde anterior: ${info.anterior.nome} — ${info.anterior.pontos} pts`
    : 'Primeiro recorde desta dificuldade';
  const el = $('fim-nome-ant'); if (el) el.textContent = ant;

  const inp = $('f-nome');
  if (inp){
    inp.value = info.sugestao || '';
    /* Foco só fora do VR: dentro do headset o `<input>` nem existe, e pedir
       foco a um elemento invisível é o tipo de chamada que alguns
       navegadores respondem rolando a página. */
    if (!renderer.xr.isPresenting) setTimeout(() => inp.focus(), 60);
  }
  if (bloco) bloco.classList.remove('hidden');

  painelCentro.visible = false;
  menu3d.pedirNome3D({ ...info, anteriorTexto: ant });
  return true;
}

export function fecharPedidoDeNome(){
  const bloco = $('fim-nome'); if (bloco) bloco.classList.add('hidden');
  if (menu3d.telaAtual() === 'nome'){
    painelCentro.visible = true;      // o placar continua pintado
    menu3d.mostrar('fim');
  }
}

/* ========================= RANKING NA ABERTURA ===========================
   RN08. Uma linha por dificuldade: quem manda em cada uma. Não é a lista
   longa de propósito — o que interessa antes de jogar é a marca a bater no
   nível que se vai escolher, e três linhas cabem na tela inicial sem
   empurrar o botão JOGAR para fora dela.                                   */

/** @param {Array|null} itens `null` = API fora do ar (não escreve nada) */
export function pintarRecordes(itens){
  const el = $('inicio-recordes');
  const ordem = Object.keys(NIVEIS);
  const linhas = (itens || [])
    .filter(i => i && i.nome)
    .sort((a, b) => ordem.indexOf(a.nivel) - ordem.indexOf(b.nivel));

  /* API fora do ar: some nos DOIS lugares. Sair cedo aqui deixava a placa 3D
     do menu com os recordes da consulta anterior para sempre — e recorde
     velho pendurado é pior que nenhum. */
  if (!itens){
    if (el){ el.classList.add('hidden'); el.innerHTML = ''; }
    menu3d.pintarRecordes3D([]);
    return;
  }

  if (el){
    if (!linhas.length){
      el.classList.remove('hidden');
      el.innerHTML = '<span class="vazio">nenhum recorde ainda — o primeiro é seu</span>';
    } else {
      el.classList.remove('hidden');
      el.innerHTML = '<span class="rot">recordes</span>' + linhas.map(i =>
        `<div class="linha"><b>${NIVEIS[i.nivel]?.nome || i.nivel}</b>` +
        `<span>${escapar(i.nome)}</span><i>${i.pontos}</i></div>`).join('');
    }
  }
  menu3d.pintarRecordes3D(linhas.map(i =>
    `${NIVEIS[i.nivel]?.nome || i.nivel}: ${i.nome} — ${i.pontos}`));
}

/** O nome vem do banco, e o banco recebe o que o jogador digitou. Não é
 *  desconfiança de quem joga: é que `innerHTML` com texto de terceiro é a
 *  porta de XSS mais batida que existe, e o custo de fechá-la é esta função. */
function escapar(s){
  return String(s).replace(/[&<>"']/g, c => (
    { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
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
