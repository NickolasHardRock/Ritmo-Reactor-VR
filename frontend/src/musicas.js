/* ============================================================================
   musicas.js — A LISTA DO MODO JOGAR, para o carrossel do menu 3D.

   Mesma ideia de `trilhas.js` (o manifesto do modo livre), mas para o outro
   lado do menu: músicas JOGÁVEIS, com carta, nota, julgamento e pontuação.
   O carrossel de menu3d.js lê daqui em vez de ter a lista escrita à mão —
   foi a lição dos níveis (ver o comentário em menu3d.js sobre o contrato de
   id): lista fixa é o que fica para trás quando alguém acrescenta um item.

   ESTE MÓDULO NÃO IMPORTA NADA, do mesmo jeito que trilhas.js. É só o dado.
   Quem toca é `fases.js`/`musica.js`; quem monta o carrossel é `menu3d.js`,
   com a ligação feita em `main.js`.

   ATÉ 15/09, ESTE MANIFESTO NÃO FAZIA A LIGAÇÃO ATÉ O FIM: só existia uma
   música jogável de verdade (Colour Me Red), o carrossel já mandava o `id`
   escolhido para `iniciarComNivel` (menu3d.js → main.js), mas nada usava —
   a carta carregada era sempre a do nível, vinda de `config.js` → `NIVEIS`
   → `cartaAgora`. Com a segunda música (Rock You Like A Hurricane), o `id`
   passou a virar a `carta` de verdade em `main.js` (`porMusica`), e
   `cartaAgora` passou a aceitá-la como segundo parâmetro — perdendo só para
   `?carta=` na URL e, no nível Profissa, para a versão "kit inteiro" da
   MESMA música escolhida, quando existir uma (ver `CARTAS_CHEIAS` em
   `config.js`; até 16/09 isso era uma carta fixa só válida para a padrão). */

const CAMINHO = 'musicas.json';

/** Confere e completa uma entrada do manifesto. Devolve `null` para entrada
 *  sem `carta` — melhor o carrossel vir com um cartão a menos que com um
 *  cartão que não inicia partida nenhuma. */
export function normalizarMusica(m, i = 0){
  if (!m || typeof m !== 'object') return null;
  const carta = typeof m.carta === 'string' ? m.carta.trim() : '';
  /* Mesma defesa de `normalizarTrilha`: caminho de dentro de `cartas/`, sem
     protocolo, sem barra na frente e sem `..`. */
  if (!carta || /^[a-z]+:|^\/|(^|\/)\.\.(\/|$)/i.test(carta)) return null;
  const id = String(m.id || `musica${i + 1}`).replace(/[^\w-]/g, '');
  return {
    id: id || `musica${i + 1}`,
    titulo: String(m.titulo || id || carta),
    creditos: typeof m.creditos === 'string' ? m.creditos : '',
    carta,
  };
}

/** Lê `public/musicas.json`.
 *
 *  MANIFESTO AUSENTE NÃO É ERRO — mesmo tratamento de `carregarTrilhas()`.
 *  Sem ele o carrossel do Jogar fica vazio e o menu3d avisa no console;
 *  não trava o jogo. */
export async function carregarMusicas(){
  try {
    const r = await fetch(CAMINHO);
    if (!r.ok) return [];
    const j = await r.json();
    const lista = Array.isArray(j) ? j : (j && j.musicas);
    if (!Array.isArray(lista)) return [];
    return lista.map(normalizarMusica).filter(Boolean);
  } catch {
    return [];
  }
}
