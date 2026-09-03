/* ============================================================================
   musica.js — a faixa da fase de ritmo e o relógio que todo o resto segue.

   REGRA DE OURO: nada de ritmo se mede por `setTimeout` nem pelo relógio de
   render. Os dois derrapam dezenas de milissegundos e, num jogo musical,
   isso é audível — a nota acende depois do som. O único relógio confiável é
   o do próprio áudio, `AudioContext.currentTime`, que anda colado no que sai
   da caixa de som.

   LATÊNCIA — o detalhe que estraga o jogo se for ignorado. Entre agendar um
   som e ele chegar no ouvido existe um atraso: buffer da placa, do sistema,
   do Bluetooth. No Quest passa fácil de 100 ms. O jogador reage ao que OUVE,
   então o tempo musical que ele percebe está ATRASADO em relação ao
   currentTime. Por isso `tempo` SUBTRAI a latência. Sem isso o jogo parece
   injusto: você bate junto com a música e ele diz que você adiantou.

   A conta tem duas partes:
     - `outputLatency`, que o navegador informa (nem todos informam);
     - `CALIBRAGEM`, medida pelo jogador na tela de calibração, que cobre o
       resto da cadeia e o viés pessoal de quem toca.
   ========================================================================== */

import { synth } from './synth.js';

const CHAVE_CALIBRAGEM = 'rrvr.calibragem';

export class Musica {
  constructor(){
    this.buffer   = null;    // AudioBuffer da faixa
    this.fonte    = null;    // AudioBufferSourceNode em reprodução
    this.ganho    = null;
    this._t0      = 0;       // currentTime em que a reprodução começou
    this._desde   = 0;       // ponto da faixa em que ela começou, em segundos
    this.tocando  = false;
    this.carta    = null;    // a carta carregada (ver formato em cartas/)
  }

  /* ------------------------------------------------------- calibragem ----- */
  /** Atraso extra, em segundos, medido pelo jogador. Positivo = o som chega
   *  depois do esperado, que é o caso normal. */
  static get calibragem(){
    const v = parseFloat(localStorage.getItem(CHAVE_CALIBRAGEM));
    return Number.isFinite(v) ? v : null;      // null = ainda não calibrado
  }
  static set calibragem(s){
    localStorage.setItem(CHAVE_CALIBRAGEM, String(s));
  }

  /** Latência total a compensar. `outputLatency` é o que o navegador
   *  consegue medir sozinho; `baseLatency` é o piso quando ele não informa
   *  o resto. Alguns navegadores não expõem nenhum dos dois — daí o 0. */
  get latencia(){
    /* A medida do jogador SUBSTITUI o palpite do navegador, não soma: ela já
       inclui a saída de áudio inteira. Somar contaria duas vezes.

       Sem calibragem sobra `outputLatency`, que no Windows costuma declarar
       uns 40 ms quando o real passa de 150 — daí o jogo parecer que atrasa
       antes de calibrar. */
    const c = Musica.calibragem;
    if (c !== null) return c;
    const ctx = synth.ctx;
    if (!ctx) return 0;
    return ctx.outputLatency || ctx.baseLatency || 0;
  }

  /* ---------------------------------------------------------- carregar ---- */
  /** Baixa e decodifica a faixa. Decodificar é caro (uma faixa de 4 minutos
   *  vira ~50 MB de PCM na memória), então isto acontece uma vez só, antes
   *  da fase começar, nunca no meio. */
  async carregar(url, aoProgredir){
    await synth.ligar();
    const ctx = synth.ctx;
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`${url}: HTTP ${resp.status}`);

    // Progresso: faixa de 4 min em 128 kbps são ~4 MB, e no Quest pela rede
    // isso demora o suficiente para valer uma barra em vez de tela parada.
    let dados;
    const total = Number(resp.headers.get('content-length')) || 0;
    if (aoProgredir && total && resp.body){
      const leitor = resp.body.getReader();
      const partes = []; let lido = 0;
      for (;;){
        const { done, value } = await leitor.read();
        if (done) break;
        partes.push(value); lido += value.length;
        aoProgredir(lido / total);
      }
      dados = new Uint8Array(lido);
      let off = 0;
      for (const p of partes){ dados.set(p, off); off += p.length; }
      dados = dados.buffer;
    } else {
      dados = await resp.arrayBuffer();
    }

