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
  const musicas = new Map();        // slug -> { id, slug, titulo }
  const partidas = [];
  let seqJogador = 0, seqMusica = 0, seqPartida = 0;

  return {
    tipo: 'memoria',
    async iniciar(){ /* nada a preparar */ },

    async acharOuCriarJogador(nome){
      if (jogadores.has(nome)) return jogadores.get(nome);
      const id = ++seqJogador;
      jogadores.set(nome, id);
      return id;
    },

    async acharOuCriarMusica(slug, titulo){
      const ja = musicas.get(slug);
      if (ja) return ja.id;
      const id = ++seqMusica;
      musicas.set(slug, { id, slug, titulo: titulo || slug });
      return id;
    },

    async salvarPartida(p){
      const registro = { id: ++seqPartida, musica_id: null, ...p,
                         criado: new Date().toISOString() };
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

    /* Os `limite` melhores jogadores de CADA música: a melhor partida de cada
       jogador naquela música, por pontos e depois menor tempo. Partida sem
       música (`musica_id` nulo — as de antes desta tabela existir, ou de uma
       carta avulsa pedida na URL) não entra em pódio nenhum. */
    async rankingPorMusica(limite){
      const melhor = new Map();                       // "musica:jogador" -> partida
      const antes = (a, b) => a.pontos > b.pontos
        || (a.pontos === b.pontos && a.tempo < b.tempo);
      for (const p of partidas){
        if (p.musica_id == null) continue;
        const k = `${p.musica_id}:${p.jogador_id}`;
        const atual = melhor.get(k);
        if (!atual || antes(p, atual)) melhor.set(k, p);
      }
      const nomePorId = new Map([...jogadores].map(([nome, id]) => [id, nome]));
      const porMusica = new Map();                    // musica_id -> partidas
      for (const p of melhor.values()){
        if (!porMusica.has(p.musica_id)) porMusica.set(p.musica_id, []);
        porMusica.get(p.musica_id).push(p);
      }
      return [...musicas.values()]
        .filter(m => porMusica.has(m.id))
        .sort((a, b) => a.slug.localeCompare(b.slug))
        .map(m => ({
          musica: m.slug,
          titulo: m.titulo,
          itens: porMusica.get(m.id)
            .sort((a, b) => b.pontos - a.pontos || a.tempo - b.tempo)
            .slice(0, limite)
            .map((p, i) => ({
              posicao: i + 1, nome: nomePorId.get(p.jogador_id),
              pontos: p.pontos, tempo: p.tempo, precisao: p.precisao,
              combo_max: p.combo_max, estrelas: p.estrelas, criado: p.criado,
            })),
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
                          'combo_max', 'estrelas', 'jogador_id', 'musica_id', 'id'];
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
        CREATE TABLE IF NOT EXISTS musica (
          id     SERIAL PRIMARY KEY,
          slug   VARCHAR(60)  NOT NULL UNIQUE,
          titulo VARCHAR(120) NOT NULL,
          criado TIMESTAMPTZ  NOT NULL DEFAULT NOW()
        );
        CREATE TABLE IF NOT EXISTS partida (
          id         SERIAL PRIMARY KEY,
          jogador_id INTEGER NOT NULL REFERENCES jogador(id) ON DELETE CASCADE,
          musica_id  INTEGER REFERENCES musica(id) ON DELETE SET NULL,
          pontos     INTEGER NOT NULL CHECK (pontos >= 0),
          tempo      NUMERIC(7,2) NOT NULL CHECK (tempo >= 0),
          precisao   SMALLINT NOT NULL CHECK (precisao BETWEEN 0 AND 100),
          erros      SMALLINT NOT NULL DEFAULT 0 CHECK (erros >= 0),
          combo_max  SMALLINT NOT NULL DEFAULT 0 CHECK (combo_max >= 0),
          estrelas   SMALLINT NOT NULL CHECK (estrelas BETWEEN 0 AND 5),
          criado     TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        -- Banco criado ANTES de existir a tabela musica: o CREATE TABLE acima
        -- não mexe numa tabela que já existe, então a coluna entra aqui.
        ALTER TABLE partida
          ADD COLUMN IF NOT EXISTS musica_id INTEGER REFERENCES musica(id) ON DELETE SET NULL;
        CREATE INDEX IF NOT EXISTS idx_partida_pontos  ON partida (pontos DESC);
        CREATE INDEX IF NOT EXISTS idx_partida_jogador ON partida (jogador_id);
        CREATE INDEX IF NOT EXISTS idx_partida_musica_jogador
          ON partida (musica_id, jogador_id, pontos DESC, tempo ASC);
      `);
    },

    async acharOuCriarJogador(nome){
      const r = await pool.query(
        `INSERT INTO jogador (nome) VALUES ($1)
         ON CONFLICT (nome) DO UPDATE SET nome = EXCLUDED.nome
         RETURNING id`, [nome]);
      return r.rows[0].id;
    },

    async acharOuCriarMusica(slug, titulo){
      /* O título só vale na PRIMEIRA vez: o DO UPDATE reescreve o slug por ele
         mesmo, só para o RETURNING devolver o id da linha que já existe. Um
         cliente forjando POST não consegue renomear uma música já cadastrada. */
      const r = await pool.query(
        `INSERT INTO musica (slug, titulo) VALUES ($1, $2)
         ON CONFLICT (slug) DO UPDATE SET slug = EXCLUDED.slug
         RETURNING id`, [slug, titulo || slug]);
      return r.rows[0].id;
    },

    async salvarPartida(p){
      const r = await pool.query(
        `INSERT INTO partida (jogador_id, musica_id, pontos, tempo, precisao, erros, combo_max, estrelas)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
        [p.jogador_id, p.musica_id ?? null, p.pontos, p.tempo, p.precisao,
         p.erros, p.combo_max, p.estrelas]);
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

    /* Mesma regra do ranking geral (a MELHOR partida de cada jogador), só que
       por música: DISTINCT ON (musica_id, jogador_id) escolhe a melhor de cada
       par, ROW_NUMBER numera dentro de cada música, e o WHERE corta no pódio.
       Tudo numa ida ao banco, e o índice idx_partida_musica_jogador é o que o
       DISTINCT ON percorre. */
    async rankingPorMusica(limite){
      const r = await pool.query(
        `WITH melhor AS (
           SELECT DISTINCT ON (musica_id, jogador_id) *
             FROM partida
            WHERE musica_id IS NOT NULL
            ORDER BY musica_id, jogador_id, pontos DESC, tempo ASC
         ), numerada AS (
           SELECT melhor.*,
                  ROW_NUMBER() OVER (PARTITION BY musica_id
                                     ORDER BY pontos DESC, tempo ASC) AS posicao
             FROM melhor
         )
         SELECT m.slug AS musica, m.titulo, n.posicao, j.nome, n.pontos, n.tempo,
                n.precisao, n.combo_max, n.estrelas, n.criado
           FROM numerada n
           JOIN musica  m ON m.id = n.musica_id
           JOIN jogador j ON j.id = n.jogador_id
          WHERE n.posicao <= $1
          ORDER BY m.slug, n.posicao`, [limite]);

      const porMusica = new Map();
      for (const linha of r.rows.map(normalizar)){
        const { musica, titulo, ...item } = linha;
        if (!porMusica.has(musica)) porMusica.set(musica, { musica, titulo, itens: [] });
        porMusica.get(musica).itens.push(item);
      }
      return [...porMusica.values()];
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
