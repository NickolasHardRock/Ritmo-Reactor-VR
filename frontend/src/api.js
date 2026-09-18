/* ============================================================================
   api.js — a ponte com o back-end (RF11 persistência, RF12 API).

   O jogo funciona sem API: se ela estiver fora do ar, a partida termina
   normalmente e a tela de resultado só informa que não deu para salvar.
   Nada do que o jogador fez se perde por causa de uma falha de rede.
   ========================================================================== */

import { API_BASE, CARTA_PADRAO, CARTA_PEDIDA } from './config.js';
import { jogo, precisao } from './estado.js';
import { estrelas } from './pontuacao.js';
import { statusApi } from './ui.js';

/** Nome do jogador. Guardado localmente só por conveniência — o registro
 *  que vale é o do banco, feito pela API. */
export function nomeJogador(){
  try { return localStorage.getItem('nome') || 'Jogador'; }
  catch { return 'Jogador'; }
}
export function definirNome(n){
  try { localStorage.setItem('nome', n); } catch { /* modo privado, tudo bem */ }
}

/** A música desta partida, para o pódio de cada música. `null` quando a carta
 *  veio de `?carta=` na URL: ela não é uma música do manifesto e não pode
 *  ganhar uma linha no banco só porque alguém digitou um nome. */
export function musicaDaPartida(){
  if (CARTA_PEDIDA) return null;
  return jogo.musica || { id: CARTA_PADRAO, titulo: null };
}

/** O corpo do POST /partidas. Mantido como função para poder ser testado
 *  sem rede. */
export function corpoDaPartida(){
  const m = musicaDaPartida();
  return {
    nome:     nomeJogador(),
    ...(m ? { musica: m.id, ...(m.titulo ? { musicaTitulo: m.titulo } : {}) } : {}),
    pontos:   jogo.pontos,
    tempo:    +jogo.duracao.toFixed(2),
    precisao: precisao(),
    erros:    jogo.erros,
    comboMax: jogo.comboMax,
    estrelas: estrelas(precisao()),
  };
}

/** RN07 — chamado só depois da partida concluída. */
export async function enviarResultado(){
  const corpo = corpoDaPartida();
  try {
    const r = await fetch(`${API_BASE}/partidas`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(corpo),
    });
    if (r.ok){
      const dado = await r.json().catch(() => ({}));
      statusApi(`salva (id ${dado.id ?? '—'})`, 'var(--ok)');
    } else {
      statusApi(`API respondeu HTTP ${r.status}`, 'var(--bad)');
    }
  } catch {
    statusApi('API fora do ar — partida não registrada', 'var(--warn)');
    console.info('[RF12] corpo que seria enviado:', corpo);
  }
}

/** GET /ranking — usado na tela inicial quando a API está no ar. */
export async function buscarRanking(limite = 10){
  try {
    const r = await fetch(`${API_BASE}/ranking?limite=${limite}`);
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
}

/** GET /ranking/musicas — os `limite` melhores de CADA música, para o painel
 *  de recordes da tela principal. Devolve a lista `[{ musica, titulo, itens }]`
 *  ou `null` se a API não respondeu (o painel então diz que está offline em
 *  vez de fingir que ninguém jogou). */
export async function buscarRankingPorMusica(limite = 3){
  try {
    const r = await fetch(`${API_BASE}/ranking/musicas?limite=${limite}`);
    if (!r.ok) return null;
    const j = await r.json();
    return Array.isArray(j.musicas) ? j.musicas : null;
  } catch { return null; }
}
