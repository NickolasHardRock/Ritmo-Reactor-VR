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
  draws: window.__jogo.renderer.info.render.calls,
  cena: window.__perf.inventario() })`);
console.log(`  · ${custo.tris.toLocaleString('pt-BR')} triângulos, ${custo.draws} draw calls`);
console.log('    (em VR isto DOBRA — um desenho por olho)');

/* DE QUEM É O PESO. O total sozinho aponta a dor sem apontar a causa: não
   diz se cortar deve começar pela bateria ou pelo cenário. A medida dentro
   do headset vai herdar exatamente essa dúvida, então ela se responde aqui,
   onde é barato. Conta a geometria montada, não a que sobreviveu ao
   descarte por frustum — é o peso do que existe, não o do último quadro. */
for (const g of custo.cena){
  console.log(`    ${g.nome.padEnd(10)}`
    + ` ${g.triangulos.toLocaleString('pt-BR').padStart(9)} tris`
    + ` ${String(g.malhas).padStart(4)} malhas`
    + (g.malhasDuplas
        ? `   +${g.malhasDuplas} desenhadas 2x `
          + `(+${g.triangulosExtras.toLocaleString('pt-BR')} tris)`
        : ''));
}

/* Não é asserção, é vigia. Material `transparent` com `DoubleSide` faz o
   three desenhar a malha duas vezes; o exportador de glTF marca transparente
   por hábito, e o custo não aparece em lugar nenhum do nosso código. Fica
   impresso a cada rodada para ninguém precisar redescobrir isso. */
const extras = custo.cena.reduce((s, g) => s + g.triangulosExtras, 0);
if (extras){
  console.log(`    ⚠ ${extras.toLocaleString('pt-BR')} triângulos por olho vêm da`
    + ' passada dupla de material transparente + DoubleSide');
}

conf(custo.draws < 200, 'draw calls dentro do razoável para mobile');
/* As duas raízes precisam continuar nomeadas: é o nome que separa uma da
   outra. Quem renomear sem querer faz o inventário desabar num número só,
   e o teste avisa em vez de deixar passar. */
const nomes = custo.cena.map(g => g.nome);
conf(nomes.includes('bateria') && nomes.includes('cenario'),
     'inventário separa bateria e cenário', nomes.join(', '));

/* O painel e o resumo de desempenho só aparecem dentro do headset, onde
   ninguém vê uma exceção acontecer: o quadro simplesmente para. Então o
   caminho inteiro — ligar, gravar, resumir, pintar — é exercitado aqui. */
console.log('\nCT-08b  o instrumento de medição funciona');
await pagina.evaluate('window.__perf.ligar(true)');
/* Espera CONDIÇÃO, não relógio. Neste Chromium a cena roda por software, a
   ~13 quadros por segundo: qualquer pausa fixa ou sobra ou falta, e um teste
   que depende da velocidade da máquina é um teste que vai piscar. */
await pagina.waitForFunction('window.__perf.serie().ms.length >= 12', { timeout: 30000 });
const r = await pagina.evaluate('window.__perf.resumo()');
conf(r.geral && r.geral.n >= 12, 'a sessão é gravada quadro a quadro',
     `${r.geral ? r.geral.n : 0} quadros`);
conf(r.geral && r.geral.p50 > 0 && r.geral.p95 >= r.geral.p50 && r.geral.pior >= r.geral.p95,
     'os percentis saem ordenados',
     r.geral ? `p50 ${r.geral.p50.toFixed(1)} ≤ p95 ${r.geral.p95.toFixed(1)}`
               + ` ≤ pior ${r.geral.pior.toFixed(1)}` : 'sem amostras');
conf(r.orcamento > 0 && Math.abs(r.orcamento - 1000 / r.hz) < 1e-9,
     'o orçamento vem da taxa real, não de um número fixo',
     `${r.hz} Hz -> ${r.orcamento.toFixed(1)} ms`);
conf(r.porFase.length >= 1 && r.porFase.every(f => f.n > 0),
     'a estatística é separada por fase', r.porFase.map(f => f.rotulo).join(', '));

await pagina.evaluate('window.__perf.alternarResumo(true)');
await pagina.waitForTimeout(120);
const textoResumo = await pagina.textContent('#perf-resumo');
conf(/RESUMO/.test(textoResumo) && /TOTAL/.test(textoResumo),
     'o resumo é pintado numa tela só, para sair do headset num print',
     (textoResumo.split('\n')[0] || '').trim());
await pagina.evaluate('window.__perf.alternarResumo(false); window.__perf.ligar(false)');

console.log('\nCT-09  RF11/RF12 — a partida foi registrada pela API');
const reg = await fetch(`http://localhost:${PORTA}/api/ranking?limite=5`).then(r => r.json());
conf(reg.total >= 1, 'partida gravada no banco', `${reg.total} registro(s)`);
conf(reg.itens[0]?.pontos === 700, 'ranking devolve a pontuação correta',
     `topo: ${reg.itens[0]?.nome} com ${reg.itens[0]?.pontos}`);
