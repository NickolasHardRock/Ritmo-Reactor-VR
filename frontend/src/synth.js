/* ============================================================================
   synth.js — sons da bateria via samples .mp3, com feedback sintetizado.

   Os samples ficam em public/sounds/ e são pré-carregados como AudioBuffer.

   A FORÇA DA BATIDA MUDA O TIMBRE, NÃO A AFINAÇÃO. Tambor batido de leve não
   é tambor mais grave: é tambor com menos brilho e cauda mais curta. A versão
   anterior modulava o `playbackRate` em ±4% com a força, e afinação subindo
   junto com o volume é justamente o que denuncia amostra — nenhum instrumento
   acústico se comporta assim.

   O brilho é feito com UM filtro high-shelf em 2,5 kHz, e a escolha é o ponto
   inteiro da coisa: cada peça é afetada na medida do próprio espectro, sem
   precisar de ajuste por peça. O bumbo quase não tem energia acima de 2,5 kHz,
   então um toque leve nele só fica mais baixo — que é o certo. O chimbal é
   quase todo acima disso, então um toque leve nele perde o chiado inteiro —
   também o certo. Um passa-baixa com corte fixo não faria isso: ou destruía
   o chimbal ou não fazia nada no bumbo.

   A cauda também encurta no toque leve, e por isso a fonte é parada mais cedo.

   Sobra uma variação de afinação MÍNIMA e ALEATÓRIA, sem relação com a força:
   golpe em ponto diferente da pele muda um pouco a afinação de verdade, e é o
   que evita o efeito de metralhadora quando a mesma peça toca 200 vezes.

   Sons de feedback do jogo (erro, ok, nivel) continuam sintetizados —
   são curtos, não justificam arquivo.
   ========================================================================== */

const SONS_BATERIA = ['chimbal','crash','caixa','tom1','tom2','surdo','bumbo','ride'];

export class Synth {
  constructor(){
    this.ctx = null;
    this.master = null;
    this.buffers = {};        // id → AudioBuffer EM USO
    this.buffersPadrao = {};  // o kit de biblioteca, sempre guardado
    this._kitPendente = null; // kit pedido antes de existir AudioContext
    this._carregando = null;
  }

