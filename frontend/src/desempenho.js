/* ============================================================================
   desempenho.js — contador de tempo de quadro, para medir DENTRO do headset.

   POR QUE ISTO EXISTE. Nenhuma ferramenta de fora alcança a sessão imersiva:
   o DevTools do desktop mede a GPU do desktop, e extensão de navegador não
   entra no VR. A única medida honesta é o jogo se medir sozinho e mostrar o
   número onde o jogador está olhando. (O OVR Metrics Tool, da própria Meta,
   alcança — mas mede o sistema, não o nosso laço; os dois se completam.)

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

   ---------------------------------------------------------------------------
   POR QUE O PAINEL AO VIVO NÃO BASTA. Ele mostra os últimos 120 quadros —
   1,7 s a 72 Hz. Dentro do headset, jogando, ninguém decora seis números em
   quatro momentos diferentes. Por isso a sessão inteira é GRAVADA, quadro a
   quadro, com a fase marcada, e existe um RESUMO que cabe numa tela só:
   estatística de toda a partida, separada por fase. É uma imagem para o
   jogador tirar print e sair do headset com o dado na mão.

   COMO LIGAR
     • `?perf=1` na URL   — funciona no navegador do Quest, que é onde importa
     • tecla P            — liga e desliga o painel ao vivo, no desktop
     • tecla R            — mostra e esconde o RESUMO da sessão, no desktop
     • botão B do controle direito — o mesmo resumo, dentro do headset

   CHAVES DE DIAGNÓSTICO (o fluxo que a Meta recomenda, nesta ordem)
     • `?semrender=1`   — esconde tudo menos o painel. O tempo de quadro que
                          SOBRAR é o custo de CPU: nossa lógica, detecção,
                          áudio. Se quase não cair, o gargalo é a CPU e não
                          adianta cortar triângulo. Se despencar, é a GPU.
     • `?escala=0.01`   — encolhe o framebuffer a 1%. Se o quadro melhorar
                          muito, o gargalo é de FRAGMENTO (pixels, texturas,
                          overdraw). Se não mudar, é de VÉRTICE (geometria).
                          Precisa estar na URL ANTES de entrar no VR: o
                          three não deixa trocar a escala com a sessão aberta.

   As duas chaves existem para não precisar de deploy novo com o headset já
   na cabeça. Elas se combinam: `?perf=1&semrender=1`.

   Fica desligado por padrão: é instrumento de medição, não parte do jogo.
   ========================================================================== */

import { DoubleSide } from 'three';
import { renderer, camera, scene, placa } from './cena.js';
import { jogo, FASES } from './estado.js';

/* ------------------------------------------------------------- chaves ---- */
const Q = typeof location !== 'undefined'
  ? new URLSearchParams(location.search) : new URLSearchParams();

/** Esconde a cena e deixa só o painel. Exportado porque é modo de
 *  diagnóstico: quem lê o número precisa saber que ele não é o do jogo. */
export const SEM_RENDER = Q.has('semrender') && Q.get('semrender') !== '0';

/* Escala do framebuffer. Tem de ser aplicada AGORA, na carga do módulo:
   `setFramebufferScaleFactor` não funciona com a sessão XR já aberta, e o
   three só avisa no console — falharia em silêncio dentro do headset. */
const ESCALA = parseFloat(Q.get('escala'));
if (Number.isFinite(ESCALA) && ESCALA > 0 && ESCALA <= 2){
  renderer.xr.setFramebufferScaleFactor(ESCALA);
}

/* Janela de amostras do painel AO VIVO. 120 quadros são ~1,7 s a 72 Hz:
   curto o bastante para reagir enquanto se joga, longo o bastante para o
   p95 significar algo. O resumo não usa esta janela — usa a série inteira. */
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

/* ----------------------------------------------------------- gravação ---- */
/* A sessão inteira, quadro a quadro. Duas listas paralelas em vez de uma
   lista de objetos: 200 mil quadros (~46 min a 72 Hz) cabem em alguns MB e
   não geram 200 mil objetos para o coletor de lixo varrer no meio do jogo. */
const TETO = 200000;
const serieMs   = [];
const serieFase = [];

