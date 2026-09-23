/* ============================================================================
   popular-ranking.mjs — enche o TOP 3 de jogadores de mentira, para você VER
   a tela da música com ranking sem precisar jogar dezenas de partidas.

   USO (dois terminais, na raiz do projeto)
     1)  npm run dev:api          # a API, com banco EM MEMÓRIA (sem DATABASE_URL)
     2)  npm run seed:ranking     # este script
     3)  npm run dev              # abra o jogo → JOGAR → escolha uma música

   O QUE ELE CRIA (para cada música de public/musicas.json, nos 3 níveis)
     · 1ª música  → 5 jogadores: top 3 CHEIO (o 4º e o 5º ficam de fora)
     · 2ª música  → 2 jogadores: 1 "vaga livre"
     · demais     → ninguém: aparece "seja o primeiro!"
   Assim você vê os três estados da tela. `--jogadores=N` cria N jogadores em
   TODAS as músicas (0 = ninguém); `--musica=<id>` limita a uma só.

   TRAVAS (para não sujar banco de verdade)
     · só fala com localhost, a menos que você passe --api=<url> e --forcar
     · se a API estiver ligada a um PostgreSQL (banco real), recusa, a menos
       que você passe --forcar. Os nomes são de mentira e ficam gravados.

   Reiniciar a API (Ctrl+C e `npm run dev:api` de novo) zera o banco em memória
   e limpa tudo o que este script criou.
   ========================================================================== */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = Object.fromEntries(process.argv.slice(2).map(a => {
  const [k, v] = a.replace(/^--/, '').split('=');
  return [k, v ?? true];
}));
const API = String(args.api || 'http://localhost:3000/api').replace(/\/$/, '');
const NIVEIS = ['facil', 'normal', 'profissa'];
const NOMES = ['Ana', 'Bruno', 'Carla', 'Diego', 'Elisa', 'Fábio', 'Gabi', 'Hugo'];
const MULT = { facil: 1, normal: 1.4, profissa: 2 };   // só para os pontos variarem por nível

const local = /^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(API);
if (!local && !args.forcar){
  console.error(`✗ ${API} não é localhost. Para semear ali mesmo assim, use --forcar.`);
  process.exit(1);
}

let saude;
try { saude = await fetch(`${API}/saude`).then(r => r.json()); }
catch {
  console.error(`✗ Não consegui falar com ${API}.\n  A API está rodando? Em outro terminal:  npm run dev:api`);
  process.exit(1);
}
if (saude.banco && saude.banco !== 'memoria' && !args.forcar){
  console.error(`✗ A API está ligada a um banco de verdade (${saude.banco}).\n`
    + '  Os jogadores de mentira ficariam gravados nele. Rode a API sem DATABASE_URL\n'
    + '  (banco em memória) ou, se é isso mesmo que você quer, use --forcar.');
  process.exit(1);
}

const arq = path.join(RAIZ, 'frontend', 'public', 'musicas.json');
const j = JSON.parse(fs.readFileSync(arq, 'utf8'));
let musicas = (Array.isArray(j) ? j : j.musicas || [])
  .map((m, i) => ({ ...m, id: (String(m.id || `musica${i + 1}`).replace(/[^\w-]/g, '')) || `musica${i + 1}` }));
if (args.musica) musicas = musicas.filter(m => m.id === args.musica);
if (!musicas.length){ console.error('✗ Nenhuma música encontrada.'); process.exit(1); }

let criadas = 0;
for (const [i, m] of musicas.entries()){
  const n = args.jogadores !== undefined ? Number(args.jogadores)
          : i === 0 ? 5 : i === 1 ? 2 : 0;
  for (const nivel of NIVEIS){
    for (let k = 0; k < n; k++){
      const pontos = Math.round((32000 - k * 3300 - i * 700) * MULT[nivel]);
      const r = await fetch(`${API}/partidas`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome: NOMES[k % NOMES.length], pontos, tempo: 70 + k * 3,
          precisao: 96 - k * 4, erros: k, comboMax: 40 - k * 4, estrelas: Math.max(1, 5 - k),
          musica: m.id, nivel }),
      });
      if (!r.ok){ console.error(`✗ ${m.id}/${nivel}: HTTP ${r.status} ${await r.text()}`); process.exit(1); }
      criadas++;
    }
  }
  console.log(`  ${m.id.padEnd(24)} ${n} jogador(es) × ${NIVEIS.length} níveis`);
}
console.log(`\n✔ ${criadas} partida(s) criadas. Abra o jogo → JOGAR → escolha uma música.\n`);
