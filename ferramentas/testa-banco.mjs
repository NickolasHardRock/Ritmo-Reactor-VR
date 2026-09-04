/* ============================================================================
   testa-banco.mjs — fala com o Postgres SEM o Express no meio.

   POR QUE EXISTE. Quando a API cai na primeira requisição, o navegador só
   mostra "conexão resetada" e o erro de verdade se perde no meio do
   reinício do `node --watch`. Aqui o erro aparece inteiro, e sozinho.

   NUNCA imprime a senha: a string é desmontada e só host, porta, usuário e
   banco vão para a tela.

   USO (na mesma janela onde DATABASE_URL foi definida):
     node ferramentas/testa-banco.mjs
   ========================================================================== */

const URL_BRUTA = process.env.DATABASE_URL?.trim();
if (!URL_BRUTA){
  console.error('✗ DATABASE_URL não está definida NESTA janela do terminal.');
  console.error('  No PowerShell:  $env:DATABASE_URL = "postgresql://..."');
  process.exit(1);
}

/* ---- desmonta a string sem vazar a senha ------------------------------- */
let u;
try { u = new URL(URL_BRUTA); }
catch {
  console.error('✗ A string não é uma URL válida. O caso mais comum é senha com');
  console.error('  "@" ou ":" sem codificar, o que parte a URL no meio.');
  process.exit(1);
}
const porta = u.port || '5432';
console.log('string recebida:');
console.log(`  usuário : ${decodeURIComponent(u.username)}`);
console.log(`  host    : ${u.hostname}`);
console.log(`  porta   : ${porta}`);
console.log(`  banco   : ${u.pathname.replace('/','')}`);
console.log(`  senha   : ${u.password ? `${u.password.length} caracteres` : '(VAZIA!)'}`);

/* ---- avisos que se detectam antes de tentar conectar ------------------- */
if (u.password.startsWith('[') || u.password.endsWith(']'))
  console.log('\n⚠ a senha está entre colchetes — eles fazem parte do placeholder e devem sair');
if (porta === '5432' && u.hostname.includes('pooler'))
  console.log('\n⚠ porta 5432 no pooler = session mode. Para Vercel use 6543 (transaction).');
if (porta === '5432' && u.hostname.startsWith('db.'))
  console.log('\n⚠ esta é a conexão DIRETA (IPv6). Funciona aqui, mas falha no Vercel.');

const { default: pg } = await import('pg');
const cliente = new pg.Client({
  connectionString: URL_BRUTA,
  ssl: URL_BRUTA.includes('localhost') ? false : { rejectUnauthorized: false },
  connectionTimeoutMillis: 12000,
});

try {
  console.log('\nconectando…');
  await cliente.connect();
  const v = await cliente.query('SELECT version()');
  console.log('✓ conectado');
  console.log('  ' + v.rows[0].version.split(',')[0]);

  const t = await cliente.query(`
    SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'public' ORDER BY table_name`);
  const nomes = t.rows.map(r => r.table_name);
  console.log(`\ntabelas em public: ${nomes.join(', ') || '(nenhuma)'}`);
  for (const esperada of ['jogador','partida'])
    console.log(`  ${nomes.includes(esperada) ? '✓' : '✗'} ${esperada}`);

  if (nomes.includes('partida')){
    const c = await cliente.query(`
      SELECT column_name FROM information_schema.columns
       WHERE table_name = 'partida' ORDER BY ordinal_position`);
    const cols = c.rows.map(r => r.column_name);
    console.log(`\ncolunas de partida: ${cols.join(', ')}`);
    console.log(`  ${cols.includes('estrelas') ? '✓' : '✗'} estrelas`
              + `${cols.includes('reator') ? '  ⚠ coluna "reator" antiga ainda existe' : ''}`);
    const n = await cliente.query('SELECT COUNT(*)::int AS n FROM partida');
    console.log(`\npartidas gravadas: ${n.rows[0].n}`);
  }
  console.log('\nTUDO OK — pode seguir para o Vercel.');
} catch (e){
  console.error('\n✗ FALHOU:', e.message);
  const dica = {
    '28P01': 'senha errada, ou símbolo da senha sem codificar em URL',
    '3D000': 'o banco do fim da string não existe',
    '28000': 'usuário inválido — no pooler ele é postgres.<ref>, não só postgres',
    '42501': 'sem permissão — usuário errado para criar/ler tabela',
  }[e.code];
  if (dica) console.error('  →', dica);
  if (e.code === 'ETIMEDOUT' || e.code === 'ENETUNREACH')
    console.error('  → host inalcançável. Se a porta é 5432 em db.<ref>.supabase.co,'
                + '\n    é a conexão direta por IPv6; troque pelo pooler em :6543.');
  if (e.code === 'ENOTFOUND')
    console.error('  → host não resolveu: confira se o endereço foi copiado inteiro.');
  if (e.code === 'ECONNRESET')
    console.error('  → conexão resetada pelo servidor: costuma ser SSL. Confirme :6543.');
  console.error('\n  código:', e.code || '(sem código)');
  process.exit(1);
} finally {
  await cliente.end().catch(() => {});
}
