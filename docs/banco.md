# Banco de dados (Etapa 6)

## Modelo (DER)

```
┌─────────────────────┐            ┌──────────────────────────────┐
│ jogador             │            │ partida                      │
├─────────────────────┤            ├──────────────────────────────┤
│ id        SERIAL PK │ 1        N │ id          SERIAL PK        │
│ nome      VARCHAR60 │◄───────────│ jogador_id  INTEGER FK       │
│           UNIQUE    │            │ pontos      INTEGER          │
│ criado    TIMESTAMP │            │ tempo       NUMERIC(7,2)     │
└─────────────────────┘            │ precisao    SMALLINT 0..100  │
                                   │ erros       SMALLINT         │
                                   │ combo_max   SMALLINT         │
                                   │ estrelas    SMALLINT 0..5    │
                                   │ criado      TIMESTAMP        │
                                   └──────────────────────────────┘
```

**Por que duas tabelas e não uma.** Guardar o nome dentro de cada partida
repetiria a mesma string a cada jogo e tornaria impossível corrigir um nome
digitado errado sem varrer todas as linhas. Separando, o ranking também fica
trivial: agrupa por `jogador_id`.

O script completo, com as restrições e os índices comentados, está em
[`../backend/db/schema.sql`](../backend/db/schema.sql).

---

## Os dois adaptadores

`backend/db/index.js` escolhe sozinho, conforme a variável `DATABASE_URL`:

| `DATABASE_URL` | Adaptador | Comportamento |
|---|---|---|
| vazia | **memória** | funciona na hora, dados somem ao reiniciar |
| preenchida | **PostgreSQL** | persiste de verdade; cria as tabelas se não existirem |

Isso não é gambiarra: é o que permite clonar o repositório e ter a API no ar
em trinta segundos, sem instalar Postgres, para desenvolver o front e rodar
os testes. Nenhuma rota muda quando o banco entra.

---

## Provisionando um Postgres

Opções gratuitas que funcionam com o Vercel:

- **[Neon](https://neon.tech)** — plano gratuito, string de conexão pronta
- **[Supabase](https://supabase.com)** — idem, com painel de tabelas
- **Postgres local** — `postgres://postgres:senha@localhost:5432/drum`

Depois:

```bash
# 1. cole a string em backend/.env
DATABASE_URL=postgres://usuario:senha@host:5432/banco?sslmode=require

# 2. aplique o esquema
psql "$DATABASE_URL" -f backend/db/schema.sql

# 3. confira
curl http://localhost:3000/api/saude    # deve responder "banco":"postgres"
```

No Vercel, a mesma variável vai em *Settings → Environment Variables*.

> O `.env` **não** vai para o Git. Nunca comitem a string de conexão: ela
> contém a senha do banco (RNF04).
