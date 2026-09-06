/* ============================================================================
   otimizar-cenario.mjs — v2, com KTX2
   ----------------------------------------------------------------------------
   USO:
     node otimizar-cenario.mjs world_of_metal.glb ../frontend/public/modelos/cenario.glb

   POR QUE ESTA VERSÃO DÁ MUITO MAIS QUALIDADE QUE A v1
   ----------------------------------------------------------------------------
   Na v1 eu só sabia baixar resolução, e por isso a imagem piorou. Existe uma
   saída melhor: KTX2 / Basis Universal.

   Um PNG 1024x1024 pesa pouco no disco, mas a GPU o DESCOMPRIME para RGBA
   cru: 5,59 MB de VRAM, sempre. Já uma textura KTX2 continua comprimida
   dentro da GPU — o mesmo 1024 ocupa ~0,7 MB. Oito vezes menos.

   O resultado prático, medido no seu laboratório:

     PNG 512/256 (a v1)                     80,3 MB de VRAM
     KTX2, MESMA resolução                  14,0 MB de VRAM
     KTX2 em 1024 CHEIO                    ~62,7 MB de VRAM

   Ou seja: dá para voltar à resolução ORIGINAL e ainda gastar menos memória
   do que a versão reduzida. É isso que esta v2 faz.

   PRÉ-REQUISITOS
   ----------------------------------------------------------------------------
   1) npm install @gltf-transform/core @gltf-transform/extensions \
                  @gltf-transform/functions draco3dgltf sharp
   2) npm install -g @gltf-transform/cli
   3) KTX-Software (fornece o binário `ktx`, que faz a compressão Basis):
        Windows: baixe o instalador .exe em
                 https://github.com/KhronosGroup/KTX-Software/releases
                 e REABRA o terminal depois de instalar (PATH).
      Sem ele o script ainda roda, mas para no passo de resolução e avisa.

   IMPORTANTE: o jogo precisa do KTX2Loader para abrir o arquivo resultante.
   O jogo.html já vem com ele.
   ========================================================================== */

import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, flatten, join, weld, prune, textureCompress,
         listTextureSlots } from '@gltf-transform/functions';
import sharp from 'sharp';
import draco3d from 'draco3dgltf';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

/* ------------------------------------------------------- AJUSTES ---------- */
const CFG = {
  /* Com KTX2 dá para ser generoso. Sem KTX2, divida os dois por dois. */
  corEmissivo: 1024,   // baseColor + emissive — é o que o olho lê
  normalRough: 512,    // normal + metallicRoughness — detalhe de superfície

  usarKTX2: true,      // false = fica só em PNG redimensionado (a v1)

  /* KHR_materials_transmission (vidro "de verdade") força a GPU a copiar a
     tela a cada objeto transparente. Dos efeitos mais caros em mobile. */
  removerTransmissao: true,

  /* Desligar doubleSided corta pela metade o trabalho de pixel... mas se as
     paredes forem planos com a normal virada para fora, elas SOMEM vistas de
     dentro. Teste antes de deixar ligado. */
  desligarDoubleSided: false,

  /* Descarta malhas longe do ponto onde o jogador fica. null = não descarta.
     Ex.: { centro:[4,0,-3], raio:9 } */
  recorte: null,
};
/* -------------------------------------------------------------------------- */

const [,, ENTRADA, SAIDA] = process.argv;
if (!ENTRADA || !SAIDA){
  console.error('uso: node otimizar-cenario.mjs <entrada.glb> <saida.glb>');
  process.exit(1);
}
const TMP = SAIDA.replace(/\.glb$/i,'') + '.__tmp.glb';
/* Decodificador Draco, registrado nos DOIS leitores.
   No fim eu preciso dele para RELER a saída e conferir o resultado — essa
   era a única razão de existir, e por isso ele só estava no `ioLeitura`.
   Só que a entrada também pode vir comprimida: quem apontar este script para
   um `.glb` que já passou por Draco (o `world_of_metal_otimizado.glb`, por
   exemplo, e é fácil confundir com a fonte crua) recebia um
   `Cannot read properties of undefined (reading 'DT_FLOAT32')` lá dentro do
   @gltf-transform, que não diz nada a quem chamou. Registrar nos dois custa
   um módulo e apaga a armadilha. */
const draco = { 'draco3d.decoder': await draco3d.createDecoderModule() };
const io  = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies(draco);
const ioLeitura = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies(draco);

