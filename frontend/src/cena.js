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
import { CENARIO, QUALIDADE, AMBIENTE, PALCO, LUZ,
         CAMINHO_DRACO, CAMINHO_BASIS } from './config.js';

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
/* ONDE O BATERISTA FICA. Era 0,62 m atrás do centro do kit, e o teste de
   09/09 disse que dali só se alcança o ride esticando o braço. Medido no
   modelo REAL, o alcance exigido do ombro (já descontada a baqueta de 38 cm):

     peça       z=0,62   z=0,50
     ride        0,54     0,45     ← o pior caso, e o que doía
     crash       0,48     0,37
     chimbal     0,44     0,36
     tom 1 e 2   0,40     0,30
     surdo       0,28     0,21
     caixa       0,24     0,17

   Braço de adulto vai a ~0,62 m com o ombro travado; 0,54 é esticar de
   verdade, 0,45 é confortável.

   0,50 NÃO É ARREDONDAMENTO: é o limite. Medindo a malha do kit na faixa
   |x| < 30 cm, que é a que fica na frente do corpo, ela avança até z=0,445
   (o bumbo, abaixo de 40 cm) e z=0,398 na altura do peito. Abaixo de 0,50 o
   jogador começa a ficar DENTRO da bateria — que é invisível de cabeça
   erguida e constrangedor ao olhar para baixo. Daí também o limite de
   aproximação do ajuste fino, logo abaixo.

   Mexer aqui mexe no cenário junto: `encaixarCenario` posiciona a paisagem a
   partir do POSTO, para o jogador continuar em cima da mesma pedra.        */
export const POSTO = new THREE.Vector3(0, 0, 0.50);
let _orbit = null;
export function registrarOrbit(o){ _orbit = o; }

/* ------------------------------------------- distância, no ajuste fino ---
   Como a altura, isto é medida de corpo e muda de pessoa para pessoa. A
   alavanca ESQUERDA ↑↓ aproxima e afasta; a direita já cuidava da altura.

   O curso é assimétrico de propósito, e não por descuido: o padrão já está
   encostado no bumbo, então para a frente sobram 3 cm e para trás sobram 30.
   Quem quiser espaço tem para onde ir; quem quiser chegar mais perto já
   chegou.

   Só vale em VR. No navegador a distância é o zoom do OrbitControls, que já
   existe e é melhor — a roda do mouse faz isto desde sempre.               */
export let avancoVisao = 0;              // metros à frente do POSTO
const AVANCO_MAX =  .03;
const AVANCO_MIN = -.30;

/** @param {number} d metros; positivo aproxima o jogador da bateria.
 *  @param {(a:number)=>void} [aoMudar] recebe a distância resultante, em
 *         metros do centro do kit — que é o número que significa algo. */
export function ajustarAvanco(d, aoMudar){
  const antes = avancoVisao;
  avancoVisao = THREE.MathUtils.clamp(avancoVisao + d, AVANCO_MIN, AVANCO_MAX);
  if (avancoVisao !== antes && renderer.xr.isPresenting){
    player.position.z = POSTO.z - avancoVisao;
  }
  if (aoMudar) aoMudar(POSTO.z - avancoVisao);
  return avancoVisao;
}

/* ==================== A ALTURA: QUEM SOBE E DESCE É O JOGADOR ============
   Até 08/09 o ajuste de altura movia a BATERIA (`kit.position.y`). Parecia a
   mesma coisa e não é: a bateria pousa direto na pedra do cenário — não há
   estrado, ver claude/estado-ambiente-da-cena.md — então descer o kit o
   ENTERRA no chão. No teste do Quest foi exatamente isso que apareceu: quem
   é mais alto precisa da bateria mais baixa, e mais baixa quer dizer meio
   tambor dentro da rocha.

   O ajuste agora move o JOGADOR, que é o que a diferença de altura de fato é.
   O kit fica onde o cenário o apoia, e `deteccao.js` deixa de depender de um
   valor que muda no meio da partida.

   O SINAL NÃO MUDOU, de propósito: `alturaVisao` continua sendo "a bateria,
   em relação a mim" — positivo é kit mais alto, e para isso quem desce é o
   jogador. As chamadas de fora (`[`/`]`, alavanca direita) seguem iguais, e a
   mensagem na tela continua dizendo a mesma coisa que o jogador vê.

   MEXER NA CÂMERA DENTRO DO VR É PROIBIDO (a posição dela é ditada pelo
   headset e mexer nela dá náusea), e por isso quem se move é o grupo
   `player` — a regra de ouro do topo do arquivo. Fora do VR quem manda na
   câmera é o OrbitControls, que a recalcula a cada `update()` a partir do
   alvo: ali o deslocamento tem de ir na CÂMERA E NO ALVO juntos, senão o
   OrbitControls desfaz no quadro seguinte — ou, pior, gira o ângulo que o
   jogador tinha escolhido. */
