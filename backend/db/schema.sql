-- ===========================================================================
-- schema.sql — Drum Reactivate (Etapa 6)
-- PostgreSQL 14+
--
-- MODELO (DER em texto):
--
--   jogador ---- 1 : N ---- partida ---- N : 1 ---- musica
--
--   jogador (id PK, nome UNIQUE, criado)
--   musica  (id PK, slug UNIQUE, titulo, criado)
--   partida (id PK, jogador_id FK -> jogador.id,
--            musica_id FK -> musica.id (NULL permitido),
--            pontos, tempo, precisao, erros, combo_max, estrelas, criado)
--
-- POR QUE TABELAS SEPARADAS E NÃO UMA SÓ
-- Guardar o nome dentro de cada partida repetiria a mesma string a cada
-- jogo e tornaria impossível corrigir um nome digitado errado sem varrer
-- todas as linhas. Separando, o ranking também fica trivial: agrupa por
-- jogador_id. O mesmo vale para a música (18/09: o painel de recordes da
-- tela principal mostra os três melhores de CADA música).
--
-- POR QUE NÃO HÁ UMA TABELA "PÓDIO"
-- Os três melhores de cada música são DERIVADOS de `partida`: guardá-los à
-- parte criaria um segundo lugar que precisa ser atualizado em toda partida
-- e que pode discordar do primeiro. A consulta no fim deste arquivo calcula o
-- pódio na hora, e o índice idx_partida_musica_jogador a torna barata.
--
-- `musica.slug` é o `id` de frontend/public/musicas.json. `partida.musica_id`
-- é NULL nas partidas gravadas antes de existir a tabela e nas de uma carta
-- avulsa pedida por ?carta= — elas contam no ranking geral, não em pódio.
--
-- Banco JÁ EM USO? Não rode este arquivo (ele começa com DROP). Use
-- backend/db/migracoes/002-musicas.sql, que só acrescenta.
--
-- Para aplicar:
--   psql "$DATABASE_URL" -f backend/db/schema.sql
-- ===========================================================================

BEGIN;

DROP TABLE IF EXISTS partida;
DROP TABLE IF EXISTS musica;
DROP TABLE IF EXISTS jogador;

