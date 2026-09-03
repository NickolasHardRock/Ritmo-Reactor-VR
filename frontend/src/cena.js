/* ============================================================================
   cena.js — o mundo: renderizador, câmera, luzes, o laboratório e o reator.

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
import { LAB, QUALIDADE, CAMINHO_DRACO, CAMINHO_BASIS } from './config.js';

/* --------------------------------------------------------- cena base ----- */
export const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0e16);
scene.fog = new THREE.Fog(0x2a3446, 16, 40);

export const camera = new THREE.PerspectiveCamera(68, innerWidth/innerHeight, .05, 60);
export const player = new THREE.Group();
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

/* ==================================================== O LABORATÓRIO ======
   O cenário é uma malha centrada na origem. Escala, posiciona o posto do
   baterista em POSTO e ajusta o chão para Y=0.                            */

function encaixarLab(m){
  const s   = LAB.escala  || 1;
  const rot = LAB.rotacao || 0;
  m.scale.setScalar(s);
  m.rotation.y = rot;
  /* postoJogador é em coords do modelo (antes da rotação). Aplicar a
     mesma rotação para descobrir onde ele cai no mundo.                */
  const c = Math.cos(rot), sn = Math.sin(rot);
  const px = ( LAB.postoJogador[0]*c + LAB.postoJogador[1]*sn) * s;
  const pz = (-LAB.postoJogador[0]*sn + LAB.postoJogador[1]*c) * s;
  m.position.set(-px, -LAB.alturaPiso * s, POSTO.z - pz);
}

/** Carrega o cenário. Falha não é fatal: o jogo roda sem ele. */
export function carregarLab(){
  loader.load(LAB.url,
    (gltf) => {
      const m = gltf.scene;
      encaixarLab(m);
      m.traverse(o => { if (o.isMesh){ o.castShadow = false; o.receiveShadow = false; } });
      afinarTexturas(m);
      scene.add(m);
      reator.visible = false;
    },
    undefined,
    (err) => console.warn('[cena] cenário não carregou — seguindo sem ele', err),
  );
}

/* ========================================================== O REATOR =====
   O tanque do cenário É o núcleo — não desenho esfera nenhuma. Três anéis
   HORIZONTAIS abraçam o cilindro (é o que lê como "contenção de energia"),
   uma luz acende por dentro e um arco no chão mostra a carga.
   O modelo faz o trabalho visual; o jogo só o acende.                     */
export const reator = new THREE.Group(); scene.add(reator);
const RAIO_TANQUE = 1.32;
const ALTURAS_ANEL = [-0.55, 0, 0.55];

const matAnel = new THREE.MeshStandardMaterial({
  color:0x1a3a52, emissive:0x00d9ff, emissiveIntensity:.25, roughness:.3, metalness:.7 });

export const aneis = ALTURAS_ANEL.map((dy, i) => {
  const a = new THREE.Mesh(new THREE.TorusGeometry(RAIO_TANQUE, .045, 8, 64), matAnel.clone());
  a.rotation.x = Math.PI/2;               // deitado -> abraça o cilindro
  a.position.y = dy;
  a.userData.giro = (i % 2 ? -1 : 1) * (0.22 + i*0.06);
  a.userData.base = dy;
  reator.add(a);
  return a;
});
export const luzR = new THREE.PointLight(0x00d9ff, .5, 12); reator.add(luzR);

export const aroCarga = new THREE.Mesh(
  new THREE.TorusGeometry(RAIO_TANQUE + .35, .05, 8, 120, 0.001),
  new THREE.MeshBasicMaterial({ color:0x3ddc97 }));
aroCarga.rotation.x = Math.PI/2;
aroCarga.position.y = -1.35;
reator.add(aroCarga);

/** Redesenha o arco de progresso. Chamado quando a pontuação muda. */
export function atualizarAroCarga(percentual){
  aroCarga.geometry.dispose();
  aroCarga.geometry = new THREE.TorusGeometry(RAIO_TANQUE + .35, .05, 8, 120,
    Math.max(.001, percentual/100 * Math.PI*2));
}

/** Anima o reator conforme a carga. Chamado a cada quadro. */
export function animarReator(dt, t, carga){
  const c = carga / 100;
  aneis.forEach(a => {
    a.rotation.z += dt * a.userData.giro * (1 + c*3);
    a.position.y = a.userData.base + Math.sin(t*.8 + a.userData.base*4)*.06*(0.3 + c);
    a.material.emissiveIntensity = .2 + c*2.6;
  });
  luzR.intensity = .5 + c*5.5 + Math.sin(t*5)*.35*c;
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
      c.font = `${o.peso || 700} ${Math.round((o.tam || .6) * passo)}px system-ui, sans-serif`;
      c.fillText(t, cv.width/2, passo * (i + 1));
    });
    tex.needsUpdate = true;
  };
  return mesh;
}

export const painelHUD = placa(1.05, .34);
painelHUD.position.set(-1.45, 2.2, -2.55); scene.add(painelHUD);

export const painelObj = placa(1.05, .26);
painelObj.position.set(1.45, 2.2, -2.55); scene.add(painelObj);

/** Aviso volante que segue o olhar — o "toast" do mundo VR. */
export const flash = placa(1.1, .24); flash.visible = false; scene.add(flash);
export const flashEstado = { ate: 0 };

/** A pista de notas da fase 3 vive aqui para que a altura possa acompanhar
 *  o ajuste da bateria. */
export const pistaG = new THREE.Group();
pistaG.position.set(0, 1.95, 0); scene.add(pistaG);
export const ALTURA_PISTA = 1.95;
