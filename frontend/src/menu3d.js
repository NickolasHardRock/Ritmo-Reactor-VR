/* ============================================================================
   menu3d.js — A INTERFACE QUE EXISTE DENTRO DO HEADSET.

   HTML não aparece em VR. Até aqui isso era resolvido com PLACAS de leitura
   (painelHUD, painelObj, painelCentro em cena.js): o jogador via, mas não
   podia responder. Tudo que exigia decisão dele — começar a partida, escolher
   o nível, pular o tutorial, voltar ao menu — ou acontecia ANTES de entrar no
   VR, na tela de HTML, ou virava botão de controle, que ninguém descobre sem
   ler documentação.

   O TESTE DE 08/09 MOSTROU O PREÇO DISSO: quem entrava em VR pelo menu caía
   direto no meio de uma partida, sem ter escolhido nada, e no fim da música
   não tinha como sair.

   Este arquivo é o que faltava: botões de verdade em 3D, apontados com o
   controle e acionados com o GATILHO.

   POR QUE O GATILHO E NÃO A BAQUETA. A baqueta seria mais coerente com o
   jogo, mas a mesma detecção que reconhece uma batida (deteccao.js, trajeto
   varrido de cima para baixo) dispararia o botão em qualquer movimento
   descendente perto dele — e o jogador de bateria move as mãos o tempo todo.
   Botão de menu não pode ter falso positivo. O gatilho, além disso, estava
   livre: a batida é MOVIMENTO, nenhum botão de controle a produz.

   ONDE CADA GRUPO APARECE, e nunca dois ao mesmo tempo:
     'menu'  antes da partida — espelha a tela inicial de HTML
     'jogo'  durante a partida — PULAR (só nas fases 0 e 1) e SAIR
     'cal'   durante a calibragem aberta pelo menu — só FECHAR
     'fim'   sobre o painel de resultado — JOGAR DE NOVO e MENU

   O grupo inteiro pendura em `uiVR`, um único filho de `scene`. Isso não é
   arrumação: `gerarAmbienteDaCena()` esconde todos os filhos da cena que não
   sejam o cenário ou luz antes de capturar o cubemap, e um grupo só é uma
   linha a menos para alguém esquecer ali.
   ========================================================================== */

import * as THREE from 'three';
import { scene, camera, renderer, placa } from './cena.js';
import { baquetas } from './kit.js';

/* Tudo que este módulo desenha vive aqui dentro. */
export const uiVR = new THREE.Group();
uiVR.name = 'ui-vr';
scene.add(uiVR);

/* Distância dos painéis: 2,6 m do posto do jogador (o posto está em z=+0,62).
   Longe o bastante para não brigar com os pratos, perto o bastante para o
   texto ser legível sem apertar os olhos. */
const Z = -2.00;

/* ------------------------------------------------------------- botões ----- */

/** Um botão. É uma placa de canvas com estado de foco — o mesmo `placa()` das
 *  outras mensagens 3D, para o visual não divergir com o tempo. */
function botao(rotulo, w, h, acao, tam = .52){
  const m = placa(w, h, Math.max(256, Math.round(w * 560)));
  m.name = 'botao3d';
  m.userData.acao = acao;
  m.userData.rotulo = rotulo;
  m.userData.ligado = false;      // estado "selecionado" — usado pelos níveis
  m.userData.foco = false;
  m.userData.repintar = () => {
    const { foco, ligado } = m.userData;
    m.userData.pintar(m.userData.rotulo, {
      tam,
      cor:   foco ? '#06131b' : ligado ? '#06131b' : '#e8eef8',
      fundo: foco ? 'rgba(0,217,255,.95)'
                  : ligado ? 'rgba(0,217,255,.72)' : 'rgba(17,24,38,.92)',
      borda: foco ? 'rgba(232,238,248,.95)' : 'rgba(0,217,255,.45)',
    });
  };
  m.userData.repintar();
  return m;
}

/** Texto sem interação — título, subtítulo, rótulo de seção. */
function texto(linhas, w, h, o = {}){
  const m = placa(w, h, Math.max(256, Math.round(w * 560)));
  m.userData.pintar(linhas, { fundo:false, tam:o.tam || .6, cor:o.cor || '#e8eef8',
                              cores:o.cores, tams:o.tams });
  return m;
}

