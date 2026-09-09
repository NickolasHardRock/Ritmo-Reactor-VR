/* ============================================================================
   bichos.js — o indicador de nota que desce sobre a própria peça.

   POR QUE ISSO SUBSTITUI A PISTA. A pista de notas ficava acima da bateria,
   longe dela. No monitor dá para acompanhar as duas com o canto do olho; em
   VR não, porque virar o olho custa virar a cabeça — e a limitação já estava
   anotada no README. Trazendo a indicação para cima do tambor, o olhar fica
   onde as mãos estão.

   AGORA É UMA CAVEIRA POR PEÇA, e a cor dela é a cor da peça em `PECAS`.
   Antes era um bicho só para as sete, e a peça se distinguia só pela posição.
   Isso obriga a mudança estrutural abaixo.

   UMA MALHA POR PEÇA, NÃO UMA PARA TODAS. `InstancedMesh` desenha N cópias
   numa chamada — mas de UMA geometria e UM material. Sete modelos com sete
   texturas não cabem num só, então são sete instâncias, cada uma com o seu
   `count`.

   E ISSO NÃO CUSTA SETE DRAW CALLS. O `renderInstances` do WebGLRenderer
   começa com `if (primcount === 0) return`: peça sem nota na tela não emite
   desenho. O custo que sobra é de CPU (preparar o material), não de GPU. Na
   prática o número de chamadas é o número de peças COM nota visível, que num
   compasso normal é uma ou duas.

   O QUE ISSO CUSTA DE VERDADE é VRAM e download: 7 × 1,2 MB de textura
   contra 1,2 MB de antes, e +3,6 MB no carregamento inicial.

   O BICHO NÃO TEM ANIMAÇÃO. Os arquivos não trazem esqueleto nem clipe. A
   vida vem por código: flutuar, girar devagar e achatar no impacto. Sai mais
   barato que animação de verdade e não depende do arquivo.

   O CAMINHO É INCLINADO, não vertical. Descer reto colocaria o nascimento
   acima da linha dos olhos de quem joga em pé, e o jogador voltaria a olhar
   para cima — o problema que essa mudança existe para resolver. Então ele
   nasce em cima E À FRENTE, e vem na diagonal até a pele.
   ========================================================================== */

import * as THREE from 'three';
import { loader, afinarTexturas } from './cena.js';
import { PECAS } from './config.js';

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
   para o bicho marcar o alvo sem esconder o alvo.

   ATENÇÃO AO QUE ESTE NÚMERO MEDE. A normalização abaixo usa o MAIOR eixo da
   caixa envolvente. No fantasma antigo o maior eixo era a cabeça; nas
   caveiras é chifre-a-chifre. Com o mesmo 0,15 o crânio lê MENOR do que o
   fantasma lia, porque parte da medida foi para o chifre. Se no headset
   parecer pequeno demais, é aqui que se mexe — algo entre 0,18 e 0,20. */
const TAMANHO = 0.15;

/* Teto de bichos simultâneos, somando todas as peças. Cada malha é alocada
   com esse tamanho porque, no limite, todas as notas visíveis podem ser da
   mesma peça (um rufo de caixa faz exatamente isso). São 28×16 floats por
   peça — 1,8 KB cada, irrelevante perto de errar para menos e ver nota
   sumir. */
const MAX = 28;

/* id da peça → entrada. Duas peças PODEM apontar para a mesma entrada,
   quando uma delas caiu na reserva; por isso o contador vive na entrada e
   não numa tabela paralela indexada por peça. */
const porPeca = new Map();
/* As entradas distintas, para varrer sem repetir a que está compartilhada. */
const entradas = [];

const molde = new THREE.Object3D();

/** Extrai a malha do gltf e devolve a entrada pronta, já no pai.
 *  Os arquivos passaram por join(): é uma primitiva só. Pego a geometria e o
 *  material dela e jogo o resto fora — o InstancedMesh não usa a hierarquia. */