CREATE TABLE jogador (
  id      SERIAL       PRIMARY KEY,
  nome    VARCHAR(60)  NOT NULL UNIQUE,
  criado  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  jogador      IS 'Quem jogou. O nome é único: a mesma pessoa acumula partidas.';
COMMENT ON COLUMN jogador.nome IS 'Informado pelo jogador na tela inicial.';

CREATE TABLE musica (
  id      SERIAL       PRIMARY KEY,
  slug    VARCHAR(60)  NOT NULL UNIQUE,
  titulo  VARCHAR(120) NOT NULL,
  criado  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  musica        IS 'Música jogável. Uma linha nasce na primeira partida registrada nela.';
COMMENT ON COLUMN musica.slug   IS 'O id de frontend/public/musicas.json (letras, números, - e _).';
COMMENT ON COLUMN musica.titulo IS 'Título na primeira vez que a música apareceu; a tela usa o do manifesto.';

CREATE TABLE partida (
  id          SERIAL       PRIMARY KEY,
  jogador_id  INTEGER      NOT NULL REFERENCES jogador(id) ON DELETE CASCADE,
  musica_id   INTEGER      REFERENCES musica(id) ON DELETE SET NULL,
  pontos      INTEGER      NOT NULL CHECK (pontos >= 0),
  tempo       NUMERIC(7,2) NOT NULL CHECK (tempo >= 0),
  precisao    SMALLINT     NOT NULL CHECK (precisao BETWEEN 0 AND 100),
  erros       SMALLINT     NOT NULL DEFAULT 0 CHECK (erros >= 0),
  combo_max   SMALLINT     NOT NULL DEFAULT 0 CHECK (combo_max >= 0),
  estrelas    SMALLINT     NOT NULL CHECK (estrelas BETWEEN 0 AND 5),
  criado      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  partida          IS 'Uma linha por partida CONCLUÍDA (RN07).';
COMMENT ON COLUMN partida.musica_id IS 'Música jogada. NULL: partida antiga ou de carta avulsa.';
COMMENT ON COLUMN partida.tempo    IS 'Duração em segundos.';
COMMENT ON COLUMN partida.precisao IS 'Percentual de acertos sobre o total de julgamentos.';
COMMENT ON COLUMN partida.estrelas IS 'Estrelas da partida, 0 a 5. Derivadas da precisão; ver pontuacao.js.';

-- O ranking ordena por pontos; sem este índice ele varre a tabela toda.
CREATE INDEX idx_partida_pontos  ON partida (pontos DESC);
CREATE INDEX idx_partida_jogador ON partida (jogador_id);
-- O pódio por música: o DISTINCT ON (musica_id, jogador_id) percorre este.
CREATE INDEX idx_partida_musica_jogador
  ON partida (musica_id, jogador_id, pontos DESC, tempo ASC);

COMMIT;

-- ---------------------------------------------------------------------------
-- Consulta do ranking (RN08): a MELHOR partida de cada jogador.
-- DISTINCT ON é específico do PostgreSQL e resolve isso sem subconsulta
-- correlacionada.
-- ---------------------------------------------------------------------------
-- SELECT ROW_NUMBER() OVER (ORDER BY m.pontos DESC, m.tempo ASC) AS posicao,
--        j.nome, m.pontos, m.tempo, m.precisao, m.combo_max, m.estrelas, m.criado
--   FROM (SELECT DISTINCT ON (jogador_id) *
--           FROM partida ORDER BY jogador_id, pontos DESC, tempo ASC) m
--   JOIN jogador j ON j.id = m.jogador_id
--  ORDER BY m.pontos DESC, m.tempo ASC
--  LIMIT 10;

-- ---------------------------------------------------------------------------
-- Consulta do pódio por música: os 3 melhores de CADA música (mesmo critério,
-- a melhor partida de cada jogador). É a que roda em GET /api/ranking/musicas.
-- ---------------------------------------------------------------------------
-- WITH melhor AS (
--   SELECT DISTINCT ON (musica_id, jogador_id) *
--     FROM partida WHERE musica_id IS NOT NULL
--    ORDER BY musica_id, jogador_id, pontos DESC, tempo ASC
-- ), numerada AS (
--   SELECT melhor.*, ROW_NUMBER() OVER (PARTITION BY musica_id
--                                       ORDER BY pontos DESC, tempo ASC) AS posicao
--     FROM melhor
-- )
-- SELECT m.slug, m.titulo, n.posicao, j.nome, n.pontos, n.tempo
--   FROM numerada n
--   JOIN musica m ON m.id = n.musica_id JOIN jogador j ON j.id = n.jogador_id
--  WHERE n.posicao <= 3
--  ORDER BY m.slug, n.posicao;

-- ---------------------------------------------------------------------------
-- Dados de exemplo para conferir o ranking sem jogar (apague antes da entrega)
-- ---------------------------------------------------------------------------
-- INSERT INTO jogador (nome) VALUES ('Diego'), ('Bruno');
-- INSERT INTO musica (slug, titulo) VALUES ('colour-me-red', 'Colour Me Red');
-- INSERT INTO partida (jogador_id, musica_id, pontos, tempo, precisao, erros, combo_max, estrelas)
-- VALUES (1, 1, 740, 96.20, 88, 4, 17, 4),
--        (1, 1, 520, 91.40, 71, 9, 11, 3),
--        (2, 1, 810, 94.75, 92, 3, 21, 4);
--
-- As estrelas conferem com a precisao pela regra de pontuacao.js
-- (cortes em 95 / 85 / 70 / 50): 88% e 92% dao 4 estrelas, 71% da 3.
