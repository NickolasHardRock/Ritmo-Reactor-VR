/* ============================================================================
   Copia os decodificadores do three (Draco para geometria, Basis para
   texturas KTX2) de node_modules para public/libs/.

   POR QUE NÃO USAR CDN
   Um CDN é um ponto único de falha que não está sob nosso controle. Se a
   rede da sala de apresentação bloquear jsdelivr — e redes corporativas e
   de faculdade bloqueiam — NENHUM modelo carrega e o jogo aparece vazio.
   Servindo do próprio domínio, o jogo funciona em qualquer rede, e a
   versão dos decodificadores fica sempre casada com a do three instalado.

   Roda sozinho antes de `dev` e de `build` (ver package.json).
   ========================================================================== */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const ORIGEM = path.resolve(AQUI, '..', '..', 'node_modules', 'three', 'examples', 'jsm', 'libs');
const DESTINO = path.resolve(AQUI, '..', 'public', 'libs');

if (!fs.existsSync(ORIGEM)){
  console.error(`[decodificadores] não achei ${ORIGEM}. Rodou "npm install"?`);
  process.exit(1);
}

let n = 0;
for (const pasta of ['draco', 'basis']){
  const de = path.join(ORIGEM, pasta);
  const para = path.join(DESTINO, pasta);
  if (!fs.existsSync(de)){
    console.error(`[decodificadores] faltando ${de}`);
    process.exit(1);
  }
  // Copiar POR CIMA em vez de apagar e recriar: apagar exige permissão que
  // nem todo ambiente concede (a ponte com a máquina do usuário, por
  // exemplo), e não há ganho — os arquivos têm sempre os mesmos nomes.
  fs.cpSync(de, para, { recursive: true, force: true });
  n += fs.readdirSync(para, { recursive: true }).length;
}
console.log(`[decodificadores] ${n} arquivos copiados para public/libs/`);
