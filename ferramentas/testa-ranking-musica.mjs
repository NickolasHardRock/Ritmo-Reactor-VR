/* ============================================================================
   testa-ranking-musica.mjs — confere o TOP 3 POR MÚSICA, sem navegador.

   ESTE É O ARQUIVO PARA TESTAR SOZINHO. Não precisa de Playwright, de
   Chromium, do build do front nem de servidor rodando: ele sobe a API dentro
   do próprio processo, joga partidas de mentira e confere o que o ranking
   devolve. Leva uns 2 segundos e termina com código 0 (tudo certo) ou 1.

   USO
     npm run test:ranking                 # roda em memória. Não toca em banco nenhum.
     node ferramentas/testa-ranking-musica.mjs

   O QUE ELE CONFERE
     1. gravar partida com música e nível, e o que o servidor rejeita
     2. o top 3 sai ordenado, sem repetir jogador (vale a MELHOR partida)
     3. o desempate é o menor tempo
     4. uma música não vaza para outra, nem um nível para outro
     5. partida antiga (sem música) fica de fora do top 3 e dentro do geral
     6. TODA música de `public/musicas.json` × TODOS os níveis funciona — é a
        garantia de que uma música nova, acrescentada nos cartões, já nasce
        com ranking, sem mexer em código
     7. cada cartão do manifesto tem id válido, único e carta existente

   MODO POSTGRES (opcional — para conferir o banco de verdade, ex.: Supabase)
     $env:BANCO_TESTE_URL = "postgresql://..."     # PowerShell
     node ferramentas/testa-ranking-musica.mjs --postgres

   Usa a variável BANCO_TESTE_URL e NÃO a DATABASE_URL, de propósito: quem
   roda isto com a DATABASE_URL da produção já definida no terminal não pode
   sujar o banco de verdade sem querer. Sem --postgres a DATABASE_URL é
   IGNORADA. Os dados de teste têm prefixo "teste-" e são apagados no fim.
   O teste de MIGRAÇÃO (banco com o esquema ANTIGO) roda num schema
   temporário próprio e o remove depois — não mexe nas suas tabelas.
   ========================================================================== */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MODO_PG = process.argv.includes('--postgres');
const SUFIXO = Math.random().toString(36).slice(2, 8);   // isola esta rodada
const NIVEIS = ['facil', 'normal', 'profissa'];           // chaves de NIVEIS (config.js)

/* ---- escolhe o banco ANTES de importar a API: db/index.js lê a variável
        na hora do import e guarda o adaptador para sempre. ------------------ */
if (MODO_PG){
  const url = process.env.BANCO_TESTE_URL?.trim();
  if (!url){
    console.error('✗ --postgres precisa de BANCO_TESTE_URL definida NESTA janela.');
    console.error('  PowerShell:  $env:BANCO_TESTE_URL = "postgresql://..."');
    process.exit(1);
  }
  process.env.DATABASE_URL = url;
} else {
  delete process.env.DATABASE_URL;      // garante memória, mesmo que exista uma
}

/* ------------------------------------------------------------ pequena régua */
let falhas = 0, total = 0;
const ok  = (t, extra = '') => { total++; console.log(`  ✓ ${t}${extra ? '  ' + extra : ''}`); };
const nok = (t, extra = '') => { total++; falhas++; console.log(`  ✗ ${t}${extra ? '  ' + extra : ''}`); };
const conf = (cond, t, extra = '') => cond ? ok(t, extra) : nok(t, extra);
const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const secao = (t) => console.log(`\n${t}`);

