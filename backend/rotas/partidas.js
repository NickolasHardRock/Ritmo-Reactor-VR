/* ============================================================================
   rotas/partidas.js — RF12 (API) e RF11 (persistência).

   Contrato documentado em docs/api.md.
   ========================================================================== */

import { Router } from 'express';
import { db } from '../db/index.js';

export const rotaPartidas = Router();

/* Formato dos identificadores de música e nível. Batem com o que o front
   manda: o `id` de `public/musicas.json` (musicas.js o reduz a [\w-]) e a
   chave de `NIVEIS` (facil, normal, profissa). A API não conhece a LISTA de
   músicas de propósito — acrescentar uma no manifesto não pode exigir mexer
   aqui —, só o formato, o que basta para o valor nunca virar lixo no banco. */
export const ID_MUSICA = /^[\w-]{1,60}$/;
export const ID_NIVEL  = /^[a-z]{1,20}$/;

/** Validação explícita. Nunca confie no corpo que chega da rede: o jogo
 *  roda no navegador do jogador e qualquer um pode forjar um POST. */
function validar(corpo){
  const erros = [];
  const nome = String(corpo?.nome ?? '').trim();
  if (!nome)              erros.push('nome é obrigatório');
  if (nome.length > 60)   erros.push('nome deve ter no máximo 60 caracteres');

  const num = (v, campo, min, max) => {
    const n = Number(v);
    if (!Number.isFinite(n))      { erros.push(`${campo} deve ser numérico`); return 0; }
    if (n < min || n > max)       { erros.push(`${campo} fora do intervalo ${min}..${max}`); return 0; }
    return n;
  };
  /* Opcionais: partida sem música/nível (cliente antigo, `?menu2d=1` sem
     escolher nada) continua valendo e cai no balde '' — não aparece em ranking
     de música nenhum, mas conta no ranking geral. */
  const musica = String(corpo?.musica ?? '').trim();
  if (musica && !ID_MUSICA.test(musica))
    erros.push('musica inválida (use letras, números, - ou _; até 60 caracteres)');
  const nivel = String(corpo?.nivel ?? '').trim();
  if (nivel && !ID_NIVEL.test(nivel))
    erros.push('nivel inválido (use letras minúsculas; até 20 caracteres)');

  const dados = {
    nome, musica, nivel,
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
    const criada = await base.salvarPartida({ ...dados, jogador_id });

    res.status(201).json({
      id: criada.id,
      nome: dados.nome,
      pontos: criada.pontos,
      tempo: Number(criada.tempo),
      estrelas: criada.estrelas,
      musica: dados.musica,
      nivel: dados.nivel,
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
