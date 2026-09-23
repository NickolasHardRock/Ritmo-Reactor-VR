# API — documentação dos endpoints (RF12)

Base em produção: `https://ritmo-reactor-vr.vercel.app/api`
Base em desenvolvimento: `http://localhost:3000/api`

Todas as respostas são JSON. Erros seguem o formato
`{ "erro": "descrição", "detalhes": [...] }` — `detalhes` só aparece em
validação.

**Todo campo numérico é devolvido como número**, nunca como string. Isso não
é automático: o driver do PostgreSQL entrega `NUMERIC` e `BIGINT` como string
(decisão correta dele — esses tipos cabem mais do que um `double` aguenta), o
que fazia o mesmo endpoint responder `"tempo": 96.2` rodando em memória e
`"tempo": "96.20"` rodando no Postgres. O adaptador normaliza antes de
devolver, para o contrato ser um só.

---

## `GET /api/saude`

Sonda de saúde. Serve para conferir se o deploy subiu e **qual banco está em
uso**, sem precisar abrir o jogo.

**200**
```json
{ "ok": true, "banco": "postgres", "partidas": 42 }
```

`banco` é `"memoria"` quando `DATABASE_URL` não está configurada — o que em
produção significa que a variável de ambiente não chegou naquele deploy.

---

## `POST /api/partidas`

Registra o resultado de uma partida **concluída**. RN07: o jogo só chama isto
depois do fim; nunca durante.

**Corpo**

| Campo | Tipo | Obrigatório | Faixa |
|---|---|---|---|
| `nome` | string | sim | 1 a 60 caracteres (espaços das pontas são removidos) |
| `musica` | string | não | chave da carta, `[a-z0-9_-]` até 60 (padrão `desconhecida`) |
| `nivel` | string | não | chave de dificuldade, `[a-z0-9_-]` até 20 (padrão `facil`) |
| `pontos` | número | sim | 0 a 1.000.000 |
| `tempo` | número | sim | 0 a 86.400 (segundos) |
| `precisao` | número | sim | 0 a 100 (%) |
| `erros` | número | não | 0 a 100.000 (padrão 0) |
| `comboMax` | número | não | 0 a 100.000 (padrão 0) |
| `estrelas` | número | sim | 0 a 5 — derivadas da precisão (ver `frontend/src/pontuacao.js`) |

Repare que o corpo usa `comboMax` (camelCase) mas as respostas devolvem
`combo_max`: o corpo segue a convenção do JavaScript e a resposta reflete a
coluna do banco.

`musica` é o nome do arquivo da carta sem `.json` (`colour-me-red`), e
`nivel` é a chave de `NIVEIS` no `config.js`. Os dois têm padrão para um
cliente antigo — ou o `curl` de quem está conferindo a API — continuar
gravando.

```bash
curl -X POST http://localhost:3000/api/partidas \
  -H 'Content-Type: application/json' \
  -d '{"nome":"Diego","musica":"colour-me-red","nivel":"facil",
       "pontos":7400,"tempo":96.2,"precisao":88,
       "erros":4,"comboMax":17,"estrelas":4}'
```

**201 — criada.** A resposta é um resumo, não a linha inteira:
```json
{ "id": 1, "nome": "Diego", "musica": "colour-me-red", "nivel": "facil",
  "pontos": 7400, "tempo": 96.2, "estrelas": 4,
  "recorde": true, "recordeAnterior": null,
  "criado": "2026-09-01T23:16:02.194Z" }
```

**`recorde` é decidido pelo SERVIDOR**, nunca pelo corpo enviado: o jogo roda
na máquina do jogador e um campo vindo dali seria só uma sugestão. A consulta
acontece **antes** do INSERT — depois, a própria partida já seria a marca a
bater e nada nunca seria recorde. Ver `backend/regras.js` (RN09).

**400 — dados inválidos.** Todos os problemas de uma vez, não o primeiro:
```json
{ "erro": "dados inválidos",
  "detalhes": ["nome é obrigatório", "estrelas fora do intervalo 0..5"] }
```

O mesmo nome sempre cai no **mesmo jogador**: o servidor procura antes de
criar (`acharOuCriarJogador`), e `jogador.nome` é `UNIQUE`. Duas pessoas com
o mesmo nome viram o mesmo jogador — limitação aceita, já que o trabalho não
tem login.

> O jogo roda no navegador do jogador: qualquer um pode forjar este POST.
> Por isso a validação é explícita no servidor, e não confia no cliente.

---

## `GET /api/partidas/:id`

Consulta uma partida específica.

**200**
```json
{ "id": 1, "jogador_id": 1, "musica": "colour-me-red", "nivel": "facil",
  "pontos": 7400, "tempo": 96.2, "precisao": 88,
  "erros": 4, "combo_max": 17, "estrelas": 4,
  "criado": "2026-09-01T23:16:02.194Z" }
```

Não traz `nome`: o nome mora na tabela `jogador`, e esta rota devolve a linha
de `partida`. Quem quer nome usa o ranking.

**400** id inválido (não inteiro, ou menor que 1) · **404** partida não encontrada

---

## `GET /api/ranking`

Classificação. RN08 — o critério da equipe é: **a melhor partida de cada
jogador**, ordenada por pontos e, em caso de empate, pelo menor tempo.

Assim quem jogou vinte vezes não ocupa o pódio inteiro. No PostgreSQL isso é
um `DISTINCT ON (jogador_id)`, que resolve "a melhor de cada" sem subconsulta
correlacionada.

**Parâmetros**