/* 0 é "parado": menu, carregando, ou partida encerrada. Depois vêm as fases
   na ordem em que o jogador as encontra. */
const ROTULOS = ['parado', ...FASES.map(f => f.nome)];
const faseAgora = () =>
  jogo.ativo ? Math.min(jogo.fase + 1, ROTULOS.length - 1) : 0;

/* A taxa REAL vista durante a sessão. Guardada porque o resumo costuma ser
   lido depois de tirar o headset: aí `isPresenting` já é falso e perguntar a
   taxa devolveria os 60 Hz do desktop, estragando o orçamento do relatório. */
let hzVisto = 0;

function taxa(){
  if (renderer.xr.isPresenting){
    hzVisto = renderer.xr.getSession()?.frameRate || 72;
    return hzVisto;
  }
  /* Fora do VR: se já estivemos no VR nesta sessão, o número que interessa é
     o de lá. Nunca estivemos? 60 Hz é a suposição segura do desktop. */
  return hzVisto || 60;
}

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
  placaVR.name = 'perf';
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

/* `?semrender=1` esconde tudo menos o jogador — e o painel, que é filho da
   câmera, que é filha do jogador. Escondemos em vez de pular o
   `renderer.render`: sem desenhar nada o compositor fica sem quadro e o
   painel some junto, ou seja, o experimento apagaria o próprio instrumento.
   Reaplicado a cada quadro porque o cenário chega tarde, depois da carga. */
function aplicarSemRender(){
  for (const o of scene.children){
    if (o.isLight || o.name === 'jogador') continue;
    if (o.visible) o.visible = false;
  }
}