/* ------------------------------------------------------ AS TRÊS TELAS ----- */

const acoes = {};   // preenchido por definirAcoes(), lá do main.js
const disparar = nome => (...a) => { const f = acoes[nome]; if (f) f(...a); };

/* ---- 'menu': o espelho da tela inicial ---------------------------------- */
const grupoMenu = new THREE.Group(); grupoMenu.name = 'menu-vr'; uiVR.add(grupoMenu);

const tituloMenu = texto(['DRUMFALL'], 1.5, .26, { tam:.85, cor:'#00d9ff' });
tituloMenu.position.set(0, 2.32, Z); grupoMenu.add(tituloMenu);

const subMenu = texto([''], 1.7, .16, { tam:.62, cor:'#8c9bb5' });
subMenu.position.set(0, 2.13, Z); grupoMenu.add(subMenu);

const btJogar = botao('JOGAR', 1.05, .26, disparar('jogar'), .58);
btJogar.position.set(0, 1.88, Z); grupoMenu.add(btJogar);

const btLivre = botao('Modo livre', 1.05, .20, disparar('livre'), .52);
btLivre.position.set(0, 1.62, Z); grupoMenu.add(btLivre);

const rotNivel = texto(['dificuldade'], .9, .12, { tam:.72, cor:'#6f7f96' });
rotNivel.position.set(0, 1.44, Z); grupoMenu.add(rotNivel);

/* Um botão por nível, montados a partir da lista que o main.js entrega. A
   lista NÃO está escrita aqui de propósito: `NIVEIS` já ganhou uma chave nova
   uma vez (o Profissa, em 09/09) e a cópia à mão do main.js tinha ficado para
   trás na ocasião. Ver o "contrato de id" em claude/nivel-profissa.md — este
   é o mesmo contrato, sem HTML. */
const botoesNivel = new Map();
const grupoNiveis = new THREE.Group(); grupoMenu.add(grupoNiveis);

/** @param {{chave:string,nome:string}[]} lista */
export function montarNiveis(lista){
  for (const b of botoesNivel.values()){ grupoNiveis.remove(b); b.geometry.dispose(); }
  botoesNivel.clear();
  const larg = .40, vao = .04;
  const total = lista.length * larg + (lista.length - 1) * vao;
  lista.forEach((n, i) => {
    const b = botao(n.nome, larg, .17, () => disparar('nivel')(n.chave), .58);
    b.position.set(-total/2 + larg/2 + i*(larg+vao), 1.26, Z);
    grupoNiveis.add(b);
    botoesNivel.set(n.chave, b);
  });
}

const btCalibrar = botao('Calibrar atraso', 1.05, .18, disparar('calibrar'), .50);
btCalibrar.position.set(0, 1.03, Z); grupoMenu.add(btCalibrar);

const rodapeMenu = texto(['aponte o controle e aperte o gatilho'], 1.5, .11,
                         { tam:.72, cor:'#6f7f96' });
rodapeMenu.position.set(0, .88, Z); grupoMenu.add(rodapeMenu);

/** Escreve o estado do menu: nível escolhido e atraso calibrado. Chamado pelo
 *  `pintarNivel()` do main.js, que já é o dono dessa informação. */
export function pintarMenu(chaveAtual, subtitulo = ''){
  for (const [chave, b] of botoesNivel){
    b.userData.ligado = (chave === chaveAtual);
    b.userData.repintar();
  }
  subMenu.userData.pintar([subtitulo], { fundo:false, tam:.62, cor:'#8c9bb5' });
}

/* ---- 'jogo': o que o jogador precisa no meio da partida ----------------- */
const grupoJogo = new THREE.Group(); grupoJogo.name = 'jogo-vr'; uiVR.add(grupoJogo);

/* À DIREITA, na altura dos painéis, e não no centro: o centro é por onde a
   baqueta desce. Um botão no caminho da mão seria acertado sem querer — e
   ainda tamparia a bateria, que é o que o jogador precisa ver. */
const btPular = botao('Pular ›', .68, .20, disparar('pular'), .54);
btPular.position.set(1.38, 1.80, -2.05); grupoJogo.add(btPular);

const btSair = botao('Sair', .68, .18, disparar('sair'), .50);
btSair.position.set(1.38, 1.56, -2.05); grupoJogo.add(btSair);