/* ---------------------------------------------------------------- a API ---- */
const { app } = await import('../backend/app.js');
const servidor = http.createServer(app);
await new Promise(r => servidor.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${servidor.address().port}/api`;

const postar = (corpo) => fetch(`${BASE}/partidas`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(corpo),
});
const ranking = async (query = '') => {
  const r = await fetch(`${BASE}/ranking${query}`);
  return { status: r.status, corpo: await r.json() };
};
const top3 = (musica, nivel) =>
  ranking(`?limite=3&musica=${encodeURIComponent(musica)}&nivel=${encodeURIComponent(nivel)}`);

/** Uma partida válida; `o` sobrescreve o que interessa ao caso. */
const partida = (o = {}) => ({
  nome: 'Teste', pontos: 1000, tempo: 90, precisao: 80,
  erros: 2, comboMax: 10, estrelas: 3, ...o,
});
const nomes = (r) => r.corpo.itens.map(i => i.nome);

console.log(`\nRanking por música — banco: ${MODO_PG ? 'PostgreSQL (BANCO_TESTE_URL)' : 'memória'}`
          + `  ·  rodada ${SUFIXO}`);

/* ========================================================================
   1 — gravar
   ======================================================================== */
secao('1  gravar partida com música e nível');
const MA = `teste-${SUFIXO}-a`, MB = `teste-${SUFIXO}-b`;
const n = (s) => `teste-${SUFIXO}-${s}`;            // nome de jogador desta rodada

let r = await postar(partida({ nome: n('ana'), pontos: 500, musica: MA, nivel: 'facil' }));
let j = await r.json();
conf(r.status === 201 && j.musica === MA && j.nivel === 'facil',
     'POST devolve 201 e repete música e nível', `HTTP ${r.status}`);

r = await postar(partida({ nome: n('velho') }));    // cliente antigo: sem os campos
conf(r.status === 201, 'partida SEM música/nível continua aceita (compatibilidade)', `HTTP ${r.status}`);

for (const [ruim, campo] of [
  [{ musica: 'a b' }, 'musica com espaço'],
  [{ musica: '../etc' }, 'musica com ../'],
  [{ musica: 'x'.repeat(61) }, 'musica com 61 caracteres'],
  [{ nivel: 'FACIL' }, 'nivel em maiúsculas'],
  [{ nivel: 'f1' }, 'nivel com número'],
]){
  r = await postar(partida({ nome: n('ruim'), ...ruim }));
  conf(r.status === 400, `rejeita ${campo}`, `HTTP ${r.status}`);
}

/* ========================================================================
   2 — o top 3: ordem, repetição, desempate
   ======================================================================== */
secao('2  top 3 da música: ordem, uma linha por jogador, desempate');
const jogos = [
  ['bia',   900, 80], ['caio',  1500, 95], ['duda',  700, 70],
  ['edu',  1200, 88], ['fabi',  1500, 85],       // caio e fabi empatam em 1500
];
for (const [nome, pontos, tempo] of jogos)
  await postar(partida({ nome: n(nome), pontos, tempo, musica: MA, nivel: 'facil' }));
/* a Bia joga mais duas vezes, PIOR — não pode aparecer duas vezes nem baixar */
await postar(partida({ nome: n('bia'), pontos: 100, musica: MA, nivel: 'facil' }));
await postar(partida({ nome: n('bia'), pontos: 50,  musica: MA, nivel: 'facil' }));

let t = await top3(MA, 'facil');
conf(t.corpo.itens.length === 3, 'devolve exatamente 3 quando há mais que 3 jogadores',
     `${t.corpo.itens.length} itens`);
conf(igual(nomes(t), [n('fabi'), n('caio'), n('edu')]),
     'ordem: mais pontos primeiro; empate no menor tempo',
     nomes(t).map(x => x.replace(`teste-${SUFIXO}-`, '')).join(' > '));
conf(igual(t.corpo.itens.map(i => i.posicao), [1, 2, 3]), 'posições 1, 2 e 3');
conf(t.corpo.itens.every(i => typeof i.pontos === 'number' && typeof i.posicao === 'number'),
     'pontos e posição vêm como NÚMERO, não como texto');

const todos = await ranking(`?limite=10&musica=${MA}&nivel=facil`);
const bia = todos.corpo.itens.filter(i => i.nome === n('bia'));
conf(bia.length === 1 && bia[0].pontos === 900,
     'quem jogou 3 vezes aparece UMA vez, com a MELHOR partida', `${bia.length}× ${bia[0]?.pontos} pts`);

/* ========================================================================
   3 — isolamento
   ======================================================================== */
secao('3  uma música não vaza para outra, nem um nível para outro');
await postar(partida({ nome: n('gui'), pontos: 8000, musica: MB, nivel: 'facil' }));
await postar(partida({ nome: n('hana'), pontos: 4000, musica: MA, nivel: 'normal' }));

t = await top3(MB, 'facil');
conf(igual(nomes(t), [n('gui')]), 'outra música tem a própria tabela', nomes(t).join(', '));
t = await top3(MA, 'facil');
conf(!nomes(t).includes(n('gui')), 'quem joga a música B não entra no top 3 da A');
t = await top3(MA, 'normal');
conf(igual(nomes(t), [n('hana')]), 'o nível Médio da mesma música tem a própria tabela', nomes(t).join(', '));
t = await top3(MA, 'profissa');
conf(t.status === 200 && t.corpo.itens.length === 0,
     'música/nível sem ninguém devolve lista VAZIA (o jogo mostra "vaga livre")');

/* ========================================================================
   4 — partida antiga e ranking geral
   ======================================================================== */
secao('4  partida sem música fica fora do top 3 e dentro do ranking geral');
t = await top3(MA, 'facil');
conf(!nomes(t).includes(n('velho')), 'partida sem música não entra no top 3 da música');
const geral = await ranking('?limite=100');
conf(nomes(geral).includes(n('velho')), 'mas continua no ranking GERAL');
conf(geral.corpo.musica === null && geral.corpo.nivel === null,
     'ranking geral não ecoa filtro nenhum');
const geral2 = await ranking(`?limite=100&musica=`);
conf(geral2.status === 200 && geral2.corpo.musica === null,
     '?musica= vazio é tratado como "sem filtro", não como erro');

/* ========================================================================
   5 — parâmetros ruins na consulta
   ======================================================================== */
secao('5  consulta com parâmetro inválido');
for (const q of ['?musica=a%20b', '?musica=../x', '?nivel=FACIL', '?musica=a&musica=b'])
  conf((await ranking(q)).status === 400, `GET /ranking${q} → 400`);
conf((await ranking('?limite=abc&musica=' + MA)).status === 200,
     'limite inválido continua caindo no padrão (não vira erro)');

/* ========================================================================
   6 — QUALQUER música dos cartões, em QUALQUER nível
   ======================================================================== */
secao('6  toda música de public/musicas.json × todos os níveis');
const CAM_MANIFESTO = path.join(RAIZ, 'frontend', 'public', 'musicas.json');
let manifesto = [];
try {
  const j = JSON.parse(fs.readFileSync(CAM_MANIFESTO, 'utf8'));
  manifesto = Array.isArray(j) ? j : (j.musicas || []);
  ok(`manifesto lido: ${manifesto.length} música(s)`, manifesto.map(m => m.id).join(', '));
} catch (e){
  nok('ler frontend/public/musicas.json', e.message);
}

/* O mesmo tratamento que `normalizarMusica` (frontend/src/musicas.js) faz: é
   ESTE id, e não o cru, que o jogo manda à API. */
const idNormalizado = (m, i) => (String(m.id || `musica${i + 1}`).replace(/[^\w-]/g, '')) || `musica${i + 1}`;
const ids = manifesto.map(idNormalizado);
conf(new Set(ids).size === ids.length, 'nenhum id repetido (dois cartões dividiriam o mesmo ranking)',
     ids.length === new Set(ids).size ? '' : 'repetido: ' + ids.filter((x, i) => ids.indexOf(x) !== i).join(', '));
conf(ids.every(id => id.length <= 60), 'todo id cabe no limite de 60 caracteres da API');

manifesto.forEach((m, i) => {
  const carta = path.join(RAIZ, 'frontend', 'public', 'cartas', `${m.carta}.json`);
  conf(fs.existsSync(carta), `cartão "${ids[i]}" aponta para uma carta que existe`, `cartas/${m.carta}.json`);
});

for (const [i, m] of manifesto.entries()){
  const id = ids[i];
  /* prefixo de rodada no id NÃO dá: o que se quer provar é que o id REAL do
     cartão funciona. No modo Postgres isso deixaria linhas para trás, então
     o nome do jogador é que leva o prefixo, e o fim da rodada apaga por ele. */
  let certo = true;
  for (const nivel of NIVEIS){
    const alvo = [['zed', 300, 70], ['yan', 900, 80], ['xia', 600, 75], ['walt', 100, 60]];
    for (const [nome, pontos, tempo] of alvo)
      await postar(partida({ nome: n(`${id}-${nivel}-${nome}`), pontos, tempo, musica: id, nivel }));
    const pos = (await top3(id, nivel)).corpo.itens;
    const meus = pos.filter(x => x.nome.startsWith(`teste-${SUFIXO}-${id}-${nivel}-`));
    /* Em banco com dados REAIS dessa música pode haver gente na frente dos
       nossos; então confere o que é nosso: se aparecem, aparecem em ordem. */
    const ordem = meus.map(x => x.pontos);
    const ordenado = ordem.every((v, k) => k === 0 || ordem[k - 1] >= v);
    if (pos.length > 3 || !ordenado || (!MODO_PG && pos.length !== 3)) certo = false;
  }
  conf(certo, `"${id}" — top 3 correto em ${NIVEIS.join(', ')}`);
}

/* ========================================================================
   7 — MIGRAÇÃO (só no modo Postgres)
   ======================================================================== */
if (MODO_PG){
  secao('7  migração: banco com o esquema ANTIGO ganha as colunas sem perder dados');
  const { default: pg } = await import('pg');
  const url = process.env.BANCO_TESTE_URL.trim();
  const ssl = url.includes('localhost') ? false : { rejectUnauthorized: false };
  const esquema = `tmp_mig_${SUFIXO}`;
  const admin = new pg.Client({ connectionString: url, ssl });
  await admin.connect();
  try {
    await admin.query(`CREATE SCHEMA ${esquema}`);
    /* O esquema de ANTES: sem musica e sem nivel. É o que está hoje no banco
       de produção. */
    await admin.query(`
      CREATE TABLE ${esquema}.jogador (id SERIAL PRIMARY KEY, nome VARCHAR(60) NOT NULL UNIQUE,
                                       criado TIMESTAMPTZ NOT NULL DEFAULT NOW());
      CREATE TABLE ${esquema}.partida (
        id SERIAL PRIMARY KEY, jogador_id INTEGER NOT NULL REFERENCES ${esquema}.jogador(id),
        pontos INTEGER NOT NULL, tempo NUMERIC(7,2) NOT NULL, precisao SMALLINT NOT NULL,
        erros SMALLINT NOT NULL DEFAULT 0, combo_max SMALLINT NOT NULL DEFAULT 0,
        estrelas SMALLINT NOT NULL, criado TIMESTAMPTZ NOT NULL DEFAULT NOW());
      INSERT INTO ${esquema}.jogador (nome) VALUES ('Diego');
      INSERT INTO ${esquema}.partida (jogador_id, pontos, tempo, precisao, estrelas)
        VALUES (1, 31200, 69.4, 94, 4);`);

    /* Aponta a MESMA API para o schema temporário e sobe uma cópia NOVA do
       adaptador (o `?v=` fura o cache de módulos do Node). */
    const sep = url.includes('?') ? '&' : '?';
    process.env.DATABASE_URL = `${url}${sep}options=-c%20search_path%3D${esquema}`;
    const { db: dbNovo } = await import(`../backend/db/index.js?migracao=${SUFIXO}`);
    const base = await dbNovo();          // <- roda iniciar(), que migra

    const cols = (await admin.query(
      `SELECT column_name FROM information_schema.columns
        WHERE table_schema = $1 AND table_name = 'partida'`, [esquema])).rows.map(x => x.column_name);
    conf(cols.includes('musica') && cols.includes('nivel'), 'colunas musica e nivel criadas',
         cols.filter(c => ['musica', 'nivel'].includes(c)).join(', '));
    const antiga = (await admin.query(`SELECT pontos, musica, nivel FROM ${esquema}.partida`)).rows[0];
    conf(antiga?.pontos === 31200 && antiga.musica === '' && antiga.nivel === '',
         'a partida antiga continua lá, com musica e nivel vazios', JSON.stringify(antiga));

    const jid = await base.acharOuCriarJogador('Diego');
    await base.salvarPartida({ jogador_id: jid, pontos: 777, tempo: 50, precisao: 90, erros: 1,
                               combo_max: 9, estrelas: 4, musica: 'colour-me-red', nivel: 'facil' });
    const pos = await base.ranking(3, { musica: 'colour-me-red', nivel: 'facil' });
    conf(pos.length === 1 && pos[0].pontos === 777,
         'partida nova grava e o filtro enxerga só ela (a antiga fica de fora)', JSON.stringify(pos.map(p => p.pontos)));
    conf((await base.ranking(3)).length === 1 && (await base.ranking(3))[0].pontos === 31200,
         'o ranking geral segue vendo a melhor de todas (a antiga, 31200)');

    await dbNovo();                        // idempotente: subir de novo não quebra
    ok('subir a API de novo sobre o banco já migrado não dá erro');
  } catch (e){
    nok('migração', e.message);
  } finally {
    await admin.query(`DROP SCHEMA IF EXISTS ${esquema} CASCADE`).catch(() => {});
    await admin.end().catch(() => {});
  }

  /* limpeza dos dados de teste da rodada, nas tabelas reais */
  const lim = new pg.Client({ connectionString: url, ssl });
  await lim.connect();
  const del = await lim.query(`DELETE FROM jogador WHERE nome LIKE $1`, [`teste-${SUFIXO}-%`]);
  console.log(`\n  (limpeza: ${del.rowCount} jogador(es) de teste apagados, e as partidas junto)`);
  await lim.end();
}

/* ------------------------------------------------------------------ fim ---- */
servidor.close();
console.log(falhas === 0
  ? `\n✔ Tudo certo — ${total} verificações.\n`
  : `\n✘ ${falhas} de ${total} verificações falharam.\n`);
process.exit(falhas === 0 ? 0 : 1);
