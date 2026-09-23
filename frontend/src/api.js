/* ============================================================================
   api.js — a ponte com o back-end (RF11 persistência, RF12 API).

   O jogo funciona sem API: se ela estiver fora do ar, a partida termina
   normalmente e a tela de resultado só informa que não deu para salvar.
   Nada do que o jogador fez se perde por causa de uma falha de rede.

   AQUI SÓ MORA O TRANSPORTE. Quando pedir o nome e quando gravar é decisão
   de `registro.js` — este arquivo não sabe o que é um recorde, só sabe
   perguntar e enviar.
   ========================================================================== */

import { API_BASE, nivelAtual } from './config.js';
import { jogo, precisao } from './estado.js';
import { estrelas } from './pontuacao.js';
import { musica } from './musica.js';
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

/** A chave da música que acabou de ser jogada. Cai em 'desconhecida' quando a
 *  partida rodou sem carta (modo livre, carta ausente) — a coluna tem o mesmo
 *  padrão, então nada quebra. */
export function musicaAtual(){
  return (musica.carta && musica.carta.id) || 'desconhecida';
}

/** O corpo do POST /partidas. Mantido como função para poder ser testado
 *  sem rede.
 *
 *  LEIA SÍNCRONO, ENVIE DEPOIS: quem chama guarda o retorno ANTES de
 *  qualquer `await`. O jogador pode apertar "Jogar novamente" enquanto a
 *  consulta ao recorde está no ar, e aí `jogo` já foi zerado — o corpo
 *  montado na hora certa é o que impede uma partida de ser gravada com os
 *  números da seguinte. */
export function corpoDaPartida(){
  return {
    nome:     nomeJogador(),
    musica:   musicaAtual(),
    nivel:    nivelAtual(),
    pontos:   jogo.pontos,
    tempo:    +jogo.duracao.toFixed(2),
    precisao: precisao(),
    erros:    jogo.erros,
    comboMax: jogo.comboMax,
    estrelas: estrelas(precisao()),
  };
}

/** RN07 — chamado só depois da partida concluída.
 *  @param {object} [corpo] o que enviar; por padrão, a partida atual. */
export async function enviarResultado(corpo = corpoDaPartida()){
  try {
    const r = await fetch(`${API_BASE}/partidas`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(corpo),
    });
    if (r.ok){
      const dado = await r.json().catch(() => ({}));
      statusApi(dado.recorde
        ? `salva — NOVO RECORDE (id ${dado.id ?? '—'})`
        : `salva (id ${dado.id ?? '—'})`,
        dado.recorde ? 'var(--gold)' : 'var(--ok)');
      return dado;
    }
    statusApi(`API respondeu HTTP ${r.status}`, 'var(--bad)');
    return null;
  } catch {
    statusApi('API fora do ar — partida não registrada', 'var(--warn)');
    console.info('[RF12] corpo que seria enviado:', corpo);
    return null;
  }
}

/** A marca a bater nesta música e dificuldade (RN09).
 *
 *  Devolve `null` quando a API não respondeu — e isso é diferente de
 *  `{recorde:null}`, que quer dizer "a API respondeu: ainda não há recorde
 *  aqui". Quem chama precisa dos dois casos: sem API não há como saber se a
 *  partida é recorde, e pedir o nome nessa hora seria pedir à toa. */
export async function buscarRecorde(musicaId, nivel){
  try {
    const r = await fetch(
      `${API_BASE}/ranking/recorde?musica=${encodeURIComponent(musicaId)}` +
      `&nivel=${encodeURIComponent(nivel)}`);
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
}

/** O melhor jogador de CADA dificuldade, numa música (RN08). Tela inicial. */
export async function buscarMelhores(musicaId){
  try {
    const r = await fetch(
      `${API_BASE}/ranking/melhores?musica=${encodeURIComponent(musicaId)}`);
    if (!r.ok) return null;
    const d = await r.json();
    return Array.isArray(d.itens) ? d.itens : [];
  } catch { return null; }
}

/** GET /ranking — a lista longa, quando alguém quiser mostrá-la. */
export async function buscarRanking(limite = 10, filtro = {}){
  try {
    const q = new URLSearchParams({ limite: String(limite) });
    if (filtro.musica) q.set('musica', filtro.musica);
    if (filtro.nivel)  q.set('nivel',  filtro.nivel);
    const r = await fetch(`${API_BASE}/ranking?${q}`);
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
}
