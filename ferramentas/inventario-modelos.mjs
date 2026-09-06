/* ============================================================================
   inventario-modelos.mjs — o que existe dentro dos .glb, medido.

   POR QUE ESTA FERRAMENTA EXISTE. Os números de peso do projeto eram
   ESTIMATIVA: "a bateria tem ~213 mil triângulos", "as texturas dela ocupam
   ~64 MB de VRAM". Estimativa serve para levantar hipótese, não para decidir
   o que cortar. Isto abre o arquivo e conta.

   NÃO DEPENDE DE NADA. Nem de `@gltf-transform`, nem do `ktx`, nem de rede —
   lê o GLB na unha. É de propósito: a ferramenta que mede não pode ser a que
   falha por falta de binário. (O `otimizar-cenario.mjs`, que TRANSFORMA,
   precisa dos dois; este, que só OLHA, não precisa de nenhum.)

   O QUE ELE RESPONDE
     • quantos triângulos, por malha e no total
     • quantas primitivas — cada uma é, no mínimo, um draw call
     • cada textura: dimensão, formato, bytes no arquivo e VRAM estimada
     • se a textura está em KTX2 e, nesse caso, se é UASTC ou ETC1S

   A CONTA DA VRAM é a mesma do `otimizar-cenario.mjs`, para os números serem
   comparáveis: PNG/JPEG a GPU descomprime para RGBA, 4 bytes por pixel;
   KTX2 continua comprimida, ~1 B/px em UASTC e ~0,5 B/px em ETC1S. Tudo
   vezes 4/3, que é o custo dos mipmaps.

   ATENÇÃO AO QUE ISTO **NÃO** É. É o peso do ARQUIVO, não a medida do
   quadro. Um modelo pesado pode custar pouco se estiver fora do campo de
   visão, e um leve pode custar caro se for desenhado dez vezes. Para o custo
   do quadro existe o `desempenho.js`, dentro do headset. Este aqui responde
   "o que há para cortar", não "o que está doendo".

   USO
     node ferramentas/inventario-modelos.mjs
     node ferramentas/inventario-modelos.mjs frontend/public/modelos/cenario.glb
   ========================================================================== */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/* Sem argumento, olha exatamente os dois modelos que o jogo carrega — que
   são os que importam. A pasta tem uma dúzia de tentativas antigas. */
const PADRAO = [
  'frontend/public/modelos/cenario.glb',
  'frontend/public/modelos/bateria_pratos.glb',
];

/* ------------------------------------------------------- leitura do GLB -- */
/** Um GLB é: cabeçalho de 12 bytes, depois pedaços. O primeiro pedaço é o
 *  JSON da cena; o segundo, o binário com vértices e imagens. */
function abrirGlb(arquivo){
  const buf = fs.readFileSync(arquivo);
  if (buf.readUInt32LE(0) !== 0x46546c67) throw new Error('não é um GLB');
  let off = 12, json = null, bin = null;
  while (off + 8 <= buf.length){
    const tam = buf.readUInt32LE(off);
    const tipo = buf.readUInt32LE(off + 4);
    const corpo = buf.subarray(off + 8, off + 8 + tam);
    if (tipo === 0x4e4f534a) json = JSON.parse(corpo.toString('utf8'));
    if (tipo === 0x004e4942) bin = corpo;
    off += 8 + tam;
  }
  if (!json) throw new Error('GLB sem pedaço JSON');
  return { json, bin, bytes: buf.length };
}

/** Os bytes de uma imagem, seguindo a bufferView até o pedaço binário. */
function bytesDaImagem(g, i){
  const img = g.json.images?.[i];
  if (!img || img.bufferView === undefined || !g.bin) return null;
  const bv = g.json.bufferViews[img.bufferView];
  const ini = bv.byteOffset || 0;
  return g.bin.subarray(ini, ini + bv.byteLength);
}

/* ------------------------------------------------- formato das imagens --- */
/** Dimensão e formato lidos do cabeçalho do próprio arquivo de imagem.
 *  Nenhum decodificador envolvido: só os primeiros bytes. */
