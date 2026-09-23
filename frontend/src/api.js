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
/** Tamanho máximo do nome. A API aceita 60, mas o nome tem de CABER numa linha
 *  do top 3 em 3D, lido a 2 m de distância — e nome longo é o que estoura. */
export const NOME_MAX = 16;

export function definirNome(n){
  const limpo = String(n ?? '').trim().slice(0, NOME_MAX);
  try { localStorage.setItem('nome', limpo); } catch { /* modo privado, tudo bem */ }
}

/** O nome que o JOGADOR escolheu, ou '' se ele nunca escolheu nenhum —
 *  diferente de `nomeJogador()`, que devolve "Jogador" nesse caso. Serve para
 *  pré-preencher o campo sem gravar "Jogador" como se fosse um nome digitado. */
export function nomeEscolhido(){
  try { return localStorage.getItem('nome') || ''; }
  catch { return ''; }
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
    /* Em qual top 3 esta partida cai. Vazios quando não houve música
       escolhida — a API aceita e guarda como "sem música". */
    musica:   jogo.musica || '',
    nivel:    jogo.nivel  || '',
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

/** O 1º colocado de uma música num nível, para a tela de escolha (menu3d.js).
 *
 *  Devolve UMA lista com 0 ou 1 item (nunca mais — pedido de 21/09 trocou o
 *  top 3 por só o recorde) ou `null` quando não deu para saber — API fora do
 *  ar, resposta ruim ou demora. A distinção importa para a tela: lista VAZIA
 *  é "ninguém jogou ainda, seja o primeiro"; `null` é "não consegui
 *  perguntar", e mostrar "seja o primeiro" nesse caso seria mentir ao
 *  jogador. O nome ficou `buscarTop3` para não mexer em quem já importa esta
 *  função (menu3d.js, ferramentas de teste); quem lê é que decide usar só o
 *  índice 0.
 *
 *  Tem limite de espera: a API no Vercel pode demorar alguns segundos numa
 *  partida a frio, e o menu não pode ficar com "carregando…" para sempre. */
export async function buscarTop3(musica, nivel, esperaMs = 6000){
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), esperaMs);
  try {
    const q = new URLSearchParams({ limite: '1', musica: musica || '', nivel: nivel || '' });
    const r = await fetch(`${API_BASE}/ranking?${q}`, { signal: ctl.signal });
    if (!r.ok) return null;
    const j = await r.json();
    return Array.isArray(j.itens) ? j.itens.slice(0, 1) : null;
  } catch { return null; }
  finally { clearTimeout(timer); }
}

/** GET /ranking — usado na tela inicial quando a API está no ar. */
export async function buscarRanking(limite = 10){
  try {
    const r = await fetch(`${API_BASE}/ranking?limite=${limite}`);
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
}
