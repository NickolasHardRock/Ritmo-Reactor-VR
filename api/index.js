/* ============================================================================
   api/index.js — adaptador para as Serverless Functions do Vercel.

   O Vercel trata cada arquivo desta pasta como uma função. O vercel.json
   reescreve /api/* para cá, e o Express resolve o roteamento interno.
   Nenhuma lógica mora aqui: ela toda está em backend/app.js.
   ========================================================================== */
import { app } from '../backend/app.js';
export default app;