function medirImagem(b){
  if (!b || b.length < 32) return null;

  // PNG: assinatura, depois o IHDR traz largura e altura em big-endian.
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47){
    return { formato: 'PNG', w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
  }

  // KTX2: identificador de 12 bytes, depois vkFormat, typeSize, largura,
  // altura. `supercompressionScheme` = 1 (BasisLZ) é ETC1S; sem BasisLZ e
  // com vkFormat 0, é UASTC. A distinção importa: a bateria fica a 60 cm do
  // rosto e ETC1S ali aparece como borrão.
  if (b[0] === 0xab && b[1] === 0x4b && b[2] === 0x54 && b[3] === 0x58){
    const vkFormat = b.readUInt32LE(12);
    const esquema  = b.readUInt32LE(44);
    const basis = vkFormat === 0;
    return {
      formato: 'KTX2', w: b.readUInt32LE(20), h: b.readUInt32LE(24),
      ktx2: true,
      modo: !basis ? 'bloco' : (esquema === 1 ? 'ETC1S' : 'UASTC'),
      uastc: basis && esquema !== 1,
    };
  }

  // JPEG: percorre os marcadores até um SOFn, que carrega altura e largura.
  if (b[0] === 0xff && b[1] === 0xd8){
    let p = 2;
    while (p + 9 < b.length){
      if (b[p] !== 0xff){ p++; continue; }
      const m = b[p + 1];
      // SOF0..SOF15, pulando DHT(c4), JPG(c8) e DAC(cc), que não são SOF.
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc){
        return { formato: 'JPEG', h: b.readUInt16BE(p + 5), w: b.readUInt16BE(p + 7) };
      }
      p += 2 + b.readUInt16BE(p + 2);
    }
    return { formato: 'JPEG', w: 0, h: 0 };
  }
  if (b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50){
    return { formato: 'WEBP', w: 0, h: 0 };   // dimensão exigiria decodificar
  }
  return { formato: '?', w: 0, h: 0 };
}

/** VRAM com mipmaps (fator 4/3). PNG/JPG a GPU descomprime para RGBA — 4
 *  bytes por pixel, sempre, independente do tamanho no disco. */
const bpp = (m) => !m.ktx2 ? 4 : (m.uastc ? 1 : 0.5);
const vram = (m) => (!m.w || !m.h) ? 0 : m.w * m.h * bpp(m) * 4 / 3;

/* ------------------------------------------------- em que slot ela entra - */
/** De baseColor a normal: o slot decide o modo de compressão certo. Mapa de
 *  textura -> slots que a usam, para o relatório dizer onde cada peso mora. */
function slotsPorTextura(json){
  const r = new Map();
  const marca = (ref, nome) => {
    if (!ref || ref.index === undefined) return;
    const fonte = json.textures?.[ref.index]?.source
      ?? json.textures?.[ref.index]?.extensions?.KHR_texture_basisu?.source;
    if (fonte === undefined) return;
    const s = r.get(fonte) || new Set(); s.add(nome); r.set(fonte, s);
  };
  for (const mat of json.materials || []){
    const p = mat.pbrMetallicRoughness || {};
    marca(p.baseColorTexture, 'baseColor');
    marca(p.metallicRoughnessTexture, 'metalRough');
    marca(mat.normalTexture, 'normal');
    marca(mat.emissiveTexture, 'emissive');
    marca(mat.occlusionTexture, 'oclusao');
  }
  return r;
}

/* ------------------------------------------------------------ geometria - */
function geometria(json){
  let tris = 0, primitivas = 0;
  const porMalha = [];
  for (const malha of json.meshes || []){
    let t = 0;
    for (const p of malha.primitives || []){
      primitivas++;
      /* Modo 4 é TRIANGLES; os outros (linhas, pontos) não têm triângulo.
         Ausente também significa 4, por padrão do glTF. */
      if (p.mode !== undefined && p.mode !== 4) continue;
      const acc = p.indices !== undefined
        ? json.accessors?.[p.indices]
        : json.accessors?.[p.attributes?.POSITION];
      if (acc) t += acc.count / 3;
    }
    tris += t;
    porMalha.push({ nome: malha.name || '(sem nome)',
                    tris: Math.round(t), prims: (malha.primitives || []).length });
  }
  return { tris: Math.round(tris), primitivas, porMalha };
}