conf((await pagina.textContent('#f-api')).includes('salva'),
     'tela de resultado confirma a gravação', await pagina.textContent('#f-api'));

console.log('\nCT-10  console limpo');
conf(erros.length === 0, 'nenhum erro de JavaScript', erros.join(' | '));

/* ---------------------------------------------------------------------------
   CT-11 — as chaves de diagnóstico abrem sem quebrar.

   Estas duas só serão usadas DENTRO do headset, num dia marcado, com o
   equipamento na mão. Se uma delas lançar exceção, a descoberta acontece
   tarde demais: o quadro congela e a sessão de medição vai embora junto.
   Por isso elas são abertas aqui, numa aba própria, com o console vigiado.  */
console.log('\nCT-11  as chaves de diagnóstico abrem sem quebrar');
/* A aba principal sai de cena antes: neste Chromium tudo roda por software,
   e duas cenas de 450 mil triângulos disputando a mesma CPU fazem a segunda
   demorar mais que qualquer limite razoável de espera. */
await pagina.close();
for (const [chave, confere] of [
  ['perf=1&semrender=1',
   `(() => { const sc = window.__jogo.scene;
      const vis = sc.children.filter(o => o.visible && !o.isLight).map(o => o.name || o.type);
      return { visiveis: vis, temPainel: !!document.getElementById('perf') }; })()`],
  ['perf=1&escala=0.01',
   `(() => ({ visiveis: null, temPainel: !!document.getElementById('perf') }))()`],
]){
  const aba = await navegador.newPage({ viewport: { width: 800, height: 600 } });
  const ruim = [];
  aba.on('pageerror', e => ruim.push(String(e.message)));
  aba.on('console', m => { if (m.type() === 'error') ruim.push(m.text()); });
  /* `commit` em vez de `load`: o que interessa é o jogo ficar pronto, e isso
     quem responde é `window.__pronto`. Esperar o evento `load` seria esperar
     os 22 MB de modelo por um caminho que não diz nada a mais. */
  await aba.goto(`http://localhost:${PORTA}/?${chave}`,
                 { waitUntil: 'commit', timeout: 120000 });
  await aba.waitForFunction('window.__pronto === true', { timeout: 120000 });
  await aba.waitForFunction('window.__perf.serie().ms.length >= 5', { timeout: 30000 });
  const est = await aba.evaluate(confere);
  conf(ruim.length === 0 && est.temPainel, `?${chave} abre, mede e não erra`,
       ruim.join(' | ') || (est.temPainel ? '' : 'painel não apareceu'));
  /* `semrender` tem de deixar só o jogador de pé — é nele que a câmera, e
     portanto o painel, estão penduradas. Se sobrar cenário, o experimento
     não isolou nada e o número seria uma mentira confortável. */
  if (est.visiveis){
    conf(est.visiveis.length === 1 && est.visiveis[0] === 'jogador',
         'semrender esconde a cena e preserva o painel', est.visiveis.join(', '));
  }
  await aba.close();
}

await navegador.close();
servidor.close();

console.log(falhas === 0
  ? '\nTodos os casos passaram.\n'
  : `\n${falhas} caso(s) falharam.\n`);
process.exit(falhas === 0 ? 0 : 1);