/** VRAM de uma textura, com mipmaps (fator 4/3).
 *  PNG/JPG/WebP: a GPU descomprime para RGBA -> 4 bytes por pixel.
 *  KTX2: continua comprimida -> ~0,5 B/px (ETC1S) ou 1 B/px (UASTC).  */
const bpp = (mime, uastc) => mime !== 'image/ktx2' ? 4 : (uastc ? 1 : 0.5);

function relatorio(doc, titulo){
  const r = doc.getRoot();
  let vram = 0, tris = 0, draws = 0;
  const porSlot = {}, porRes = {};
  for (const t of r.listTextures()){
    const s = t.getSize(); if (!s) continue;
    const slots = listTextureSlots(t);
    const uastc = slots.some(x=>/normal/i.test(x));
    const v = s[0]*s[1]*bpp(t.getMimeType(), uastc)*4/3;
    vram += v;
    const k = (slots[0]||'outro').replace('Texture','');
    porSlot[k] = (porSlot[k]||0) + v;
    porRes[s.join('x')] = (porRes[s.join('x')]||0)+1;
  }
  for (const m of r.listMeshes()) for (const p of m.listPrimitives()){
    draws++; const i = p.getIndices();
    tris += (i ? i.getCount() : p.getAttribute('POSITION').getCount())/3;
  }
  const mb = n => (n/1048576).toFixed(1);
  console.log(`\n── ${titulo} ${'─'.repeat(Math.max(0,44-titulo.length))}`);
  console.log(`   texturas       ${r.listTextures().length}   ${JSON.stringify(porRes)}`);
  console.log(`   VRAM textura   ${mb(vram)} MB`);
  for (const [k,v] of Object.entries(porSlot).sort((a,b)=>b[1]-a[1]))
    console.log(`     ${k.padEnd(20)} ${mb(v)} MB`);
  console.log(`   triângulos     ${Math.round(tris).toLocaleString('pt-BR')}`);
  console.log(`   draw calls     ${draws}`);
  return vram;
}

const temCmd = (cmd, args) => {
  try { execFileSync(cmd, args, {stdio:'ignore', shell:process.platform==='win32'}); return true; }
  catch { return false; }
};

console.log(`lendo ${ENTRADA} (${(fs.statSync(ENTRADA).size/1048576).toFixed(2)} MB)…`);
const doc  = await io.read(ENTRADA);
const antes = relatorio(doc, 'ANTES');
const root = doc.getRoot();

/* 1. Recorte por distância — o ganho mais barato quando o jogador fica parado */
if (CFG.recorte){
  const [cx,,cz] = CFG.recorte.centro; let fora = 0;
  for (const node of root.listNodes()){
    if (!node.getMesh()) continue;
    const [x,,z] = node.getWorldTranslation();
    if (Math.hypot(x-cx, z-cz) > CFG.recorte.raio){ node.dispose(); fora++; }
  }
  console.log(`\n• recorte: ${fora} malhas além de ${CFG.recorte.raio} m descartadas`);
}

/* 2. Extensões caras em mobile */
if (CFG.removerTransmissao)
  for (const ext of root.listExtensionsUsed())
    if (ext.extensionName === 'KHR_materials_transmission'){
      ext.dispose();
      console.log('• KHR_materials_transmission removida (cópia de tela por objeto)');
    }

/* 3. doubleSided */
if (CFG.desligarDoubleSided){
  let n = 0;
  for (const m of root.listMaterials()) if (m.getDoubleSided()){ m.setDoubleSided(false); n++; }
  console.log(`• ${n} materiais deixaram de ser doubleSided`);
}

/* 4. Limpeza. Uma textura 1024 de cor sólida custa os mesmos 5,59 MB de VRAM
      que uma cheia de detalhe — vira um simples fator de material.        */
const nAntes = root.listTextures().length;
await doc.transform(dedup(), prune({ keepSolidTextures:false }));
console.log(`• ${nAntes - root.listTextures().length} texturas removidas (duplicadas ou de cor sólida)`);

/* 5. Resolução por tipo de mapa */
await doc.transform(
  textureCompress({ encoder:sharp, resize:[CFG.corEmissivo,CFG.corEmissivo],
                    slots:/baseColorTexture|emissiveTexture/ }),
  textureCompress({ encoder:sharp, resize:[CFG.normalRough,CFG.normalRough],
                    slots:/normalTexture|metallicRoughnessTexture|clearcoatNormalTexture|occlusionTexture/ }),
);
console.log(`• cor/emissivo → ${CFG.corEmissivo}px · normal/rugosidade → ${CFG.normalRough}px`);

