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
| `pontos` | número | sim | 0 a 1.000.000 |
| `tempo` | número | sim | 0 a 86.400 (segundos) |
| `precisao` | número | sim | 0 a 100 (%) |
| `erros` | número | não | 0 a 100.000 (padrão 0) |
| `comboMax` | número | não | 0 a 100.000 (padrão 0) |
| `estrelas` | número | sim | 0 a 5 — derivadas da precisão (ver `frontend/src/pontuacao.js`) |

Repare que o corpo usa `comboMax` (camelCase) mas as respostas devolvem
`combo_max`: o corpo segue a convenção do JavaScript e a resposta reflete a
coluna do banco.

```bash
curl -X POST http://localhost:3000/api/partidas \
  -H 'Content-Type: application/json' \
  -d '{"nome":"Diego","pontos":740,"tempo":96.2,"precisao":88,
       "erros":4,"comboMax":17,"estrelas":4}'
```

**201 — criada.** A resposta é um resumo, não a linha inteira:
```json
{ "id": 1, "nome": "Diego", "pontos": 740, "tempo": 96.2,
  "estrelas": 4, "criado": "2026-09-01T23:16:02.194Z" }
```

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
{ "id": 1, "jogador_id": 1, "pontos": 740, "tempo": 96.2, "precisao": 88,
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

`limite` inválido (texto, zero, negativo) **não dá 400**: volta para 10.
Acima de 100 é cortado em 100 — ninguém baixa a tabela inteira numa requisição.

```bash
curl "http://localhost:3000/api/ranking?limite=5"
```

**200**
```json
{
  "criterio": "melhor partida por jogador, por pontos e depois menor tempo",
  "total": 3,
  "itens": [
    { "posicao": 1, "nome": "Bruno", "pontos": 810, "tempo": 94.75,
      "precisao": 92, "combo_max": 21, "estrelas": 4,
      "criado": "2026-09-01T23:16:02.194Z" }
  ]
}
```

`total` é o número de **partidas registradas**, não o de linhas devolvidas —
por isso ele pode ser maior que o tamanho de `itens`.

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
| 404 | partida inexistente | `{ erro }` |
| 404 | rota inexistente | `{ erro, caminho }` |
| 413 | corpo acima de 16 kb | do Express |
| 500 | erro interno | `{ erro: "erro interno" }` — **nunca** *stack trace* (RNF04) |
