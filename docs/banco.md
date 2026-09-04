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

## Supabase — o que já está provisionado

Projeto na região **South America (São Paulo)**, esquema aplicado pelo SQL
Editor a partir deste `schema.sql`.

**Use a string do *transaction pooler*, porta 6543.** As outras duas opções
que o botão *Connect* oferece não servem para o nosso caso:

| opção | porta | por quê |
|---|---|---|
| Direct connection | 5432 | é IPv6, e o Vercel não faz saída por IPv6 — funciona na máquina de casa e falha no deploy |
| Session pooler | 5432 | é para servidor que fica ligado, não para função que sobe e desce |
| **Transaction pooler** | **6543** | **é a recomendada para serverless, e é IPv4 em todos os planos** |

O usuário muda entre elas: na direta é `postgres`, no pooler é
`postgres.<ref-do-projeto>`. A **senha é a mesma** nos dois — a do momento
da criação do projeto. O `[YOUR-PASSWORD]` da string é um espaço reservado,
não uma senha gerada; e se a senha tiver `@`, `:`, `/`, `?`, `#`, `%` ou
`&`, ela precisa ir codificada em URL, senão o `pg` parte o endereço no
meio e o erro que aparece é `password authentication failed`, que não dá
pista nenhuma disso.

### Ferramentas de diagnóstico

```bash
node ferramentas/testa-banco.mjs     # conecta, confere tabelas e colunas
node ferramentas/testa-escrita.mjs   # percorre o caminho de gravação
```

Os dois nunca imprimem a senha, só o tamanho dela. O primeiro traduz o
código de erro do Postgres em causa provável. O segundo anuncia cada passo
antes de executar, então o último `→` da tela é onde quebrou — serve para
quando o POST derruba a API e o stack se perde no reinício do `--watch`.

### Plano free: pausa por inatividade

O projeto é **pausado depois de 7 dias com pouca atividade**, com e-mail de
aviso antes. Nada se perde e religar é um clique no painel, mas vale abrir
o painel um dia antes de qualquer apresentação.
