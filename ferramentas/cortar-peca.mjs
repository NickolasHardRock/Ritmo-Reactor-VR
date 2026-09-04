/* ============================================================================
   cortar-peca.mjs — separa peças da malha fundida da bateria.

   POR QUE ISTO EXISTE. O `bateria.glb` é um scan de fotogrametria: um node,
   uma mesh, uma primitiva. Não existe um objeto "prato" para girar, então
   nenhuma animação por código é possível sem antes recortar as peças.

   O CRITÉRIO. Um triângulo é da peça quando está dentro do disco dela: raio
   pequeno o bastante, dentro de uma faixa fina de espessura, e com a normal
   aproximadamente paralela ao prato. É o mesmo critério que mediu as sete
   posições do kit, e foi ele que produziu o ride e o chimbal que ficaram bons.

   A ÚNICA DIFERENÇA PARA AQUELA VERSÃO — e a correção do bug do crash — é que
   o disco agora é ORIENTADO PELO PLANO DO PRÓPRIO PRATO, não pela horizontal.
   Enquanto o prato é quase plano (ride, chimbal), a normal estimada dá
   ~(0,1,0) e as duas fórmulas são a mesma conta; nada muda. No crash, que o
   scan trouxe inclinado 37°, a faixa horizontal cortava as pontas POR
   CONSTRUÇÃO: um disco de raio 0,23 m inclinado 37° ocupa 0,28 m de altura, e
   a faixa tinha 0,15 m. Sobrava metade do prato presa ao resto — exatamente o
   que se via balançando pela metade.

   NÃO USE CRESCIMENTO DE REGIÃO AQUI. Tentei; num scan fundido a superfície
   do prato é contínua com o pedestal e com o resto do kit, e o crescimento ou
   para cedo (peça de 2.900 triângulos, um caco) ou vaza para a bateria toda.

   USO: node cortar-peca.mjs <entrada.glb> <saida.glb> <peca> [peca...]
   ========================================================================== */

import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { draco, prune, dedup } from '@gltf-transform/functions';
import draco3d from 'draco3dgltf';

/* AS COORDENADAS DE config.js ESTÃO NO REFERENCIAL DO JOGO, não do arquivo.
   O jogo ergue o kit por `APOIO_KIT` para as sapatas ficarem em y=0. Sem
   descontar isso, o corte procura o prato meio metro acima de onde ele está
   e casa zero triângulo — foi o que aconteceu na primeira tentativa. */
const APOIO_KIT = 0.494;
const PECAS = {
  chimbal: { x:-0.719, y:0.721, z: 0.078, r:0.194 },
  crash:   { x:-0.486, y:0.916, z:-0.184, r:0.230 },
  caixa:   { x:-0.375, y:0.575, z: 0.242, r:0.189 },
  tom2:    { x:-0.159, y:0.681, z:-0.081, r:0.157 },
  tom1:    { x: 0.161, y:0.683, z:-0.080, r:0.162 },
  surdo:   { x: 0.401, y:0.576, z: 0.184, r:0.189 },
  ride:    { x: 0.676, y:0.799, z:-0.127, r:0.293 },
};

const RAIO_F   = 1.06;    // folga no raio: quero a borda inteira, senão sobra um anel
const FAIXA    = 0.075;   // meia-espessura do disco, medida NA NORMAL do prato
const COS_MIN  = 0.25;    // |n·N|: descarta paredes verticais (pedestal, aro)
const BORDA    = 0.55;    // além disso do raio, aceita mesmo com normal de canto
const VERTICAL = [0,1,0];

const [ENTRADA, SAIDA, ...NOMES] = process.argv.slice(2);
if (!ENTRADA || !SAIDA || !NOMES.length || NOMES.some(n => !PECAS[n])){
  console.error('uso: node cortar-peca.mjs entrada.glb saida.glb <' + Object.keys(PECAS).join('|') + '> [...]');
  process.exit(1);
}
const SO_VERTICAL = process.env.SO_VERTICAL === '1';   // para comparar com a versão antiga

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'draco3d.decoder': await draco3d.createDecoderModule(),
  'draco3d.encoder': await draco3d.createEncoderModule(),
});

const doc  = await io.read(ENTRADA);
const raiz = doc.getRoot();
const prim = raiz.listMeshes()[0].listPrimitives()[0];
const POS = prim.getAttribute('POSITION');
const NOR = prim.getAttribute('NORMAL');
const IDX = prim.getIndices();
const nTri = IDX.getCount() / 3;
console.log(`entrada: ${POS.getCount()} vértices, ${nTri} triângulos`);
console.log(`atributos: ${prim.listSemantics().join(', ')}\n`);

/* pré-carrega posições e normais: getElement por triângulo, 3x por peça, é lento */
const XYZ = new Float64Array(POS.getCount()*3);
{ const p=[0,0,0]; for (let i=0;i<POS.getCount();i++){ POS.getElement(i,p); XYZ[i*3]=p[0]; XYZ[i*3+1]=p[1]; XYZ[i*3+2]=p[2]; } }
const I = new Uint32Array(nTri*3);
for (let i=0;i<nTri*3;i++) I[i] = IDX.getScalar(i);

