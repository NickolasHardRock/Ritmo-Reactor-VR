/* ============================================================================
   deteccao.js — O CORAÇÃO DO JOGO.

   O PROBLEMA
   A 72 Hz, a ponta de uma baqueta a 5 m/s percorre 6,9 cm entre dois
   quadros. A pele de um tambor tem cerca de 1 cm. Perguntar "a ponta está
   encostando AGORA?" perde quase toda batida — e justamente as fortes, que
   são as mais rápidas.

   Medido, 7 peças, quadro de 1/72 s:

     velocidade   deslocamento   varrido   ingênuo
     1 m/s        1,4 cm         7/7       7/7
     2 m/s        2,8 cm         7/7       0/7
     5 m/s        6,9 cm         7/7       0/7
     12 m/s       16,7 cm        7/7       0/7

   A SOLUÇÃO
   Tratar o trajeto da ponta como um SEGMENTO entre o quadro anterior e o
   atual, e perguntar: esse segmento cruzou o plano da pele de cima para
   baixo, dentro do raio? Nenhuma batida escapa.
   ========================================================================== */

import * as THREE from 'three';
import { renderer, relogio } from './cena.js';
import { kit, zonas, baquetas } from './kit.js';

/** Intervalo mínimo entre duas batidas na MESMA peça. Sem isto, um único
 *  movimento registra várias vezes (RN03 — não contar duas vezes). */
const ANTI_REPIQUE = 0.07;   // segundos

/** Velocidade de descida que já conta como batida cheia (força = 1). */
const VEL_MAXIMA = 4.5;      // m/s

const _v = new THREE.Vector3();

/**
 * Testa o trajeto de UMA ponta (anterior -> atual) contra todas as peles.
 * Separada de `detectarBatidas` para poder ser exercitada por teste
 * automatizado, sem precisar de um headset.
 *
 * @param {object}  b        a baqueta { anterior, atual }
 * @param {number}  dt       segundos desde o quadro anterior
 * @param {Function} aoBater callback(zona, força)
 * @returns {string|null}    id da peça acertada, ou null
 */
export function processarPonta(b, dt, aoBater){
  const desceu = b.anterior.y - b.atual.y;      // quanto caiu neste quadro
  if (desceu <= 0.0004) return null;            // subindo ou parada

  let melhor = null, melhorT = 2;

  for (const z of zonas){
    const yPele = z.grupo.position.y + kit.position.y;

    // o segmento cruzou o plano da pele, de cima para baixo?
    if (!(b.anterior.y >= yPele && b.atual.y <= yPele)) continue;

    // t = fração do trajeto onde houve o cruzamento
    const t = (b.anterior.y - yPele) / desceu;
    // ponto exato do cruzamento, interpolado
    _v.lerpVectors(b.anterior, b.atual, t);

    const dx = _v.x - (z.grupo.position.x + kit.position.x);
    const dz = _v.z - (z.grupo.position.z + kit.position.z);
    if (dx*dx + dz*dz > z.p.r * z.p.r) continue;   // caiu fora do raio

    // se duas zonas se sobrepõem (Tom 1 e Tom 2 encostam), vence a que foi
    // cruzada primeiro no trajeto
    if (t < melhorT){ melhorT = t; melhor = z; }
  }
  if (!melhor) return null;

  const agora = relogio.elapsedTime;
  if (agora - melhor.ultima <= ANTI_REPIQUE) return null;
  melhor.ultima = agora;

  const vel = desceu / Math.max(dt, 1e-4);        // m/s de descida
  const força = THREE.MathUtils.clamp(vel / VEL_MAXIMA, .18, 1);
  aoBater(melhor, força);

  // retorno tátil: sem ele, bater no ar em VR é estranho
  const src = renderer.xr.getSession()?.inputSources;
  src?.[baquetas.indexOf(b)]?.gamepad?.hapticActuators?.[0]
     ?.pulse?.(THREE.MathUtils.clamp(vel / VEL_MAXIMA, .2, 1), 22);

  return melhor.p.id;
}

/** Roda uma vez por quadro, antes de qualquer outra coisa. */
export function detectarBatidas(dt, aoBater){
  if (!renderer.xr.isPresenting) return;
  for (const b of baquetas){
    b.ponta.getWorldPosition(b.atual);
    if (!b.temAnterior){ b.anterior.copy(b.atual); b.temAnterior = true; continue; }
    processarPonta(b, dt, aoBater);
    b.anterior.copy(b.atual);
  }
}

/* -------------------------------------------------------- ferramentas ----
   Usadas pelos testes automatizados (docs/testes.md).                     */

/** Simula uma baquetada: monta o segmento anterior->atual de um quadro
 *  inteiro a `vel` m/s e roda a MESMA detecção usada em VR. */
export function simularBatida(id, aoBater, vel = 4, dt = 1/72, desvio = 0){
  const z = zonas.find(z => z.p.id === id), b = baquetas[0];
  const y = z.grupo.position.y + kit.position.y, passo = vel * dt;
  const x = z.grupo.position.x + kit.position.x + desvio;
  const zz = z.grupo.position.z + kit.position.z;
  b.temAnterior = true;
  b.anterior.set(x, y + passo*0.5, zz);
  b.atual.set(   x, y - passo*0.5, zz);
  const r = processarPonta(b, dt, aoBater);
  b.anterior.copy(b.atual);
  return r;
}

/** A mesma batida, mas com a checagem INGÊNUA (ponto dentro do disco).
 *  Serve para medir quantas batidas o método antigo perderia. */
export function testeIngenuo(id, vel = 4, dt = 1/72){
  const z = zonas.find(z => z.p.id === id);
  const y = z.grupo.position.y + kit.position.y, passo = vel * dt;
  const pontaY = y + passo*0.5 - passo;    // posição no quadro seguinte
  return Math.abs(pontaY - y) < 0.01;      // "encostou" na pele?
}
