/* ============================================================================
   teste-recorde.mjs — RN08 e RN09 conferidas sem navegador.

     node ferramentas/teste-recorde.mjs      (ou `npm run test:api`)

   Sobe o Express em memória numa porta livre e conversa com ele por HTTP,
   igual ao jogo. Não precisa de Postgres, de build nem de headset: é o teste
   que se pode rodar depois de cada mexida na regra.

   O que o `npm test` (Playwright) cobre é outra coisa — ele dirige o jogo de
   verdade. Aqui a pergunta é só: o servidor decide certo quem é recorde?
   ========================================================================== */

import { app } from '../backend/app.js';
import { ehRecorde, PONTOS_MINIMOS } from '../backend/regras.js';

let falhas = 0;
const conf = (ok, t, extra='') => { console.log((ok?'  ok  ':'  FALHA ')+t+(extra?`  [${extra}]`:'')); if(!ok) falhas++; };

/* --- regra pura ------------------------------------------------------- */
console.log('\nRN09 — a regra, sem rede');
conf(PONTOS_MINIMOS === 1000, 'piso é 1000');
conf(ehRecorde(1000, null) === true,  'primeira partida no piso é recorde');
conf(ehRecorde(999,  null) === false, 'abaixo do piso não é recorde nem sendo a primeira');
conf(ehRecorde(1200, {pontos:1100}) === true,  'supera o recorde');
conf(ehRecorde(1100, {pontos:1100}) === false, 'empate NÃO desbanca');
conf(ehRecorde(900,  {pontos:100})  === false, 'bate o recorde mas não o piso');

/* --- API em memória --------------------------------------------------- */
const srv = app.listen(0);
const porta = srv.address().port;
const U = `http://localhost:${porta}/api`;
const post = (b) => fetch(`${U}/partidas`, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(b)}).then(async r=>({s:r.status,j:await r.json()}));
const get  = (p) => fetch(`${U}${p}`).then(async r=>({s:r.status,j:await r.json()}));

const base = { tempo:90, precisao:80, erros:2, comboMax:12, estrelas:4 };

console.log('\nRecorde por música E dificuldade');
let r = await get('/ranking/recorde?musica=colour-me-red&nivel=facil');
conf(r.s===200 && r.j.recorde === null, 'tabela vazia: recorde null, não zero', JSON.stringify(r.j.recorde));
conf(r.j.minimo === 1000, 'o piso viaja na resposta');

r = await post({...base, nome:'Diego', musica:'colour-me-red', nivel:'facil', pontos:1500});
conf(r.s===201 && r.j.recorde === true, 'primeira partida acima do piso é recorde', JSON.stringify(r.j.recorde));

r = await post({...base, nome:'Bruno', musica:'colour-me-red', nivel:'facil', pontos:1200});
conf(r.j.recorde === false, 'pontuação menor não é recorde');

r = await post({...base, nome:'Nick', musica:'colour-me-red', nivel:'normal', pontos:1100});
conf(r.j.recorde === true, 'MESMA música, outra dificuldade: recorde próprio');

r = await post({...base, nome:'Danilo', musica:'colour-me-red', nivel:'facil', pontos:900});
conf(r.j.recorde === false, 'abaixo do piso nunca é recorde');
conf(r.s === 201, 'mas a partida é gravada assim mesmo (RN07)', `HTTP ${r.s}`);

r = await get('/ranking/recorde?musica=colour-me-red&nivel=facil');
conf(r.j.recorde?.nome === 'Diego' && r.j.recorde?.pontos === 1500, 'o recorde é o maior', JSON.stringify(r.j.recorde));

console.log('\nRanking por dificuldade (RN08)');
r = await get('/ranking/melhores?musica=colour-me-red');
const porNivel = Object.fromEntries(r.j.itens.map(i=>[i.nivel, i.nome+':'+i.pontos]));
conf(porNivel.facil === 'Diego:1500', 'melhor do Fácil', porNivel.facil);
conf(porNivel.normal === 'Nick:1100', 'melhor do Normal', porNivel.normal);
conf(r.j.itens.length === 2, 'uma linha por dificuldade jogada', String(r.j.itens.length));

r = await get('/ranking?nivel=facil&limite=10');
conf(r.j.itens.every(i=>i.nivel==='facil'), 'filtro por dificuldade');
conf(r.j.itens[0].nome === 'Diego', 'ordena por pontos');

r = await get('/ranking?limite=10');
conf(r.j.total === 4, 'sem filtro, o ranking antigo continua igual', String(r.j.total));
conf(r.j.itens[0].pontos === 1500, 'topo geral');

console.log('\nValidação');
r = await post({...base, nome:'X', musica:'../../etc/passwd', nivel:'facil', pontos:1200});
conf(r.s === 400, 'chave de música com caminho é recusada', `HTTP ${r.s}`);
r = await post({...base, nome:'', musica:'colour-me-red', nivel:'facil', pontos:1200});
conf(r.s === 400, 'nome vazio continua recusado');
r = await post({...base, nome:'SemChaves', pontos:1200});
conf(r.s === 201 && r.j.musica === 'desconhecida' && r.j.nivel === 'facil',
     'cliente antigo (sem musica/nivel) ainda grava', JSON.stringify([r.j.musica, r.j.nivel]));
r = await get('/ranking/recorde?musica=colour-me-red');
conf(r.s === 400, 'recorde sem nivel é 400');

srv.close();
console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTudo passou');
process.exit(falhas ? 1 : 0);