export let alturaVisao = 0;
const LIMITE_VISAO = .45;

/** @param {number} d metros; positivo sobe a bateria em relação ao jogador.
 *  @param {(a:number)=>void} [aoMudar] */
export function ajustarVisao(d, aoMudar){
  const antes = alturaVisao;
  alturaVisao = THREE.MathUtils.clamp(alturaVisao + d, -LIMITE_VISAO, LIMITE_VISAO);
  const real = alturaVisao - antes;          // no fim do curso o clamp come o passo
  if (real !== 0){
    if (renderer.xr.isPresenting) player.position.y = -alturaVisao;
    else {
      camera.position.y -= real;
      if (_orbit){ _orbit.target.y -= real; _orbit.update(); }
    }
  }
  if (aoMudar) aoMudar(alturaVisao);
  return alturaVisao;
}

export function molduraDesktop(){
  player.position.set(0,0,0); player.rotation.set(0,0,0);
  camera.position.set(0, 1.42 - alturaVisao, 2.05);
  if (_orbit){ _orbit.target.set(0, 1.05 - alturaVisao, 0); _orbit.update(); }
}
export function molduraVR(){
  player.position.set(POSTO.x, -alturaVisao, POSTO.z - avancoVisao);
  player.rotation.set(0,0,0);
}

/* ------------------------------------------------------------- luz ------- */
const pmrem = new THREE.PMREMGenerator(renderer);

/* O AMBIENTE PROVISÓRIO, que vive só até o cenário carregar.
   Um gradiente escuro numa esfera de dentro para fora — zero download, uma
   malha de 16 × 12 que nem chega a existir por quadro, porque o PMREM a
   consome uma vez e ela é descartada. Serve a dois momentos: os segundos
   entre a página abrir e o `cenario.glb` chegar, e o caso em que o cenário
   NÃO carrega (que não é fatal aqui — o jogo roda sem ele). Sem nenhum
   ambiente, todo metal do kit fica preto e o defeito parece ser do modelo. */
function ambienteGradiente(){
  const g = new THREE.SphereGeometry(1, 16, 12);
  const pos = g.attributes.position, cor = new THREE.Color(), cores = [];
  const alto = new THREE.Color(0x2a3446), baixo = new THREE.Color(0x0b0f18);
  for (let i = 0; i < pos.count; i++){
    cor.copy(baixo).lerp(alto, THREE.MathUtils.smoothstep(pos.getY(i), -.6, .6));
    cores.push(cor.r, cor.g, cor.b);
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(cores, 3));
  const provisoria = new THREE.Scene();
  provisoria.add(new THREE.Mesh(g, new THREE.MeshBasicMaterial({
    vertexColors: true, side: THREE.BackSide })));
  const rt = pmrem.fromScene(provisoria, .04);
  g.dispose();
  return rt;
}

/* Guardar o RENDER TARGET, não a textura: quem tem `dispose()` que devolve a
   memória da GPU é ele. Trocar `scene.environment` sem isto vaza um alvo de
   PMREM inteiro por troca — e este código troca pelo menos uma vez por
   carregamento. */
let _envRT = null;
const _ouvintes = [];

/** Avisa quando o `scene.environment` troca, e já chama com o que existe
 *  agora. Existe porque o kit precisa saber: ele copia a textura para o
 *  próprio `envMap` (ver kit.js), e o ambiente definitivo costuma chegar
 *  DEPOIS do modelo — cenário e bateria carregam em paralelo, e quem termina
 *  primeiro muda com a rede. */
export function aoTrocarAmbiente(fn){ _ouvintes.push(fn); fn(scene.environment); }

function trocarAmbiente(rt){
  if (_envRT && _envRT !== rt) _envRT.dispose();
  _envRT = rt;
  scene.environment = rt ? rt.texture : null;
  for (const fn of _ouvintes) fn(scene.environment);
}
trocarAmbiente(ambienteGradiente());

/* Exportada porque a intensidade dela é metade da transição tutorial→show. */
export const luzAmbiente = new THREE.HemisphereLight(0xbcd4f5, 0x2b3648, LUZ.tutorial.hemisferica);
scene.add(luzAmbiente);
/* Nasce no nível do TUTORIAL, não no do show: a partida começa clara. O
   valor do show é o `PALCO.intensidade`, aplicado por `definirLuz('show')`. */