/* 6. Geometria: funde por material (corta draw calls) */
await doc.transform(flatten(), join(), weld({tolerance:1e-5}), prune());

/* 7. KTX2 + Draco, via CLI (o encoder Basis é um binário nativo) */
const gt = process.platform === 'win32' ? 'gltf-transform.cmd' : 'gltf-transform';
const temGT  = temCmd(gt, ['--version']);
const temKTX = temCmd('ktx', ['--version']);

/* ATENÇÃO AO NOME `ktx`. Existe um pacote npm chamado `ktx` que NÃO tem nada
   a ver com o KTX-Software da Khronos — é uma ferramenta de outro assunto que
   só divide o nome. Se ele estiver no PATH, `ktx --version` responde, o
   `temKTX` dá verdadeiro, e o script seguia confiante para morrer no meio do
   caminho com um `spawn ktx ENOENT` vindo lá de dentro do gltf-transform.
   Perder o encoder é chato; perder o arquivo no meio da conversão é pior.
   Por isso a passada de KTX2 vive num try: se ela falhar por qualquer razão,
   caímos no caminho de PNG, que é a degradação que este script já previa. */
let fezKTX2 = false;
if (CFG.usarKTX2 && temGT && temKTX){
  await io.write(TMP, doc);
  const rodar = (args) => execFileSync(gt, args, {stdio:'inherit', shell:process.platform==='win32'});
  try {
    console.log('\n• KTX2: mapas normais em UASTC (precisam de precisão)…');
    rodar(['uastc', TMP, TMP+'2', '--slots','{normalTexture,clearcoatNormalTexture}',
           '--level','2','--rdo','4','--zstd','18']);
    console.log('• KTX2: cor, emissivo e rugosidade em ETC1S (mais compacto)…');
    rodar(['etc1s', TMP+'2', TMP+'3', '--quality','200']);
    console.log('• Draco na geometria…');
    rodar(['draco', TMP+'3', SAIDA]);
    fezKTX2 = true;
  } catch (e){
    console.log('\n⚠  A conversão para KTX2 falhou no meio. Causa provável: o'
      + '\n   `ktx` do PATH não é o do KTX-Software (há um pacote npm de mesmo'
      + '\n   nome). Confira com `ktx --version` — o da Khronos se identifica'
      + '\n   como KTX-Software. Baixe em:'
      + '\n   https://github.com/KhronosGroup/KTX-Software/releases'
      + `\n   Erro: ${String(e.message).split('\n')[0]}`);
  }
  for (const f of [TMP+'2', TMP+'3']) try{ fs.unlinkSync(f); }catch{}
  if (fezKTX2) try{ fs.unlinkSync(TMP); }catch{}
}

if (!fezKTX2){
  if (CFG.usarKTX2 && !(temGT && temKTX)){
    console.log('\n⚠  KTX2 pulado — ' +
      (!temGT  ? 'falta `npm install -g @gltf-transform/cli`. ' : '') +
      (!temKTX ? 'falta o binário `ktx` (KTX-Software). ' : ''));
  }
  if (CFG.usarKTX2){
    console.log('   Saindo em PNG. Com KTX2 esse mesmo arquivo usaria ~8x menos VRAM.');
  }
  if (!fs.existsSync(TMP)) await io.write(TMP, doc);
  if (temGT){
    execFileSync(gt, ['draco', TMP, SAIDA], {stdio:'inherit', shell:process.platform==='win32'});
    fs.unlinkSync(TMP);
  } else fs.renameSync(TMP, SAIDA);
}

const depois = relatorio(await ioLeitura.read(SAIDA), 'DEPOIS');
const mb = n => (n/1048576).toFixed(2);
console.log(`\n${'═'.repeat(50)}`);
console.log(`arquivo   ${mb(fs.statSync(ENTRADA).size)} MB  →  ${mb(fs.statSync(SAIDA).size)} MB`);
console.log(`VRAM      ${mb(antes)} MB  →  ${mb(depois)} MB   (${(100-depois/antes*100).toFixed(0)}% menos)`);
console.log(`${'═'.repeat(50)}`);
if (depois/1048576 > 120)
  console.log('\n⚠  Acima de ~120 MB de VRAM o Quest ainda pode sofrer.\n' +
              '   Baixe CFG.corEmissivo para 512, ou use CFG.recorte.');
