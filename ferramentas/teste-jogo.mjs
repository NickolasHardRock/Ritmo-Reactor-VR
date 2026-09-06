/* ============================================================================
   teste-jogo.mjs — testes funcionais automatizados do front (Etapa 8).

   Roda o jogo num Chromium de verdade, serve o build de produção e exercita
   as regras. Não substitui o teste no headset (conforto, escala e enjoo só
   se avaliam lá), mas pega regressão de lógica antes de subir.

   USO:
     npm run build
     node ferramentas/teste-jogo.mjs

   Requer Playwright:  npm i -D playwright && npx playwright install chromium
   ========================================================================== */

import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { app } from '../backend/app.js';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(RAIZ, 'frontend', 'dist');
const PORTA = 8123;

const MIME = {
  '.html':'text/html', '.js':'text/javascript', '.css':'text/css',
  '.glb':'model/gltf-binary', '.wasm':'application/wasm', '.json':'application/json',
};

if (!fs.existsSync(DIST)){
  console.error('dist/ não existe. Rode `npm run build` antes.');
  process.exit(1);
}

/* O mesmo servidor entrega o build E a API. Assim o teste exercita a
   integração de verdade (RF11/RF12) em vez de só o front isolado — que é
   exatamente o arranjo do Vercel em produção: mesmo domínio, sem CORS. */
const servidor = http.createServer((req, res) => {
  if (req.url.startsWith('/api')) return app(req, res);
  const rel = decodeURIComponent(req.url.split('?')[0]);
  const alvo = path.join(DIST, rel === '/' ? 'index.html' : rel);
  if (!alvo.startsWith(DIST) || !fs.existsSync(alvo) || fs.statSync(alvo).isDirectory()){
    res.writeHead(404); return res.end('nao encontrado');
  }
  res.writeHead(200, {
    'Content-Type': MIME[path.extname(alvo)] || 'application/octet-stream',
    'Content-Length': fs.statSync(alvo).size,
  });
  fs.createReadStream(alvo).pipe(res);
});
await new Promise(r => servidor.listen(PORTA, r));

const navegador = await chromium.launch({
  // executablePath permite apontar um Chromium já instalado na máquina;
  // sem ele o Playwright usa o próprio (npx playwright install chromium).
  ...(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {}),
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
});
const pagina = await navegador.newPage({ viewport: { width: 1280, height: 800 } });

const erros = [];
pagina.on('pageerror', e => erros.push(String(e.message)));
pagina.on('console', m => { if (m.type() === 'error') erros.push(m.text()); });

let falhas = 0;
const ok   = (t, extra='') => console.log(`  ✓ ${t}${extra ? '  ' + extra : ''}`);
const nok  = (t, extra='') => { falhas++; console.log(`  ✗ ${t}${extra ? '  ' + extra : ''}`); };
const conf = (cond, t, extra='') => cond ? ok(t, extra) : nok(t, extra);

console.log('\nCT-01  carregamento');
await pagina.goto(`http://localhost:${PORTA}/`);
await pagina.waitForFunction('window.__pronto === true', { timeout: 60000 });
ok('cenário e bateria carregados');

console.log('\nCT-02  detecção varrida de batida (o núcleo do jogo)');
const det = await pagina.evaluate(`(() => {
  const J = window.__jogo, linhas = [];
  const zerar = () => J.zonas.forEach(z => z.ultima = -9);
  for (const v of [1, 2, 3, 5, 8, 12]){
    let varrido = 0, ingenuo = 0;
    for (const p of J.PECAS){
      zerar();
      if (J.simularBatidaVR(p.id, v, 1/72) === p.id) varrido++;
      if (J.testeIngenuo(p.id, v, 1/72)) ingenuo++;
    }
    linhas.push({ velocidade: v, varrido, ingenuo });
  }
  return linhas;
})()`);
for (const l of det)
  conf(l.varrido === 7,
    `${String(l.velocidade).padStart(2)} m/s (${(l.velocidade/72*100).toFixed(1)} cm/quadro)`,
    `varrido ${l.varrido}/7 · ingênuo ${l.ingenuo}/7`);

console.log('\nCT-03  RN03 — a mesma batida não conta duas vezes');
const repique = await pagina.evaluate(`(() => {
  const J = window.__jogo; J.zonas.forEach(z => z.ultima = -9);
  let n = 0; for (let i = 0; i < 10; i++) if (J.simularBatidaVR('caixa', 5, 1/72)) n++;
  return n;
})()`);
conf(repique === 1, 'dez batidas no mesmo quadro registram uma só', `registrou ${repique}`);

console.log('\nCT-04  fase 1 — calibração');
await pagina.click('#btn-jogar');
await pagina.waitForTimeout(300);
let guarda = 0;
while (await pagina.evaluate('window.__jogo.jogo.fase') === 0 && guarda++ < 30){
  const alvo = await pagina.evaluate('window.__jogo.cal.atual');
  if (!alvo) break;
  await pagina.evaluate(`window.__jogo.bater(window.__jogo.zonas.find(z => z.p.id === '${alvo}'), .9)`);
  await pagina.waitForTimeout(50);
}
const pontos1 = await pagina.evaluate('window.__jogo.jogo.pontos');
/* Sete peças, todas PERFEITO (100), combo de 1 a 7 — ainda abaixo do
   primeiro degrau do multiplicador (10), então vale x1: 7 x 100 = 700.
   O 140 daqui era da tabela antiga, de quando um acerto valia 20; a troca
   pelo modelo de pontuação próprio mudou a tabela e não mexeu neste número. */
