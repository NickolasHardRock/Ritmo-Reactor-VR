/* ============================================================================
   reacao.js — a cena reagindo à música.

   O DADO JÁ EXISTE E ESTÁ PARADO. A carta traz o tempo e a força medida de
   cada nota — na `colour-me-red.json` são 890 eventos, TODOS com `forca`.
   Aqui isso vira um número de 0 a 1 por quadro, e quem desenha usa esse
   número para modular uma luz que JÁ EXISTE. Nunca para acrescentar luz,
   geometria ou passe de tela cheia: o quadro é dominado por FRAGMENTO
   (~3,4 ms fixos + ~3,2 ms por megapixel, medidos em 07/09), que é
   exatamente o que um bloom cobraria.

   O RELÓGIO É `musica.tempo`, E ISSO NÃO É DETALHE. Ele SUBTRAI a latência de
   saída, então vale o tempo da nota que está sendo OUVIDA agora. Disparar por
   `relogio.elapsedTime` ou `performance.now()` acenderia a luz ANTES do som —
   no Quest a latência passa de 100 ms e o erro é visível. Por isso este
   módulo não conhece `dt` nem relógio de render: ele recebe `agora` de fora,
   e o único `agora` legítimo é `musica.tempo`.

   MÓDULO PURO, como o `pontuacao.js`: nenhum import, nenhum `location`,
   nenhum three. As opções chegam por argumento, não do `config.js` — é o que
   permite conferir o envelope inteiro com `node`, sem navegador.
   ========================================================================== */

/** A força medida da carta virando pulso de 0 a 1.
 *
 *  A `forca` do bumbo é BIMODAL, e isso muda o desenho. Medido nos 326
 *  bumbos dentro do recorte da `colour-me-red.json`:
 *
 *      p0    0,475      p50   0,963
 *      p10   0,486      p75   0,982
 *      p25   0,920      p100  1,000
 *
 *  São duas populações: ~20% de batidas fracas em torno de 0,48 e o resto
 *  cravado entre 0,92 e 1,0. Não é força "comprimida no topo" — são batida
 *  fantasma e batida de verdade, e a diferença entre elas é informação boa.
 *
 *  Mapear 0,45..1,0 direto deixaria a fraca em 0,05: invisível, e o holofote
 *  leria como se estivesse PULANDO tempos. Daí o `minimo`, que é o pulso da
 *  batida mais fraca. Com `minimo` 0,35 a fraca dá 0,37 e a forte 0,95 —
 *  2,6× de diferença, que se vê, e nenhum tempo apagado.                  */
export function normalizar(forca, { piso, teto, minimo }){
  const n = (forca - piso) / (teto - piso);
  const c = n < 0 ? 0 : n > 1 ? 1 : n;
  return minimo + (1 - minimo) * c;
}

/** A queda do pulso, medida em segundos DE FAIXA e não no `dt` do laço.
 *
 *  De propósito: engasgo de quadro não estica o flash, e a duração é a mesma
 *  no desktop e no headset. O `decaimento` padrão sai do intervalo entre
 *  bumbos medido na carta — mínimo 0,331 s, mediana 0,746 — então nem no par
 *  mais rápido um flash come o seguinte.
 *
 *  ATAQUE INSTANTÂNEO, QUEDA EM k². Percussão não tem rampa de subida, e o
 *  ataque em um quadro é o que mantém a luz colada no som. A queda convexa
 *  cai rápido e deixa um rastro curto, que é como luz de palco se comporta;
 *  queda linear lê como fade, não como batida.                            */
export function envelope(agora, ultimoT, forca, decaimento){
  const d = agora - ultimoT;
  /* `d >= 0` invertido pega de graça os casos em que ainda não houve nota
     (`ultimoT` = -Infinity, `d` = Infinity) e qualquer NaN. */
  if (!(d >= 0) || d >= decaimento) return 0;
  const k = 1 - d / decaimento;
  return forca * k * k;
}

/** Primeiro índice de `ev` cujo `t` passa de `t0`. */
function buscar(ev, t0){
  let lo = 0, hi = ev.length;
  while (lo < hi){
    const m = (lo + hi) >> 1;
    if (ev[m].t <= t0) lo = m + 1; else hi = m;
  }
  return lo;
}

/** Um canal: uma lista de eventos ordenada por `t`, e o pulso que ela produz.
 *
 *  O ponteiro anda para frente e não volta — é o mesmo desenho do
 *  `ritmo.iAuto` em `fases.js`, e custa um `while` que quase sempre não roda.
 *
 *  MAS `musica.tempo` PODE ANDAR PARA TRÁS, e ignorar isso é um bug que não
 *  dá erro. Ele começa NEGATIVO (a espera do `ESPERA_INICIAL`, para as notas
 *  descerem antes de o som entrar) e `ritmoIniciar` recomeça a fase do zero.
 *  Sem tratar o rebobinar, um reinício deixaria o ponteiro no fim da lista e
 *  o holofote morto pelo resto da música. Daí a busca binária.
 *
 *  @param {{t:number,forca?:number}[]} eventos ordenados por `t`
 *  @param {{decaimento:number,piso:number,teto:number,minimo:number}} opcoes */
export function criarCanal(eventos, opcoes){
  const ev = eventos;
  let i = 0, ultimoT = -Infinity, forca = 0, anterior = -Infinity;

  return {
    /** Pulso 0..1 em `agora` (segundos de faixa, de `musica.tempo`). */
    avancar(agora){
      if (agora < anterior){                 // rebobinou: reinício ou seek
        i = buscar(ev, agora);
        ultimoT = -Infinity;
        forca = 0;
      }
      anterior = agora;
      /* Dois eventos no mesmo quadro: vale o ÚLTIMO, que é o que está soando.
         Com o bumbo não acontece (0,331 s de intervalo mínimo contra 13,9 ms
         de quadro a 72 Hz), mas um canal denso — chimbal — chega perto. */
      while (i < ev.length && ev[i].t <= agora){
        ultimoT = ev[i].t;
        forca   = normalizar(ev[i].forca ?? 1, opcoes);
        i++;
      }
      return envelope(agora, ultimoT, forca, opcoes.decaimento);
    },
    /** Só para teste e para o `window.__jogo`. */
    get indice(){ return i; },
  };
}

/** Os eventos da trilha automática de UM som.
 *
 *  `som` ausente é bumbo — a MESMA regra que `agendarAuto()` usa ao agendar
 *  (`a.som || 'bumbo'`). Se as duas divergirem, a luz pulsa num tempo e o som
 *  sai em outro, que é o defeito que este arquivo inteiro existe para evitar.
 */
export function eventosDoSom(auto, som){
  return auto.filter(a => (a.som || 'bumbo') === som);
}

/* ---------------------------------------------------------- os canais ----
   Um registro só, de nome para canal. Hoje tem um (`palco`, o holofote no
   bumbo); acrescentar o próximo é uma chamada de `reacaoIniciar`, não uma
   reestruturação.                                                         */
const canais = new Map();

export function reacaoIniciar(nome, eventos, opcoes){
  canais.set(nome, criarCanal(eventos, opcoes));
}

/** Chamado quando a fase de ritmo acaba ou é cancelada. Sem isto o pulso
 *  continuaria sendo calculado sobre uma carta que não está mais tocando. */
export function reacaoParar(){ canais.clear(); }

/** Pulso 0..1 do canal `nome` em `agora`, ou 0 se ele não está em curso. */
export function pulsar(nome, agora){
  const c = canais.get(nome);
  return c ? c.avancar(agora) : 0;
}
