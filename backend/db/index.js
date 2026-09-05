/* ============================================================================
   db/index.js — camada de acesso a dados.

   POR QUE DOIS ADAPTADORES
   Sem DATABASE_URL a API roda com um banco EM MEMÓRIA. Isso não é gambiarra:
   é o que permite clonar o repositório e ter a API no ar em trinta segundos,
   sem instalar Postgres, para desenvolver o front e rodar os testes.
   Assim que a equipe provisionar o banco (Etapa 6), basta preencher a
   variável de ambiente — nenhuma rota muda.

   O ESQUEMA DE VERDADE está em db/schema.sql.
   ========================================================================== */

const URL = process.env.DATABASE_URL?.trim();

/* ------------------------------------------------------- EM MEMÓRIA ------ */
function adaptadorMemoria(){
  const jogadores = new Map();      // nome -> id
  const partidas = [];
  let seqJogador = 0, seqPartida = 0;

  return {
    tipo: 'memoria',
    async iniciar(){ /* nada a preparar */ },

    async acharOuCriarJogador(nome){
      if (jogadores.has(nome)) return jogadores.get(nome);
      const id = ++seqJogador;
      jogadores.set(nome, id);
      return id;
    },

    async salvarPartida(p){
      const registro = { id: ++seqPartida, ...p, criado: new Date().toISOString() };
      partidas.push(registro);
      return registro;
    },

    async ranking(limite){
      // melhor partida de cada jogador, ordenada por pontos
      const melhor = new Map();
      for (const p of partidas){
        const atual = melhor.get(p.jogador_id);
        if (!atual || p.pontos > atual.pontos) melhor.set(p.jogador_id, p);
      }
      const nomePorId = new Map([...jogadores].map(([nome, id]) => [id, nome]));
      return [...melhor.values()]
        .sort((a, b) => b.pontos - a.pontos || a.tempo - b.tempo)
        .slice(0, limite)
        .map((p, i) => ({
          posicao: i + 1, nome: nomePorId.get(p.jogador_id),
          pontos: p.pontos, tempo: p.tempo, precisao: p.precisao,
          combo_max: p.combo_max, estrelas: p.estrelas, criado: p.criado,
        }));
    },

    async partida(id){ return partidas.find(p => p.id === Number(id)) || null; },
    async total(){ return partidas.length; },
  };
}

/* -------------------------------------------------------- POSTGRESQL ----- */

/* O node-postgres devolve NUMERIC e BIGINT como STRING, nao como numero: e
   a decisao correta da biblioteca, porque esses tipos cabem mais do que um
   double aguenta. Só que aqui isso fazia o MESMO endpoint responder com
   tipos diferentes conforme o DATABASE_URL estar definido ou nao --
   `"tempo": 96.2` em memoria contra `"tempo": "96.20"` no Postgres, e
   `"posicao": 1` contra `"posicao": "1"`. Quem consome ordenaria ou somaria
   string sem perceber. Os valores deste jogo cabem folgados num double, e o
   contrato publicado em docs/api.md diz numero, entao normalizamos aqui. */
const CAMPOS_NUMERICOS = ['posicao', 'pontos', 'tempo', 'precisao', 'erros',
                          'combo_max', 'estrelas', 'jogador_id', 'id'];
function normalizar(linha){
  const saida = { ...linha };
  for (const k of CAMPOS_NUMERICOS)
    if (saida[k] !== undefined && saida[k] !== null) saida[k] = Number(saida[k]);
  return saida;
}