/* ---- 'cal': a calibragem, que empresta o painel do meio -----------------
   A contagem e o resultado da medição são desenhados no `painelCentro`
   (ui.js → calibragem3D), que fica em z=−2,30 — ATRÁS do menu, que está em
   z=−2,00. Deixar os dois ligados esconderia a medição justamente atrás dos
   botões. Então o menu sai e fica só uma saída, no mesmo lugar em que o
   resultado de partida põe as suas. É o equivalente 3D do modal de HTML
   "Ajustes", que também cobre a tela e tem um Fechar. */
const grupoCal = new THREE.Group(); grupoCal.name = 'cal-vr'; uiVR.add(grupoCal);
const btFecharCal = botao('Fechar', .78, .20, disparar('fecharCal'), .50);
btFecharCal.position.set(0, 1.02, -2.28); grupoCal.add(btFecharCal);

/* ---- 'fim': sob o painel de resultado ----------------------------------- */
const grupoFim = new THREE.Group(); grupoFim.name = 'fim-vr'; uiVR.add(grupoFim);

/* O `painelCentro` do resultado é 1,62 × 1,04 em y=1,72 — ou seja, sua borda
   de baixo está em 1,20. Os botões ficam logo abaixo dela, e no mesmo z, para
   os dois lerem como uma coisa só. */
const btDeNovo = botao('Jogar de novo', .78, .20, disparar('denovo'), .50);
btDeNovo.position.set(-.42, 1.05, -2.28); grupoFim.add(btDeNovo);

const btMenu = botao('Menu', .78, .20, disparar('menu'), .50);
btMenu.position.set(.42, 1.05, -2.28); grupoFim.add(btMenu);

/* ------------------------------------------------------- visibilidade ---- */

let _tela = null;          // 'menu' | 'jogo' | 'fim' | null
let _pular = false;        // o PULAR só existe nas fases 0 e 1
let _forcar = false;       // ver forcarForaDoVR()

/** Nada disto aparece fora do VR: no navegador o mesmo papel é do HTML, e
 *  desenhar os dois deixaria a tela com dois menus empilhados. */
function aplicar(){
  const emVR = renderer.xr.isPresenting || _forcar;
  grupoMenu.visible = emVR && _tela === 'menu';
  grupoJogo.visible = emVR && _tela === 'jogo';
  grupoFim.visible  = emVR && _tela === 'fim';
  grupoCal.visible  = emVR && _tela === 'cal';
  btPular.visible   = _pular;
  if (!grupoMenu.visible && !grupoJogo.visible
      && !grupoFim.visible && !grupoCal.visible) limparFoco();
}

/** @param {'menu'|'jogo'|'fim'|'cal'|null} qual */
export function mostrar(qual){ _tela = qual; aplicar(); }
export function mostrarPular3D(v){ _pular = !!v; aplicar(); }
export function telaAtual(){ return _tela; }

/* ============================ O PONTEIRO =================================
   Um raio por controle. Ele NÃO fica sempre ligado: durante a partida
   apareceria atravessando a bateria a cada movimento de braço. A regra é

     - menu ou resultado abertos → raio sempre visível (é a hora de apontar)
     - partida em curso          → raio só quando aponta para um botão

   O custo é um raycast contra no máximo oito planos por controle, por quadro.
   Insignificante ao lado dos 357 mil triângulos da cena.                    */

const CURSOR = new THREE.Mesh(
  new THREE.SphereGeometry(.012, 10, 10),
  new THREE.MeshBasicMaterial({ color:0xffffff, depthTest:false }));
CURSOR.renderOrder = 10; CURSOR.visible = false; uiVR.add(CURSOR);

const ponteiros = baquetas.map(b => {
  const geo = new THREE.BufferGeometry().setFromPoints(
    [new THREE.Vector3(0,0,0), new THREE.Vector3(0,0,-1)]);
  const linha = new THREE.Line(geo, new THREE.LineBasicMaterial({
    color:0x00d9ff, transparent:true, opacity:.7 }));
  linha.name = 'ponteiro';
  linha.visible = false;
  b.ctrl.add(linha);
  return { ctrl:b.ctrl, linha, alvo:null, baqueta:b };
});

