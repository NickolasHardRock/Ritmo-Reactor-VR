/* Dublê do synth.js real. O arnês exercita o musica.js DE VERDADE — só o que
   está fora dele (Web Audio, rede) é fingido. */
export const synth = {
  ctx: null,
  async ligar(){ if (!this.ctx) this.ctx = new globalThis.AudioContextFake(); },
};