async function adaptadorPostgres(){
  // import dinâmico: quem roda em memória não precisa ter o `pg` instalado
  const { default: pg } = await import('pg');
  const pool = new pg.Pool({
    connectionString: URL,
    ssl: URL.includes('localhost') ? false : { rejectUnauthorized: false },

    /* Poucas conexões de propósito. Cada instância de função no Vercel abre o
       PRÓPRIO pool, e o pooler do plano free tem um teto modesto de conexões:
       um `max` generoso aqui multiplica por instância e esgota o servidor. */
    max: 4,
    /* Devolve a conexão logo — segurar socket ocioso atrás de um pooler é
       pedir para ele ser descartado do outro lado. */
    idleTimeoutMillis: 10_000,
    /* Sem isto o padrão é esperar para sempre: um host errado deixaria a
       requisição pendurada em vez de falhar com uma mensagem. */
    connectionTimeoutMillis: 10_000,
    keepAlive: true,
  });

  /* ISTO NÃO É OPCIONAL. Quando uma conexão OCIOSA do pool morre — e atrás de
     um pooler isso é rotina, não exceção — o `pg` emite `error` no pool. Sem
     ouvinte, o Node trata como erro não capturado e MATA O PROCESSO.

     Foi assim que a API caiu no primeiro POST durante a implantação: o
     /api/saude abriu a conexão, ela ficou parada alguns segundos, o pooler a
     descartou, e a requisição seguinte pegou o socket morto. Em produção é
     pior: função serverless fica ociosa entre requisições por natureza, então
     esse é o caminho COMUM. O pool sabe se recuperar sozinho — ele descarta a
     conexão ruim e abre outra. Só precisa que alguém escute o aviso. */
  pool.on('error', (e) => {
    console.error('[db] conexão ociosa caiu (o pool abre outra):', e.message);
  });

  return {
    tipo: 'postgres',

    async iniciar(){
      // cria as tabelas se ainda não existirem (idempotente)
      await pool.query(`
        CREATE TABLE IF NOT EXISTS jogador (
          id     SERIAL PRIMARY KEY,
          nome   VARCHAR(60) NOT NULL UNIQUE,
          criado TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE TABLE IF NOT EXISTS partida (
          id         SERIAL PRIMARY KEY,
          jogador_id INTEGER NOT NULL REFERENCES jogador(id) ON DELETE CASCADE,
          pontos     INTEGER NOT NULL CHECK (pontos >= 0),
          tempo      NUMERIC(7,2) NOT NULL CHECK (tempo >= 0),
          precisao   SMALLINT NOT NULL CHECK (precisao BETWEEN 0 AND 100),
          erros      SMALLINT NOT NULL DEFAULT 0,
          combo_max  SMALLINT NOT NULL DEFAULT 0,
          estrelas   SMALLINT NOT NULL CHECK (estrelas BETWEEN 0 AND 5),
          criado     TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_partida_pontos ON partida (pontos DESC);
      `);
    },

    async acharOuCriarJogador(nome){
      const r = await pool.query(
        `INSERT INTO jogador (nome) VALUES ($1)
         ON CONFLICT (nome) DO UPDATE SET nome = EXCLUDED.nome
         RETURNING id`, [nome]);
      return r.rows[0].id;
    },

    async salvarPartida(p){
      const r = await pool.query(
        `INSERT INTO partida (jogador_id, pontos, tempo, precisao, erros, combo_max, estrelas)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
        [p.jogador_id, p.pontos, p.tempo, p.precisao, p.erros, p.combo_max, p.estrelas]);
      return r.rows[0];
    },

    async ranking(limite){
      const r = await pool.query(
        `SELECT ROW_NUMBER() OVER (ORDER BY m.pontos DESC, m.tempo ASC) AS posicao,
                j.nome, m.pontos, m.tempo, m.precisao, m.combo_max, m.estrelas, m.criado
           FROM (SELECT DISTINCT ON (jogador_id) *
                   FROM partida ORDER BY jogador_id, pontos DESC, tempo ASC) m
           JOIN jogador j ON j.id = m.jogador_id
          ORDER BY m.pontos DESC, m.tempo ASC
          LIMIT $1`, [limite]);
      return r.rows.map(normalizar);
    },

    async partida(id){
      const r = await pool.query('SELECT * FROM partida WHERE id = $1', [id]);
      return r.rows[0] ? normalizar(r.rows[0]) : null;
    },
    async total(){
      const r = await pool.query('SELECT COUNT(*)::int AS n FROM partida');
      return r.rows[0].n;
    },
  };
}

let _db = null;
export async function db(){
  if (_db) return _db;
  _db = URL ? await adaptadorPostgres() : adaptadorMemoria();
  await _db.iniciar();
  console.log(`[db] usando adaptador "${_db.tipo}"` +
    (_db.tipo === 'memoria' ? ' — defina DATABASE_URL para persistir de verdade' : ''));
  return _db;
}
