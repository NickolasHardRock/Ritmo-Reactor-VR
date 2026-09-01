/* ============================================================================
   synth.js — a bateria feita na unha, com osciladores e ruído filtrado.
   Técnica de caixa de ritmo dos anos 80.

   POR QUE NÃO USAR .mp3 GRAVADO
   - zero arquivos para baixar (o Quest carregaria por Wi-Fi antes de tocar)
   - zero CORS
   - latência de disparo praticamente nula, o que num jogo de RITMO é o que
     separa "responde" de "atrasa"
   - a força da batida modula o som de verdade, em vez de tocar o mesmo
     sample mais alto
   ========================================================================== */

export class Synth {
  constructor(){ this.ctx = null; this.ruido = null; }

  /** O navegador só libera áudio depois de uma interação do usuário, então
   *  isto é chamado no primeiro clique/tecla, não no carregamento. */
  ligar(){
    if (this.ctx) return;
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.85;
    this.master.connect(this.ctx.destination);
    // 2 s de ruído branco, reaproveitado por todos os sons percussivos
    const n = this.ctx.sampleRate * 2;
    this.ruido = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
    const d = this.ruido.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random()*2 - 1;
  }

  /** Relógio do áudio. Use ESTE para agendar ritmo — nunca setTimeout, que
   *  erra dezenas de milissegundos e num jogo musical isso é audível. */
  get agora(){ return this.ctx ? this.ctx.currentTime : 0; }

  _env(no, t, pico, dur){
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(pico, .0002), t + .004);
    g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    no.connect(g); g.connect(this.master);
    return g;
  }
  _tom(t, f0, f1, dur, vol, tipo = 'sine'){
    const o = this.ctx.createOscillator(); o.type = tipo;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f1, t + dur*.9);
    this._env(o, t, vol, dur); o.start(t); o.stop(t + dur + .02);
  }
  _ruido(t, hp, dur, vol, q = 1){
    const s = this.ctx.createBufferSource(); s.buffer = this.ruido;
    s.playbackRate.value = .8 + Math.random()*.4;
    const f = this.ctx.createBiquadFilter();
    f.type = 'highpass'; f.frequency.value = hp; f.Q.value = q;
    s.connect(f); this._env(f, t, vol, dur); s.start(t); s.stop(t + dur + .02);
  }

  /**
   * @param {string} som    id do som (ver switch abaixo)
   * @param {number} força  0..1 — em VR vem da velocidade real da baqueta
   * @param {number} quando instante no relógio do áudio; null = agora
   */
  tocar(som, força = 1, quando = null){
    this.ligar();
    if (this.ctx.state === 'suspended') this.ctx.resume();
    const t = quando ?? this.ctx.currentTime;
    const v = .15 + força*.75;
    switch (som){
      case 'chimbal': this._ruido(t, 8500, .055, .30*v, .7); break;
      case 'caixa':   this._ruido(t, 1400, .16,  .38*v, .6);
                      this._tom(t, 220, 170, .12, .22*v, 'triangle'); break;
      case 'tom1':    this._tom(t, 260, 130, .30, .55*v); break;
      case 'tom2':    this._tom(t, 190,  95, .34, .55*v); break;
      case 'surdo':   this._tom(t, 120,  60, .45, .60*v); break;
      case 'bumbo':   this._tom(t, 135,  45, .34, .75*v); break;
      case 'ride':    this._ruido(t, 5200, .85, .16*v, .5);
                      this._tom(t, 860, 840, .5, .09*v, 'triangle'); break;
      case 'crash':   this._ruido(t, 3200, 1.5, .26*v, .4); break;
      // avisos do jogo, não da bateria
      case 'erro':    this._tom(t, 150,  90, .18, .35, 'square');   break;
      case 'ok':      this._tom(t, 660, 990, .14, .28, 'triangle'); break;
      case 'nivel':   this._tom(t, 440, 880, .35, .30, 'triangle'); break;
    }
  }
}

export const synth = new Synth();
