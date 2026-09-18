/* ============================================================================
   testa-recordes.mjs — confere o PÓDIO POR MÚSICA direto na camada de dados,
   sem Express e sem navegador.

   Roda nos DOIS bancos, e é a ideia: sem DATABASE_URL usa o adaptador em
   memória; com ela usa o PostgreSQL de verdade — e as duas respostas têm de
   ser iguais. É o teste que pega o dia em que o SQL e o JavaScript
   discordarem sobre o desempate.

   USO
     node ferramentas/testa-recordes.mjs                       # memória
     DATABASE_URL="postgresql://..." node ferramentas/testa-recordes.mjs

   Com Postgres ele grava linhas de teste (jogadores "T-…" e músicas
   "teste-…") e as APAGA no fim.
   ========================================================================== */

import assert from 'node:assert/strict';
const { db } = await import('../backend/db/index.js');
const base = await db();
console.log(`adaptador: ${base.tipo}`);

const marca = Date.now().toString(36);
const A = `teste-a-${marca}`, B = `teste-b-${marca}`;
const nome = (n) => `T-${n}-${marca}`;

async function jogar(quem, musica, pontos, tempo = 90){
  const jogador_id = await base.acharOuCriarJogador(nome(quem));
  const musica_id = musica ? await base.acharOuCriarMusica(musica, `Título ${musica}`) : null;
  return base.salvarPartida({ jogador_id, musica_id, pontos, tempo,
    precisao: 80, erros: 3, combo_max: 10, estrelas: 3 });
}

// Música A: cinco jogadores, um deles com duas partidas (vale a melhor).
await jogar('ana',   A, 900);
await jogar('ana',   A, 300);            // pior — não pode ocupar outra vaga
await jogar('bia',   A, 1200);
await jogar('caio',  A, 900, 80);        // empata com a Ana e é mais rápido
await jogar('duda',  A, 500);
await jogar('edu',   A, 100);            // 5º: fica de fora
// Música B: uma jogadora só.
await jogar('bia',   B, 700);
// Partida sem música: conta no ranking geral, mas não em pódio nenhum.
await jogar('fabio', null, 99999);

const todas = await base.rankingPorMusica(3);
const daMinha = (slug) => todas.find(m => m.musica === slug);
const a = daMinha(A), b = daMinha(B);

assert.ok(a, 'a música A deveria ter pódio');
assert.equal(a.itens.length, 3, 'o pódio tem no máximo 3 lugares');
assert.deepEqual(a.itens.map(i => i.nome), [nome('bia'), nome('caio'), nome('ana')],
  'ordem: 1200; depois 900 com menor tempo (caio); depois 900 (ana)');
assert.deepEqual(a.itens.map(i => i.posicao), [1, 2, 3]);
assert.equal(a.itens.filter(i => i.nome === nome('ana')).length, 1,
  'a Ana aparece UMA vez, com a melhor partida');
assert.equal(a.itens[2].pontos, 900, 'a Ana entra com 900, não com 300');
assert.equal(a.titulo, `Título ${A}`);

assert.ok(b, 'a música B deveria ter pódio');
assert.deepEqual(b.itens.map(i => i.nome), [nome('bia')]);

assert.ok(!todas.some(m => m.itens.some(i => i.nome === nome('fabio'))),
  'partida sem música não entra em pódio');
for (const m of todas) for (const i of m.itens)
  for (const k of ['posicao', 'pontos', 'tempo', 'precisao', 'combo_max', 'estrelas'])
    assert.equal(typeof i[k], 'number', `${k} deve ser número (${base.tipo})`);

const so1 = (await base.rankingPorMusica(1)).find(m => m.musica === A);
assert.equal(so1.itens.length, 1, 'limite=1 devolve só o primeiro');

// o título de uma música já cadastrada não muda por um POST posterior
await base.acharOuCriarMusica(A, 'NOME FORJADO');
assert.equal((await base.rankingPorMusica(3)).find(m => m.musica === A).titulo,
  `Título ${A}`, 'título só vale na primeira vez');

console.log('✓ pódio por música: ordem, desempate, melhor-partida-por-jogador, corte, tipos');
console.log('  A →', a.itens.map(i => `${i.posicao}. ${i.nome.split('-')[1]} ${i.pontos}`).join(' | '));

if (base.tipo === 'postgres'){
  const { default: pg } = await import('pg');
  const c = new pg.Client({ connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false } });
  await c.connect();
  await c.query(`DELETE FROM jogador WHERE nome LIKE $1`, [`T-%-${marca}`]);
  await c.query(`DELETE FROM musica  WHERE slug LIKE $1`, [`teste-%-${marca}`]);
  await c.end();
  console.log('  linhas de teste apagadas');
}
process.exit(0);
