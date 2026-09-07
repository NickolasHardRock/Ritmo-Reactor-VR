/* ============================================================================
   encorpar-carta.mjs — dá ao jogador as peças que a carta não usa.

   O PROBLEMA. A `colour-me-red` transcreve quatro peças: chimbal e caixa
   jogáveis, bumbo e crash na trilha automática. Tom, surdo e ride não
   existem nela. Quem quiser exercitar a bateria inteira sobre essa música
   não tem o que tocar — e `?sem=caixa` ali deixa o jogador com UM
   instrumento, o chimbal.

   O QUE ESTA FERRAMENTA FAZ, E O QUE ELA NÃO FAZ.
   Ela NÃO transcreve. Não dá para tirar do MP3 um tom que o baterista não
   tocou. O que ela faz é REDISTRIBUIR: pega golpes que já existem na carta,
   nos instantes exatos em que já existem, e troca a peça de alguns deles.

   É a diferença entre inventar e rearranjar. Toda nota que sai daqui cai
   num instante que a gravação já marcava, então nada soa fora do tempo —
   o que muda é qual tambor responde àquele golpe.

   POR QUE ISSO É SEGURO NESTA MÚSICA. O `colour-me-red.mp3` é a mixagem SEM
   bateria: a percussão inteira vem dos samples que a carta declara em `kit`
   (ver `synth.definirKit`). Não há bateria gravada para dobrar ou brigar.

   DUAS COISAS PARA O OUVIDO CONFERIR, PORQUE EU NÃO POSSO:
   1. O kit `diesel13` só tem sample de bumbo, caixa, chimbal e crash. Tom,
      surdo e ride caem no kit padrão do jogo — timbre diferente do resto.
      É uma costura audível; se incomodar, o caminho é gravar os samples que
      faltam em `frontend/public/kits/diesel13/`.
   2. Rearranjo é decisão musical. As regras abaixo são as de uma levada de
      rock comum, não as desta música em particular.

   O ARRANJO, e o porquê de cada regra:

     CRASH vira jogável. Ele já está na carta com 58 golpes reais, só que
     marcados como automáticos. Promover não inventa nada — é a única parte
     desta ferramenta que é puro ganho, sem escolha musical envolvida.

     RIDE substitui o chimbal em frases alternadas. Trocar de condução a
     cada oito compassos é o gesto mais banal do rock: estrofe no chimbal,
     refrão no ride. Como cai exatamente nos golpes de chimbal que já
     existiam, a levada não muda de densidade — muda de cor.

     TOM e SURDO viram a virada no fim da frase. Os últimos golpes de caixa
     de cada frase de oito compassos descem tom1 → tom2 → surdo. É onde um
     baterista de verdade vira, e são golpes de caixa que já estavam ali.

   USO
     node ferramentas/encorpar-carta.mjs                    (usa os padrões)
     node ferramentas/encorpar-carta.mjs entrada.json saida.json
     ... --frase 8 --virada 3 --ride-de 2 --ride-a-cada 2

   Não sobrescreve a carta de entrada. A original é uma transcrição honesta,
   creditada a quem cedeu a multipista; o rearranjo vive num arquivo ao lado.
   ========================================================================== */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CARTAS = path.join(RAIZ, 'frontend', 'public', 'cartas');

/* ----------------------------------------------------------- opções ------ */
const argv = process.argv.slice(2);
const posic = argv.filter(a => !a.startsWith('--'));
const opt = (nome, padrao) => {
  const i = argv.indexOf('--' + nome);
  return i >= 0 && argv[i + 1] !== undefined ? Number(argv[i + 1]) : padrao;
};

const ENTRADA = path.resolve(RAIZ, posic[0] || 'frontend/public/cartas/colour-me-red.json');
const SAIDA   = path.resolve(RAIZ, posic[1] || 'frontend/public/cartas/colour-me-red-cheio.json');

const CFG = {
  /* Compassos por frase. Oito é a frase de rock; quatro deixa a virada
     frequente demais e cansa. */
  frase: opt('frase', 8),
  /* Quantos golpes de caixa no fim da frase viram virada. Três desce
     tom1→tom2→surdo, que é a virada mais reconhecível que existe. */
  virada: opt('virada', 3),
  /* A partir de qual frase o ride entra. A primeira frase fica no chimbal
     para a música se apresentar antes de mudar de cor. */
  rideDe: opt('ride-de', 2),
  /* Ride a cada N frases. 2 = alterna estrofe/refrão. */
  rideACada: opt('ride-a-cada', 2),
};

