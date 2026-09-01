/* Sobe o Express localmente. Em produção quem faz isso é o Vercel
   (ver api/index.js). */
import { app } from './app.js';

const porta = Number(process.env.PORT) || 3000;
app.listen(porta, () => {
  console.log(`API em http://localhost:${porta}/api/saude`);
});