    this.buffer = await ctx.decodeAudioData(dados);
    return this.buffer.duration;
  }

  /** Carrega a carta (JSON) e, junto, a faixa que ela declara.
   *
   *  Carta SEM faixa é legítima e útil: a levada toca só pela trilha
   *  automática (bumbo) e o jogo funciona como metrônomo. É assim que dá
   *  para desenvolver e testar a fase sem depender de nenhum áudio de
   *  terceiro — e é o modo de treino de um trecho difícil. */
  async carregarCarta(url, aoProgredir){
    const carta = await fetch(url).then(r => {
      if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
      return r.json();
    });
    normalizarCarta(carta);
    if (carta.faixa) await this.carregar(carta.faixa, aoProgredir);
    else { await synth.ligar(); this.buffer = null; }
    this.carta = carta;
    return carta;
  }

  /* ------------------------------------------------------------ tocar ----- */
  /** @param {number} desde segundo da faixa em que começar
   *  @param {number} atraso espera antes de começar, para dar tempo das
   *         primeiras notas descerem a pista antes do som entrar */
  tocar(desde = 0, atraso = 0){
    this.parar();
    const ctx = synth.ctx;
    const quando = ctx.currentTime + atraso;

    // Sem buffer o relógio anda igual, só não sai som de faixa. É o que
    // permite jogar uma carta sem música (ver `carregarCarta`).
    if (this.buffer){
      this.fonte = ctx.createBufferSource();
      this.fonte.buffer = this.buffer;
      this.ganho = ctx.createGain();
      this.ganho.gain.value = 0.9;
      this.fonte.connect(this.ganho);
      this.ganho.connect(ctx.destination);
      this.fonte.start(quando, desde);
      this.fonte.onended = () => { this.tocando = false; };
    }
    this._t0 = quando;
    this._desde = desde;
    this.tocando = true;
  }

  parar(){
    if (this.fonte){
      try { this.fonte.stop(); } catch { /* já parou */ }
      this.fonte.disconnect();
      this.fonte = null;
    }
    this.tocando = false;
  }

  /** Onde a MÚSICA está agora, em segundos da faixa original, do ponto de
   *  vista de quem escuta. É contra este número que as notas são julgadas.
   *
   *  Antes de `tocar()` a conta ainda vale: devolve um valor negativo, que é
   *  a contagem regressiva até o som entrar. A pista usa isso para já mostrar
   *  as primeiras notas descendo antes do primeiro compasso. */
  get tempo(){
    const ctx = synth.ctx;
    if (!ctx || !this._t0) return this._desde;
    return (ctx.currentTime - this._t0) + this._desde - this.latencia;
  }

  /** Em que instante do relógio do áudio um tempo `t` da faixa deve SOAR.
   *  É o inverso de `tempo`, e é o que se passa para `synth.tocar(..., quando)`
   *  ao agendar a trilha automática. Note que aqui NÃO entra a latência: o
   *  agendamento é para a placa de som, não para o ouvido — quem compensa o
   *  atraso é o julgamento das batidas, do outro lado. */
  quandoNoAudio(t){
    return this._t0 + (t - this._desde);
  }

  /** Volume da faixa, 0..1. Serve para abaixar a música no modo livre. */
  set volume(v){ if (this.ganho) this.ganho.gain.value = v; }
}

/* ============================== A CARTA ===================================
   Formato (ver frontend/public/cartas/):

   {
     "titulo":  "Nome da faixa",
     "creditos":"Autor — licença",       // vai para a tela de resultado
     "faixa":   "sounds/arquivo.mp3",
     "bpm":     134.2,
     "ancora":  1.582,                   // segundo do primeiro tempo forte
     "recorte": [45.9, 135.0],           // trecho jogável, em segundos
     "notas":   [ { "t": 46.12, "peca": "caixa" } ],
     "auto":    [ { "t": 46.00, "som":  "bumbo" } ]
   }

   `t` é SEMPRE em segundos da faixa original, nunca em compassos. Compasso é
   como se escreve a carta; segundo é como se toca. Converter uma vez, na
   ferramenta, evita espalhar aritmética de BPM pelo jogo — e é o que permite
   uma faixa com andamento variável mais tarde, sem mexer em nada aqui.

   `auto` são as notas que o jogo toca sozinho. Hoje é o bumbo: o Quest não
   rastreia os pés, então ele não é tocável, mas sem ele a levada fica
   irreconhecível.                                                          */

export function normalizarCarta(c){
  if (!Array.isArray(c.notas)) c.notas = [];
  if (!Array.isArray(c.auto))  c.auto  = [];
  c.notas.sort((a,b) => a.t - b.t);
  c.auto.sort((a,b) => a.t - b.t);
  if (!Array.isArray(c.recorte) || c.recorte.length !== 2){
    const fim = c.notas.length ? c.notas[c.notas.length-1].t + 2 : 0;
    c.recorte = [0, fim];
  }
  return c;
}

/** Só as notas dentro do recorte. Os tempos continuam ABSOLUTOS, em segundos
 *  da faixa — deslocá-los para o início do recorte só criaria duas escalas de
 *  tempo no jogo e uma classe de bug difícil de enxergar. `musica.tempo`
 *  também devolve tempo de faixa, então os dois se comparam direto. */
export function notasDoRecorte(c){
  const [ini, fim] = c.recorte;
  const dentro = (n) => n.t >= ini && n.t <= fim;
  return {
    inicio: ini,
    fim,
    notas: c.notas.filter(dentro),
    auto:  c.auto .filter(dentro),
  };
}

export const musica = new Musica();