/* ------------------------------------------------------------ a grade ---- */
const carta = JSON.parse(fs.readFileSync(ENTRADA, 'utf8'));
for (const campo of ['bpm', 'notas']){
  if (carta[campo] === undefined){
    console.error(`carta sem "${campo}" — não dá para montar a grade`);
    process.exit(1);
  }
}
const ancora   = carta.ancora || 0;
const batida   = 60 / carta.bpm;          // segundos por batida
const compasso = batida * 4;              // 4/4; nenhuma carta nossa foge disso
const frase    = compasso * CFG.frase;

/** Em que frase (0,1,2…) cai este instante. */
const fraseDe = (t) => Math.floor((t - ancora) / frase);

/* ------------------------------------------------------- o rearranjo ----- */
const notas = carta.notas.map(n => ({ ...n }));
const auto  = (carta.auto || []).map(n => ({ ...n }));

/* 1. CRASH: sai da trilha automática e vira nota do jogador. Nada é
      inventado aqui — os 58 golpes já estavam na carta. */
const crashPromovido = [];
for (let i = auto.length - 1; i >= 0; i--){
  if (auto[i].som !== 'crash') continue;
  const a = auto.splice(i, 1)[0];
  crashPromovido.push({ t: a.t, peca: 'crash', forca: a.forca ?? 0.85 });
}
notas.push(...crashPromovido);

/* 2. RIDE: assume a condução em frases alternadas, nos golpes de chimbal
      que já existiam. */
let virouRide = 0;
for (const n of notas){
  if (n.peca !== 'chimbal') continue;
  const f = fraseDe(n.t);
  if (f < CFG.rideDe) continue;
  if ((f - CFG.rideDe) % CFG.rideACada !== 0) continue;
  n.peca = 'ride';
  virouRide++;
}

/* 3. VIRADA: os últimos golpes de caixa de cada frase descem pelos tons.
      Agrupa por frase, ordena, e converte a cauda.                        */
const porFrase = new Map();
for (const n of notas){
  if (n.peca !== 'caixa') continue;
  const f = fraseDe(n.t);
  if (!porFrase.has(f)) porFrase.set(f, []);
  porFrase.get(f).push(n);
}
const DESCIDA = ['tom1', 'tom2', 'surdo'];
let virouTom = 0;
for (const [, lista] of porFrase){
  lista.sort((a, b) => a.t - b.t);
  const cauda = lista.slice(-CFG.virada);
  /* Uma frase com pouquíssima caixa não tem virada para dar: converter tudo
     ali deixaria a frase sem backbeat nenhum. */
  if (lista.length <= CFG.virada) continue;
  cauda.forEach((n, i) => {
    n.peca = DESCIDA[Math.min(i, DESCIDA.length - 1)];
    virouTom++;
  });
}

notas.sort((a, b) => a.t - b.t);
auto.sort((a, b) => a.t - b.t);

/* --------------------------------------------------------- a gravação --- */
const saida = {
  ...carta,
  titulo: (carta.titulo || 'Carta') + ' — kit inteiro',
  /* O crédito da original continua valendo e ganha a ressalva: o que se
     ouve aqui não é mais a transcrição, é um rearranjo em cima dela. */
  creditos: (carta.creditos || '')
    + ' | Rearranjo para o jogo: ride, tons e surdo redistribuídos sobre'
    + ' golpes da própria transcrição (ferramentas/encorpar-carta.mjs).',
  notas,
  auto,
};
fs.writeFileSync(SAIDA, JSON.stringify(saida, null, 1) + '\n');

/* --------------------------------------------------------- relatório ---- */
const conta = (a, k) => a.reduce((o, n) => (o[n[k]] = (o[n[k]] || 0) + 1, o), {});
const linha = (rot, o) => console.log(`  ${rot.padEnd(22)}`
  + Object.entries(o).sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `${k} ${v}`).join('  '));

console.log(`\n${path.relative(RAIZ, ENTRADA).replace(/\\/g, '/')}`
  + `  →  ${path.relative(RAIZ, SAIDA).replace(/\\/g, '/')}`);
console.log(`grade: ${carta.bpm} bpm · compasso ${compasso.toFixed(3)}s`
  + ` · frase de ${CFG.frase} compassos = ${frase.toFixed(2)}s\n`);
linha('ANTES  jogador', conta(carta.notas, 'peca'));
linha('ANTES  automatico', conta(carta.auto || [], 'som'));
console.log();
linha('DEPOIS jogador', conta(notas, 'peca'));
linha('DEPOIS automatico', conta(auto, 'som'));
console.log(`\n  crash promovido: ${crashPromovido.length}`
  + ` · chimbal → ride: ${virouRide}`
  + ` · caixa → tom/surdo: ${virouTom}`);
console.log(`\nteste com:  ?carta=${path.basename(SAIDA, '.json')}&sem=caixa\n`);
