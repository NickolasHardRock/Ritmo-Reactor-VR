/* ============================================================================
   midi-para-carta.mjs — transforma a parte de bateria em MIDI na carta que
   o jogo lê.

   POR QUE MIDI. Partitura em PDF vira transcrição à mão, nota por nota, e
   cada erro só aparece tocando. O MIDI já traz o instante exato de cada
   golpe e o padrão General MIDI diz qual peça é cada nota. A conversão é
   determinística — e refazível quando a carta mudar.

   POR QUE SEGUNDOS, E NÃO COMPASSOS. A carta guarda tempo absoluto em
   segundos porque é assim que o áudio é medido. Compasso é como se ESCREVE;
   segundo é como se TOCA. Fazer a conta uma vez, aqui, evita espalhar
   aritmética de BPM pelo jogo e já deixa o caminho aberto para faixas com
   andamento variável — o mapa de tempo abaixo trata disso.

   USO:
     node ferramentas/midi-para-carta.mjs bateria.mid carta.json \
       --faixa sounds/musica.mp3 \
       --ancora 1.582 \
       --recorte 45.9,135.0 \
       --titulo "Nome" --creditos "Autor — licenca"

   Opções úteis:
     --deslocamento S   soma S segundos a todos os tempos (alinha o MIDI
                        com o áudio quando o MIDI não começa no compasso 1)
     --chimbal N        mantém 1 a cada N notas de chimbal. Levada de rock
                        toca chimbal em toda colcheia; com duas baquetas isso
                        é impossível e some com o resto. `--chimbal 2` deixa
                        jogável sem descaracterizar.
     --sem-auto         não gera a trilha automática (bumbo entra como nota)
   ========================================================================== */

import fs from 'node:fs';

/* ---------------------------------------------------- General MIDI ------ */
/* A percussão do GM vive no canal 10 (índice 9) e cada nota é uma peça.
   Só mapeamos o que a bateria do jogo tem; o resto é descartado e listado
   no fim, para ninguém descobrir depois que perdeu metade da levada.     */
const MAPA = {
  35:'bumbo',   36:'bumbo',
  37:'caixa',   38:'caixa',   39:'caixa',   40:'caixa',
  41:'surdo',   43:'surdo',
  45:'tom2',    47:'tom2',
  48:'tom1',    50:'tom1',
  42:'chimbal', 44:'chimbal', 46:'chimbal',
  49:'crash',   52:'crash',   55:'crash',   57:'crash',
  51:'ride',    53:'ride',    59:'ride',
};
const NOMES_GM = {
  35:'Acoustic Bass Drum', 36:'Bass Drum 1', 37:'Side Stick',
  38:'Acoustic Snare', 39:'Hand Clap', 40:'Electric Snare',
  41:'Low Floor Tom', 42:'Closed Hi-Hat', 43:'High Floor Tom',
  44:'Pedal Hi-Hat', 45:'Low Tom', 46:'Open Hi-Hat', 47:'Low-Mid Tom',
  48:'Hi-Mid Tom', 49:'Crash Cymbal 1', 50:'High Tom', 51:'Ride Cymbal 1',
  52:'Chinese Cymbal', 53:'Ride Bell', 54:'Tambourine', 55:'Splash Cymbal',
  56:'Cowbell', 57:'Crash Cymbal 2', 58:'Vibraslap', 59:'Ride Cymbal 2',
};

/* -------------------------------------------------- leitor de MIDI ------ */
class Leitor {
  constructor(buf){ this.b = buf; this.i = 0; }
  u8(){ return this.b[this.i++]; }
  u16(){ const v = this.b.readUInt16BE(this.i); this.i += 2; return v; }
  u32(){ const v = this.b.readUInt32BE(this.i); this.i += 4; return v; }
  txt(n){ const s = this.b.subarray(this.i, this.i+n); this.i += n; return s; }
  /** Quantidade de tamanho variável: 7 bits por byte, o oitavo diz "continua". */
  vlq(){
    let v = 0, c;
    do { c = this.u8(); v = (v << 7) | (c & 0x7f); } while (c & 0x80);
    return v;
  }
}

function lerMidi(caminho){
  const b = fs.readFileSync(caminho);
  const r = new Leitor(b);
  if (r.txt(4).toString('latin1') !== 'MThd') throw new Error('não é um arquivo MIDI');
  r.u32();                                  // tamanho do cabeçalho, sempre 6
  const formato = r.u16(), nTrilhas = r.u16(), divisao = r.u16();
  if (divisao & 0x8000) throw new Error('MIDI em SMPTE não suportado — exporte em ticks por semínima');

  const eventos = [];                       // { tick, tipo, ... }
  for (let t = 0; t < nTrilhas; t++){
    if (r.i >= b.length) break;
    const marca = r.txt(4).toString('latin1');
    const tam = r.u32();
    const fim = r.i + tam;
    if (marca !== 'MTrk'){ r.i = fim; continue; }
    let tick = 0, statusAnterior = 0;
    while (r.i < fim){
      tick += r.vlq();
      let st = r.b[r.i];
      if (st & 0x80){ r.i++; statusAnterior = st; }
      else st = statusAnterior;             // "running status": reaproveita o anterior
      const tipo = st & 0xf0, canal = st & 0x0f;

      if (st === 0xff){                     // meta-evento
        const meta = r.u8(), n = r.vlq();
        const dados = r.txt(n);
        if (meta === 0x51){                 // andamento
          const us = (dados[0]<<16) | (dados[1]<<8) | dados[2];
          eventos.push({ tick, tipo:'tempo', us });
        }
        continue;
      }
      if (st === 0xf0 || st === 0xf7){ r.i += r.vlq(); continue; }   // sysex

      const d1 = r.u8();
      const temD2 = tipo !== 0xc0 && tipo !== 0xd0;
      const d2 = temD2 ? r.u8() : 0;
      if (tipo === 0x90 && d2 > 0)          // note on de verdade (vel > 0)
        eventos.push({ tick, tipo:'nota', canal, nota:d1, vel:d2 });
    }
    r.i = fim;
  }
  eventos.sort((a,b) => a.tick - b.tick);
  return { formato, divisao, eventos };
}

