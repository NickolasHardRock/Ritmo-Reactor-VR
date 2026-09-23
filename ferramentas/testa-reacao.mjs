/* ============================================================================
   testa-reacao.mjs — confere o envelope da reação visual contra a CARTA DE
   VERDADE, sem navegador. `node ferramentas/testa-reacao.mjs`

   Existe porque `reacao.js` é módulo puro (como o `pontuacao.js`) e porque o
   que ele faz de errado não dá erro: ele acenderia a luz no tempo errado, ou
   pararia de acender depois de um reinício, e nos dois casos o jogo continua
   rodando. Os casos que importam são o CT-D (nenhuma nota deixa de acender, e
   o atraso nota->luz cabe em um quadro) e o CT-E (rebobinar).

   NÃO substitui o `npm test`, que é o portão. Este roda em ~1 s e não precisa
   de build nem de API, então dá para rodar a cada mexida no envelope.
   ========================================================================== */
import { readFileSync } from 'node:fs';
const SRC = new URL('../frontend/src/reacao.js', import.meta.url);
const { criarCanal, eventosDoSom, envelope, normalizar,
        reacaoIniciar, reacaoParar, pulsar } = await import(SRC);

const carta = JSON.parse(readFileSync(new URL('../frontend/public/cartas/colour-me-red.json', import.meta.url),'utf8'));
const [ini,fim] = carta.recorte;
const auto = carta.auto.filter(a=>a.t>=ini&&a.t<=fim).sort((a,b)=>a.t-b.t);
const OP = { decaimento:0.18, piso:0.45, teto:1.0, minimo:0.35 };
const bumbo = eventosDoSom(auto,'bumbo');

let falhas=0;
const ok=(c,msg,extra='')=>{ console.log((c?'  ok  ':'FALHA ')+msg+(extra?'  — '+extra:'')); if(!c)falhas++; };

console.log('CT-A  eventos');
ok(bumbo.length===326, 'eventosDoSom pega 326 bumbos', `${bumbo.length}`);
ok(bumbo.every(b=>(b.som||'bumbo')==='bumbo'), 'nenhum crash vazou para o canal');

console.log('\nCT-B  normalizacao');
ok(Math.abs(normalizar(0.475,OP)-0.3795)<1e-3, "batida fraca (0,475) -> ~0,38", normalizar(0.475,OP).toFixed(4));
ok(Math.abs(normalizar(1.0,OP)-1.0)<1e-9,      'batida maxima (1,0) -> 1,0');
ok(normalizar(0.10,OP)===OP.minimo,            'abaixo do piso satura no minimo');
ok(normalizar(9.99,OP)===1,                    'acima do teto satura em 1');
const r = normalizar(0.963,OP)/normalizar(0.475,OP);
ok(r>2 && r<3, 'forte/fraca da entre 2x e 3x de diferenca visivel', r.toFixed(2)+'x');

console.log('\nCT-C  envelope');
ok(envelope(10, 10, 1, .18)===1,            'pico no instante exato da nota');
ok(envelope(10.18, 10, 1, .18)<1e-9,        'zera ao fim do decaimento', envelope(10.18,10,1,.18).toExponential(1));
ok(envelope(10.30, 10, 1, .18)===0,         'zero depois do fim');
ok(envelope(9.99, 10, 1, .18)===0,          'zero ANTES da nota (nao acende adiantado)');
ok(envelope(10, -Infinity, 0, .18)===0,     'sem nota nenhuma da zero');
ok(Number.isFinite(envelope(10,NaN,1,.18)) && envelope(10,NaN,1,.18)===0, 'NaN da zero, nao NaN');
const meio = envelope(10.09,10,1,.18);
ok(meio>0.2 && meio<0.3, 'na metade do decaimento ja caiu para ~0,25 (convexo)', meio.toFixed(3));

console.log('\nCT-D  varredura a 72 Hz sobre a musica inteira');
const c = criarCanal(bumbo, OP);
const H=1/72;
let maxP=0, atrasoPior=0, engolidos=0, picos=[];
let iEv=0, ultimoPico=-1;
for (let t=-2.0; t<=fim+1; t+=H){
  const p=c.avancar(t);
  if(p>maxP)maxP=p;
  // toda nota deve produzir pulso no primeiro quadro apos ela
  while (iEv<bumbo.length && bumbo[iEv].t<=t){
    const atraso=t-bumbo[iEv].t;
    if(atraso>atrasoPior)atrasoPior=atraso;
    if(p<=0)engolidos++;
    picos.push(p);
    iEv++;
  }
  if(p>0)ultimoPico=t;
}
ok(iEv===326, 'as 326 notas foram consumidas', `${iEv}`);
ok(engolidos===0, 'nenhuma nota deixou de acender', `${engolidos} engolidas`);
ok(atrasoPior < H+1e-9, 'pior atraso nota->luz cabe em UM quadro', `${(atrasoPior*1000).toFixed(1)} ms (quadro = ${(H*1000).toFixed(1)} ms)`);
ok(maxP<=1+1e-9, 'pulso nunca passa de 1', maxP.toFixed(4));
const fortes=picos.filter(p=>p>0.75).length, fracas=picos.filter(p=>p<0.55).length;
ok(fortes>200 && fracas>40, 'as duas populacoes aparecem no pulso', `${fortes} fortes / ${fracas} fracas`);
ok(ultimoPico<fim+0.2, 'a luz para junto com o recorte', ultimoPico.toFixed(2));

console.log('\nCT-E  rebobinar (reinicio da fase)');
const c2=criarCanal(bumbo,OP);
for(let t=0;t<120;t+=H) c2.avancar(t);          // toca metade
const antes=c2.indice;
c2.avancar(-2.0);                                // ritmoIniciar do zero
ok(c2.indice===0, 'ponteiro volta ao inicio ao rebobinar', `${antes} -> ${c2.indice}`);
let acendeu=0;
for(let t=-2.0;t<12;t+=H) if(c2.avancar(t)>0) acendeu++;
ok(acendeu>50, 'e a luz volta a acender depois do reinicio', `${acendeu} quadros com pulso`);

console.log('\nCT-F  registro de canais');
reacaoParar();
ok(pulsar('palco', 50)===0, 'sem canal, pulsar da 0 (fora da fase de ritmo)');
reacaoIniciar('palco', bumbo, OP);
ok(pulsar('palco', bumbo[0].t)>0, 'com canal, a nota acende');
reacaoParar();
ok(pulsar('palco', bumbo[0].t)===0, 'reacaoParar apaga');

console.log(falhas? `\n${falhas} FALHA(S)` : '\nTUDO OK');
process.exit(falhas?1:0);