function montar(gltf, paiDoKit){
  let fonte = null;
  gltf.scene.traverse(o => { if (o.isMesh && !fonte) fonte = o; });
  if (!fonte) return null;
  afinarTexturas(gltf.scene);

  /* Normaliza o tamanho aqui, na geometria, e não na escala de cada cópia:
     assim a escala de instância fica livre para a animação de achatar e
     crescer, sem ter de carregar o fator de conversão. */
  const geo = fonte.geometry;
  geo.computeBoundingBox();
  const t = geo.boundingBox.getSize(new THREE.Vector3());
  const k = TAMANHO / Math.max(t.x, t.y, t.z);
  geo.scale(k, k, k);
  geo.center();
  geo.computeBoundingSphere();

  /* O exportador do Meshy marca doubleSided em tudo. Numa caveira fechada
     isso só paga o dobro de trabalho de pixel: não existe face de dentro
     para ver. (O aviso do CLAUDE.md contra desligar doubleSided é sobre o
     CENÁRIO, onde parede é plano de uma face só e sumiria vista de dentro.
     Aqui o sólido é fechado, então não há esse risco.) */
  fonte.material.side = THREE.FrontSide;

  const malha = new THREE.InstancedMesh(geo, fonte.material, MAX);
  malha.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  malha.frustumCulled = false;      // a esfera envolvente não cobre as cópias
  malha.castShadow = malha.receiveShadow = false;
  malha.count = 0;
  paiDoKit.add(malha);

  const entrada = { malha, n: 0 };
  entradas.push(entrada);
  return entrada;
}

/** Carrega uma caveira por peça. Chamar uma vez, junto dos outros modelos.
 *  @param {THREE.Object3D} paiDoKit grupo que acompanha a altura da bateria
 *  @param {(ok:boolean, faltaram:string[])=>void} [aoTerminar] chamado quando
 *         TODAS as cargas terminaram, bem ou mal. */
export function carregarBichos(paiDoKit, aoTerminar){
  let restam = PECAS.length;
  const faltaram = [];

  /* Uma peça sem modelo não pode virar nota invisível — o bicho é o único
     aviso que o jogador tem. Então a primeira caveira que carregar vira
     reserva, e quem faltou passa a desenhar com ela. A cor sai errada; a
     nota continua aparecendo, que é o que não pode faltar. */
  const encerrar = () => {
    if (--restam > 0) return;
    if (faltaram.length && entradas.length){
      const reserva = entradas[0];
      for (const id of faltaram) porPeca.set(id, reserva);
      console.warn(`[bichos] sem modelo próprio: ${faltaram.join(', ')} —`
                 + ' desenhando com a caveira de reserva.');
    }
    aoTerminar?.(entradas.length > 0, faltaram);
  };

  for (const peca of PECAS){
    loader.load(`modelos/bicho_${peca.id}.glb`,
      (gltf) => {
        const entrada = montar(gltf, paiDoKit);
        if (entrada) porPeca.set(peca.id, entrada);
        else faltaram.push(peca.id);
        encerrar();
      },
      undefined,
      (err) => {
        console.warn(`[bichos] bicho_${peca.id}.glb não carregou`, err);
        faltaram.push(peca.id);
        encerrar();
      },
    );
  }
}

export function bichosProntos(){ return entradas.length > 0; }

/**
 * Posiciona um bicho por nota visível. Chamar a cada quadro.
 * @param {Array<{id:string,x:number,y:number,z:number,dt:number,semente:number}>} lista
 *        id da PEÇA (é ele que escolhe a caveira), posição da PELE em
 *        coordenadas do kit, tempo que falta, e uma semente por nota para as
 *        animações não ficarem em uníssono
 * @param {number} t relógio para as animações
 */
export function desenharBichos(lista, t){
  if (!entradas.length) return;

  for (const e of entradas) e.n = 0;

  const total = Math.min(lista.length, MAX);
  for (let i = 0; i < total; i++){
    const b = lista[i];
    const entrada = porPeca.get(b.id);
    if (!entrada || entrada.n >= MAX) continue;

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
    entrada.malha.setMatrixAt(entrada.n++, molde.matrix);
  }

  for (const e of entradas){
    e.malha.count = e.n;
    /* Só sobe para a GPU o que mudou. Peça parada em zero não paga nada. */
    if (e.n) e.malha.instanceMatrix.needsUpdate = true;
  }
}

/** Some com todos — fim de fase, ou partida reiniciada. */
export function limparBichos(){
  for (const e of entradas){ e.n = 0; e.malha.count = 0; }
}