const ESPERADO_CALIBRACAO = 700;
conf(pontos1 === ESPERADO_CALIBRACAO,
     `sete peças acertadas valem ${ESPERADO_CALIBRACAO} pontos`, `deu ${pontos1}`);
conf(await pagina.evaluate('window.__jogo.zonas.every(z => !z.rotulo.visible)'),
     'rótulos somem depois da calibração');

console.log('\nCT-05  fase 2 — eco');
await pagina.waitForTimeout(1900);
conf((await pagina.textContent('#h-fase')).includes('Eco'), 'fase 2 ativa');
await pagina.waitForFunction('window.__jogo.eco.tocando === false', { timeout: 15000 });
const padrao = await pagina.evaluate('window.__jogo.eco.padrao');
conf(padrao.every((v, i) => i === 0 || v !== padrao[i-1]),
     'padrão não repete a mesma peça em seguida', padrao.join(' > '));

console.log('\nCT-06  RN06 — interação inválida avisa e zera o combo');
const antes = await pagina.evaluate('window.__jogo.jogo.erros');
const errada = (await pagina.evaluate('window.__jogo.PECAS')).map(p => p.id).find(id => id !== padrao[0]);
await pagina.evaluate(`window.__jogo.bater(window.__jogo.zonas.find(z => z.p.id === '${errada}'), .9)`);
await pagina.waitForTimeout(120);
conf(await pagina.evaluate('window.__jogo.jogo.erros') === antes + 1, 'erro contabilizado');
conf(await pagina.evaluate('window.__jogo.jogo.combo') === 0, 'combo zerado');

console.log('\nCT-07  RF09/RF10 — conclusão e resultado');
/* 20 perfeitas, 6 boas, 3 erros -> base (20*100 + 6*50) / (29*100) = 79%,
   que cai na faixa de 3 estrelas (corte em 70). Os números são escolhidos
   para cair no MEIO de uma faixa: um caso na borda passaria a testar o
   arredondamento em vez da regra. */
await pagina.evaluate(`(() => { const J = window.__jogo;
  Object.assign(J.jogo, { pontos: 700, perfeitas: 20, boas: 6, erros: 3, comboMax: 14 });
  J.concluir(); })()`);
await pagina.waitForTimeout(400);
conf(await pagina.textContent('#f-pontos') === '700', 'pontuação exibida');
conf(await pagina.textContent('#f-combo') === '14x', 'combo máximo exibido');
conf(await pagina.textContent('#f-prec') === '79%', 'precisão ponderada exibida',
     'um BOM vale metade de um PERFEITO');
conf(await pagina.textContent('#f-estrelas') === '★★★☆☆', 'estrelas conferem com a precisão',
     await pagina.textContent('#f-estrelas'));

console.log('\nCT-07b  RN04 — a tabela do multiplicador');
const mult = await pagina.evaluate(`(() => { const P = window.__jogo.pontuacao;
  return [0,9,10,19,20,29,30,99].map(P.multiplicador); })()`);
conf(JSON.stringify(mult) === JSON.stringify([1,1,2,2,3,3,4,4]),
     'x1 até 9, x2 aos 10, x3 aos 20, x4 aos 30', mult.join(' '));
const barra = await pagina.evaluate(`(() => { const P = window.__jogo.pontuacao;
  return [0,5,10,15,30].map(c => +P.progressoDoDegrau(c).toFixed(2)); })()`);
conf(JSON.stringify(barra) === JSON.stringify([0,0.5,0,0.5,1]),
     'barra do rodapé mede o caminho até o próximo degrau', barra.join(' '));

console.log('\nCT-08  custo por quadro');
const custo = await pagina.evaluate(`({
  tris: window.__jogo.renderer.info.render.triangles,
  draws: window.__jogo.renderer.info.render.calls })`);
console.log(`  · ${custo.tris.toLocaleString('pt-BR')} triângulos, ${custo.draws} draw calls`);
console.log('    (em VR isto DOBRA — um desenho por olho)');
conf(custo.draws < 200, 'draw calls dentro do razoável para mobile');

console.log('\nCT-09  RF11/RF12 — a partida foi registrada pela API');
const reg = await fetch(`http://localhost:${PORTA}/api/ranking?limite=5`).then(r => r.json());
conf(reg.total >= 1, 'partida gravada no banco', `${reg.total} registro(s)`);
conf(reg.itens[0]?.pontos === 700, 'ranking devolve a pontuação correta',
     `topo: ${reg.itens[0]?.nome} com ${reg.itens[0]?.pontos}`);
conf((await pagina.textContent('#f-api')).includes('salva'),
     'tela de resultado confirma a gravação', await pagina.textContent('#f-api'));

console.log('\nCT-10  console limpo');
conf(erros.length === 0, 'nenhum erro de JavaScript', erros.join(' | '));

await navegador.close();
servidor.close();

console.log(falhas === 0
  ? '\nTodos os casos passaram.\n'
  : `\n${falhas} caso(s) falharam.\n`);
process.exit(falhas === 0 ? 0 : 1);