| Nome | Padrão | Máximo |
|---|---|---|
| `limite` | 10 | 100 |
| `musica` | sem filtro | — |
| `nivel` | sem filtro | — |

`limite` inválido (texto, zero, negativo) **não dá 400**: volta para 10.
Acima de 100 é cortado em 100 — ninguém baixa a tabela inteira numa requisição.
`musica` e `nivel` fora do alfabeto aceito são **ignorados** em vez de virarem
erro: filtro é conveniência, e uma lista sem filtro é uma resposta válida.

```bash
curl "http://localhost:3000/api/ranking?limite=5&nivel=profissa"
```

**200**
```json
{
  "criterio": "melhor partida por jogador, por pontos e depois menor tempo",
  "filtro": { "musica": null, "nivel": "profissa" },
  "total": 3,
  "itens": [
    { "posicao": 1, "nome": "Bruno", "musica": "colour-me-red-cheio",
      "nivel": "profissa", "pontos": 8100, "tempo": 94.75,
      "precisao": 92, "combo_max": 21, "estrelas": 4,
      "criado": "2026-09-01T23:16:02.194Z" }
  ]
}
```

`total` é o número de **partidas registradas**, não o de linhas devolvidas —
por isso ele pode ser maior que o tamanho de `itens`.

---

## `GET /api/ranking/melhores`

**O melhor jogador de cada dificuldade** numa música (RN08). É o que a tela
inicial mostra, e é a leitura que o jogo faz do ranking.

Uma lista só, misturando os níveis, mediria qual nível rende mais ponto e não
quem toca melhor: pontos crescem com o tamanho da carta e com o multiplicador,
e o Fácil tem uma peça com janela 1,8× contra as sete peças com janela 0,8× do
Profissa.

| Nome | Padrão |
|---|---|
| `musica` | sem filtro (todas as músicas misturadas) |

```bash
curl "http://localhost:3000/api/ranking/melhores?musica=colour-me-red"
```

**200**
```json
{
  "criterio": "melhor partida de cada dificuldade, por pontos e depois menor tempo",
  "musica": "colour-me-red",
  "itens": [
    { "nivel": "facil",  "nome": "Diego", "musica": "colour-me-red",
      "pontos": 7400, "tempo": 96.20, "precisao": 88, "estrelas": 4,
      "criado": "2026-09-01T23:16:02.194Z" },
    { "nivel": "normal", "nome": "Nick",  "musica": "colour-me-red",
      "pontos": 5200, "tempo": 91.40, "precisao": 71, "estrelas": 3,
      "criado": "2026-09-01T23:20:41.002Z" }
  ]
}
```

Só aparecem as dificuldades que **alguém já jogou**. A ordem vem do banco
(alfabética por `nivel`); quem exibe ordena pela ordem de `NIVEIS`.

---

## `GET /api/ranking/recorde`

A **marca a bater** numa música e dificuldade. O jogo consulta no fim de toda
partida concluída para decidir se pede o nome de quem jogou (RN09).

| Nome | Obrigatório |
|---|---|
| `musica` | sim |
| `nivel` | sim |

```bash
curl "http://localhost:3000/api/ranking/recorde?musica=colour-me-red&nivel=facil"
```

**200**
```json
{ "musica": "colour-me-red", "nivel": "facil",
  "recorde": { "nome": "Diego", "pontos": 7400, "tempo": 96.2,
               "criado": "2026-09-01T23:16:02.194Z" },
  "minimo": 1000 }
```

`"recorde": null` quer dizer **ainda não há registro nenhum ali** — e é
diferente de zero ponto: a primeira partida da tabela também é recorde, desde
que alcance `minimo`.

`minimo` é o piso de pontos da RN09, e viaja na resposta de propósito: é regra
de negócio, e uma cópia dela dentro do jogo seria uma cópia a divergir — além
de morar no navegador, onde qualquer um edita. **O jogo não mostra esse número
ao jogador**: é critério nosso, não meta dele.

**400** sem `musica` ou sem `nivel`.

---

## Configuração

| Variável | Onde | Efeito |
|---|---|---|
| `DATABASE_URL` | Vercel e `backend/.env` | ausente → adaptador em memória; presente → PostgreSQL. Use a string do **pooler de transação** (ver [banco.md](banco.md)) |
| `CORS_ORIGENS` | opcional | lista separada por vírgula. Padrão `http://localhost:5173`; `*` libera todas |
| `PORT` | opcional | porta do `npm run dev:api`; padrão 3000 |

Em produção o front e a API dividem o domínio (o `vercel.json` reescreve
`/api/*`), então **o CORS não entra em jogo**. Ele existe para o
desenvolvimento, em que o Vite serve o front em `:5173` e a API responde em
`:3000`.

O corpo das requisições é limitado a **16 kb** (RNF04). Nada legítimo chega
perto disso; o limite existe para um POST gigante não virar consumo de
memória.

---

## Códigos HTTP usados

| Código | Quando | Corpo |
|---|---|---|
| 200 | consulta bem-sucedida | o recurso |
| 201 | partida criada | resumo da partida |
| 400 | corpo ou parâmetro inválido | `{ erro, detalhes? }` |
| 400 | `/ranking/recorde` sem `musica` ou `nivel` | `{ erro }` |
| 404 | partida inexistente | `{ erro }` |
| 404 | rota inexistente | `{ erro, caminho }` |
| 413 | corpo acima de 16 kb | do Express |
| 500 | erro interno | `{ erro: "erro interno" }` — **nunca** *stack trace* (RNF04) |
