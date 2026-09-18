/* ============================================================================
   rotas/ranking.js — RN08: o ranking apresenta os resultados de acordo com
   os critérios definidos pela equipe.

   Critério adotado: a MELHOR partida de cada jogador (não todas), ordenada
   por pontos e, em caso de empate, pelo menor tempo. Assim uma pessoa que
   jogou vinte vezes não ocupa o pódio inteiro.
   ========================================================================== */

import { Router } from 'express';
import { db } from '../db/index.js';

export const rotaRanking = Router();

/** GET /api/ranking?limite=10 */
rotaRanking.get('/', async (req, res, next) => {
  try {
    let limite = Number(req.query.limite ?? 10);
    if (!Number.isInteger(limite) || limite < 1) limite = 10;
    limite = Math.min(limite, 100);            // teto: ninguém baixa a tabela toda

    const base = await db();
    res.json({
      criterio: 'melhor partida por jogador, por pontos e depois menor tempo',
      total: await base.total(),
      itens: await base.ranking(limite),
    });
  } catch (e) { next(e); }
});

/**
 * GET /api/ranking/musicas?limite=3
 *
 * Os melhores jogadores de CADA música — o painel da tela principal. Mesmo
 * critério do ranking geral (a melhor partida de cada jogador, por pontos e
 * depois menor tempo), aplicado dentro de cada música. Só aparecem músicas que
 * já têm ao menos uma partida; quem quer listar também as vazias cruza com
 * public/musicas.json, que é o dono da lista.
 */
rotaRanking.get('/musicas', async (req, res, next) => {
  try {
    let limite = Number(req.query.limite ?? 3);
    if (!Number.isInteger(limite) || limite < 1) limite = 3;
    limite = Math.min(limite, 10);

    const base = await db();
    res.json({
      criterio: 'melhor partida de cada jogador em cada música, por pontos e depois menor tempo',
      limite,
      musicas: await base.rankingPorMusica(limite),
    });
  } catch (e) { next(e); }
});
