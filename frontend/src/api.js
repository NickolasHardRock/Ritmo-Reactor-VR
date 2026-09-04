/* ============================================================================
   api.js — a ponte com o back-end (RF11 persistência, RF12 API).

   O jogo funciona sem API: se ela estiver fora do ar, a partida termina
   normalmente e a tela de resultado só informa que não deu para salvar.
   Nada do que o jogador fez se perde por causa de uma falha de rede.
   ========================================================================== */

import { API_BASE } from './config.js';
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

/** O corpo do POST /partidas. Mantido como função para poder ser testado
 *  sem rede. */
export function corpoDaPartida(){
  return {
    nome:     nomeJogador(),
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