export const luzChave = new THREE.SpotLight(PALCO.cor, LUZ.tutorial.palco,
  PALCO.alcance, PALCO.angulo, PALCO.penumbra, PALCO.decaimento);
luzChave.name = 'luz-palco';
luzChave.position.set(...PALCO.posicao);
/* O alvo precisa estar NA CENA. Fora dela o three não atualiza a matriz dele,
   e o cone aponta para a origem do mundo qualquer que seja este vetor — um
   defeito que não dá erro, só deixa a luz mirando o lugar errado. */
luzChave.target.position.set(...PALCO.alvo);
scene.add(luzChave.target);

luzChave.castShadow = true;
luzChave.shadow.mapSize.set(512, 512);
/* Sombra de spot usa câmera em PERSPECTIVA, não ortográfica: o `fov` sai do
   próprio ângulo do cone e os limites left/right/top/bottom da versão
   anterior não existem mais aqui. `far` curto porque o que projeta sombra
   está todo a menos de 8 m — cada metro a mais é resolução jogada fora. */
luzChave.shadow.camera.near = .5;
luzChave.shadow.camera.far  = 8;
scene.add(luzChave);


/* ======================= TUTORIAL CLARO, SHOW ESCURO =====================
   Dois estados de luz e uma interpolação entre eles. No tutorial o jogador
   está aprendendo onde ficam as sete peças e precisa ver a cena; na entrada
   do ritmo as luzes caem e sobra a poça de palco.

   POR QUE INTERPOLADO E NÃO EM DEGRAUS: luz que pula de um valor a outro em
   dois ou três `setTimeout` lê como engasgo de carregamento, não como
   holofote apagando. Aqui o fade tem duração exata (`LUZ.transicao`) porque o
   progresso é um `t` de 0 a 1 alimentado pelo `dt` do laço, e não um passo
   proporcional à diferença que fica se aproximando do alvo para sempre.

   `animarLuzes(dt)` sai de graça quando não há transição em curso — é o caso
   em 99% dos quadros de uma partida.                                      */
const _de    = { hemi:0, palco:0, amb:0 };
const _para  = { hemi:0, palco:0, amb:0 };
const _atual = { hemi:0, palco:0, amb:0 };
/* Cor do céu: as duas pontas e a interpolada. `scene.background` aponta para
   `_corAtual` e é MUTADA no lugar — trocar o objeto a cada quadro daria lixo
   para o coletor 60 vezes por segundo, e a captura do cubemap guarda e devolve
   esta referência (ver gerarAmbienteDaCena). */
const _corDe   = new THREE.Color();
const _corPara = new THREE.Color();
const _corAtual = new THREE.Color();
let _t = 1;

function _estado(nome){
  return nome === 'show'
    ? { hemi: LUZ.show.hemisferica,     palco: PALCO.intensidade,  amb: LUZ.show.ambiente,
        fundo: LUZ.show.fundo }
    : { hemi: LUZ.tutorial.hemisferica, palco: LUZ.tutorial.palco, amb: LUZ.tutorial.ambiente,
        fundo: LUZ.tutorial.fundo };
}
function _aplicar(){
  luzAmbiente.intensity = _atual.hemi;
  luzChave.intensity    = _atual.palco;
  /* `environmentIntensity` da CENA, e não `envMapIntensity` do material: aqui
     se quer mexer no reflexo de tudo de uma vez, cenário incluído. O caminho
     por material existe e é outro — ver kit.js. */
  scene.environmentIntensity = _atual.amb;
  scene.background = _corAtual;
}

/** @param {'tutorial'|'show'} nome
 *  @param {boolean} imediato sem fade — usado no início da partida, onde não
 *         há transição a mostrar, só um ponto de partida a fixar. */
export function definirLuz(nome, imediato = false){
  const alvo = _estado(nome);
  Object.assign(_de, _atual);
  Object.assign(_para, alvo);
  _corDe.copy(_corAtual);
  _corPara.set(alvo.fundo);
  _t = imediato ? 1 : 0;
  if (imediato){
    Object.assign(_atual, alvo);
    _corAtual.copy(_corPara);
    _aplicar();
  }
}

