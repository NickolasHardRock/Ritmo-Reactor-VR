/* ============================================================================
   kit.js — a bateria: modelo, zonas de acerto, baquetas e ajuste de altura.

   "Zona de acerto" é um disco INVISÍVEL (quase) sobre cada pele. O modelo
   3D é decoração; quem o jogo testa é o disco. Isso desacopla a jogabilidade
   da malha — trocar o modelo da bateria não quebra a detecção, só exige
   remedir as posições em config.js.
   ========================================================================== */

import * as THREE from 'three';
import { PECAS, URL_BATERIA, ESCALA_KIT, ALTURA_INICIAL_KIT, APOIO_KIT } from './config.js';
import { scene, loader, afinarTexturas, placa, renderer, player,
         pistaG, ALTURA_PISTA } from './cena.js';

export const kit = new THREE.Group(); scene.add(kit);

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
scene.add(mancha);

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
   joga em pé. O ajuste do jogador acontece a partir daí, não do chão.

   NÃO existe estrado: a bateria pousa direto na pedra do cenário. Só a
   mancha de sombra fica no chão, e ela NÃO acompanha o ajuste de altura —
   sombra não sobe junto com o objeto.                                    */
let alturaKit = ALTURA_INICIAL_KIT;
kit.position.y = alturaKit;
pistaG.position.y = ALTURA_PISTA + alturaKit;
mancha.position.y = ALTURA_INICIAL_KIT + .012;

/** Pessoas têm alturas diferentes e a bateria precisa cair na altura da
 *  cintura de quem joga. Alavanca direita ↑↓ em VR, `[` `]` no teclado. */
export function ajustarAltura(d, aoMudar){
  alturaKit = THREE.MathUtils.clamp(alturaKit + d,
    ALTURA_INICIAL_KIT - .45, ALTURA_INICIAL_KIT + .45);
  kit.position.y = alturaKit;
  pistaG.position.y = ALTURA_PISTA + alturaKit;
  if (aoMudar) aoMudar(alturaKit);
  return alturaKit;
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
      kit.add(m);
      aoTerminar(true);
    },
    aoProgredir,
    (err) => { console.error('[kit] bateria.glb não carregou', err); aoTerminar(false); },
  );
}

/* ===================================================== AS BAQUETAS (VR) ==
   Cada controle vira uma baqueta. O que importa para o jogo é a posição da
   PONTA a cada quadro — e a posição dela no quadro ANTERIOR (ver deteccao.js).
   ========================================================================= */
const COMP_BAQUETA = 0.38;
export const baquetas = [];

for (let i = 0; i < 2; i++){
  const ctrl = renderer.xr.getController(i);
  player.add(ctrl);                        // a mão vive no player, não na cena

  const corpo = new THREE.Mesh(
    new THREE.CylinderGeometry(.008, .012, COMP_BAQUETA, 10),
    new THREE.MeshStandardMaterial({ color:0xd9c9a8, roughness:.55 }));
  corpo.rotation.x = -Math.PI/2;
  corpo.position.z = -COMP_BAQUETA/2;
  corpo.castShadow = true;
  ctrl.add(corpo);

  const ponta = new THREE.Mesh(
    new THREE.SphereGeometry(.016, 12, 12),
    new THREE.MeshStandardMaterial({ color:0xffffff, emissive:0x334455, roughness:.4 }));
  ponta.position.z = -COMP_BAQUETA;
  ctrl.add(ponta);

  baquetas.push({
    ctrl, ponta,
    atual: new THREE.Vector3(), anterior: new THREE.Vector3(),
    temAnterior: false, mao: null,
  });
  ctrl.addEventListener('connected', e => { baquetas[i].mao = e.data.handedness; });
}
