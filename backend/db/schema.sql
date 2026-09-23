-- ===========================================================================
-- schema.sql — Drum Reactivate (Etapa 6)
-- PostgreSQL 14+
--
-- MODELO (DER em texto):
--
--   jogador ---- 1 : N ---- partida
--
--   jogador (id PK, nome UNIQUE, criado)
--   partida (id PK, jogador_id FK -> jogador.id, musica, nivel, pontos, tempo,
--            precisao, erros, combo_max, estrelas, criado)
--
-- POR QUE DUAS TABELAS E NÃO UMA
-- Guardar o nome dentro de cada partida repetiria a mesma string a cada
-- jogo e tornaria impossível corrigir um nome digitado errado sem varrer
-- todas as linhas. Separando, o ranking também fica trivial: agrupa por
-- jogador_id.
--
-- POR QUE `musica` E `nivel` NA PARTIDA, E NÃO EM TABELA PRÓPRIA
-- Os dois são a IDENTIDADE do desafio: "melhor pontuação" só quer dizer
-- alguma coisa dentro de uma música e de uma dificuldade — 900 pontos no
-- Fácil (uma peça, janela 1,8×) e 900 no Profissa (sete peças, janela 0,8×)
-- não são a mesma façanha, e comparar os dois na mesma lista é comparar
-- coisas diferentes. Uma tabela `musica` só faria sentido se a música
-- tivesse atributos próprios para guardar (autor, duração, licença) — e ela
-- tem, mas eles já moram na CARTA (frontend/public/cartas/*.json), que é a
-- fonte da verdade e muda a cada ajuste de recorte. Duplicá-los no banco
-- criaria duas verdades. Aqui guarda-se só a CHAVE da carta.
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
COMMENT ON COLUMN jogador.nome IS 'Digitado pelo jogador quando a partida bate o recorde da música (RN09).';

CREATE TABLE partida (
  id          SERIAL       PRIMARY KEY,
  jogador_id  INTEGER      NOT NULL REFERENCES jogador(id) ON DELETE CASCADE,
  musica      VARCHAR(60)  NOT NULL DEFAULT 'desconhecida',
  nivel       VARCHAR(20)  NOT NULL DEFAULT 'facil',
  pontos      INTEGER      NOT NULL CHECK (pontos >= 0),
  tempo       NUMERIC(7,2) NOT NULL CHECK (tempo >= 0),
  precisao    SMALLINT     NOT NULL CHECK (precisao BETWEEN 0 AND 100),
  erros       SMALLINT     NOT NULL DEFAULT 0 CHECK (erros >= 0),
  combo_max   SMALLINT     NOT NULL DEFAULT 0 CHECK (combo_max >= 0),
  estrelas    SMALLINT     NOT NULL CHECK (estrelas BETWEEN 0 AND 5),
  criado      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  partida          IS 'Uma linha por partida CONCLUÍDA (RN07).';
COMMENT ON COLUMN partida.musica   IS 'Chave da carta jogada (nome do arquivo em cartas/, sem .json).';
COMMENT ON COLUMN partida.nivel    IS 'Dificuldade: chave de NIVEIS no config.js (facil, normal, profissa).';
COMMENT ON COLUMN partida.tempo    IS 'Duração em segundos.';
COMMENT ON COLUMN partida.precisao IS 'Percentual de acertos sobre o total de julgamentos.';
COMMENT ON COLUMN partida.estrelas IS 'Estrelas da partida, 0 a 5. Derivadas da precisão; ver pontuacao.js.';

-- O ranking ordena por pontos; sem este índice ele varre a tabela toda.
CREATE INDEX idx_partida_pontos  ON partida (pontos DESC);
CREATE INDEX idx_partida_jogador ON partida (jogador_id);
-- O recorde é consultado no fim de TODA partida concluída, e sempre pela
-- mesma tripla. Este índice é o que faz essa consulta ser uma busca e não
-- uma varredura.
CREATE INDEX idx_partida_recorde ON partida (musica, nivel, pontos DESC);

COMMIT;

-- ---------------------------------------------------------------------------
-- MIGRAÇÃO, para um banco que já existe sem as duas colunas novas.
-- (O schema acima começa com DROP TABLE e só serve para criar do zero.)
-- ---------------------------------------------------------------------------
-- ALTER TABLE partida ADD COLUMN IF NOT EXISTS musica VARCHAR(60) NOT NULL DEFAULT 'desconhecida';
-- ALTER TABLE partida ADD COLUMN IF NOT EXISTS nivel  VARCHAR(20) NOT NULL DEFAULT 'facil';
-- CREATE INDEX IF NOT EXISTS idx_partida_recorde ON partida (musica, nivel, pontos DESC);

-- ---------------------------------------------------------------------------
-- RN09 — O RECORDE DE UMA MÚSICA NUMA DIFICULDADE.
-- É esta consulta que a tela de resultado faz ANTES de decidir se pede o
-- nome do jogador.
-- ---------------------------------------------------------------------------
-- SELECT j.nome, p.pontos, p.tempo, p.criado
--   FROM partida p JOIN jogador j ON j.id = p.jogador_id
--  WHERE p.musica = 'colour-me-red' AND p.nivel = 'facil'
--  ORDER BY p.pontos DESC, p.tempo ASC
--  LIMIT 1;

-- ---------------------------------------------------------------------------
-- RN08 — O RANKING: o melhor jogador de cada DIFICULDADE, numa música.
-- É o que a tela inicial mostra. DISTINCT ON é específico do PostgreSQL e
-- resolve "uma linha por nível" sem subconsulta correlacionada.
-- ---------------------------------------------------------------------------
-- SELECT DISTINCT ON (p.nivel)
--        p.nivel, j.nome, p.pontos, p.tempo, p.precisao, p.estrelas, p.criado
--   FROM partida p JOIN jogador j ON j.id = p.jogador_id
--  WHERE p.musica = 'colour-me-red'
--  ORDER BY p.nivel, p.pontos DESC, p.tempo ASC;

-- ---------------------------------------------------------------------------
-- Ranking longo (a MELHOR partida de cada jogador), com filtro opcional.
-- ---------------------------------------------------------------------------
-- SELECT ROW_NUMBER() OVER (ORDER BY m.pontos DESC, m.tempo ASC) AS posicao,
--        j.nome, m.musica, m.nivel, m.pontos, m.tempo, m.precisao,
--        m.combo_max, m.estrelas, m.criado
--   FROM (SELECT DISTINCT ON (jogador_id) *
--           FROM partida ORDER BY jogador_id, pontos DESC, tempo ASC) m
--   JOIN jogador j ON j.id = m.jogador_id
--  ORDER BY m.pontos DESC, m.tempo ASC
--  LIMIT 10;

-- ---------------------------------------------------------------------------
-- Dados de exemplo para conferir o ranking sem jogar (apague antes da entrega)
-- ---------------------------------------------------------------------------
-- INSERT INTO jogador (nome) VALUES ('Diego'), ('Bruno');
-- INSERT INTO partida (jogador_id, musica, nivel, pontos, tempo, precisao, erros, combo_max, estrelas)
-- VALUES (1, 'colour-me-red', 'facil',    7400, 96.20, 88, 4, 17, 4),
--        (1, 'colour-me-red', 'normal',   5200, 91.40, 71, 9, 11, 3),
--        (2, 'colour-me-red-cheio', 'profissa', 8100, 94.75, 92, 3, 21, 4);
--
-- As estrelas conferem com a precisao pela regra de pontuacao.js
-- (cortes em 95 / 85 / 70 / 50): 88% e 92% dao 4 estrelas, 71% da 3.
