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
      const registro = { id: ++seqPartida, ...p,
                         musica: p.musica ?? '', nivel: p.nivel ?? '',
                         criado: new Date().toISOString() };
      partidas.push(registro);
      return registro;
    },

    /* `filtro` = { musica?, nivel? }. Campo ausente (undefined) NÃO filtra:
       sem filtro nenhum é o ranking geral de sempre. Com filtro, a regra da
       "melhor partida de cada jogador" vale DENTRO do recorte — quem joga a
       mesma música em três dificuldades aparece nas três tabelas, cada uma
       com a sua melhor. */
    async ranking(limite, filtro = {}){
      const melhor = new Map();
      for (const p of partidas){
        if (!casa(p, filtro)) continue;
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
    async total(filtro = {}){ return partidas.filter(p => casa(p, filtro)).length; },
  };
}

/** A partida `p` entra no recorte `filtro`? Campo `undefined` não filtra. */
function casa(p, { musica, nivel } = {}){
  if (musica !== undefined && (p.musica ?? '') !== musica) return false;
  if (nivel  !== undefined && (p.nivel  ?? '') !== nivel)  return false;
  return true;
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

    /* ESTE DDL TEM QUE CONTINUAR IGUAL AO db/schema.sql. Sao duas fontes de
       propósito -- o schema.sql comeca com DROP TABLE, entao nao pode rodar
       sozinho na subida da API -- mas um banco criado por aqui e um criado
       pelo schema.sql precisam ser o MESMO banco. Ja divergiram uma vez:
       faltavam os CHECK de erros e combo_max e o indice por jogador_id, que
       e justamente o que o DISTINCT ON (jogador_id) do ranking usa. */
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
          erros      SMALLINT NOT NULL DEFAULT 0 CHECK (erros >= 0),
          combo_max  SMALLINT NOT NULL DEFAULT 0 CHECK (combo_max >= 0),
          estrelas   SMALLINT NOT NULL CHECK (estrelas BETWEEN 0 AND 5),
          musica     VARCHAR(60) NOT NULL DEFAULT '',
          nivel      VARCHAR(20) NOT NULL DEFAULT '',
          criado     TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        /* MIGRAÇÃO. O CREATE TABLE IF NOT EXISTS acima NÃO mexe numa tabela que
           já existe — e o banco de produção já existe, criado antes de haver
           ranking por música. Sem estes dois ALTER a API sobe "normalmente" e
           só quebra no primeiro POST ("column musica does not exist"). As
           partidas antigas ficam com musica='' e nivel='' e simplesmente não
           aparecem em nenhum ranking de música: não foram jogadas em nenhuma. */
        ALTER TABLE partida ADD COLUMN IF NOT EXISTS musica VARCHAR(60) NOT NULL DEFAULT '';
        ALTER TABLE partida ADD COLUMN IF NOT EXISTS nivel  VARCHAR(20) NOT NULL DEFAULT '';

        CREATE INDEX IF NOT EXISTS idx_partida_pontos  ON partida (pontos DESC);
        CREATE INDEX IF NOT EXISTS idx_partida_jogador ON partida (jogador_id);
        CREATE INDEX IF NOT EXISTS idx_partida_musica  ON partida (musica, nivel, pontos DESC);
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
        `INSERT INTO partida (jogador_id, pontos, tempo, precisao, erros, combo_max, estrelas,
                              musica, nivel)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
        [p.jogador_id, p.pontos, p.tempo, p.precisao, p.erros, p.combo_max, p.estrelas,
         p.musica ?? '', p.nivel ?? '']);
      return r.rows[0];
    },

    /* Filtro OPCIONAL, por parâmetro e nunca por concatenação: `null` desliga
       a condição (`$2::text IS NULL OR ...`), então a MESMA consulta serve ao
       ranking geral e ao de uma música/nível. O filtro entra DENTRO do
       DISTINCT ON, antes de escolher "a melhor de cada jogador" — filtrar
       depois devolveria, para quem tem a melhor partida em outra música,
       nenhuma linha em vez da melhor DESTA. */
    async ranking(limite, { musica, nivel } = {}){
      const r = await pool.query(
        `SELECT ROW_NUMBER() OVER (ORDER BY m.pontos DESC, m.tempo ASC) AS posicao,
                j.nome, m.pontos, m.tempo, m.precisao, m.combo_max, m.estrelas, m.criado
           FROM (SELECT DISTINCT ON (jogador_id) *
                   FROM partida
                  WHERE ($2::text IS NULL OR musica = $2)
                    AND ($3::text IS NULL OR nivel  = $3)
                  ORDER BY jogador_id, pontos DESC, tempo ASC) m
           JOIN jogador j ON j.id = m.jogador_id
          ORDER BY m.pontos DESC, m.tempo ASC
          LIMIT $1`, [limite, musica ?? null, nivel ?? null]);
      return r.rows.map(normalizar);
    },

    async partida(id){
      const r = await pool.query('SELECT * FROM partida WHERE id = $1', [id]);
      return r.rows[0] ? normalizar(r.rows[0]) : null;
    },
    async total({ musica, nivel } = {}){
      const r = await pool.query(
        `SELECT COUNT(*)::int AS n FROM partida
          WHERE ($1::text IS NULL OR musica = $1)
            AND ($2::text IS NULL OR nivel  = $2)`, [musica ?? null, nivel ?? null]);
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