/** Chamar uma vez por quadro, com o dt do laço. */
export function animarLuzes(dt){
  if (_t >= 1) return;
  _t = Math.min(1, _t + dt / LUZ.transicao);
  const e = _t * _t * (3 - 2 * _t);              // smoothstep
  for (const k of ['hemi', 'palco', 'amb'])
    _atual[k] = _de[k] + (_para[k] - _de[k]) * e;
  _corAtual.lerpColors(_corDe, _corPara, e);
  _aplicar();
}

definirLuz('tutorial', true);

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

/* ============================ A PASSADA DUPLA =============================
   MATERIAL TRANSPARENTE + DoubleSide É DESENHADO DUAS VEZES. O three faz
   isso de propósito: desenha as faces de trás, depois as da frente, para a
   ordem da mistura sair certa (`WebGLRenderer.js`, em `renderObject`). São
   dois draw calls e o dobro dos triângulos para uma malha só.

   O PROBLEMA É QUE QUASE NINGUÉM PEDIU ESSA TRANSPARÊNCIA. Exportador de
   glTF marca o material como transparente sempre que o material declara
   canal alfa, mesmo com opacidade 1 e nada translúcido para mostrar. No
   `cenario.glb` isso acontecia em 62 das 88 malhas, e custava 104.939
   triângulos e ~62 draw calls POR QUADRO — medido, com a GPU já respondendo
   por 88% do tempo de quadro. Era o desperdício mais caro que existia.

   `forceSinglePass = true` desliga só a segunda passada. Escolhido em vez de
   `transparent = false`, que seria mais agressivo e QUEBRARIA folhagem: o
   cenário tem vegetação, e recorte de folha vem do alfa da textura de cor —
   canal que este teste não consegue inspecionar sem decodificar a imagem.
   Desligar a mistura ali deixaria as folhas como retângulos opacos.

   O CRITÉRIO É CONSERVADOR: só mexe onde a opacidade é 1 E não há mapa de
   alfa próprio. Material de vidro de verdade — a bateria tem sete, com
   opacidade 0,1 — mantém as duas passadas, porque ali a ordem das faces é
   visível e custa só 1.120 triângulos.                                    */
