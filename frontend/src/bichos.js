/* ============================================================================
   bichos.js — o indicador de nota que desce sobre a própria peça.

   POR QUE ISSO SUBSTITUI A PISTA. A pista de notas ficava acima da bateria,
   longe dela. No monitor dá para acompanhar as duas com o canto do olho; em
   VR não, porque virar o olho custa virar a cabeça — e a limitação já estava
   anotada no README. Trazendo a indicação para cima do tambor, o olhar fica
   onde as mãos estão.

   UMA SÓ MALHA PARA TODOS. `InstancedMesh` desenha as cópias numa chamada e
   com uma geometria só. São 3.480 triângulos compartilhados: oito bichos na
   tela custam 27 mil triângulos e UM draw call, contra oito. A textura
   também é uma para todos — 1,2 MB de VRAM, contados uma vez.

   O BICHO NÃO TEM ANIMAÇÃO. O arquivo não traz esqueleto nem clipe. A vida
   vem por código: flutuar, girar devagar e achatar no impacto. Sai mais
   barato que animação de verdade e não depende do arquivo.

   O CAMINHO É INCLINADO, não vertical. Descer reto colocaria o nascimento
   acima da linha dos olhos de quem joga em pé, e o jogador voltaria a olhar
   para cima — o problema que essa mudança existe para resolver. Então ele
   nasce em cima E À FRENTE, e vem na diagonal até a pele.
   ========================================================================== */

import * as THREE from 'three';
import { loader, afinarTexturas } from './cena.js';

/* Quanto tempo de aviso o jogador tem. Menos que 1 s não dá para levar a
   baqueta; muito mais e o bicho nasce longe demais para caber no campo de
   visão sem subir a cabeça. */
export const ANTECEDENCIA_BICHO = 1.5;

/* Sobe MUITO mais do que avança, e o motivo é o espaço disponível: a caixa
   fica em z = 0,242 e o jogador em z = 0,62 (POSTO, em cena.js). São 38 cm
   de folga. Avançar mais que isso faz o bicho nascer ATRÁS do jogador e
   passar voando por ele — foi o que aconteceu na primeira tentativa.

   A inclinação de 18 cm serve para a fila não virar uma torre reta que tapa
   as peças de trás; mais que isso não cabe.                              */
const ALTURA  = 0.55;      // acima da pele, onde ele nasce
const AFRENTE = 0.18;      // e na direção do jogador — limitado pelo POSTO
/* 15 cm: menor que a pele de qualquer peça (a caixa tem 35 cm de diâmetro),
   para o bicho marcar o alvo sem esconder o alvo. */
const TAMANHO = 0.15;
const MAX     = 28;        // teto de bichos simultâneos

let malha = null;
const molde = new THREE.Object3D();
const cor = new THREE.Color();

/** Carrega e monta a instância. Chamar uma vez, junto dos outros modelos.
 *  @param {THREE.Object3D} paiDoKit grupo que acompanha a altura da bateria */
export function carregarBichos(paiDoKit, aoTerminar){
  loader.load('modelos/bicho.glb',
    (gltf) => {
      /* O arquivo passou por join(): é uma primitiva só. Pego a geometria e
         o material dela e jogo o resto fora — o InstancedMesh não usa a
         hierarquia, só a malha. */
      let fonte = null;
      gltf.scene.traverse(o => { if (o.isMesh && !fonte) fonte = o; });
      if (!fonte){ aoTerminar?.(false); return; }
      afinarTexturas(gltf.scene);

      /* Normaliza o tamanho aqui, na geometria, e não na escala de cada
         cópia: assim a escala de instância fica livre para a animação de
         achatar e crescer, sem ter de carregar o fator de conversão. */
      fonte.geometry.computeBoundingBox();
      const t = fonte.geometry.boundingBox.getSize(new THREE.Vector3());
      const k = TAMANHO / Math.max(t.x, t.y, t.z);
      fonte.geometry.scale(k, k, k);
      fonte.geometry.center();
      fonte.geometry.computeBoundingSphere();

      malha = new THREE.InstancedMesh(fonte.geometry, fonte.material, MAX);
      malha.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      malha.frustumCulled = false;      // a esfera envolvente não cobre as cópias
      malha.castShadow = malha.receiveShadow = false;
      malha.count = 0;
      paiDoKit.add(malha);
      aoTerminar?.(true);
    },
    undefined,
    (err) => { console.warn('[bichos] bicho.glb não carregou', err); aoTerminar?.(false); },
  );
}

export function bichosProntos(){ return !!malha; }

/**
 * Posiciona um bicho por nota visível. Chamar a cada quadro.
 * @param {Array<{x:number,y:number,z:number,dt:number,semente:number}>} lista
 *        posição da PELE em coordenadas do kit, tempo que falta, e uma
 *        semente por nota para as animações não ficarem em uníssono
 * @param {number} t relógio para as animações
 */
export function desenharBichos(lista, t){
  if (!malha) return;
  const n = Math.min(lista.length, MAX);
  for (let i = 0; i < n; i++){
    const b = lista[i];
    /* 0 quando chega na pele, 1 quando nasce. */
    const p = THREE.MathUtils.clamp(b.dt / ANTECEDENCIA_BICHO, 0, 1);

    molde.position.set(b.x, b.y + ALTURA * p, b.z + AFRENTE * p);

    /* Flutuar e girar. A amplitude cai perto da pele: nos últimos instantes
       o jogador está mirando, e alvo que mexe atrapalha. */
    const s = b.semente;
    molde.position.y += Math.sin(t * 3.1 + s) * 0.012 * p;
    molde.position.x += Math.sin(t * 2.3 + s * 1.7) * 0.010 * p;
    molde.rotation.set(0, Math.sin(t * 0.9 + s) * 0.5, Math.sin(t * 2.6 + s) * 0.07);

    /* Nasce pequeno e cresce nos primeiros 20% do caminho — aparecer do
       tamanho final, do nada, lê como falha de desenho. */
    const cresce = THREE.MathUtils.smoothstep(1 - p, 0, 0.2);
    /* E achata de leve ao encostar, como se pousasse. */
    const achata = 1 - THREE.MathUtils.smoothstep(1 - p, 0.88, 1) * 0.22;
    molde.scale.set(cresce * (1 + (1 - achata) * 0.5), cresce * achata, cresce);

    molde.updateMatrix();
    malha.setMatrixAt(i, molde.matrix);
  }
  malha.count = n;
  malha.instanceMatrix.needsUpdate = true;
}

/** Some com todos — fim de fase, ou partida reiniciada. */
export function limparBichos(){
  if (malha) malha.count = 0;
}