const _m = new THREE.Matrix4();
const _ray = new THREE.Raycaster();
_ray.far = 8;
let _focado = null;

function limparFoco(){
  if (_focado){ _focado.userData.foco = false; _focado.userData.repintar(); _focado = null; }
  for (const p of ponteiros){ p.linha.visible = false; p.alvo = null; }
  CURSOR.visible = false;
}

function alvosVisiveis(){
  const r = [];
  for (const g of [grupoMenu, grupoJogo, grupoFim, grupoCal]){
    if (!g.visible) continue;
    for (const o of g.children){
      if (o.userData?.acao && o.visible) r.push(o);
      else if (o.isGroup) for (const f of o.children) if (f.userData?.acao && f.visible) r.push(f);
    }
  }
  return r;
}

/** Uma vez por quadro, dentro da sessão VR. */
export function atualizarPonteiros(){
  const alvos = alvosVisiveis();
  if (!alvos.length){ limparFoco(); return; }

  /* Com menu ou resultado abertos o raio fica visível mesmo sem acertar nada:
     é o único jeito de o jogador descobrir para onde está apontando. */
  const sempre = grupoMenu.visible || grupoFim.visible || grupoCal.visible;
  let novo = null, melhorDist = Infinity;

  for (const p of ponteiros){
    _m.identity().extractRotation(p.ctrl.matrixWorld);
    _ray.ray.origin.setFromMatrixPosition(p.ctrl.matrixWorld);
    _ray.ray.direction.set(0, 0, -1).applyMatrix4(_m);
    const hit = _ray.intersectObjects(alvos, false)[0];

    p.alvo = hit ? hit.object : null;
    p.linha.visible = !!hit || sempre;
    p.linha.scale.z = hit ? hit.distance : 3.2;
    p.linha.material.opacity = hit ? .95 : .35;

    if (hit && hit.distance < melhorDist){ melhorDist = hit.distance; novo = hit.object; }
    if (hit){ CURSOR.position.copy(hit.point); CURSOR.visible = true; }
  }
  if (!novo) CURSOR.visible = false;

  if (novo !== _focado){
    if (_focado){ _focado.userData.foco = false; _focado.userData.repintar(); }
    _focado = novo;
    if (_focado){
      _focado.userData.foco = true; _focado.userData.repintar();
      /* Um toque curto ao entrar no botão. Em VR o retorno tátil é o que
         substitui o "clique" que o dedo espera de uma interface. */
      for (const p of ponteiros) if (p.alvo === _focado) vibrar(p, .25, 12);
    }
  }
}

function vibrar(p, forca, ms){
  const i = ponteiros.indexOf(p);
  renderer.xr.getSession()?.inputSources?.[i]
    ?.gamepad?.hapticActuators?.[0]?.pulse?.(forca, ms);
}

/* O GATILHO. `selectstart` é o evento do three para o gatilho de qualquer
   controle de WebXR, e vale também para mão rastreada (pinça) — de graça.
   Só age se AQUELE controle estiver apontando para um botão: apertar o
   gatilho no meio da música, sem mirar, não pode fazer nada. */
for (const p of ponteiros){
  p.ctrl.addEventListener('selectstart', () => {
    const alvo = p.alvo;
    if (!alvo || !alvo.visible) return;
    vibrar(p, .6, 25);
    alvo.userData.acao?.();
  });
}

/** Liga as ações. Fica no main.js, que é quem já conhece `iniciar`,
 *  `pularTutorial` e companhia — importá-las aqui fecharia um ciclo
 *  (fases.js → ui.js → menu3d.js → fases.js). */
export function definirAcoes(mapa){ Object.assign(acoes, mapa); }

/** Chamado ao entrar e ao sair da sessão: a visibilidade depende de estar em
 *  VR, e o `isPresenting` só muda depois do evento. */
export function revisar(){ aplicar(); }

/** SÓ PARA CONFERIR NO MONITOR. Desenha os painéis fora da sessão VR, onde
 *  eles normalmente não existem — é o único jeito de olhar o texto, o
 *  alinhamento e o corte das placas sem colocar o headset. O ponteiro
 *  continua sendo dos controles, então no navegador nada é clicável: isto
 *  mostra, não substitui o teste no Quest. */
export function forcarForaDoVR(v){ _forcar = !!v; aplicar(); }

aplicar();
