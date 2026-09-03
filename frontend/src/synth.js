/* ============================================================================
   synth.js — sons da bateria via samples .mp3, com feedback sintetizado.

   Os samples ficam em public/sounds/ e são pré-carregados como AudioBuffer.
   A força da batida modula volume e sutilmente o playbackRate, dando
   variação natural sem precisar de múltiplas camadas de velocity.

   Sons de feedback do jogo (erro, ok, nivel) continuam sintetizados —
   são curtos, não justificam arquivo.
   ========================================================================== */

const SONS_BATERIA = ['chimbal','crash','caixa','tom1','tom2','surdo','bumbo','ride'];

export class Synth {
  constructor(){
    this.ctx = null;
    this.master = null;
    this.buffers = {};   // id → AudioBuffer
    this._carregando = null;
  }

  /** O navegador só libera áudio depois de uma interação do usuário, então
   *  isto é chamado no primeiro clique/tecla, não no carregamento. */
  ligar(){
    if (this.ctx) return this._carregando;
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.85;
    this.master.connect(this.ctx.destination);

    // Ruído branco para sons sintetizados de feedback
    const n = this.ctx.sampleRate * 2;
    this.ruido = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
    const d = this.ruido.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random()*2 - 1;

    // Pré-carregar todos os samples
    this._carregando = Promise.all(
      SONS_BATERIA.map(id =>
        fetch(`sounds/${id}.mp3`)
          .then(r => r.arrayBuffer())
          .then(buf => this.ctx.decodeAudioData(buf))
          .then(decoded => { this.buffers[id] = decoded; })
          .catch(e => console.warn(`[synth] falha ao carregar ${id}.mp3:`, e))
      )
    );
    return this._carregando;
  }

  /** Relógio do áudio. Use ESTE para agendar ritmo — nunca setTimeout, que
   *  erra dezenas de milissegundos e num jogo musical isso é audível. */
  get agora(){ return this.ctx ? this.ctx.currentTime : 0; }

  /* ---- helpers para sons sintetizados (feedback) ---- */
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

  /* ---- reprodução de sample ---- */
  /** @returns {AudioBufferSourceNode|undefined} a fonte criada, para quem
   *  agendou poder cancelar depois (ver a trilha automática em fases.js). */
  _sample(id, força, quando){
    const buf = this.buffers[id];
    if (!buf) return;  // ainda não carregou — silêncio em vez de erro
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    // Modula levemente o pitch pela força (±4%) — soa mais natural
    src.playbackRate.value = 0.98 + força * 0.04;
    const g = this.ctx.createGain();
    // Volume proporcional à força: batida fraca = mais suave
    g.gain.value = 0.3 + força * 0.7;
    src.connect(g);
    g.connect(this.master);
    src.start(quando);
    return src;
  }

  /**
   * @param {string} som    id do som (peça da bateria ou feedback)
   * @param {number} força  0..1 — em VR vem da velocidade real da baqueta
   * @param {number} quando instante no relógio do áudio; null = agora
   */
  tocar(som, força = 1, quando = null){
    this.ligar();
    if (this.ctx.state === 'suspended') this.ctx.resume();
    const t = quando ?? this.ctx.currentTime;

    // Sons de bateria → sample
    if (this.buffers[som] !== undefined || SONS_BATERIA.includes(som)) {
      return this._sample(som, força, t);
    }

    // Sons de feedback → sintetizados
    const v = .15 + força*.75;
    switch (som){
      case 'erro':  this._tom(t, 150,  90, .18, .35, 'square');   break;
      case 'ok':    this._tom(t, 660, 990, .14, .28, 'triangle'); break;
      case 'nivel': this._tom(t, 440, 880, .35, .30, 'triangle'); break;
    }
  }
}

export const synth = new Synth();
