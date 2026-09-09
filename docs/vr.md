# Documentação de VR (item 17.6)

## Como entrar no modo VR

1. Abra a URL do jogo no **Meta Quest Browser** (o navegador do headset).
2. Se o dispositivo suportar, a tarja na tela inicial fica verde:
   *"VR disponível"*.
3. Toque no botão **ENTER VR** e autorize, se for pedido.
4. Você cai no **menu**, em 3D, à sua frente — não no meio de uma partida.
   Aponte um controle e aperte o gatilho para escolher.
5. Para sair, use o gesto/botão do sistema; o jogo volta ao modo navegador
   sozinho.

Quem já estava jogando no monitor e coloca o headset no meio da partida
continua de onde estava: aí a partida existe, e interrompê-la para mostrar um
menu seria o defeito ao contrário.

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

### A baqueta pende da mão, não da mira

O WebXR entrega **duas** poses por controle, e a diferença entre elas é o que
fazia a baqueta parecer reta demais:

| Espaço | O que é | Onde é usado |
|---|---|---|
| `targetRaySpace` (`getController`) | para onde o controle **aponta** | o ponteiro dos botões 3D, e os eventos do gatilho |
| `gripSpace` (`getControllerGrip`) | como a **mão** segura um objeto | a baqueta |

A especificação define o −Z do `gripSpace` como *a direção de uma vareta reta
segurada na mão*. É literalmente a definição de baqueta. Até 09/09 a haste
pendurava na **mira**, que é outra coisa — daí ela sair alinhada com o
ponteiro em vez de com o punho.

Por cima disso vêm dois ângulos de gosto, no `BAQUETA` do `config.js`: a
**inclinação** (a ponta cai um pouco abaixo do eixo da mão, 12° por padrão) e
a **convergência** (as pontas se aproximam, 8°). Nenhum dos dois vem de
cálculo, então os dois estão na URL e se ajustam de dentro do headset:

```
?baq=18     inclina 18° em vez de 12
?conv=0     baquetas paralelas
?punho=0    volta a pendurar a haste na mira (saída de emergência)
```

`?punho=0` existe porque, se algum controle expuser o `gripSpace` com outra
orientação, a baqueta apontaria para um lugar estranho e o jogo ficaria
injogável até alguém editar arquivo. Controles sem `gripSpace` — mão
rastreada, por exemplo — caem sozinhos nesse caminho, somando a
`compensacaoDoRaio`, porque a mira já nasce mais inclinada que a mão.

**Mexer nesses ângulos mexe no jogo, não só no visual:** quem o jogo mede é a
ponta, e girar a haste move a ponta.

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
| **Gatilho** | acionar o botão 3D para o qual o controle aponta |
| Alavanca direita ↑↓ | ajustar a altura da bateria em relação a você |
| Alavanca esquerda ↑↓ | aproximar ou afastar você da bateria |
| Botão **A** (direito) | atalho: pular o tutorial (o mesmo do botão 3D) |
| Botão **X** (esquerdo) | atalho: abrir a calibragem de atraso |
| Vibração (saída) | retorno tátil da batida e do foco nos botões |

**Bater não usa botão nenhum** — é gesto, e era esse o ponto do projeto. O
*grip* segue livre.

O **gatilho** só serve para os botões 3D, e só quando o controle está
apontando para um: apertá-lo no meio da música, sem mirar, não faz nada. Não
há conflito com a batida, porque batida é movimento.

**A** e **X** deixaram de ser a única porta e viraram atalhos. Continuam
valendo para quem já os conhece, com o mesmo anti-repique de ~0,7 s — um botão
de VR lido a cada quadro dispara dezenas de vezes num toque. Índice 4 no perfil
`xr-standard` do Touch é o X/A; índice 5 é o B/Y, que abre o resumo de
desempenho quando o jogo roda com `?perf=1`.

## Interface dentro do VR

Nenhum `<div>` aparece dentro do headset. Toda informação visível em VR é um
**objeto 3D**: texto desenhado num `<canvas>` e usado como textura
(`frontend/src/cena.js` → `placa()`).

- Painel esquerdo: pontos, combo e multiplicador
- Painel direito: o objetivo do momento
- Painel central: **resultado da partida** e **calibragem**, que antes só
  existiam em HTML e eram invisíveis para quem estava de headset
- Aviso volante: segue o olhar quando algo precisa ser dito na hora

### Os botões (`menu3d.js`)

Até 08/09 as placas só serviam para LER. Tudo que exigia uma decisão do
jogador — começar, escolher o nível, pular o tutorial, voltar ao menu — ou
acontecia antes de entrar no VR, no HTML, ou virava botão de controle. O teste
no Quest mostrou o preço: entrar em VR jogava direto no meio de uma partida
não escolhida, e terminar a música deixava o jogador preso no placar.

São quatro conjuntos, e nunca dois ao mesmo tempo:

