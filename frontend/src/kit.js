/* ============================================================================
   kit.js — a bateria: modelo, zonas de acerto, baquetas e ajuste de altura.

   "Zona de acerto" é um disco INVISÍVEL (quase) sobre cada pele. O modelo
   3D é decoração; quem o jogo testa é o disco. Isso desacopla a jogabilidade
   da malha — trocar o modelo da bateria não quebra a detecção, só exige
   remedir as posições em config.js.
   ========================================================================== */

import * as THREE from 'three';
import { PECAS, URL_BATERIA, ESCALA_KIT, ALTURA_INICIAL_KIT, APOIO_KIT,
         AMBIENTE, BAQUETA } from './config.js';
import { registrarPecasMoveis } from './balanco.js';
import { scene, loader, afinarTexturas, placa, renderer, player,
         pistaG, ALTURA_PISTA, aoTrocarAmbiente } from './cena.js';

export const kit = new THREE.Group(); kit.name = 'bateria'; scene.add(kit);

/* Mancha de sombra sob a bateria.
   PERFORMANCE (Quest): a bateria NÃO entra no mapa de sombra. Ela sozinha
   tem 86 mil triângulos; deixá-la projetar sombra dobrava o custo de
   geometria por quadro — e em VR tudo é desenhado duas vezes, uma por olho.
   A ancoragem visual vem desta mancha, que custa um quad.                 */
const mancha = (() => {
  const cv = document.createElement('canvas'); cv.width = cv.height = 256;
  const c = cv.getContext('2d');
  const g = c.createRadialGradient(128,128,10,128,128,124);
  g.addColorStop(0,'rgba(0,0,0,.62)');
  g.addColorStop(.55,'rgba(0,0,0,.28)');
  g.addColorStop(1,'rgba(0,0,0,0)');
  c.fillStyle = g; c.fillRect(0,0,256,256);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 0.95),
    new THREE.MeshBasicMaterial({ map:new THREE.CanvasTexture(cv),
                                  transparent:true, depthWrite:false }));
  m.rotation.x = -Math.PI/2; m.position.set(0, .012, -.05);
  return m;
})();
mancha.name = 'mancha'; scene.add(mancha);

/* --------------------------------------------------- zonas de acerto ----- */
export const zonas = [];
for (const p of PECAS){
  const g = new THREE.Group();
  g.position.set(p.x, p.y, p.z);

  const disco = new THREE.Mesh(
    new THREE.CylinderGeometry(p.r, p.r, .008, 40),
    new THREE.MeshBasicMaterial({ color:p.cor, transparent:true, opacity:.10,
                                  depthWrite:false, side:THREE.DoubleSide }));
  g.add(disco);

  const anel = new THREE.Mesh(
    new THREE.TorusGeometry(p.r, .008, 6, 48),
    new THREE.MeshBasicMaterial({ color:p.cor, transparent:true, opacity:.35 }));
  anel.rotation.x = Math.PI/2; g.add(anel);

  const rotulo = placa(.17, .045, 256);
  rotulo.position.y = .215; rotulo.material.opacity = .72;
  rotulo.userData.pintar(p.nome, {
    tam:.72, cor:'#'+p.cor.toString(16).padStart(6,'0'), fundo:'rgba(10,14,22,.72)' });
  g.add(rotulo);

  kit.add(g);
  zonas.push({ p, grupo:g, disco, anel, rotulo, brilho:0, ultima:-9, destaque:false });
}

/** Rótulos só enquanto o jogador ainda está aprendendo a bateria. Depois da
 *  calibração viram poluição — ainda mais em VR, onde o rosto fica a 60 cm
 *  dos pratos. */
export function mostrarRotulos(v){ zonas.forEach(z => { z.rotulo.visible = v; }); }

/** Pisca o anel da peça que o jogo está pedindo. `null` apaga todos. */
export function destacar(id){
  zonas.forEach(z => {
    const on = z.p.id === id;
    z.anel.material.opacity = on ? 1 : .35;
    z.destaque = on;
  });
}