  /** O navegador só libera áudio depois de uma interação do usuário, então
   *  isto é chamado no primeiro clique/tecla, não no carregamento. */
  ligar(){
    if (this.ctx) return this._carregando;
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.85;

    /* SATURAÇÃO SUAVE NA SAÍDA DA BATERIA.
       Medido: três peças na força cheia no mesmo instante somam pico 1,50 —
       passa do limite e estala. Não é defeito novo, já era assim antes das
       camadas de força; só agora ficou medido. E acontece de verdade: a
       trilha automática dispara bumbo e crash juntos numa entrada de refrão,
       e o jogador soma caixa e chimbal em cima.

       Por que WaveShaper e NÃO um compressor: o `DynamicsCompressorNode` do
       Chrome tem alguns milissegundos de pré-atraso interno, e a faixa de
       música NÃO passa por aqui (vai direto ao destino). Comprimir só a
       bateria a deslocaria no tempo em relação à música — reintroduzindo,
       de mão beijada, exatamente a classe de erro que esta sessão passou
       o dia caçando. WaveShaper é uma curva sem memória: latência zero,
       por construção.

       A curva é RETA até 0,7 e só depois dobra. Cheguei aqui corrigindo: a
       primeira versão era uma tangente hiperbólica normalizada, e ela tem
       inclinação 1,74 na origem — ou seja, AMPLIFICAVA o sinal baixo. Medido:
       caixa sozinha subia 1,5 dB e o toque leve saltava de 0,36 para 0,59.
       Isso comprime a dinâmica, que é exatamente o contrário do que as
       camadas de força acabaram de construir. Com o joelho em 0,7 nada que
       um golpe sozinho produza é tocado, e só a SOMA de vários encosta na
       curva. */
    const forma = this.ctx.createWaveShaper();
    const N = 4096, JOELHO = 0.7, curva = new Float32Array(N);
    for (let i = 0; i < N; i++){
      const x = (i / (N - 1)) * 2 - 1;
      const a = Math.abs(x);
      const y = a <= JOELHO
        ? a                                                    // reta
        : JOELHO + (1 - JOELHO) * Math.tanh((a - JOELHO) / (1 - JOELHO));
      curva[i] = Math.sign(x) * y;
    }
    forma.curve = curva;
    /* `oversample` FICA EM 'none' de propósito. Sobreamostrar reduz o
       aliasing da curva, mas para isso o navegador insere filtros de
       reamostragem — que atrasam. Atraso aqui é o que eu acabei de dizer que
       não podia ter. Sem sobreamostragem a curva é ponto a ponto, e o preço é
       um pouco de aliasing na parte mais empurrada, que num transiente de
       tambor de 5 ms não se ouve. Medido: o início do som não se move. */
    forma.oversample = 'none';
    this.master.connect(forma);
    forma.connect(this.ctx.destination);
    this.saturacao = forma;

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
          .then(decoded => { this.buffersPadrao[id] = this.buffers[id] = decoded; })
          .catch(e => console.warn(`[synth] falha ao carregar ${id}.mp3:`, e))
      )
    ).then(() => this._kitPendente ? this.carregarKit(this._kitPendente) : null);
    return this._carregando;
  }

  /* ============================== KIT POR CARTA =========================
     Uma carta pode trazer o próprio kit — as peças gravadas na mesma sala,
     no mesmo tambor e com o mesmo microfone da música que vai tocar. É o
     que faz a batida do jogador PERTENCER à gravação em vez de soar colada
     por cima. Só o que a carta declarar é trocado; o resto continua sendo a
     biblioteca, e é por isso que `buffersPadrao` existe.

     Chamável antes de haver áudio: a carta é lida na abertura, e o
     AudioContext só nasce no primeiro toque do jogador. Nesse caso o pedido
     fica pendente e é aplicado dentro de `ligar()`.                       */

  /** @param {Object<string,string>|null} mapa  id da peça → URL do arquivo */
  definirKit(mapa){
    if (!mapa){ this._kitPendente = null; return this.restaurarKit(); }
    if (!this.ctx){ this._kitPendente = mapa; return Promise.resolve(); }
    return this.carregarKit(mapa);
  }

  async carregarKit(mapa){
    this._kitPendente = null;
    const nomes = Object.keys(mapa).filter(id => SONS_BATERIA.includes(id));
    await Promise.all(nomes.map(async id => {
      try {
        const r = await fetch(mapa[id]);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        this.buffers[id] = await this.ctx.decodeAudioData(await r.arrayBuffer());
      } catch (e){
        /* Kit que não carrega NÃO pode calar a peça: cai para a de
           biblioteca, que já está na memória, e a partida continua. */
        console.warn(`[synth] kit: ${id} não carregou (${e.message}) — usando a padrão`);
        if (this.buffersPadrao[id]) this.buffers[id] = this.buffersPadrao[id];
      }
    }));
    return nomes;
  }

  /** Volta tudo para a biblioteca. */
  restaurarKit(){
    for (const id of SONS_BATERIA)
      if (this.buffersPadrao[id]) this.buffers[id] = this.buffersPadrao[id];
    return Promise.resolve([]);
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
    const f = Math.max(0, Math.min(força, 1));

    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    /* Afinação: só a variação aleatória de ±1,2%, que é da ordem do que muda
       de verdade entre um golpe e outro na mesma pele. NÃO depende da força. */
    src.playbackRate.value = 1 + (Math.random() - 0.5) * 0.024;

    /* Brilho pela força: -12 dB no toque mais leve, 0 dB no golpe cheio.
       O teto é ZERO e não um reforço: a força cheia tem de soar a amostra como
       ela foi gravada. Com +2 dB o chimbal media pico 1,04 — sozinho não
       estoura, mas somado a caixa e bumbo no mesmo instante passaria do
       limite do master. */
    const brilho = this.ctx.createBiquadFilter();
    brilho.type = 'highshelf';
    brilho.frequency.value = 2500;
    brilho.gain.value = -12 + f * 12;

    const g = this.ctx.createGain();
    /* Piso de 0,32 e não zero: o volume sozinho já dá 10 dB de variação, e o
       brilho soma o resto. No chimbal, que é todo acima de 2,5 kHz, os dois
       juntos dão uns 22 dB entre o toque leve e o golpe cheio — que é a ordem
       do que existe num tambor de verdade, sem deixar o toque leve inaudível. */
    const vol = 0.32 + f * 0.68;
    g.gain.setValueAtTime(vol, quando);

    /* Cauda: no toque leve o som morre antes. Aplicado só quando encurta de
       fato — assim o golpe cheio passa pelo caminho mais simples, sem rampa
       nenhuma, e a amostra toca inteira como foi gravada. */
    const fatia = 0.45 + f * 0.55;
    let pararEm = null;
    if (fatia < 0.97){
      const fim = quando + buf.duration * fatia;
      const inicioFade = Math.max(quando + 0.02, fim - 0.09);
      g.gain.setValueAtTime(vol, inicioFade);
      g.gain.exponentialRampToValueAtTime(0.0005, fim);
      pararEm = fim + 0.02;
    }

    src.connect(brilho);
    brilho.connect(g);
    g.connect(this.master);
    src.start(quando);
    /* `stop` DEPOIS de `start`, sempre: a Web Audio lança InvalidStateError se
       a ordem inverter, e como só o toque leve agenda parada, o erro apareceria
       apenas nas batidas fracas — o tipo de defeito que passa num teste rápido
       e quebra na mão de quem está começando. */
    if (pararEm !== null) src.stop(pararEm);

    /* Cada golpe cria três nós. Numa carta de 505 notas mais a trilha
       automática são milhares ao longo da música — desligar no fim evita
       que o grafo cresça sem parar. */
    src.onended = () => {
      try { src.disconnect(); brilho.disconnect(); g.disconnect(); } catch { /* já foi */ }
    };
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
