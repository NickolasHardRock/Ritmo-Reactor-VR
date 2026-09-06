/* ============================================================================
   cena.js — o mundo: renderizador, câmera, luzes, o cenário e as placas 3D.

   REGRA DE OURO DO VR, que explica quase tudo aqui:
   dentro da sessão a posição da câmera é ditada pelo HEADSET. Mexer nela na
   mão causa náusea e é ignorado. Por isso a câmera é filha de um grupo
   `player`: para mover o jogador, move-se o GRUPO.
   ========================================================================== */

import * as THREE          from 'three';
import { GLTFLoader }      from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader }     from 'three/addons/loaders/DRACOLoader.js';
import { KTX2Loader }      from 'three/addons/loaders/KTX2Loader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { CENARIO, QUALIDADE, CAMINHO_DRACO, CAMINHO_BASIS } from './config.js';

/* --------------------------------------------------------- cena base ----- */
export const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0e16);
scene.fog = new THREE.Fog(0x2a3446, 16, 40);

export const camera = new THREE.PerspectiveCamera(68, innerWidth/innerHeight, .05, 60);
export const player = new THREE.Group(); player.name = 'jogador';
player.add(camera); scene.add(player);
camera.position.set(0, 1.42, 2.05);

export const renderer = new THREE.WebGLRenderer({
  antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType('local-floor');   // origem no chão real
renderer.xr.setFramebufferScaleFactor(QUALIDADE.escalaVR);
renderer.xr.setFoveation(QUALIDADE.foveacao);
document.body.appendChild(renderer.domElement);

export const relogio = new THREE.Clock();

/* Duas molduras para o mesmo jogo:
   - no navegador o jogador ORBITA a bateria a ~2 m, para enxergar tudo;
   - em VR ele precisa estar ao alcance do braço, no lugar do baterista.
   Mantendo o `player` na origem fora do VR, o espaço local vira igual ao
   mundo e o OrbitControls funciona sem surpresas.                          */
export const POSTO = new THREE.Vector3(0, 0, 0.62);
let _orbit = null;
export function registrarOrbit(o){ _orbit = o; }

export function molduraDesktop(){
  player.position.set(0,0,0); player.rotation.set(0,0,0);
  camera.position.set(0, 1.42, 2.05);
  if (_orbit){ _orbit.target.set(0, 1.05, 0); _orbit.update(); }
}
export function molduraVR(){
  player.position.copy(POSTO); player.rotation.set(0,0,0);
}

/* ------------------------------------------------------------- luz ------- */
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), .05).texture;

scene.add(new THREE.HemisphereLight(0xbcd4f5, 0x2b3648, 1.15));
const luzChave = new THREE.DirectionalLight(0xdfeaff, .85);
luzChave.position.set(2.5, 6, 3.5);
luzChave.castShadow = true;
luzChave.shadow.mapSize.set(512, 512);
luzChave.shadow.camera.near = .5;  luzChave.shadow.camera.far = 16;
luzChave.shadow.camera.left = -4;  luzChave.shadow.camera.right = 4;
luzChave.shadow.camera.top = 6;    luzChave.shadow.camera.bottom = -1;
scene.add(luzChave);

/* --------------------------------------------------------- carregador ---- */
export const loader = new GLTFLoader();
const draco = new DRACOLoader().setDecoderPath(CAMINHO_DRACO);
loader.setDRACOLoader(draco);

/* KTX2/Basis: textura que continua COMPRIMIDA dentro da GPU.
   Um PNG 1024 vira 5,59 MB de VRAM ao ser descomprimido; o mesmo 1024 em
   KTX2 ocupa ~0,7 MB. É o que permite manter resolução cheia no Quest.
   Sem este loader, um .glb com KTX2 simplesmente não carrega.             */
const ktx2 = new KTX2Loader()
  .setTranscoderPath(CAMINHO_BASIS)
  .detectSupport(renderer);
loader.setKTX2Loader(ktx2);

/* Filtragem anisotrópica: nitidez em superfícies vistas de canto (piso,
   paredes). Não gasta VRAM — é só um parâmetro de amostragem — e o
   GLTFLoader não a liga por conta própria.                                */
const ANISO = Math.min(QUALIDADE.anisotropia, renderer.capabilities.getMaxAnisotropy());
export function afinarTexturas(raiz){
  raiz.traverse(o => {
    if (!o.isMesh || !o.material) return;
    for (const mat of [].concat(o.material))
      for (const k of ['map','emissiveMap','normalMap','roughnessMap',
                       'metalnessMap','aoMap','clearcoatNormalMap']){
        const t = mat[k];
        if (t && t.anisotropy !== ANISO){ t.anisotropy = ANISO; t.needsUpdate = true; }
      }
  });
}

/* ======================================================= O CENÁRIO =======
   O cenário é uma malha centrada na origem. Escala, posiciona o posto do
   baterista em POSTO e ajusta o chão para Y=0.

   O cenário NÃO tem chão contínuo sob o posto: é uma paisagem irregular, e
   medindo coluna por coluna há vazio bem embaixo do jogador. Quem segura a
   bateria é o estrado que o próprio jogo desenha, não o modelo. Por isso
   trocar de cenário aqui é barato: nada estrutural depende dele.          */

function encaixarCenario(m){
  const s   = CENARIO.escala  || 1;
  const rot = (CENARIO.rotacaoGraus || 0) * Math.PI / 180;
  m.scale.setScalar(s);
  m.rotation.y = rot;
  /* postoJogador é em coords do modelo (antes da rotação). Aplicar a
     mesma rotação para descobrir onde ele cai no mundo.                */
  const c = Math.cos(rot), sn = Math.sin(rot);
  const px = ( CENARIO.postoJogador[0]*c + CENARIO.postoJogador[1]*sn) * s;
  const pz = (-CENARIO.postoJogador[0]*sn + CENARIO.postoJogador[1]*c) * s;
  m.position.set(-px, -CENARIO.alturaPiso * s, POSTO.z - pz);
}

