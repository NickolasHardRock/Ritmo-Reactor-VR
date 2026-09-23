/* ============================================================================
   trilhas.js — A LISTA DO MODO LIVRE.

   Uma "trilha" é uma faixa SEM BATERIA, para quem já sabe tocar acompanhar.
   Não confundir com uma CARTA (`cartas/*.json`, ver musica.js): a carta traz
   o tempo de cada nota, e é ela que faz o jogo julgar, pontuar e derrubar
   caveira. A trilha não traz nota nenhuma — de propósito. Ninguém que sabe
   tocar precisa de alvo caindo em cima do tambor para saber onde vai a caixa.

   Consequência disso, e é a razão de este módulo ser tão pequeno: no modo
   livre não existe carta, então não existe julgamento, precisão, estrela nem
   ranking. Sobram três coisas — o título, o crédito e o arquivo.

   Este módulo NÃO IMPORTA NADA. É só o dado, lido e conferido. Quem toca é o
   `fases.js` e quem monta os botões é o `main.js`, do mesmo jeito que todo o
   resto da interface do projeto.
   ========================================================================== */

const CAMINHO = 'trilhas.json';

/** O padrão de volume da faixa no modo livre.
 *
 *  0,85 e não 0,9 (que é o da fase de ritmo) por um motivo simples: aqui a
 *  bateria é o jogador. Na fase de ritmo a faixa é a referência e a bateria
 *  acompanha; no modo livre é o contrário, e a faixa que cobre a batida de
 *  quem está tocando faz a pessoa perder a própria mão. Cada trilha pode
 *  declarar o seu — mixagens chegam em volumes diferentes. */
const VOLUME_PADRAO = 0.85;

/** Confere e completa uma entrada do manifesto. Devolve `null` para entrada
 *  que não dá para tocar — melhor a lista vir com um item a menos que com um
 *  botão que não faz nada.
 *
 *  A validação existe mesmo o arquivo sendo nosso: manifesto é o tipo de
 *  arquivo que alguém edita à mão para acrescentar uma faixa, e um `faixa`
 *  esquecido dava um botão silenciosamente morto. */
export function normalizarTrilha(t, i = 0){
  if (!t || typeof t !== 'object') return null;
  const faixa = typeof t.faixa === 'string' ? t.faixa.trim() : '';
  if (!faixa) return null;
  /* Caminho de dentro de `public/`, e nada além disso: sem protocolo, sem
     barra na frente e sem `..`. Não é defesa contra atacante — o arquivo é
     nosso — é defesa contra o caminho colado do Windows, que é o erro que
     realmente acontece ao acrescentar uma faixa. */
  if (/^[a-z]+:|^\/|(^|\/)\.\.(\/|$)/i.test(faixa)) return null;
  const id = String(t.id || `trilha${i + 1}`).replace(/[^\w-]/g, '');
  const vol = Number(t.volume);
  const ini = Number(t.inicio);
  return {
    id: id || `trilha${i + 1}`,
    titulo: String(t.titulo || id || faixa),
    creditos: typeof t.creditos === 'string' ? t.creditos : '',
    faixa,
    inicio: Number.isFinite(ini) && ini > 0 ? ini : 0,
    volume: Number.isFinite(vol) && vol > 0 && vol <= 1 ? vol : VOLUME_PADRAO,
  };
}

/** Lê `public/trilhas.json`.
 *
 *  MANIFESTO AUSENTE NÃO É ERRO. O modo livre existe desde antes de haver
 *  faixa nenhuma, e continua funcionando sem: a lista fica só com o "Só
 *  bateria", que é o comportamento antigo. Por isso aqui devolve `[]` em vez
 *  de estourar — é o mesmo tratamento que `lerCarta()` dá à carta ausente. */
export async function carregarTrilhas(){
  try {
    const r = await fetch(CAMINHO);
    if (!r.ok) return [];
    const j = await r.json();
    const lista = Array.isArray(j) ? j : (j && j.trilhas);
    if (!Array.isArray(lista)) return [];
    return lista.map(normalizarTrilha).filter(Boolean);
  } catch {
    return [];
  }
}