/* ------------------------------------- mapa de tempo: ticks -> segundos -- */
/* Um MIDI pode mudar de andamento no meio. Em vez de assumir BPM constante,
   percorremos os eventos de tempo acumulando segundos por trecho. Se a
   música for de andamento fixo isto dá exatamente o mesmo resultado — e se
   não for, continua certo.                                                */
function construirMapa(eventos, divisao){
  const mudancas = eventos.filter(e => e.tipo === 'tempo');
  const mapa = [{ tick:0, seg:0, us: mudancas.length && mudancas[0].tick === 0
                                    ? mudancas[0].us : 500000 }];  // 120 BPM
  for (const m of mudancas){
    if (m.tick === 0){ mapa[0].us = m.us; continue; }
    const ult = mapa[mapa.length-1];
    const seg = ult.seg + (m.tick - ult.tick) * (ult.us/1e6) / divisao;
    mapa.push({ tick:m.tick, seg, us:m.us });
  }
  return (tick) => {
    let k = 0;
    while (k+1 < mapa.length && mapa[k+1].tick <= tick) k++;
    const p = mapa[k];
    return p.seg + (tick - p.tick) * (p.us/1e6) / divisao;
  };
}

/* ------------------------------------------------------------- CLI ------ */
function arg(nome, padrao = null){
  const i = process.argv.indexOf('--' + nome);
  return i > 0 && process.argv[i+1] ? process.argv[i+1] : padrao;
}
const temFlag = (nome) => process.argv.includes('--' + nome);

const [ENTRADA, SAIDA] = process.argv.slice(2).filter(a => !a.startsWith('--'));
if (!ENTRADA || !SAIDA){
  console.error('uso: node midi-para-carta.mjs entrada.mid saida.json --faixa sounds/x.mp3 [...]');
  process.exit(1);
}

const { divisao, eventos } = lerMidi(ENTRADA);
const emSegundos = construirMapa(eventos, divisao);

const DESLOC   = parseFloat(arg('deslocamento', '0'));
const PASSO_HH = parseInt(arg('chimbal', '1'), 10);
const SEM_AUTO = temFlag('sem-auto');

const notas = [], auto = [], ignoradas = {};
let nHH = 0;
for (const e of eventos){
  if (e.tipo !== 'nota') continue;
  const peca = MAPA[e.nota];
  if (!peca){
    const k = `${e.nota} ${NOMES_GM[e.nota] || '?'}`;
    ignoradas[k] = (ignoradas[k] || 0) + 1;
    continue;
  }
  const t = +(emSegundos(e.tick) + DESLOC).toFixed(4);
  if (peca === 'bumbo' && !SEM_AUTO){ auto.push({ t, som:'bumbo' }); continue; }
  if (peca === 'chimbal' && PASSO_HH > 1 && (nHH++ % PASSO_HH)) continue;
  notas.push({ t, peca, forca: +(e.vel/127).toFixed(2) });
}

const recorte = (arg('recorte') || '').split(',').map(Number);
const carta = {
  titulo:   arg('titulo', 'Sem título'),
  creditos: arg('creditos', ''),
  faixa:    arg('faixa', 'sounds/som.mp3'),
  bpm:      parseFloat(arg('bpm', '0')) || null,
  ancora:   parseFloat(arg('ancora', '0')),
  recorte:  recorte.length === 2 && recorte.every(Number.isFinite)
              ? recorte
              : [0, notas.length ? notas[notas.length-1].t + 2 : 0],
  notas, auto,
};
carta.notas.sort((a,b) => a.t - b.t);
carta.auto.sort((a,b) => a.t - b.t);

fs.writeFileSync(SAIDA, JSON.stringify(carta, null, 1));

/* ------------------------------------------------------- relatório ------ */
const [ri, rf] = carta.recorte;
const dentro = carta.notas.filter(n => n.t >= ri && n.t <= rf);
const porPeca = {};
for (const n of dentro) porPeca[n.peca] = (porPeca[n.peca] || 0) + 1;

console.log(`${SAIDA}`);
console.log(`  ${carta.notas.length} notas jogáveis, ${carta.auto.length} automáticas`);
console.log(`  recorte ${ri}s a ${rf}s  ->  ${dentro.length} notas em ${(rf-ri).toFixed(1)}s`
          + `  (${(dentro.length/Math.max(rf-ri,.001)).toFixed(1)} por segundo)`);
for (const [p,n] of Object.entries(porPeca).sort((a,b)=>b[1]-a[1]))
  console.log(`    ${p.padEnd(8)} ${n}`);

/* Densidade é o que decide se dá para tocar. Com duas baquetas, acima de
   umas 6 notas por segundo vira impossível para quem não é baterista. */
const dens = dentro.length / Math.max(rf-ri, .001);
if (dens > 6) console.log(`\n  ATENÇÃO: ${dens.toFixed(1)} notas/s é muito para duas baquetas.`
                        + `\n  Considere --chimbal 2 ou um recorte de trecho mais calmo.`);

const ign = Object.entries(ignoradas);
if (ign.length){
  console.log('\n  notas MIDI ignoradas (sem peça correspondente):');
  for (const [k,n] of ign.sort((a,b)=>b[1]-a[1])) console.log(`    ${k} — ${n}x`);
}