/** Chamar UMA vez por quadro, no início do laço. */
export function medir(){
  if (!ligado) return;
  if (SEM_RENDER) aplicarSemRender();

  const agora = performance.now();
  if (ultimo){
    const dt = agora - ultimo;
    amostras[cursor] = dt;
    cursor = (cursor + 1) % JANELA;
    if (n < JANELA) n++;
    if (serieMs.length < TETO){ serieMs.push(dt); serieFase.push(faseAgora()); }
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
  const hz  = taxa();
  const orc = 1000 / hz;

  const cor = pior > orc * 1.5 ? '#ff6b6b' : p95 > orc ? '#ffd166' : '#8de08d';
  const linhas = [
    `${med.toFixed(1)} ms  med`,
    `${p95.toFixed(1)} / ${pior.toFixed(1)}  p95/pior`,
    `${orc.toFixed(1)} ms  orcamento (${hz} Hz)`,
    `${info.calls} draws  ${(info.triangles/1000).toFixed(0)}k tris${vr ? '  (2 olhos)' : ''}`,
  ];
  if (SEM_RENDER) linhas.push('SEM RENDER — so CPU');

  if (elDom && !vr){
    elDom.style.color = cor;
    elDom.textContent = linhas.join('\n');
  }
  if (placaVR && vr){
    placaVR.userData.pintar(linhas, {
      tam: 0.62, peso: 700,
      cores: [cor, cor, '#9fb3c8', '#9fb3c8', '#ffd166'],
      fundo: 'rgba(8,12,20,.82)', borda: 'rgba(0,217,255,.30)',
    });
  }
  if (resumoVisivel) pintarResumo();
}

/* ==================================================== INVENTÁRIO DA CENA ==
   Quanto do peso é de quem. O painel ao vivo dá o TOTAL de triângulos e draw
   calls; ele não diz se o custo é da bateria ou do cenário — e sem isso a
   medida aponta a dor sem apontar a causa.

   Conta a geometria MONTADA e visível, não a que o renderer acabou
   desenhando: não desconta descarte por frustum. Serve para responder "o que
   pesa nesta cena", que é a pergunta de quem vai cortar. Para o que foi de
   fato desenhado no último quadro, o número é o de `renderer.info`.        */
function visivel(o){
  for (let p = o; p && p !== scene; p = p.parent) if (!p.visible) return false;
  return true;
}

/* MALHA DESENHADA DUAS VEZES, SEM NINGUÉM PEDIR.
   Material `transparent` com `side = DoubleSide` custa DOBRADO: o three
   desenha o objeto uma vez pelas costas e outra pela frente, para a ordem
   das faces sair certa. São dois draw calls e o dobro dos triângulos para
   uma malha só, e nada no código do jogo denuncia isso — está no
   WebGLRenderer, em `renderBufferDirect`.

   Exportadores de glTF marcam `transparent` sempre que o material declara
   alpha, mesmo com alpha 1 e nada translúcido para mostrar. Por isso vale
   contar: é custo que se paga sem receber nada em troca.

   `forceSinglePass = true` desliga a segunda passada quando a transparência
   é falsa — mas isso é conserto, e conserto se decide com medida na mão. */
const dobra = (m) =>
  !!m && m.transparent === true && m.side === DoubleSide && m.forceSinglePass === false;

export function inventario(){
  const conta = new Map();
  for (const raiz of scene.children){
    if (raiz.isLight || raiz.isCamera) continue;
    let tri = 0, malhas = 0, dupla = 0, triDupla = 0;
    raiz.traverse(o => {
      if (!o.isMesh || !o.geometry || !visivel(o)) return;
      const g = o.geometry;
      const vertices = g.index ? g.index.count : (g.attributes.position?.count || 0);
      const t = vertices / 3;
      tri += t;
      malhas++;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      if (mats.some(dobra)){ dupla++; triDupla += t; }
    });
    if (!malhas) continue;
    const nome = raiz.name || raiz.type;
    const a = conta.get(nome)
      || { malhas: 0, triangulos: 0, dupla: 0, triDupla: 0 };
    a.malhas += malhas; a.triangulos += tri;
    a.dupla += dupla;   a.triDupla += triDupla;
    conta.set(nome, a);
  }
  return [...conta]
    .map(([nome, v]) => ({
      nome, malhas: v.malhas,
      triangulos: Math.round(v.triangulos),
      /* Quantas malhas pagam a passada dupla, e quantos triângulos EXTRAS
         isso custa por olho, por quadro. */
      malhasDuplas: v.dupla,
      triangulosExtras: Math.round(v.triDupla),
    }))
    .sort((a, b) => b.triangulos - a.triangulos);
}

/* ====================================================== RESUMO DA SESSÃO ==
   Estatística de TODA a gravação, separada por fase. O que o painel ao vivo
   não consegue dar: ele só conhece os últimos 1,7 s.                       */
function estatistica(ordenado){
  return {
    n:    ordenado.length,
    p50:  percentil(ordenado, 0.50),
    p95:  percentil(ordenado, 0.95),
    p99:  percentil(ordenado, 0.99),
    pior: ordenado[ordenado.length - 1],
  };
}

export function resumo(){
  const hz = taxa(), orc = 1000 / hz;
  const porFase = [];
  for (let f = 0; f < ROTULOS.length; f++){
    const v = [];
    for (let i = 0; i < serieMs.length; i++) if (serieFase[i] === f) v.push(serieMs[i]);
    if (!v.length) continue;
    v.sort((a, b) => a - b);
    /* Quadros ACIMA do orçamento é a métrica que corresponde ao que se sente:
       não importa a média, importa quantas vezes o headset engasgou. */
    const acima = v.filter(x => x > orc).length;
    porFase.push({ rotulo: ROTULOS[f], ...estatistica(v),
                   acima, pct: 100 * acima / v.length });
  }
  const todos = serieMs.slice().sort((a, b) => a - b);
  const info = renderer.info.render;
  return {
    hz, orcamento: orc,
    vr: renderer.xr.isPresenting,
    semRender: SEM_RENDER,
    escala: Number.isFinite(ESCALA) ? ESCALA : 1,
    geral: todos.length
      ? { ...estatistica(todos), acima: todos.filter(x => x > orc).length }
      : null,
    porFase,
    cena: inventario(),
    ultimoQuadro: { draws: info.calls, triangulos: info.triangles },
  };
}

/** A série crua, para quem conseguir puxá-la (adb, desktop, console). */
export const serie = () =>
  ({ ms: serieMs.slice(), fase: serieFase.slice(), rotulos: ROTULOS });

/* ------------------------------------------------- o painel do resumo ---- */
let resumoVisivel = false;
let placaResumo = null, elResumo = null;

function linhasResumo(){
  const r = resumo();
  if (!r.geral) return ['sem amostras ainda', 'jogue com ?perf=1 ligado'];
  const num = (x) => x.toFixed(1).padStart(5);
  const L = [`RESUMO — ${r.hz} Hz, orcamento ${r.orcamento.toFixed(1)} ms`
             + (r.semRender ? '  [SEM RENDER]' : '')
             + (r.escala !== 1 ? `  [escala ${r.escala}]` : '')];
  for (const f of r.porFase){
    L.push(`${f.rotulo.padEnd(11)} p50${num(f.p50)}  p95${num(f.p95)}`
           + `  pior${num(f.pior)}  >orc ${f.pct.toFixed(0)}%`);
  }
  L.push(`TOTAL       p50${num(r.geral.p50)}  p95${num(r.geral.p95)}`
         + `  pior${num(r.geral.pior)}  ${r.geral.n} quadros`);
  const c = r.cena.slice(0, 3)
    .map(x => `${x.nome} ${(x.triangulos/1000).toFixed(0)}k`).join(' · ');
  L.push(c || 'cena vazia');
  L.push(`ultimo quadro: ${r.ultimoQuadro.draws} draws · `
         + `${(r.ultimoQuadro.triangulos/1000).toFixed(0)}k tris`
         + (r.vr ? ' (2 olhos)' : ''));
  return L;
}

function pintarResumo(){
  const L = linhasResumo();
  if (renderer.xr.isPresenting){
    if (!placaResumo){
      /* Grande e centrado, na linha dos olhos: aqui o jogador não está
         mirando, está lendo — e provavelmente tirando print. */
      placaResumo = placa(0.62, 0.30, 1400);
      placaResumo.position.set(0, 0, -0.78);
      placaResumo.renderOrder = 1000;
      placaResumo.material.depthTest = false;
      placaResumo.name = 'perf';
      camera.add(placaResumo);
    }
    placaResumo.visible = true;
    placaResumo.userData.pintar(L, {
      tam: 0.52, peso: 600,
      cores: L.map((_, i) => i === 0 ? '#00d9ff' : '#e8eef8'),
      fundo: 'rgba(8,12,20,.92)', borda: 'rgba(0,217,255,.45)',
    });
  } else {
    if (!elResumo){
      elResumo = document.createElement('div');
      elResumo.id = 'perf-resumo';
      elResumo.style.cssText = [
        'position:fixed', 'top:8px', 'right:8px', 'z-index:9999',
        'font:600 12px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace',
        'color:#e8eef8', 'background:rgba(8,12,20,.92)',
        'border:1px solid rgba(0,217,255,.45)', 'border-radius:8px',
        'padding:10px 14px', 'white-space:pre', 'pointer-events:none',
      ].join(';');
      document.body.appendChild(elResumo);
    }
    elResumo.style.display = 'block';
    elResumo.textContent = L.join('\n');
  }
}

export function alternarResumo(v = !resumoVisivel){
  resumoVisivel = v;
  if (resumoVisivel){ pintarResumo(); return; }
  if (placaResumo) placaResumo.visible = false;
  if (elResumo)    elResumo.style.display = 'none';
}
export const resumoEstaVisivel = () => resumoVisivel;

/* ------------------------------------------------------- inicialização --- */
if (typeof window !== 'undefined'){
  if (Q.get('perf') === '1' || Q.has('perf')) ligar(true);
  addEventListener('keydown', (e) => {
    /* Não roubar a tecla de quem está digitando o nome no formulário. */
    const alvo = e.target;
    if (alvo && /^(INPUT|TEXTAREA)$/.test(alvo.tagName)) return;
    if (e.key === 'p' || e.key === 'P') alternar();
    if (e.key === 'r' || e.key === 'R') alternarResumo();
  });
  /* Ponte para os testes e para quem puxar o dado pelo console via adb.
     docs/testes.md descreve o uso. */
  window.__perf = { resumo, inventario, serie, ligar, alternar, alternarResumo };
}
