/* ============================================================================
   app.js — o Express, sem subir servidor.

   Separado de server.js de propósito: assim o MESMO app roda de duas formas
     • local: `npm run dev:api` -> server.js escuta numa porta
     • Vercel: api/index.js exporta este app como função serverless
   Um código só, dois ambientes.
   ========================================================================== */

import express from 'express';
import cors from 'cors';
import { rotaPartidas } from './rotas/partidas.js';
import { rotaRanking } from './rotas/ranking.js';
import { db } from './db/index.js';

export const app = express();

app.use(express.json({ limit: '16kb' }));   // RNF04: corpo pequeno, sem surpresa

/* Em produção no Vercel o front e a API dividem o domínio e o CORS nem entra
   em jogo. Em desenvolvimento o Vite roda em :5173 e precisa ser liberado. */
const origens = (process.env.CORS_ORIGENS || 'http://localhost:5173')
  .split(',').map(s => s.trim()).filter(Boolean);
app.use(cors({ origin: origens.includes('*') ? true : origens }));

/** Sonda de saúde: útil para conferir se o deploy subiu e QUAL banco está
 *  em uso, sem precisar abrir o jogo. */
app.get('/api/saude', async (_req, res) => {
  const base = await db();
  res.json({ ok: true, banco: base.tipo, partidas: await base.total() });
});

app.use('/api/partidas', rotaPartidas);
app.use('/api/ranking',  rotaRanking);

app.use((req, res) => res.status(404).json({ erro: 'rota não encontrada', caminho: req.path }));

// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error('[api] erro não tratado:', err);
  // RNF04: nunca devolver stack trace ao cliente
  res.status(500).json({ erro: 'erro interno' });
});