/* -------------------------------------------------------- o relatório ---- */
const mb = (n) => (n / 1048576).toFixed(1) + ' MB';
const mil = (n) => n.toLocaleString('pt-BR');

function relatar(arquivo){
  const rel = path.relative(RAIZ, arquivo).replace(/\\/g, '/');
  let g;
  try { g = abrirGlb(arquivo); }
  catch (e){ console.log(`\n${rel}\n  !! ${e.message}`); return null; }

  const geo = geometria(g.json);
  const slots = slotsPorTextura(g.json);

  console.log(`\n${'='.repeat(74)}\n${rel}  —  ${mb(g.bytes)} no disco`);
  console.log(`${'-'.repeat(74)}`);
  console.log(`  ${mil(geo.tris)} triângulos · ${geo.primitivas} primitivas `
              + `(cada uma é ao menos um draw call) · ${geo.porMalha.length} malhas`);

  const maiores = geo.porMalha.slice().sort((a, b) => b.tris - a.tris).slice(0, 6);
  if (maiores.length && geo.porMalha.length > 1){
    console.log('  malhas mais pesadas:');
    for (const m of maiores){
      const pct = geo.tris ? (100 * m.tris / geo.tris).toFixed(0) : '0';
      console.log(`    ${m.nome.slice(0, 34).padEnd(34)} ${mil(m.tris).padStart(9)} tris  ${pct.padStart(3)}%`);
    }
  }

  const imgs = g.json.images || [];
  if (!imgs.length){ console.log('\n  sem texturas embutidas'); return { rel, geo, vram: 0 }; }

  console.log(`\n  ${imgs.length} textura(s):`);
  let total = 0, semKtx = 0;
  for (let i = 0; i < imgs.length; i++){
    const b = bytesDaImagem(g, i);
    const m = medirImagem(b);
    if (!m){ console.log(`    [${i}] (fora do binário)`); continue; }
    const v = vram(m);
    total += v;
    if (!m.ktx2) semKtx += v;
    const dim  = `${m.w}x${m.h}`;
    const fmt  = m.ktx2 ? `KTX2/${m.modo}` : m.formato;
    const onde = [...(slots.get(i) || ['—'])].join('+');
    console.log(`    [${String(i).padStart(2)}] ${dim.padEnd(11)} ${fmt.padEnd(11)}`
      + ` ${mb(b.length).padStart(8)} arq  ${mb(v).padStart(8)} VRAM  ${onde}`);
  }
  console.log(`    ${'-'.repeat(66)}`);
  console.log(`    VRAM de textura: ${mb(total)}`
    + (semKtx > 0 ? `  — ${mb(semKtx)} disso NÃO está em KTX2` : '  (tudo em KTX2)'));
  return { rel, geo, vram: total, semKtx };
}

const alvos = (process.argv.slice(2).length ? process.argv.slice(2) : PADRAO)
  .map(a => path.isAbsolute(a) ? a : path.join(RAIZ, a))
  .filter(a => { if (fs.existsSync(a)) return true;
                 console.log(`\n(não encontrado: ${a})`); return false; });

const resumo = [];
for (const a of alvos){ const r = relatar(a); if (r) resumo.push(r); }

if (resumo.length > 1){
  console.log(`\n${'='.repeat(74)}\nTOTAL`);
  const tris = resumo.reduce((s, r) => s + r.geo.tris, 0);
  const prim = resumo.reduce((s, r) => s + r.geo.primitivas, 0);
  const vr   = resumo.reduce((s, r) => s + r.vram, 0);
  console.log(`  ${mil(tris)} triângulos · ${prim} primitivas · ${mb(vr)} de VRAM de textura`);
  console.log(`  Em VR isto DOBRA: são dois olhos. ~${mil(tris * 2)} triângulos por quadro.`);
}
