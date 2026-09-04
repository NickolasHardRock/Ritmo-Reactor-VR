/* ============================================================================
   testa-escrita.mjs — exercita o caminho de GRAVAÇÃO direto na camada de
   dados, sem Express.

   POR QUE EXISTE. Quando o POST derruba o processo, o navegador (ou o curl)
   só vê "connection reset" e o `node --watch` reinicia por cima do stack.
   Aqui cada passo é anunciado antes de acontecer, então o último "→" que
   aparecer na tela é exatamente onde quebrou.

   USO (na janela onde DATABASE_URL está definida):
     node ferramentas/testa-escrita.mjs
   ========================================================================== */

if (!process.env.DATABASE_URL?.trim()){
  console.error('✗ DATABASE_URL não definida NESTA janela.');
  process.exit(1);
}

process.on('unhandledRejection', (e) => {
  console.error('\n✗ rejeição não tratada — é isto que derruba a API:');
  console.error(e);
  process.exit(1);
});

const { db } = await import('../backend/db/index.js');

try {
  console.log('→ abrindo o adaptador e rodando iniciar()');
  const base = await db();
  console.log(`  tipo: ${base.tipo}`);

  console.log('→ acharOuCriarJogador("Teste Escrita")');
  const jogador_id = await base.acharOuCriarJogador('Teste Escrita');
  console.log(`  jogador_id = ${jogador_id}`);

  console.log('→ acharOuCriarJogador de novo (testa o ON CONFLICT)');
  const outra = await base.acharOuCriarJogador('Teste Escrita');
  console.log(`  jogador_id = ${outra} ${outra === jogador_id ? '(mesmo, correto)' : '(DIFERENTE!)'}`);

  console.log('→ salvarPartida');
  const p = await base.salvarPartida({
    jogador_id, pontos: 31200, tempo: 69.4, precisao: 94,
    erros: 2, combo_max: 57, estrelas: 4,
  });
  console.log(`  id = ${p.id}, estrelas = ${p.estrelas}, criado = ${p.criado}`);

  console.log('→ ranking(5)');
  const r = await base.ranking(5);
  console.log(`  ${r.length} item(ns):`, JSON.stringify(r, null, 1));

  console.log('→ total()');
  console.log(`  ${await base.total()} partida(s)`);

  console.log('\nTUDO OK no caminho de escrita.');
  process.exit(0);
} catch (e){
  console.error('\n✗ QUEBROU no passo acima. Erro completo:\n');
  console.error(e);
  if (e.code) console.error('\ncódigo:', e.code);
  if (e.detail) console.error('detalhe:', e.detail);
  if (e.constraint) console.error('restrição violada:', e.constraint);
  if (e.column) console.error('coluna:', e.column);
  if (e.table) console.error('tabela:', e.table);
  process.exit(1);
}