/** Animação de resposta à batida: a pele acende e afunda de leve. */
export function animarZonas(dt, t){
  for (const z of zonas){
    if (z.brilho > 0){
      z.brilho = Math.max(0, z.brilho - dt*3.2);
      z.disco.material.opacity = .10 + z.brilho*.5;
      z.grupo.position.y = z.p.y - z.brilho*.012;
    }
    if (z.destaque) z.anel.material.opacity = .55 + Math.sin(t*7)*.45;
  }
}

/* ----------------------------------------------------- altura do kit -----
   O modelo vem montado baixo; ALTURA_INICIAL_KIT o coloca na altura de quem
   joga em pé. NÃO existe estrado: a bateria pousa direto na pedra do cenário.

   A ALTURA DO KIT É FIXA DESDE 09/09, e é justamente por causa da pedra.
   `ajustarAltura` morava aqui e movia `kit.position.y`; descer a bateria a
   enterrava no chão, que foi o defeito visto no teste do Quest. Quem se
   ajusta agora é o jogador — `ajustarVisao`, em cena.js.

   Consequência boa de graça: `deteccao.js` soma `kit.position.y` em toda
   batida e esse valor deixou de mudar no meio da partida. */
kit.position.y = ALTURA_INICIAL_KIT;
pistaG.position.y = ALTURA_PISTA + ALTURA_INICIAL_KIT;
mancha.position.y = ALTURA_INICIAL_KIT + .012;

/* ================================ O BRILHO DE METAL DOS PRATOS ===========
   `envMapIntensity` é o número que decide se um prato lê como metal ou como
   plástico perolado. Para poder mexer nele SÓ nos pratos, primeiro é preciso
   que os pratos tenham material próprio — e no scan eles não têm.

   O `bateria_pratos.glb` traz quatro nodes (`kit_resto`, `ride`, `chimbal`,
   `crash`) e UM material para os quatro. É consequência de como eles foram
   separados: o `cortar-peca.mjs` recorta GEOMETRIA a partir de uma malha
   fundida, e geometria recortada continua apontando para o material de
   origem. Sem o clone abaixo, subir o brilho dos pratos subia junto os
   163.903 triângulos do corpo do kit, as ferragens e a caveira do bumbo.

   O clone é barato: `Material.clone()` copia os parâmetros e REAPROVEITA as
   referências de textura, então os três JPEG 2048² continuam sendo três na
   VRAM, não seis. Os nodes já eram malhas separadas, então também não nasce
   draw call nova — e como os defines do shader não mudam, os dois materiais
   compartilham o mesmo programa compilado.

   Só clona se o material dos pratos for MESMO compartilhado com o resto. Se
   um dia o modelo vier com material por peça, esta função sai do caminho
   sozinha em vez de reunir de volta o que já estava separado.             */
const PRATOS = new Set(['ride', 'crash', 'chimbal']);

function separarMaterialDosPratos(raiz){
  const pratos = [], resto = [];
  raiz.traverse(o => { if (o.isMesh) (PRATOS.has(o.name) ? pratos : resto).push(o); });
  if (!pratos.length) return 0;

  const usadoNoResto = new Set(
    resto.flatMap(o => [].concat(o.material)).filter(Boolean).map(m => m.uuid));

  const clones = new Map();   // uuid do original -> clone dos pratos
  let trocados = 0;
  for (const o of pratos){
    const mat = [].concat(o.material)[0];
    if (!mat || !usadoNoResto.has(mat.uuid)) continue;   // já é só dos pratos
    let c = clones.get(mat.uuid);
    if (!c){
      c = mat.clone();
      c.name = (mat.name || 'material') + '_pratos';
      clones.set(mat.uuid, c);
    }
    o.material = c;
    trocados++;
  }
  return trocados;
}

