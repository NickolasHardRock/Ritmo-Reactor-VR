/* ============================================================================
   rotas/ranking.js — RN08: o ranking apresenta os resultados de acordo com
   os critérios definidos pela equipe.

   TRÊS LEITURAS, TRÊS PERGUNTAS DIFERENTES:

     GET /api/ranking                   "quem são os melhores?"
     GET /api/ranking/melhores          "quem manda em CADA dificuldade?"  ← a tela inicial
     GET /api/ranking/recorde           "qual a marca a bater aqui?"       ← a tela de resultado

   Critério comum: mais pontos primeiro e, no empate, o menor tempo. E a
   MELHOR partida de cada jogador, não todas — assim uma pessoa que jogou
   vinte vezes não ocupa o pódio inteiro.

   POR QUE A DIFICULDADE SEPARA AS LISTAS. Pontos crescem com o tamanho da
   carta e com o multiplicador, e o Fácil tem uma peça com janela 1,8× contra
   sete peças com janela 0,8× do Profissa. Numa lista só, o ranking mediria
   qual nível rende mais ponto, não quem toca melhor.
   ========================================================================== */

import { Router } from 'express';
import { db } from '../db/index.js';
import { PONTOS_MINIMOS } from '../regras.js';

export const rotaRanking = Router();

const CHAVE = /^[a-z0-9][a-z0-9_-]{0,59}$/i;
/** Filtro que chegou pela URL, já peneirado. `undefined` = não filtra. */
function filtroDaUrl(q){
  const limpa = (v) => {
    const s = String(v ?? '').trim();
    return s && CHAVE.test(s) ? s.toLowerCase() : undefined;
  };
  return { musica: limpa(q.musica), nivel: limpa(q.nivel) };
}

/**
 * GET /api/ranking/melhores?musica=colour-me-red
 * Uma linha por dificuldade: o melhor jogador de cada uma.
 * É o que a tela inicial mostra.
 *
 * Declarada ANTES da rota '/' não por necessidade do Express (os caminhos são
 * distintos), mas porque a ordem de leitura do arquivo é a ordem em que as
 * rotas foram pensadas.
 */
rotaRanking.get('/melhores', async (req, res, next) => {
  try {
    const { musica } = filtroDaUrl(req.query);
    const base = await db();
    res.json({
      criterio: 'melhor partida de cada dificuldade, por pontos e depois menor tempo',
      musica: musica ?? null,
      itens: await base.melhoresPorNivel(musica),
    });
  } catch (e) { next(e); }
});

/**
 * GET /api/ranking/recorde?musica=colour-me-red&nivel=facil
 * A marca a bater. O jogo consulta no fim de toda partida concluída para
 * decidir se pede o nome de quem jogou (RN09).
 *
 * `recorde: null` quer dizer que ainda não há registro nenhum ali — e é
 * diferente de zero ponto: a primeira partida da tabela também é recorde,
 * desde que alcance o piso.
 */
rotaRanking.get('/recorde', async (req, res, next) => {
  try {
    const { musica, nivel } = filtroDaUrl(req.query);
    if (!musica || !nivel)
      return res.status(400).json({ erro: 'musica e nivel são obrigatórios' });

    const base = await db();
    res.json({
      musica, nivel,
      recorde: await base.recorde(musica, nivel),
      /* O piso viaja junto para o jogo não precisar de uma cópia da regra.
         Regra de negócio duplicada é regra que diverge. */
      minimo: PONTOS_MINIMOS,
    });
  } catch (e) { next(e); }
});

/** GET /api/ranking?limite=10&nivel=facil&musica=colour-me-red */
rotaRanking.get('/', async (req, res, next) => {
  try {
    let limite = Number(req.query.limite ?? 10);
    if (!Number.isInteger(limite) || limite < 1) limite = 10;
    limite = Math.min(limite, 100);            // teto: ninguém baixa a tabela toda

    const filtro = filtroDaUrl(req.query);
    const base = await db();
    res.json({
      criterio: 'melhor partida por jogador, por pontos e depois menor tempo',
      filtro,
      total: await base.total(),
      itens: await base.ranking(limite, filtro),
    });
  } catch (e) { next(e); }
});
