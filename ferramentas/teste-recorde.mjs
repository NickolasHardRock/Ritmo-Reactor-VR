/* ============================================================================
   teste-recorde.mjs — RN09 conferida sem navegador.

     node ferramentas/teste-recorde.mjs      (ou `npm run test:api`)

   Sobe o Express em memória numa porta livre e conversa com ele por HTTP,
   igual ao jogo. Não precisa de Postgres, de build nem de headset: é o teste
   que se pode rodar depois de cada mexida na regra.

   O `npm test` (Playwright) cobre outra coisa — ele dirige o jogo de verdade.
   Aqui a pergunta é só: o servidor decide certo quem é recorde?
   ========================================================================== */

import { app } from '../backend/app.js';
import { ehRecorde, PONTOS_MINIMOS } from '../backend/regras.js';

let falhas = 0;
const conf = (ok, t, extra = '') => {
  console.log((ok ? '  ok  ' : '  FALHA  ') + t + (extra ? `  [${extra}]` : ''));
  if (!ok) falhas++;
};

/* --- a regra pura ------------------------------------------------------- */
console.log('\nRN09 — a regra, sem rede');
conf(PONTOS_MINIMOS === 1000, 'piso é 1000');
conf(ehRecorde(1000, null) === true,  'primeira partida no piso é recorde');
conf(ehRecorde(999,  null) === false, 'abaixo do piso não é recorde nem sendo a primeira');
conf(ehRecorde(1200, { pontos: 1100 }) === true,  'supera o recorde');
conf(ehRecorde(1100, { pontos: 1100 }) === false, 'empate NÃO desbanca');
conf(ehRecorde(900,  { pontos: 100 })  === false, 'bate o recorde mas não o piso');

/* --- a API em memória --------------------------------------------------- */
const srv = app.listen(0);
const U = `http://localhost:${srv.address().port}/api`;
const post = (b) => fetch(`${U}/partidas`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(b),
}).then(async r => ({ s: r.status, j: await r.json() }));
const get = (p) => fetch(`${U}${p}`).then(async r => ({ s: r.status, j: await r.json() }));

const base = { tempo: 90, precisao: 80, erros: 2, comboMax: 12, estrelas: 4 };
const M = 'colour-me-red';

console.log('\nO recorde é por MÚSICA e por NÍVEL');
let r = await get(`/ranking/recorde?musica=${M}&nivel=facil`);
conf(r.s === 200 && r.j.recorde === null,
     'tabela vazia: recorde null, não zero', JSON.stringify(r.j.recorde));
conf(r.j.minimo === 1000, 'o piso viaja na resposta — o jogo não tem cópia da regra');

r = await post({ ...base, nome: 'Diego', musica: M, nivel: 'facil', pontos: 1500 });
conf(r.s === 201 && r.j.recorde === true,
     'primeira partida acima do piso é recorde', JSON.stringify(r.j.recorde));

r = await post({ ...base, nome: 'Bruno', musica: M, nivel: 'facil', pontos: 1200 });
conf(r.j.recorde === false, 'pontuação menor não é recorde');

r = await post({ ...base, nome: 'Nick', musica: M, nivel: 'normal', pontos: 1100 });
conf(r.j.recorde === true, 'MESMA música, outro nível: recorde próprio');

r = await post({ ...base, nome: 'Danilo', musica: M, nivel: 'facil', pontos: 900 });
conf(r.j.recorde === false, 'abaixo do piso nunca é recorde');
conf(r.s === 201, 'mas a partida é gravada assim mesmo (RN07)', `HTTP ${r.s}`);

r = await post({ ...base, nome: 'Solto', pontos: 9000 });
conf(r.s === 201 && r.j.recorde === false,
     'partida sem música escolhida não vira recorde de nada', JSON.stringify(r.j.recorde));

r = await get(`/ranking/recorde?musica=${M}&nivel=facil`);
conf(r.j.recorde?.nome === 'Diego' && r.j.recorde?.pontos === 1500,
     'o recorde é o maior', JSON.stringify(r.j.recorde));

console.log('\nO recorde usa o MESMO critério do top da tela de escolha');
const top = await get(`/ranking?limite=1&musica=${M}&nivel=facil`);
conf(top.j.itens[0]?.nome === r.j.recorde?.nome
  && top.j.itens[0]?.pontos === r.j.recorde?.pontos,
     'GET /ranking?limite=1 e GET /ranking/recorde apontam o mesmo campeão',
     `${top.j.itens[0]?.nome} / ${r.j.recorde?.nome}`);

console.log('\nValidação');
r = await get('/ranking/recorde?musica=' + M);
conf(r.s === 400, 'recorde sem nivel é 400', `HTTP ${r.s}`);
r = await get('/ranking/recorde?musica=..%2F..%2Fetc%2Fpasswd&nivel=facil');
conf(r.s === 400, 'chave de música com caminho é recusada', `HTTP ${r.s}`);
r = await post({ ...base, nome: '', musica: M, nivel: 'facil', pontos: 1200 });
conf(r.s === 400, 'nome vazio continua recusado');

srv.close();
console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTudo passou');
process.exit(falhas ? 1 : 0);
