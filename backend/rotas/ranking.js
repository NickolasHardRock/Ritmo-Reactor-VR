/* ============================================================================
   rotas/ranking.js — RN08: o ranking apresenta os resultados de acordo com
   os critérios definidos pela equipe.

   Critério adotado: a MELHOR partida de cada jogador (não todas), ordenada
   por pontos e, em caso de empate, pelo menor tempo. Assim uma pessoa que
   jogou vinte vezes não ocupa o pódio inteiro.
   ========================================================================== */

import { Router } from 'express';
import { db } from '../db/index.js';
import { ID_MUSICA, ID_NIVEL } from './partidas.js';
import { PONTOS_MINIMOS } from '../regras.js';

export const rotaRanking = Router();

/** Lê um filtro opcional da query. Ausente ou vazio → `undefined` (não filtra).
 *  Presente e mal formado → `null`, para a rota responder 400. */
function filtroDaQuery(valor, formato){
  if (valor === undefined || valor === '') return undefined;
  return (typeof valor === 'string' && formato.test(valor)) ? valor : null;
}

/**
 * GET /api/ranking/recorde?musica=<id>&nivel=<chave>
 *
 * A MARCA A BATER. O jogo consulta no fim de toda partida concluída para
 * decidir se para e pede o nome de quem jogou (RN09).
 *
 * Existe separada do `GET /` — que já devolveria a mesma linha com
 * `limite=1` — por causa do `minimo`: é ele que fecha a regra, e ele é do
 * servidor. Sem isso o jogo precisaria de uma cópia do piso, e regra de
 * negócio duplicada é regra que diverge — ainda por cima a cópia moraria no
 * navegador, onde qualquer um edita.
 *
 * `recorde: null` quer dizer que ninguém jogou essa música nesse nível
 * ainda, e é diferente de zero ponto: a primeira partida também é recorde,
 * desde que alcance o piso.
 *
 * Declarada ANTES da rota '/' porque é assim que se lê o arquivo; para o
 * Express os dois caminhos são distintos e a ordem não muda nada.
 */
rotaRanking.get('/recorde', async (req, res, next) => {
  try {
    const musica = filtroDaQuery(req.query.musica, ID_MUSICA);
    const nivel  = filtroDaQuery(req.query.nivel,  ID_NIVEL);
    if (musica === null) return res.status(400).json({ erro: 'musica inválida' });
    if (nivel  === null) return res.status(400).json({ erro: 'nivel inválido' });
    if (musica === undefined || nivel === undefined)
      return res.status(400).json({ erro: 'musica e nivel são obrigatórios' });

    const base = await db();
    const top = await base.ranking(1, { musica, nivel });
    res.json({ musica, nivel, recorde: top[0] || null, minimo: PONTOS_MINIMOS });
  } catch (e) { next(e); }
});

/** GET /api/ranking?limite=10[&musica=<id>][&nivel=<chave>] */
rotaRanking.get('/', async (req, res, next) => {
  try {
    let limite = Number(req.query.limite ?? 10);
    if (!Number.isInteger(limite) || limite < 1) limite = 10;
    limite = Math.min(limite, 100);            // teto: ninguém baixa a tabela toda

    const musica = filtroDaQuery(req.query.musica, ID_MUSICA);
    const nivel  = filtroDaQuery(req.query.nivel,  ID_NIVEL);
    if (musica === null) return res.status(400).json({ erro: 'musica inválida' });
    if (nivel  === null) return res.status(400).json({ erro: 'nivel inválido' });
    const filtro = {};
    if (musica !== undefined) filtro.musica = musica;
    if (nivel  !== undefined) filtro.nivel  = nivel;

    const base = await db();
    res.json({
      criterio: 'melhor partida por jogador, por pontos e depois menor tempo',
      musica: musica ?? null,
      nivel:  nivel  ?? null,
      total: await base.total(filtro),
      itens: await base.ranking(limite, filtro),
    });
  } catch (e) { next(e); }
});
