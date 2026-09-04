# API — documentação dos endpoints (RF12)

Base em produção: `https://ritmo-reactor-vr.vercel.app/api`
Base em desenvolvimento: `http://localhost:3000/api`

Todas as respostas são JSON. Erros seguem o formato
`{ "erro": "descrição", "detalhes": [...] }` — `detalhes` só aparece em
validação.

---

## `GET /api/saude`

Sonda de saúde. Serve para conferir se o deploy subiu e **qual banco está em
uso**, sem precisar abrir o jogo.

**200**
```json
{ "ok": true, "banco": "postgres", "partidas": 42 }
```

`banco` é `"memoria"` quando `DATABASE_URL` não está configurada.

---

## `POST /api/partidas`

Registra o resultado de uma partida **concluída**. RN07: o jogo só chama isto
depois do fim; nunca durante.

**Corpo**

| Campo | Tipo | Obrigatório | Faixa |
|---|---|---|---|
| `nome` | string | sim | 1 a 60 caracteres |
| `pontos` | número | sim | 0 a 1.000.000 |
| `tempo` | número | sim | 0 a 86.400 (segundos) |
| `precisao` | número | sim | 0 a 100 (%) |
| `erros` | número | não | 0 a 100.000 (padrão 0) |
| `comboMax` | número | não | 0 a 100.000 (padrão 0) |
| `estrelas` | número | sim | 0 a 5 — derivadas da precisão (ver `frontend/src/pontuacao.js`) |

```bash
curl -X POST http://localhost:3000/api/partidas \
  -H 'Content-Type: application/json' \
  -d '{"nome":"Diego","pontos":740,"tempo":96.2,"precisao":88,
       "erros":4,"comboMax":17,"estrelas":4}'
```

**201 — criada**
```json
{ "id": 1, "nome": "Diego", "pontos": 740, "tempo": 96.2,
  "estrelas": 4, "criado": "2026-09-01T23:16:02.194Z" }
```

**400 — dados inválidos**
```json
{ "erro": "dados inválidos",
  "detalhes": ["nome é obrigatório", "estrelas fora do intervalo 0..5"] }
```

> O jogo roda no navegador do jogador: qualquer um pode forjar este POST.
> Por isso a validação é explícita no servidor, e não confia no cliente.

---

## `GET /api/partidas/:id`

Consulta uma partida específica.

**200**
```json
{ "id": 1, "jogador_id": 1, "pontos": 740, "tempo": 96.2, "precisao": 88,
  "erros": 4, "combo_max": 17, "estrelas": 4, "criado": "..." }
```

**400** id inválido · **404** partida não encontrada

---

## `GET /api/ranking`

Classificação. RN08 — o critério da equipe é: **a melhor partida de cada
jogador**, ordenada por pontos e, em caso de empate, pelo menor tempo.

Assim quem jogou vinte vezes não ocupa o pódio inteiro.

**Parâmetros**

| Nome | Padrão | Máximo |
|---|---|---|
| `limite` | 10 | 100 |

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
      "precisao": 92, "combo_max": 21, "estrelas": 5, "criado": "..." }
  ]
}
```

---

## Códigos HTTP usados

| Código | Quando |
|---|---|
| 200 | consulta bem-sucedida |
| 201 | partida criada |
| 400 | corpo ou parâmetro inválido |
| 404 | recurso ou rota inexistente |
| 500 | erro interno (a resposta nunca inclui *stack trace* — RNF04) |
