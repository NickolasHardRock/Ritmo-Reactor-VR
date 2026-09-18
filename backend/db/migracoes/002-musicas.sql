-- ===========================================================================
-- 002-musicas.sql — recordes por música (painel da tela principal).
--
-- SÓ ACRESCENTA: nada é apagado, então é seguro num banco com partidas. É
-- idempotente — pode rodar de novo sem efeito. A API faz o MESMO no
-- arranque (backend/db/index.js -> iniciar), então este arquivo serve para
-- quem prefere aplicar a mudança à mão, antes de subir a versão nova.
--
--   psql "$DATABASE_URL" -f backend/db/migracoes/002-musicas.sql
--
-- As partidas que já existem ficam com musica_id NULL: contam no ranking
-- geral e não aparecem em pódio de música. Se TODAS foram jogadas numa música
-- só e você sabe qual, atribua na mão depois de rodar isto:
--   INSERT INTO musica (slug, titulo) VALUES ('colour-me-red','Colour Me Red')
--     ON CONFLICT (slug) DO NOTHING;
--   UPDATE partida SET musica_id = (SELECT id FROM musica WHERE slug='colour-me-red')
--    WHERE musica_id IS NULL;
-- ===========================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS musica (
  id      SERIAL       PRIMARY KEY,
  slug    VARCHAR(60)  NOT NULL UNIQUE,
  titulo  VARCHAR(120) NOT NULL,
  criado  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

ALTER TABLE partida
  ADD COLUMN IF NOT EXISTS musica_id INTEGER REFERENCES musica(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_partida_musica_jogador
  ON partida (musica_id, jogador_id, pontos DESC, tempo ASC);

COMMIT;
