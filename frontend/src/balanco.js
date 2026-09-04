/* ============================================================================
   balanco.js — as peças reagem à batida, por física e não por clipe.

   POR QUE POR CÓDIGO. Animação pronta de um modelo 3D é um clipe fixo: toca
   sempre igual, na mesma amplitude, independente de o jogador ter encostado
   ou arrebentado. O que faz um kit em VR parar de parecer estátua é o prato
   inclinar QUANDO você bate e NA FORÇA que você bateu — e isso é uma equação,
   não um arquivo.

   O QUE PERMITIU ISTO. O `bateria.glb` é scan de fotogrametria: um node, uma
   mesh, uma primitiva. Não existia um objeto "prato" para girar. As peças
   foram recortadas da malha fundida por `ferramentas/cortar-peca.mjs`, com a
   geometria de cada uma movida para a própria origem — sem isso, girar o node
   varreria o prato pelo cenário em vez de inclinar no lugar.

   O MODELO FÍSICO é um oscilador amortecido, dois eixos independentes:

       a'' = -k·a - c·a'

   `k` dá a frequência (√k rad/s) e `c` o amortecimento. Impulso na batida
   entra como velocidade inicial, e o deslocamento máximo de um oscilador que
   recebe velocidade v é aproximadamente v/√k — foi assim que os números
   abaixo foram escolhidos, não por tentativa.

   POR PEÇA, e não um número só: prato de condução é grande e pesado, balança
   pouco e devagar; crash é fino e vai longe; chimbal está preso entre dois
   pratos por uma porca e quase não se move. Pele de tambor afunda milímetros
   e volta rápido — daí `eixo: 'y'`, que empurra para baixo em vez de inclinar.
   ========================================================================== */

import { PECAS } from './config.js';

/* dobra máxima de cada peça, em radianos, na força cheia; a frequência sai de
   `k` e o tempo de acalmar, de `c` */
const AJUSTE = {
  ride:    { k: 290, c: 3.4, dobra: 0.115, eixo: 'inclina' },
  crash:   { k: 210, c: 2.6, dobra: 0.165, eixo: 'inclina' },
  chimbal: { k: 520, c: 6.5, dobra: 0.045, eixo: 'inclina' },
  caixa:   { k: 900, c: 11,  dobra: 0.004, eixo: 'y' },
  tom1:    { k: 820, c: 10,  dobra: 0.005, eixo: 'y' },
  tom2:    { k: 820, c: 10,  dobra: 0.005, eixo: 'y' },
  surdo:   { k: 700, c: 9,   dobra: 0.006, eixo: 'y' },
};

/* Passo de integração com teto. Euler explícito estoura quando dt passa de
   2/√k — para o chimbal, o mais rígido, isso é 88 ms. Um engasgo de quadro
   ou uma volta de aba em segundo plano entrega dt de centenas de ms, e a
   peça sairia voando pela cena. O teto troca isso por um instante de
   lentidão, que ninguém percebe. */
const DT_MAX = 0.040;

const moveis = new Map();     // id da peça → estado

/** Registra o que o modelo trouxe. Peça que o GLB não separou simplesmente
 *  não entra — e o jogo segue igual, sem ela balançar. É o que permite cortar
 *  uma peça por vez sem tocar em mais nada. */
export function registrarPecasMoveis(raiz, zonas = []){
  moveis.clear();
  const porId = new Map(PECAS.map(p => [p.id, p]));
  const zonaDe = new Map(zonas.map(z => [z.p.id, z.grupo]));
  raiz.traverse(o => {
    if (!o.isMesh || !AJUSTE[o.name] || !porId.has(o.name)) return;
    moveis.set(o.name, {
      obj: o, cfg: AJUSTE[o.name],
      /* O disco da zona de acerto ACOMPANHA a peça. Sem isto o prato tomba e
         o disco fica plano, atravessando ele — e o disco fica mais opaco
         justamente no golpe, que é quando o prato está mais tombado. Só o
         DESENHO acompanha: a detecção usa o centro e o raio da peça em
         `config.js`, não a malha do disco, então mover isto não mexe em onde
         se acerta. */
      zona: zonaDe.get(o.name) || null,
      /* A pose de repouso é a que o modelo trouxe. Zerar seria endireitar o
         prato, que no scan já vem inclinado como um prato de verdade. */
      rx0: o.rotation.x, rz0: o.rotation.z, py0: o.position.y,
      ax: 0, az: 0, vx: 0, vz: 0,
    });
  });
  return [...moveis.keys()];
}

/** Chamada em toda batida na peça, venha de baqueta, tecla ou mouse. Vale
 *  mesmo quando o jogo não conta a nota: prato de verdade se mexe quando é
 *  batido, não quando o jogo aprova. */
export function baterPeca(id, forca = 0.8){
  const m = moveis.get(id);
  if (!m) return false;
  const f = Math.max(0, Math.min(forca, 1));
  const w = Math.sqrt(m.cfg.k);
  /* deslocamento desejado × ω = velocidade que o produz */
  const v = m.cfg.dobra * f * w;
  if (m.cfg.eixo === 'y'){
    m.vx -= v;                        // pele: afunda
  } else {
    m.vx += v;                        // prato: borda de longe sobe
    /* Um tico de eixo lateral, aleatório, para dois golpes seguidos não
       saírem idênticos — é o que separa "física" de "animação". */
    m.vz += v * (Math.random() - 0.5) * 0.7;
  }
  return true;
}

/** Integra e aplica. Chamar uma vez por quadro. */
export function animarBalanco(dt){
  const h = Math.min(dt, DT_MAX);
  for (const m of moveis.values()){
    const { k, c } = m.cfg;
    m.vx += (-k * m.ax - c * m.vx) * h;
    m.vz += (-k * m.az - c * m.vz) * h;
    m.ax += m.vx * h;
    m.az += m.vz * h;
    /* Parada seca quando já não se vê: poupa o cálculo e evita a peça ficar
       tremendo num décimo de milímetro para sempre. */
    if (Math.abs(m.ax) < 1e-5 && Math.abs(m.vx) < 1e-4 &&
        Math.abs(m.az) < 1e-5 && Math.abs(m.vz) < 1e-4){
      if (m.ax || m.az || m.vx || m.vz){
        m.ax = m.az = m.vx = m.vz = 0;
        if (m.cfg.eixo === 'y') m.obj.position.y = m.py0;
        else { m.obj.rotation.x = m.rx0; m.obj.rotation.z = m.rz0; }
        if (m.zona){ m.zona.rotation.x = 0; m.zona.rotation.z = 0; }
      }
      continue;
    }
    if (m.cfg.eixo === 'y'){
      m.obj.position.y = m.py0 + m.ax;
    } else {
      m.obj.rotation.x = m.rx0 + m.ax;
      m.obj.rotation.z = m.rz0 + m.az;
      if (m.zona){ m.zona.rotation.x = m.ax; m.zona.rotation.z = m.az; }
    }
  }
}

/** Volta tudo ao repouso — fim de partida, ou recomeço. */
export function acalmarBalanco(){
  for (const m of moveis.values()){
    m.ax = m.az = m.vx = m.vz = 0;
    if (m.cfg.eixo === 'y') m.obj.position.y = m.py0;
    else { m.obj.rotation.x = m.rx0; m.obj.rotation.z = m.rz0; }
    if (m.zona){ m.zona.rotation.x = 0; m.zona.rotation.z = 0; }
  }
}
