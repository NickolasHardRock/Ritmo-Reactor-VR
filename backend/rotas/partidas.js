/* ============================================================================
   rotas/partidas.js — RF12 (API) e RF11 (persistência).

   Contrato documentado em docs/api.md.
   ========================================================================== */

import { Router } from 'express';
import { db } from '../db/index.js';
import { ehRecorde } from '../regras.js';

export const rotaPartidas = Router();

/** Chave de carta e de nível vêm da rede e viram valor de coluna e de
 *  consulta. Aceitar só o alfabeto que elas realmente usam (o nome do arquivo
 *  em `cartas/` e a chave de `NIVEIS`) fecha a porta para qualquer coisa
 *  criativa chegar ao banco. */
const CHAVE = /^[a-z0-9][a-z0-9_-]{0,59}$/i;

/** Validação explícita. Nunca confie no corpo que chega da rede: o jogo
 *  roda no navegador do jogador e qualquer um pode forjar um POST. */
function validar(corpo){
  const erros = [];
  const nome = String(corpo?.nome ?? '').trim();
  if (!nome)              erros.push('nome é obrigatório');
  if (nome.length > 60)   erros.push('nome deve ter no máximo 60 caracteres');

  const chave = (v, campo, padrao) => {
    const s = String(v ?? '').trim() || padrao;
    if (!CHAVE.test(s)){ erros.push(`${campo} inválido`); return padrao; }
    return s.toLowerCase();
  };

  const num = (v, campo, min, max) => {
    const n = Number(v);
    if (!Number.isFinite(n))      { erros.push(`${campo} deve ser numérico`); return 0; }
    if (n < min || n > max)       { erros.push(`${campo} fora do intervalo ${min}..${max}`); return 0; }
    return n;
  };
  const dados = {
    nome,
    /* A música e a dificuldade são o que dá sentido a "melhor pontuação":
       comparar o Fácil com o Profissa é comparar desafios diferentes. Têm
       padrão porque um cliente antigo (ou o `curl` de quem está testando a
       API) continua conseguindo gravar. */
    musica:    chave(corpo?.musica, 'musica', 'desconhecida'),
    nivel:     chave(corpo?.nivel,  'nivel',  'facil'),
    pontos:    num(corpo?.pontos,   'pontos',   0, 1_000_000),
    tempo:     num(corpo?.tempo,    'tempo',    0, 86_400),
    precisao:  num(corpo?.precisao, 'precisao', 0, 100),
    erros:     num(corpo?.erros ?? 0,    'erros',    0, 100_000),
    combo_max: num(corpo?.comboMax ?? 0, 'comboMax', 0, 100_000),
    estrelas:  num(corpo?.estrelas, 'estrelas', 0, 5),
  };
  if (dados.nivel.length > 20) erros.push('nivel deve ter no máximo 20 caracteres');
  return { erros, dados };
}

/**
 * POST /api/partidas
 * Registra o resultado de UMA partida concluída (RN07: só depois de concluída).
 *
 * Devolve `recorde: true` quando a partida virou o novo recorde da música
 * naquela dificuldade (RN09). QUEM DECIDE ISSO É O SERVIDOR, não o jogo: o
 * cliente roda na máquina do jogador e o campo seria só uma sugestão.
 */
rotaPartidas.post('/', async (req, res, next) => {
  try {
    const { erros, dados } = validar(req.body);
    if (erros.length) return res.status(400).json({ erro: 'dados inválidos', detalhes: erros });

    const base = await db();

    /* A consulta vem ANTES do INSERT, senão a própria partida que está sendo
       gravada já seria o recorde a bater e nada nunca seria recorde. */
    const anterior = await base.recorde(dados.musica, dados.nivel);
    const recorde  = ehRecorde(dados.pontos, anterior);

    const jogador_id = await base.acharOuCriarJogador(dados.nome);
    const criada = await base.salvarPartida({ ...dados, jogador_id });

    res.status(201).json({
      id: criada.id,
      nome: dados.nome,
      musica: dados.musica,
      nivel: dados.nivel,
      pontos: criada.pontos,
      tempo: Number(criada.tempo),
      estrelas: criada.estrelas,
      recorde,
      recordeAnterior: anterior,
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