/** Carrega o cenário. Falha não é fatal: o jogo roda sem ele. */
export function carregarCenario(){
  loader.load(CENARIO.url,
    (gltf) => {
      const m = gltf.scene;
      encaixarCenario(m);
      m.traverse(o => { if (o.isMesh){ o.castShadow = false; o.receiveShadow = false; } });
      afinarTexturas(m);
      /* Nome explicito: e por ele que desempenho.js separa o custo do cenario
         do custo da bateria. Sem nome, os dois viram um numero so. */
      m.name = 'cenario';
      scene.add(m);
    },
    undefined,
    (err) => console.warn('[cena] cenário não carregou — seguindo sem ele', err),
  );
}

/* ============================================ PLACAS DE TEXTO EM 3D ======
   HTML não existe dentro do headset: nenhum <div> aparece em VR. Todo aviso
   que o jogador precisa ver ali tem de ser um OBJETO 3D. Isto desenha o
   texto num <canvas> e cola como textura num plano.                       */
export function placa(w, h, px = 1024){
  const cv = document.createElement('canvas');
  cv.width = px; cv.height = Math.round(px * h / w);
  const tex = new THREE.CanvasTexture(cv); tex.anisotropy = 4;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h),
    new THREE.MeshBasicMaterial({ map:tex, transparent:true }));
  mesh.name = 'placa';
  mesh.userData.pintar = (linhas, o = {}) => {
    const c = cv.getContext('2d');
    c.clearRect(0, 0, cv.width, cv.height);
    if (o.fundo !== false){
      c.fillStyle = o.fundo || 'rgba(10,14,22,.9)';
      c.beginPath(); c.roundRect(0, 0, cv.width, cv.height, cv.height*.16); c.fill();
      c.strokeStyle = o.borda || 'rgba(0,217,255,.35)'; c.lineWidth = 5; c.stroke();
    }
    const arr = [].concat(linhas), passo = cv.height / (arr.length + 1);
    c.textAlign = 'center'; c.textBaseline = 'middle';
    arr.forEach((t, i) => {
      c.fillStyle = (o.cores && o.cores[i]) || o.cor || '#e8eef8';
      /* `tams` permite tamanho por linha. Sem isso um painel com título e
         crédito na mesma placa obriga os dois ao mesmo corpo: o título fica
         pequeno ou o crédito não caberia na largura. */
      const tam = (o.tams && o.tams[i]) || o.tam || .6;
      const peso = (o.pesos && o.pesos[i]) || o.peso || 700;
      const corpo = Math.round(tam * passo);
      /* CABER É OBRIGAÇÃO DA PLACA, não de quem chama. Texto de largura fixa
         com conteúdo variável — nome de faixa, crédito de terceiro — estoura
         a borda sem avisar, e em VR ninguém vê o defeito de perto. Primeiro
         tenta encolher a fonte até 55%; se ainda não couber, corta com "…".
         Foi assim que o crédito da Colour Me Red foi pego, medindo 152% da
         largura no painel de resultado. */
      const maxW = cv.width * 0.94;
      let escala = 1, texto = String(t);
      c.font = `${peso} ${corpo}px system-ui, sans-serif`;
      let w = c.measureText(texto).width;
      while (w > maxW && escala > 0.55){
        escala -= 0.05;
        c.font = `${peso} ${Math.round(corpo * escala)}px system-ui, sans-serif`;
        w = c.measureText(texto).width;
      }
      while (w > maxW && texto.length > 4){
        texto = texto.slice(0, -2);
        w = c.measureText(texto + '…').width;
        if (w <= maxW) texto += '…';
      }
      c.fillText(texto, cv.width/2, passo * (i + 1));
    });
    tex.needsUpdate = true;
  };
  return mesh;
}

export const painelHUD = placa(1.05, .34);
painelHUD.position.set(-1.45, 2.2, -2.55); scene.add(painelHUD);

export const painelObj = placa(1.05, .26);
painelObj.position.set(1.45, 2.2, -2.55); scene.add(painelObj);

/* O PAINEL DO "NÃO ESTOU JOGANDO, ESTOU LENDO".
   HTML não existe no headset, então todo momento em que o jogo para para
   dizer alguma coisa ao jogador precisa de um objeto 3D. São dois momentos, e
   eles nunca acontecem juntos: o RESULTADO da partida e a CALIBRAGEM. Um
   painel só serve aos dois — e é por isso que ele se chama "centro" e não
   "fim".

   Fica CENTRADO e na linha dos olhos, diferente dos painéis de jogo, que são
   laterais e altos de propósito para não tampar a bateria. Aqui o jogador não
   está mirando, está lendo. */
export const painelCentro = placa(1.62, 1.04, 1400);
painelCentro.position.set(0, 1.72, -2.30);
painelCentro.visible = false; scene.add(painelCentro);

/** Aviso volante que segue o olhar — o "toast" do mundo VR. */
export const flash = placa(1.1, .24); flash.visible = false; scene.add(flash);
export const flashEstado = { ate: 0 };

/** A pista de notas da fase 3 vive aqui para que a altura possa acompanhar
 *  o ajuste da bateria. */
export const pistaG = new THREE.Group(); pistaG.name = 'pista';
pistaG.position.set(0, 1.95, 0); scene.add(pistaG);
export const ALTURA_PISTA = 1.95;
