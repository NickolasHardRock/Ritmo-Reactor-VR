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
| Alavanca direita ↑↓ | ajustar a altura da bateria |
| Vibração (saída) | retorno tátil proporcional à força da batida |

Não usamos gatilho nem botões: bater é um gesto, não um comando. Era esse o
ponto do projeto.

## Interface dentro do VR

Nenhum `<div>` aparece dentro do headset. Toda informação visível em VR é um
**objeto 3D**: texto desenhado num `<canvas>` e usado como textura
(`frontend/src/cena.js` → `placa()`).

- Painel esquerdo: carga do reator, pontos e combo
- Painel direito: o objetivo do momento
- Aviso volante: segue o olhar quando algo precisa ser dito na hora

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
- **Alternar o olhar** entre a pista de notas (acima) e a bateria (abaixo)
  cansa em sessões longas.
- **Sem modo canhoto:** o kit é destro.
- **Custo por quadro alto:** cerca de 280 mil triângulos, que dobram em VR
  porque cada olho é um desenho.

## Dispositivos usados nos testes

| Dispositivo | Navegador | Resultado |
|---|---|---|
| Meta Quest 3 | Meta Quest Browser | _preencher_ |
| Desktop | Chrome + extensão WebXR API Emulator | funcional |
| Desktop | Chrome sem headset | modo teclado, aviso correto |
