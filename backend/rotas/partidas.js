/* ============================================================================
   rotas/partidas.js — RF12 (API) e RF11 (persistência).

   Contrato documentado em docs/api.md.
   ========================================================================== */

import { Router } from 'express';
import { db } from '../db/index.js';

export const rotaPartidas = Router();

/** Validação explícita. Nunca confie no corpo que chega da rede: o jogo
 *  roda no navegador do jogador e qualquer um pode forjar um POST. */
function validar(corpo){
  const erros = [];
  const nome = String(corpo?.nome ?? '').trim();
  if (!nome)              erros.push('nome é obrigatório');
  if (nome.length > 60)   erros.push('nome deve ter no máximo 60 caracteres');

  /* A MÚSICA É OPCIONAL: clientes antigos não a mandam, e uma partida sem ela
     continua valendo para o ranking geral — só não entra em pódio de música.
     O `slug` é o `id` de public/musicas.json, o mesmo do carrossel. */
  const musica = String(corpo?.musica ?? '').trim();
  if (musica && !/^[\w-]{1,60}$/.test(musica))
    erros.push('musica deve ter de 1 a 60 caracteres: letras, números, "-" ou "_"');
  const musica_titulo = String(corpo?.musicaTitulo ?? '').trim();
  if (musica_titulo.length > 120)
    erros.push('musicaTitulo deve ter no máximo 120 caracteres');

  const num = (v, campo, min, max) => {
    const n = Number(v);
    if (!Number.isFinite(n))      { erros.push(`${campo} deve ser numérico`); return 0; }
    if (n < min || n > max)       { erros.push(`${campo} fora do intervalo ${min}..${max}`); return 0; }
    return n;
  };
  const dados = {
    nome,
    musica,
    musica_titulo,
    pontos:    num(corpo?.pontos,   'pontos',   0, 1_000_000),
    tempo:     num(corpo?.tempo,    'tempo',    0, 86_400),
    precisao:  num(corpo?.precisao, 'precisao', 0, 100),
    erros:     num(corpo?.erros ?? 0,    'erros',    0, 100_000),
    combo_max: num(corpo?.comboMax ?? 0, 'comboMax', 0, 100_000),
    estrelas:  num(corpo?.estrelas, 'estrelas', 0, 5),
  };
  return { erros, dados };
}

/**
 * POST /api/partidas
 * Registra o resultado de UMA partida concluída (RN07: só depois de concluída).
 */
rotaPartidas.post('/', async (req, res, next) => {
  try {
    const { erros, dados } = validar(req.body);
    if (erros.length) return res.status(400).json({ erro: 'dados inválidos', detalhes: erros });

    const base = await db();
    const jogador_id = await base.acharOuCriarJogador(dados.nome);
    const musica_id = dados.musica
      ? await base.acharOuCriarMusica(dados.musica, dados.musica_titulo)
      : null;
    const { musica, musica_titulo, ...colunas } = dados;   // não são colunas de partida
    const criada = await base.salvarPartida({ ...colunas, jogador_id, musica_id });

    res.status(201).json({
      id: criada.id,
      nome: dados.nome,
      musica: dados.musica || null,
      pontos: criada.pontos,
      tempo: Number(criada.tempo),
      estrelas: criada.estrelas,
      criado: criada.criado,
    });
  } catch (e) { next(e); }
});

/**
 * GET /api/partidas/:id
 * Consulta uma partida específica.
 */
rotaPartidas.get('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1)
      return res.status(400).json({ erro: 'id inválido' });

    const p = await (await db()).partida(id);
    if (!p) return res.status(404).json({ erro: 'partida não encontrada' });
    res.json(p);
  } catch (e) { next(e); }
});
