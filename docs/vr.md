# Documentação de VR (item 17.6)

## Como entrar no modo VR

1. Abra a URL do jogo no **Meta Quest Browser** (o navegador do headset).
2. Se o dispositivo suportar, a tarja na tela inicial fica verde:
   *"VR disponível — as baquetas são seus controles"*.
3. Toque no botão **ENTER VR** e autorize, se for pedido.
4. Para sair, use o gesto/botão do sistema; o jogo volta ao modo navegador
   sozinho.

**Não é preciso conta de desenvolvedor da Meta.** O jogo é uma página web.

## Como funciona a detecção de suporte (RF14/RF15)

```js
const ok = await navigator.xr.isSessionSupported('immersive-vr');
```

O botão de VR **só é criado se essa checagem responder `true`**. Sem suporte,
o jogo mostra o motivo e segue jogável no teclado (RN10). Código em
`frontend/src/main.js`.

WebXR exige *secure context*: **HTTPS ou localhost**. Abrir o arquivo com
duplo clique (`file://`) nunca ativa o VR.

## Como funciona a interação

Os controles viram **baquetas**: um cilindro com uma esfera na ponta,
presos ao grupo do jogador.

O que o jogo mede é a posição da **ponta** a cada quadro — e a posição dela
no quadro **anterior**. Se o segmento entre as duas cruzou o plano de uma
pele, de cima para baixo, dentro do raio, é batida.

A **velocidade de descida vira a força**: modula o volume do som e a
intensidade da vibração. Bater de leve soa diferente de bater forte.

### Por que não bastava testar "a ponta está encostando agora?"

A 72 Hz, uma baqueta a 5 m/s percorre **6,9 cm entre dois quadros**. A pele
tem cerca de 1 cm. A checagem pontual perde quase toda batida — e justamente
as fortes. Medição em [testes.md](testes.md), CT-02.

## Controles utilizados

| Entrada | Ação |
|---|---|
| Movimento do controle | mover a baqueta |
| Alavanca direita ↑↓ | ajustar a altura da bateria ao corpo |
| Botão **A** (direito) | pular o tutorial e ir direto para a música |
| Botão **X** (esquerdo) | abrir a calibragem de atraso |
| Vibração (saída) | retorno tátil proporcional à força da batida |

**Bater não usa botão nenhum** — é gesto, e era esse o ponto do projeto. O
gatilho e o *grip* seguem livres de propósito.

Os dois botões existem porque tirar o headset para clicar na tela quebra a
sessão. **A** salta o tutorial de sete peças, que é útil na primeira vez e
cansativo da segunda em diante; ele só age nas fases 0 e 1, porque durante a
música reiniciaria a faixa na cara de quem está tocando. **X** abre a
calibragem, que é justamente o ajuste mais necessário no headset (veja
abaixo). Ambos têm anti-repique de ~0,7 s: um botão de VR lido a cada quadro
dispara dezenas de vezes num toque.

Índice 4 no perfil `xr-standard` do Touch é o X/A. Nenhum botão era lido
antes, então não há conflito com nada.

## Interface dentro do VR

Nenhum `<div>` aparece dentro do headset. Toda informação visível em VR é um
**objeto 3D**: texto desenhado num `<canvas>` e usado como textura
(`frontend/src/cena.js` → `placa()`).

- Painel esquerdo: pontos, combo e multiplicador
- Painel direito: o objetivo do momento
- Painel central: **resultado da partida** e **calibragem**, que antes só
  existiam em HTML e eram invisíveis para quem estava de headset
- Aviso volante: segue o olhar quando algo precisa ser dito na hora

As placas se ajustam sozinhas ao texto: cada linha encolhe até 55% e só
depois é cortada com reticências. Sem isso a linha de crédito da faixa saía
com 152% da largura do painel, escorrendo para fora da placa.

### A indicação de nota fica sobre a peça, não numa pista