| Quando | Botões |
|---|---|
| antes da partida | JOGAR · Modo livre · Fácil/Normal/Profissa · Calibrar atraso |
| durante a partida | **Pular ›** (fases 0 e 1) e **Sair**, à direita |
| durante a calibragem | Fechar |
| no fim | Jogar de novo · Menu |

Pular e Sair ficam **à direita**, na altura dos painéis: o centro é por onde a
baqueta desce, e um botão no caminho da mão seria acertado sem querer.

**Por que o gatilho e não a baqueta.** Bater no botão seria mais coerente com
o jogo, e é exatamente o problema: a detecção de batida reconhece qualquer
trajeto de cima para baixo dentro do raio, e quem toca bateria move as mãos o
tempo todo. Botão de menu não pode ter falso positivo.

O ponteiro não fica sempre ligado. Com o menu ou o placar abertos ele aparece
sempre — é a hora de apontar. Durante a partida ele só acende quando o
controle encontra um botão, para não atravessar a bateria a cada braçada.

### A lista de níveis não está escrita duas vezes

O menu 3D monta um botão por chave de `NIVEIS`, como o HTML faz pelos ids
`btn-nivel-<chave>`. É o mesmo contrato de `claude/nivel-profissa.md`: nível
novo aparece nos dois lugares sem ninguém lembrar de copiar.

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

## A altura: quem sobe e desce é o jogador

A alavanca direita ajusta a bateria à altura de quem joga. Até 08/09 ela movia
mesmo a **bateria** (`kit.position.y`), e isso tinha um defeito que só aparece
no headset: a bateria pousa direto na pedra do cenário, sem estrado, então
descê-la a **enterra no chão** — e descer é justamente o que uma pessoa alta
precisa fazer.

Agora quem se move é o **jogador** (`cena.js` → `ajustarVisao`): o grupo
`player` sobe ou desce, o kit fica onde o cenário o apoia. Do ponto de vista
de quem joga é a mesma coisa; a diferença é que nada afunda na rocha.

O sinal do controle não mudou — para cima ainda é "bateria mais alta". E há um
ganho de brinde: `deteccao.js` soma `kit.position.y` em toda batida, e esse
valor deixou de mudar no meio da partida.

Dentro do VR mexer na **câmera** é proibido (a posição dela é do headset;
mexer nela dá náusea), e por isso quem se move é o grupo. No monitor, quem
manda na câmera é o `OrbitControls`, e ali o deslocamento vai na câmera **e no
alvo** juntos — senão o controle desfaz no quadro seguinte, ou gira o ângulo
que o jogador tinha escolhido.

O curso é de ±45 cm.

## A distância: o posto encostou no bumbo

O baterista ficava a 62 cm do centro do kit, e de lá o **ride** só era
alcançado esticando o braço. Medido no modelo real, o quanto o ombro precisa
avançar para cada peça (já descontada a baqueta de 38 cm):

| peça | a 62 cm | a 50 cm |
|---|---|---|
| **ride** | **0,54 m** | **0,45 m** |
| crash | 0,48 | 0,37 |
| chimbal | 0,44 | 0,36 |
| tom 1 e 2 | 0,40 | 0,30 |
| surdo | 0,28 | 0,21 |
| caixa | 0,24 | 0,17 |

Braço de adulto chega a uns 0,62 m com o ombro parado: 0,54 é esticar de
verdade, 0,45 é confortável. O posto passou para **0,50 m**.

**Não é arredondamento, é o limite.** A malha do kit, na faixa de 30 cm à
frente do corpo, avança até z = 0,445 (o bumbo, abaixo de 40 cm de altura) e
z = 0,398 na altura do peito. Abaixo de 0,50 o jogador começa a ficar *dentro*
da bateria — invisível de cabeça erguida, constrangedor ao olhar para baixo.

Por isso o ajuste da alavanca esquerda tem curso **assimétrico**: 3 cm para a
frente e 30 cm para trás. O padrão já é o mais perto que dá; quem quiser
espaço é que tem para onde ir. No navegador este ajuste não existe — lá a
distância é o zoom do OrbitControls, que a roda do mouse já faz melhor.

Mexer no posto move o cenário junto: `encaixarCenario` posiciona a paisagem a
partir dele, para o jogador continuar em cima da mesma pedra.

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

Daí o **Calibrar atraso** no menu 3D — e o botão **X**, que continua como
atalho para começar a medição sem passar pelo menu. A medida fica salva em
`localStorage` e o ajuste fino de ±10 ms continua disponível na tela inicial.
Detalhes da conta em [tecnica.md](tecnica.md).

## Dispositivos usados nos testes

| Dispositivo | Navegador | Resultado |
|---|---|---|
| Meta Quest 3 | Meta Quest Browser | _preencher_ |
| Desktop | Chrome + extensão WebXR API Emulator | funcional |
| Desktop | Chrome sem headset | modo teclado, aviso correto |