const sub=(a,b)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]];
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
const norm=a=>{ const l=Math.hypot(a[0],a[1],a[2]); return l?[a[0]/l,a[1]/l,a[2]/l]:[0,1,0]; };
const vt=i=>[XYZ[i*3],XYZ[i*3+1],XYZ[i*3+2]];
const geo=t=>{
  const a=vt(I[t*3]), b=vt(I[t*3+1]), c=vt(I[t*3+2]);
  const nv=cross(sub(b,a),sub(c,a)); const area=Math.hypot(nv[0],nv[1],nv[2])/2;
  return { c:[(a[0]+b[0]+c[0])/3,(a[1]+b[1]+c[1])/3,(a[2]+b[2]+c[2])/3], n:norm(nv), area };
};

/* ---------------------------------------------------- normal do prato ----
   Tensor T = Σ area · (n ⊗ n). A grande sacada é que n⊗n IGNORA O SINAL da
   normal: a face de cima e a de baixo do prato somam no mesmo autovetor, em
   vez de se cancelarem como fariam numa média de normais. O maior autovetor
   de T é a normal da chapa. O pedestal, cuja normal varre um plano inteiro,
   entra como um borrão de posto 2 e não desloca o pico.                   */
function autovetorMaior(T){
  let v = [0.13, 0.97, 0.21];                      // semente enviesada para cima
  for (let it=0; it<200; it++){
    const w = [ T[0]*v[0]+T[1]*v[1]+T[2]*v[2],
                T[1]*v[0]+T[3]*v[1]+T[4]*v[2],
                T[2]*v[0]+T[4]*v[1]+T[5]*v[2] ];
    v = norm(w);
  }
  return v[1] < 0 ? v.map(x=>-x) : v;              // sempre apontando para cima
}
function normalDoPrato(P, y0){
  const T = [0,0,0,0,0,0];                         // xx xy xz yy yz zz
  for (let t=0;t<nTri;t++){
    const g = geo(t);
    if (Math.hypot(g.c[0]-P.x, g.c[2]-P.z) > P.r*1.05) continue;
    if (Math.abs(g.c[1]-y0) > 0.10) continue;
    const n=g.n, a=g.area;
    T[0]+=a*n[0]*n[0]; T[1]+=a*n[0]*n[1]; T[2]+=a*n[0]*n[2];
    T[3]+=a*n[1]*n[1]; T[4]+=a*n[1]*n[2]; T[5]+=a*n[2]*n[2];
  }
  return autovetorMaior(T);
}

/* ------------------------------------------------------------ corte ------ */
const dono = new Int32Array(nTri).fill(-1);        // -1 = resto
const info = [];

NOMES.forEach((NOME, iPeca) => {
  const P  = PECAS[NOME];
  const y0 = P.y - APOIO_KIT;
  const N  = SO_VERTICAL ? VERTICAL : normalDoPrato(P, y0);
  const inc = Math.acos(Math.min(1, Math.abs(N[1]))) * 180/Math.PI;

  /* Duas passadas. A primeira ancora no ponto do config, que é a POSIÇÃO DE
     BATIDA — no crash ela foi movida na mão lá atrás no projeto, então não é
     o centro geométrico do prato. A segunda recentra no que a primeira achou,
     senão o disco fica deslocado justamente na peça que mais precisa. */
  let C = [P.x, y0, P.z];
  let sel = null;
  for (let passada = 0; passada < 2; passada++){
    sel = [];
    const R = P.r * RAIO_F;
    for (let t=0;t<nTri;t++){
      if (dono[t] !== -1) continue;                 // peça anterior já levou
      const g = geo(t);
      const d = sub(g.c, C);
      const h = dot(d, N);                          // altura NA NORMAL do prato
      if (Math.abs(h) > FAIXA) continue;
      const r = Math.sqrt(Math.max(0, dot(d,d) - h*h));   // raio NO PLANO do prato
      if (r > R) continue;
      const plano = Math.abs(dot(g.n, N)) > COS_MIN;
      if (!plano && r < R*BORDA) continue;           // parede no miolo = haste
      sel.push(t);
    }
    if (!sel.length) break;
    /* recentra pelos extremos, não pela média: média puxa para onde há mais
       triângulo, e num prato inclinado isso desloca o eixo de rotação. */
    let x0=1/0,ya=1/0,z0=1/0,x1=-1/0,yb=-1/0,z1=-1/0;
    for (const t of sel) for (let k=0;k<3;k++){
      const v = vt(I[t*3+k]);
      if(v[0]<x0)x0=v[0]; if(v[1]<ya)ya=v[1]; if(v[2]<z0)z0=v[2];
      if(v[0]>x1)x1=v[0]; if(v[1]>yb)yb=v[1]; if(v[2]>z1)z1=v[2];
    }
    C = [(x0+x1)/2, (ya+yb)/2, (z0+z1)/2];
  }
  if (!sel || !sel.length){ console.error(`✗ ${NOME}: nenhum triângulo casou`); process.exit(1); }
  for (const t of sel) dono[t] = iPeca;

  let x0=1/0,ya=1/0,z0=1/0,x1=-1/0,yb=-1/0,z1=-1/0;
  for (const t of sel) for (let k=0;k<3;k++){
    const v = vt(I[t*3+k]);
    if(v[0]<x0)x0=v[0]; if(v[1]<ya)ya=v[1]; if(v[2]<z0)z0=v[2];
    if(v[0]>x1)x1=v[0]; if(v[1]>yb)yb=v[1]; if(v[2]>z1)z1=v[2];
  }
  info.push({ NOME, N, inc, C, tam:[x1-x0,yb-ya,z1-z0], n:sel.length });
  console.log(`${NOME.padEnd(8)} ${String(sel.length).padStart(6)} tri (${(sel.length/nTri*100).toFixed(2)}%)`
    + ` | normal [${N.map(v=>v.toFixed(3)).join(', ')}] = ${inc.toFixed(0)}° da vertical`
    + `\n         centro [${C.map(v=>v.toFixed(3)).join(', ')}] | caixa ${[x1-x0,yb-ya,z1-z0].map(v=>v.toFixed(3)).join(' x ')}`);
});