/* O `envMapIntensity` SÓ VALE PARA O `envMap` DO PRÓPRIO MATERIAL. Quando o
   reflexo vem do `scene.environment`, o número é simplesmente ignorado — e
   ignorado em silêncio, que é o pior jeito de uma opção não funcionar.

   Medido aqui, na região do ride, com ambiente branco e todo o resto igual:
   `envMapIntensity` 0, 1, 4 e 16 deram TODOS 61,16 de luminância média. Com
   a mesma textura copiada para `material.envMap`, os mesmos valores deram
   17,88 / 18,37 / 19,83. Aí sim o número faz alguma coisa.

   Por isso esta função copia a textura do ambiente para o `envMap` de cada
   material do kit. Não custa VRAM — é a mesma textura, por referência — e é
   o que permite ter um número para os pratos e outro para o corpo do kit.
   (`scene.environmentIntensity` também funciona e foi medido junto, mas é um
   número só para a cena inteira, cenário incluído.)

   Chamada depois de `separarMaterialDosPratos`, senão o segundo número
   sobrescreve o primeiro: até ali é tudo o mesmo material.                */
export function aplicarIntensidadeAmbiente(raiz, ambiente = scene.environment){
  raiz.traverse(o => {
    if (!o.isMesh) return;
    const i = PRATOS.has(o.name) ? AMBIENTE.intensidadePratos : AMBIENTE.intensidadeKit;
    for (const m of [].concat(o.material)){
      if (!m || !('envMapIntensity' in m)) continue;
      if (m.envMap !== ambiente){ m.envMap = ambiente; m.needsUpdate = true; }
      m.envMapIntensity = i;
    }
  });
}

/* ------------------------------------------------- modelo da bateria ----- */
/** @param {(ok:boolean)=>void} aoTerminar chamado com true/false */
export function carregarBateria(aoTerminar, aoProgredir){
  loader.load(URL_BATERIA,
    (gltf) => {
      const m = gltf.scene;
      m.scale.setScalar(ESCALA_KIT);
      /* SEM rotação: este modelo já vem com o lado do baterista em +Z, que é
         onde o jogador fica (POSTO, em cena.js). O modelo anterior vinha ao
         contrário e exigia 180° — herdar aquele giro aqui colocava o jogador
         ATRÁS da bateria, olhando para os cascos, com o bumbo entre ele e as
         peles e o kit espelhado (chimbal à direita, ride à esquerda).     */
      /* Apoio por CONSTANTE, não pelo bounding box. O corte da base do scan
         deixa franjas alguns centímetros abaixo das sapatas; obedecer ao
         bbox faria o kit inteiro pairar sobre elas — e deslocaria em
         silêncio as sete alturas medidas em config.js.                   */
      m.position.y = APOIO_KIT * ESCALA_KIT;
      m.traverse(o => { if (o.isMesh){
        o.castShadow = false; o.receiveShadow = true; o.userData.kit = true; } });
      afinarTexturas(m);
      const pratosSeparados = separarMaterialDosPratos(m);
      /* O ambiente definitivo pode chegar depois deste modelo. Reagir à troca
         sai mais barato e mais seguro que tentar ordenar dois carregamentos. */
      aoTrocarAmbiente(tex => aplicarIntensidadeAmbiente(m, tex));
      kit.add(m);
      /* Quais peças o GLB trouxe separadas. Log de propósito: é a única
         forma de saber, sem abrir o arquivo, se o corte de uma peça nova
         chegou ao jogo. */
      const moveis = registrarPecasMoveis(m, zonas);
      console.info(`[kit] peças que balançam: ${moveis.join(', ') || 'nenhuma'}`);
      console.info(`[kit] material dos pratos: ${pratosSeparados
        ? pratosSeparados + ' malhas clonadas do material do kit'
        : 'já era próprio, nada a clonar'}`
        + ` — envMapIntensity ${AMBIENTE.intensidadePratos} nos pratos,`
        + ` ${AMBIENTE.intensidadeKit} no resto`);
      aoTerminar(true);
    },
    aoProgredir,
    (err) => { console.error('[kit] bateria.glb não carregou', err); aoTerminar(false); },
  );
}