A versão anterior tinha uma pista de notas acima da bateria. No monitor dá
para acompanhar as duas com o canto do olho; **em VR não**, porque virar o
olho custa virar a cabeça. A indicação passou a descer sobre o próprio
tambor (`bichos.js`), e o caminho é inclinado de propósito — descer reto
colocaria o nascimento acima da linha dos olhos de quem joga em pé, o que
recriaria o problema que a mudança resolve.

São desenhados com `InstancedMesh`: oito na tela custam **um** draw call em
vez de oito.

### O prato balança quando é atingido

Os três pratos são nodes próprios, recortados do scan, girados por um
oscilador amortecido (`balanco.js`). Em VR isso importa mais que no monitor:
sem retorno tátil de verdade, o movimento do prato é boa parte da confirmação
de que a batida valeu.

## Ajustes de qualidade

Em `frontend/src/config.js`, objeto `QUALIDADE`:

| Parâmetro | Padrão | Efeito |
|---|---|---|
| `escalaVR` | 1.2 | resolução do render no headset; o ganho de nitidez mais barato que existe |
| `foveacao` | 0.3 | 0 = bordas nítidas; 1 = mais rápido |
| `anisotropia` | 8 | nitidez em superfícies vistas de canto; não gasta VRAM |

Se o Quest engasgar, baixe `escalaVR` para 1.0 ou 0.9 antes de mexer em
qualquer outra coisa.

## Limitações encontradas

- **O bumbo não é tocável.** O Quest 3 rastreia mãos e controles, não pés.
  Não há como pedalar. Ele ficou decorativo.
- **Não dá para "afogar" o prato** (segurar depois de bater): exigiria
  rastrear contato contínuo, e o modelo atual só detecta o cruzamento.
- **Tom 1 e Tom 2 têm zonas que se sobrepõem** em cerca de 4 cm. Resolvido
  escolhendo a peça cruzada primeiro no trajeto, mas uma batida bem na
  fronteira é ambígua.
- **Sem modo canhoto:** o kit é destro.
- **Custo por quadro alto:** cerca de 400 mil triângulos por olho, que dobram
  em VR porque cada olho é um desenho — 800 mil por quadro. A bateria sozinha
  responde por 213 mil deles, e as texturas dela ainda são JPEG 2048², 64 MB
  de VRAM. É o primeiro lugar onde mexer se o Quest engasgar.

### Uma limitação que foi resolvida

Ficava aqui: *"alternar o olhar entre a pista de notas (acima) e a bateria
(abaixo) cansa em sessões longas"*. Foi o motivo da troca da pista pelos
indicadores sobre as peças. Fica registrado porque a limitação anotada é que
gerou a solução.

## Atraso de áudio no headset

É o ponto que mais afeta a sensação de jogo em VR, e o Quest é o pior caso da
cadeia: **passa fácil de 100 ms** entre agendar um som e ele sair — mais
ainda com fone Bluetooth.

O jogador reage ao que **ouve**, então sem compensar o jogo acusa
adiantamento em quem está batendo certo. Dois motivos para calibrar dentro
do headset, e não antes de colocá-lo:

1. o `ctx.outputLatency` que o navegador declara costuma ser bem menor que o
   real, então o palpite automático não basta;
2. a latência do headset não é a mesma do desktop — calibrar no monitor e
   entrar em VR mede a cadeia errada.

Daí o botão **X**. A medida fica salva em `localStorage` e o ajuste fino de
±10 ms continua disponível na tela inicial. Detalhes da conta em
[tecnica.md](tecnica.md).

## Dispositivos usados nos testes

| Dispositivo | Navegador | Resultado |
|---|---|---|
| Meta Quest 3 | Meta Quest Browser | _preencher_ |
| Desktop | Chrome + extensão WebXR API Emulator | funcional |
| Desktop | Chrome sem headset | modo teclado, aviso correto |
