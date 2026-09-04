-- ===========================================================================
-- schema.sql — Drum Reactivate (Etapa 6)
-- PostgreSQL 14+
--
-- MODELO (DER em texto):
--
--   jogador ---- 1 : N ---- partida
--
--   jogador (id PK, nome UNIQUE, criado)
--   partida (id PK, jogador_id FK -> jogador.id, pontos, tempo,
--            precisao, erros, combo_max, estrelas, criado)
--
-- POR QUE DUAS TABELAS E NÃO UMA
-- Guardar o nome dentro de cada partida repetiria a mesma string a cada
-- jogo e tornaria impossível corrigir um nome digitado errado sem varrer
-- todas as linhas. Separando, o ranking também fica trivial: agrupa por
-- jogador_id.
--
-- Para aplicar:
--   psql "$DATABASE_URL" -f backend/db/schema.sql
-- ===========================================================================

BEGIN;

DROP TABLE IF EXISTS partida;
DROP TABLE IF EXISTS jogador;

CREATE TABLE jogador (
  id      SERIAL       PRIMARY KEY,
  nome    VARCHAR(60)  NOT NULL UNIQUE,
  criado  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  jogador      IS 'Quem jogou. O nome é único: a mesma pessoa acumula partidas.';
COMMENT ON COLUMN jogador.nome IS 'Informado pelo jogador na tela inicial.';

CREATE TABLE partida (
  id          SERIAL       PRIMARY KEY,
  jogador_id  INTEGER      NOT NULL REFERENCES jogador(id) ON DELETE CASCADE,
  pontos      INTEGER      NOT NULL CHECK (pontos >= 0),
  tempo       NUMERIC(7,2) NOT NULL CHECK (tempo >= 0),
  precisao    SMALLINT     NOT NULL CHECK (precisao BETWEEN 0 AND 100),
  erros       SMALLINT     NOT NULL DEFAULT 0 CHECK (erros >= 0),
  combo_max   SMALLINT     NOT NULL DEFAULT 0 CHECK (combo_max >= 0),
  estrelas    SMALLINT     NOT NULL CHECK (estrelas BETWEEN 0 AND 5),
  criado      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  partida          IS 'Uma linha por partida CONCLUÍDA (RN07).';
COMMENT ON COLUMN partida.tempo    IS 'Duração em segundos.';
COMMENT ON COLUMN partida.precisao IS 'Percentual de acertos sobre o total de julgamentos.';
COMMENT ON COLUMN partida.estrelas IS 'Estrelas da partida, 0 a 5. Derivadas da precisão; ver pontuacao.js.';

-- O ranking ordena por pontos; sem este índice ele varre a tabela toda.
CREATE INDEX idx_partida_pontos  ON partida (pontos DESC);
CREATE INDEX idx_partida_jogador ON partida (jogador_id);

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
-- Dados de exemplo para conferir o ranking sem jogar (apague antes da entrega)
-- ---------------------------------------------------------------------------
-- INSERT INTO jogador (nome) VALUES ('Diego'), ('Bruno');
-- INSERT INTO partida (jogador_id, pontos, tempo, precisao, erros, combo_max, estrelas)
-- VALUES (1, 740, 96.20, 88, 4, 17, 82),
--        (1, 520, 91.40, 71, 9, 11, 57),
--        (2, 810, 94.75, 92, 3, 21, 90);
