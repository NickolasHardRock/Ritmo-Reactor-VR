# Banco de dados (Etapa 6)

## Modelo (DER)

```
┌─────────────────────┐            ┌──────────────────────────────┐
│ jogador             │            │ partida                      │
├─────────────────────┤            ├──────────────────────────────┤
│ id        SERIAL PK │ 1        N │ id          SERIAL PK        │
│ nome      VARCHAR60 │◄───────────│ jogador_id  INTEGER FK       │
│           UNIQUE    │            │ musica      VARCHAR(60)      │
│ criado    TIMESTAMP │            │ nivel       VARCHAR(20)      │
└─────────────────────┘            │ pontos      INTEGER          │
                                   │ tempo       NUMERIC(7,2)     │
                                   │ precisao    SMALLINT 0..100  │
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

**Por que `musica` e `nivel` ficam na partida.** Os dois são a identidade do
desafio: "melhor pontuação" só quer dizer alguma coisa dentro de uma música e
de uma dificuldade — 900 pontos no Fácil (uma peça, janela 1,8×) e 900 no
Profissa (sete peças, janela 0,8×) não são a mesma façanha. Uma tabela
`musica` própria só faria sentido se a música tivesse atributos para guardar
(autor, duração, licença) — e ela tem, só que eles moram na **carta**
(`frontend/public/cartas/*.json`), que é a fonte da verdade e muda a cada
ajuste de recorte. Duplicá-los no banco criaria duas verdades; aqui guarda-se
só a chave.

`musica` é o nome do arquivo da carta sem `.json`; `nivel` é a chave de
`NIVEIS` no `config.js`. Ambas com `DEFAULT`, para um cliente antigo continuar
gravando.

### RN09 — o nome só é pedido no recorde

O jogo pergunta o nome de quem jogou quando a partida bate a melhor marca
**daquela música naquela dificuldade** e faz pelo menos **1000 pontos**. Nas
outras a linha vai com o último nome conhecido: um campo de texto ao fim de
cada partida é atrito no melhor momento do jogo, e em VR custa uns vinte
segundos de teclado apontado.

O piso existe porque a primeira condição, sozinha, se resolve com uma partida
vazia — num banco recém-criado qualquer resultado é recorde. Ele mora em
`backend/regras.js`, é devolvido em `GET /api/ranking/recorde` e **não aparece
para o jogador**: é critério da equipe, não meta dele.

Quem decide é o servidor, na mesma requisição que grava e **antes** do
`INSERT`: depois, a própria partida já seria a marca a bater.

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

**Um contrato só para os dois.** O `node-postgres` devolve `NUMERIC` e
`BIGINT` como *string* — decisão correta dele, porque esses tipos cabem mais
do que um `double` aguenta. O efeito colateral era o mesmo endpoint responder
`"tempo": 96.2` em memória e `"tempo": "96.20"` no Postgres. O adaptador
normaliza os campos numéricos antes de devolver, para que trocar de banco não
mude o formato da resposta.

### Duas fontes do esquema, e por quê

O DDL existe em dois lugares e os dois precisam continuar iguais:

| arquivo | quando roda | forma |
|---|---|---|
| `backend/db/schema.sql` | à mão, uma vez | começa com `DROP TABLE` — **apaga tudo** |
| `iniciar()` em `db/index.js` | toda subida da API | `CREATE TABLE IF NOT EXISTS`, idempotente |

São dois porque o `schema.sql` é destrutivo e não pode rodar sozinho quando a
API sobe. Já divergiram uma vez: faltavam no código os `CHECK` de `erros` e
`combo_max` e o índice `idx_partida_jogador` — que é exatamente o que o
`DISTINCT ON (jogador_id)` do ranking percorre. **Mexeu num, confira o outro.**

O `iniciar()` traz também dois `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` para
`musica` e `nivel`. Num banco que já existe, o `CREATE TABLE IF NOT EXISTS`
não toca na tabela — ela ficaria sem as colunas novas e **todo INSERT
falharia**. Os `ALTER` são idempotentes e valem para o banco novo e para o
antigo. Para aplicar à mão, os mesmos comandos estão comentados no
`schema.sql`.

O índice novo é `idx_partida_recorde (musica, nivel, pontos DESC)`: o recorde
é consultado ao fim de **toda** partida concluída, sempre pela mesma tripla.

### O pool, e por que ele derrubava a API

Quatro decisões em `db/index.js` que só fazem sentido em serverless:

| ajuste | motivo |
|---|---|
| `max: 4` | cada instância de função no Vercel abre o **próprio** pool. Um `max` generoso multiplica por instância e esgota o teto do plano free |
| `idleTimeoutMillis: 10s` | segurar socket ocioso atrás de um pooler é pedir para ele ser descartado do outro lado |
| `connectionTimeoutMillis: 10s` | o padrão é esperar **para sempre**: um host errado penduraria a requisição em vez de falhar com mensagem |
| `pool.on('error', ...)` | **este derrubava a API.** Quando uma conexão ociosa cai, o `pg` emite um evento de erro no pool; sem ouvinte, o Node trata como exceção não capturada e mata o processo inteiro. O sintoma era o primeiro POST depois de um tempo parada falhar |

---

## Provisionando um Postgres

A equipe usa **Supabase**. Alternativas equivalentes, caso alguém precise
recriar o ambiente: [Neon](https://neon.tech), ou um Postgres local
(`postgres://postgres:senha@localhost:5432/drum`, que dispensa SSL).

Em qualquer um dos casos:

```bash
# 1. cole a string em backend/.env
DATABASE_URL=postgres://usuario:senha@host:5432/banco?sslmode=require

# 2. aplique o esquema
psql "$DATABASE_URL" -f backend/db/schema.sql

# 3. confira
curl http://localhost:3000/api/saude    # deve responder "banco":"postgres"
```

> O `.env` **não** vai para o Git. Nunca comitem a string de conexão: ela
> contém a senha do banco (RNF04).

### No Vercel

A variável vai em *projeto → Settings → Environment Variables* — o item fica
**dentro** do projeto, não na barra lateral da conta; o que aparece no nível
da conta são as *shared environment variables*, que não alcançam um projeto
de outra conta.

Como foi cadastrada:

| campo | valor |
|---|---|
| Key | `DATABASE_URL` |
| Type | **Secret** (o antigo *Sensitive*): o valor fica ilegível depois de salvo |
| Environments | **Production e Preview** |

Development ficou de fora porque **Secret não aceita esse ambiente** — o
botão trava se ele estiver marcado. Não custa nada: Development só é lido
pelo `vercel dev` da CLI, e o desenvolvimento local aqui é `npm run dev:api`,
que lê o `backend/.env` do disco.

**A ordem importa.** Variável de ambiente só entra em deploy **novo**. Se ela
for salva depois do deploy, é preciso *Redeploy* com *"Use existing Build
Cache"* desmarcado — o deploy antigo continua servindo sem ela, e o sintoma é
`/api/saude` responder `"banco":"memoria"` sem erro nenhum.

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

**O que o pooler de transação cobra em troca:** cada consulta pode cair numa
conexão diferente, então nada que dependa de *estado de sessão* sobrevive —
`SET`, tabelas temporárias, `LISTEN/NOTIFY` e *prepared statements* nomeados.
O código atual não usa nada disso (`pool.query` com parâmetros posicionais é
seguro aqui), mas quem for acrescentar precisa saber.

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