export function corrigirPassadaDupla(raiz){
  let malhas = 0, triangulos = 0;
  raiz.traverse(o => {
    if (!o.isMesh || !o.material || !o.geometry) return;
    let mexeu = false;
    for (const mat of [].concat(o.material)){
      if (!mat || mat.transparent !== true) continue;
      if (mat.side !== THREE.DoubleSide) continue;
      if (mat.forceSinglePass === true) continue;
      /* Transparência de verdade fica como está. */
      if (mat.opacity !== 1 || mat.alphaMap) continue;
      mat.forceSinglePass = true;
      mat.needsUpdate = true;
      mexeu = true;
    }
    if (mexeu){
      malhas++;
      const g = o.geometry;
      triangulos += (g.index ? g.index.count : (g.attributes.position?.count || 0)) / 3;
    }
  });
  if (malhas){
    console.info(`[cena] passada dupla desligada em ${malhas} malhas`
      + ` — ${Math.round(triangulos).toLocaleString('pt-BR')} triângulos`
      + ' por quadro, por olho, que eram desenhados de graça');
  }
  return { malhas, triangulos: Math.round(triangulos) };
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

/** Carrega o cenário.
 *  Falha não é fatal: o jogo roda sem ele — e por isso `aoTerminar` é chamado
 *  nos DOIS caminhos, com o modelo ou com `null`. Quem espera o cenário para
 *  agir (a captura do ambiente, logo abaixo) precisa saber que ele não vem,
 *  em vez de esperar para sempre.
 *  @param {(cenario:THREE.Object3D|null)=>void} [aoTerminar] */
export function carregarCenario(aoTerminar){
  loader.load(CENARIO.url,
    (gltf) => {
      const m = gltf.scene;
      encaixarCenario(m);
      m.traverse(o => { if (o.isMesh){ o.castShadow = false; o.receiveShadow = false; } });
      afinarTexturas(m);
      corrigirPassadaDupla(m);
      /* Nome explicito: e por ele que desempenho.js separa o custo do cenario
         do custo da bateria. Sem nome, os dois viram um numero so. */
      m.name = 'cenario';
      scene.add(m);
      if (aoTerminar) aoTerminar(m);
    },
    undefined,
    (err) => {
      console.warn('[cena] cenário não carregou — seguindo sem ele', err);
      if (aoTerminar) aoTerminar(null);
    },
  );
}

/* ======================= O AMBIENTE VEM DA PRÓPRIA CENA ==================
   Seis faces renderizadas UMA vez da posição do kit, viradas em mapa de
   ambiente pelo PMREM. Zero download, e nada por quadro depois da carga.

   Por que não um HDRI: engorda de 1 a 4 MB o que se está tentando emagrecer.
   Por que não gradiente procedural: melhor que estúdio branco, mas continua
   sendo um lugar que não existe. Aqui o prato reflete a rocha, os
   amplificadores e a cor do céu que estão de fato em volta dele.

   O QUE NÃO ENTRA NA CAPTURA. Só o cenário e as luzes. Sai o kit (que
   refletiria a si mesmo a partir de um ponto só, e ainda pagaria 212 mil
   triângulos vezes seis), saem os discos e anéis coloridos das zonas, os
   rótulos, os painéis, a mancha de sombra, a pista e o grupo do jogador com
   as baquetas. LUZ NÃO SE ESCONDE: `visible = false` numa luz a tira do
   cálculo, e a captura sairia preta.

   A NÉVOA TEM DE SAIR NO MEIO. Ela é 16–40 m e o cenário tem 26 × 32 × 27 m,
   então as bordas dele caem bem dentro da faixa: capturar com névoa ligada
   assa o cinza `0x2a3446` em quase todo o cubo e o resultado fica PIOR que o
   estúdio branco — um borrão uniforme reflete pior que uma sala errada.

   O AMBIENTE ANTERIOR TAMBÉM SAI. Sem isso a captura inclui o reflexo velho
   já assado na rocha, e uma segunda chamada se alimentaria da primeira. Como
   o resultado fica um pouco mais escuro que o que está na tela, a
   compensação é o `envMapIntensity` do config — que é onde ela deve estar,
   e não escondida aqui dentro.                                            */
export function gerarAmbienteDaCena(){
  if (!AMBIENTE.ligado){
    console.info('[cena] ?amb=0 — ambiente segue no gradiente provisório');
    return null;
  }

  /* Seis renders num quadro só. Fora do VR é um engasgo que ninguém vê,
     porque acontece atrás da tela de carregamento. Dentro de uma sessão é um
     tranco na cabeça de quem está de headset — e o `CubeCamera.update()`
     ainda desliga o `xr.enabled` no meio do caminho para conseguir
     renderizar. Se o cenário chegar com o jogador já em VR, espera ele sair. */
  if (renderer.xr.isPresenting){
    const depois = () => { renderer.xr.removeEventListener('sessionend', depois);
                           gerarAmbienteDaCena(); };
    renderer.xr.addEventListener('sessionend', depois);
    console.info('[cena] captura do ambiente adiada — sessão VR em curso');
    return null;
  }

  const cenario = scene.getObjectByName('cenario');
  if (!cenario){
    console.warn('[cena] sem cenário na cena — ambiente segue no gradiente');
    return null;
  }

  const t0 = performance.now();

  const escondidos = [];
  for (const o of scene.children){
    if (o === cenario || o.isLight || !o.visible) continue;
    o.visible = false; escondidos.push(o);
  }
  const nevoaAntes = scene.fog;         scene.fog = null;
  const envAntes   = scene.environment; scene.environment = null;
  const fundoAntes = scene.background;
  if (AMBIENTE.corDoCeu != null) scene.background = new THREE.Color(AMBIENTE.corDoCeu);

  /* `near` 0,1 porque nada perto sobrou visível; `far` 100 cobre com folga os
     ~32 m do cenário. HalfFloat para o PMREM receber a faixa alta sem
     estourar: o céu é bem mais claro que a rocha e é ele que dá o brilho da
     borda do prato. */
  const alvo = new THREE.WebGLCubeRenderTarget(AMBIENTE.resolucao,
    { type: THREE.HalfFloatType });
  const camCubo = new THREE.CubeCamera(.1, 100, alvo);
  camCubo.position.set(0, AMBIENTE.altura, 0);
  camCubo.update(renderer, scene);

  const rt = pmrem.fromCubemap(alvo.texture);
  alvo.dispose();

  scene.fog = nevoaAntes;
  scene.environment = envAntes;
  scene.background = fundoAntes;
  for (const o of escondidos) o.visible = true;

  trocarAmbiente(rt);
  console.info(`[cena] ambiente gerado da própria cena em`
    + ` ${Math.round(performance.now() - t0)} ms`
    + ` — ${AMBIENTE.resolucao}² por face, câmera em y=${AMBIENTE.altura} m,`
    + ` céu 0x${(AMBIENTE.corDoCeu ?? 0).toString(16).padStart(6, '0')}`);
  return rt.texture;
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