/* ===================================================== AS BAQUETAS (VR) ==
   Cada controle vira uma baqueta. O que importa para o jogo é a posição da
   PONTA a cada quadro — e a posição dela no quadro ANTERIOR (ver deteccao.js).

   DOIS ESPAÇOS, E A DIFERENÇA ENTRE ELES ERA O DEFEITO. O WebXR entrega duas
   poses por controle:

     targetRaySpace  (`getController`)      para onde o controle APONTA
     gripSpace       (`getControllerGrip`)  como a MÃO segura um objeto

   O −Z do gripSpace é definido pela especificação como a direção de uma
   vareta reta segurada na mão. É literalmente a definição de baqueta. A
   haste pendurava no targetRaySpace, que é a mira — daí ela sair reta demais,
   alinhada com o ponteiro em vez de com o punho.

   O RAIO DOS BOTÕES CONTINUA NO `ctrl`, e é o certo: ali o que se quer é
   justamente a mira (ver menu3d.js). Cada espaço no seu papel.

   A inclinação e a convergência vêm do `BAQUETA` do config.js, ajustáveis
   pela URL, porque ângulo de baqueta é decisão de olho e não de cálculo.
   ========================================================================= */
const GRAU = Math.PI / 180;
export const baquetas = [];

/** Aplica os dois ângulos de gosto na haste. Separada porque a mão só se
 *  sabe no evento `connected` — a convergência depende de qual é qual. */
function inclinarBaqueta(b){
  const extra = b.noPunho ? 0 : BAQUETA.compensacaoDoRaio;
  const conv  = BAQUETA.convergencia * GRAU;
  b.haste.rotation.set(
    -(BAQUETA.inclinacao + extra) * GRAU,          // ponta para baixo
    b.mao === 'left' ? -conv : b.mao === 'right' ? conv : 0,
    0);
}

for (let i = 0; i < 2; i++){
  const ctrl  = renderer.xr.getController(i);       // mira: eventos e ponteiro
  const punho = renderer.xr.getControllerGrip(i);   // mão: a baqueta
  player.add(ctrl);                        // a mão vive no player, não na cena
  player.add(punho);

  /* Corpo e ponta num grupo só: assim a inclinação é UMA rotação, e a ponta
     acompanha sem ninguém precisar recalcular onde ela foi parar. */
  const haste = new THREE.Group(); haste.name = 'baqueta';

  const corpo = new THREE.Mesh(
    new THREE.CylinderGeometry(.008, .012, BAQUETA.comprimento, 10),
    new THREE.MeshStandardMaterial({ color:0xd9c9a8, roughness:.55 }));
  corpo.rotation.x = -Math.PI/2;
  corpo.position.z = -BAQUETA.comprimento/2;
  corpo.castShadow = true;
  haste.add(corpo);

  const ponta = new THREE.Mesh(
    new THREE.SphereGeometry(.016, 12, 12),
    new THREE.MeshStandardMaterial({ color:0xffffff, emissive:0x334455, roughness:.4 }));
  ponta.position.z = -BAQUETA.comprimento;
  haste.add(ponta);

  const b = {
    ctrl, punho, haste, ponta,
    base: ctrl,          // de quem a haste pendura AGORA — ver deteccao.js
    noPunho: false,
    atual: new THREE.Vector3(), anterior: new THREE.Vector3(),
    temAnterior: false, mao: null,
  };
  ctrl.add(haste);       // ponto de partida seguro até o controle se anunciar
  inclinarBaqueta(b);
  baquetas.push(b);

  /* O `connected` é o único lugar que sabe DUAS coisas de que a haste
     precisa: qual mão é (para a convergência) e se este controle expõe
     `gripSpace` (mão rastreada, por exemplo, pode não expor). Sem punho, a
     haste fica na mira mesmo, com a compensação — melhor que uma baqueta
     parada no chão. */
  ctrl.addEventListener('connected', e => {
    b.mao = e.data.handedness;
    b.noPunho = BAQUETA.usarPunho && !!e.data.gripSpace;
    b.base = b.noPunho ? punho : ctrl;
    if (haste.parent !== b.base) b.base.add(haste);
    inclinarBaqueta(b);
  });
}