/* -------------------------------------- reconstrução, dentro do documento --
   Reconstruir o documento à mão custou caro na primeira tentativa: copiei cor
   e normal e ESQUECI a textura de rugosidade e o atributo TANGENT. Partir a
   primitiva DENTRO do documento que já existe resolve a classe do problema:
   material, texturas, extensões e atributos continuam sendo os MESMOS
   objetos, não cópias que eu possa deixar incompletas.                     */
const semanticas = prim.listSemantics();
const material   = prim.getMaterial();
const bufOrig    = raiz.listBuffers()[0];

function montar(marca, origem){
  const mapa = new Map(); const idx = [];
  for (let t=0;t<nTri;t++){
    if (dono[t] !== marca) continue;
    for (let k=0;k<3;k++){
      const antigo = I[t*3+k];
      let novo = mapa.get(antigo);
      if (novo === undefined){ novo = mapa.size; mapa.set(antigo, novo); }
      idx.push(novo);
    }
  }
  const nv = mapa.size;
  const g = { nv, idx:new Uint32Array(idx), ntri:idx.length/3 };
  /* TODOS os atributos que a primitiva tem, sem lista fixa. */
  for (const s of semanticas){
    const acc = prim.getAttribute(s);
    const dim = acc.getElementSize();
    const arr = new Float32Array(nv*dim); const tmp = new Array(dim).fill(0);
    for (const [antigo, novo] of mapa){ acc.getElement(antigo, tmp); arr.set(tmp, novo*dim); }
    g[s] = arr;
  }
  /* Move a peça para a própria origem: girar um node cuja geometria está longe
     do centro varreria a peça pelo cenário em vez de inclinar no lugar. */
  if (origem) for (let i=0;i<nv;i++){
    g.POSITION[i*3]   -= origem[0];
    g.POSITION[i*3+1] -= origem[1];
    g.POSITION[i*3+2] -= origem[2];
  }
  return g;
}
function criarPrim(g){
  const pr = doc.createPrimitive().setMaterial(material)
    .setIndices(doc.createAccessor().setType('SCALAR').setArray(g.idx).setBuffer(bufOrig));
  for (const s of semanticas){
    const tipo = s==='TEXCOORD_0' ? 'VEC2' : s==='TANGENT' ? 'VEC4' : 'VEC3';
    pr.setAttribute(s, doc.createAccessor().setType(tipo).setArray(g[s]).setBuffer(bufOrig));
  }
  return pr;
}

const cena = raiz.listScenes()[0];
for (const n of cena.listChildren()) n.dispose();
const B = montar(-1, null);
cena.addChild(doc.createNode('kit_resto').setMesh(doc.createMesh('resto').addPrimitive(criarPrim(B))));
console.log(`\nresto    ${String(B.ntri).padStart(6)} tri`);
info.forEach((it, i) => {
  const g = montar(i, it.C);
  cena.addChild(doc.createNode(it.NOME).setMesh(doc.createMesh(it.NOME).addPrimitive(criarPrim(g))).setTranslation(it.C));
});
raiz.listMeshes().filter(m => !['resto', ...NOMES].includes(m.getName())).forEach(m => m.dispose());

/* `prune` NÃO é opcional: descartar a malha antiga não descarta os acessores
   dela, e o arquivo saiu com 18,18 MB contra 10,63 MB da entrada — 7,5 MB de
   geometria que ninguém mais referencia. */
await doc.transform(dedup(), prune(), draco());
await io.write(SAIDA, doc);
const fs = await import('node:fs');
console.log(`\n${SAIDA}: ${(fs.statSync(SAIDA).size/1048576).toFixed(2)} MB`);
console.log(`nodes: kit_resto, ${NOMES.join(', ')}   |   atributos: ${semanticas.join(', ')}`);
