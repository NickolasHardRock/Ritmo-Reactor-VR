/* ============================================================================
   config.js — tudo que se ajusta sem entender o resto do código.
   Se você veio consertar posição, dificuldade ou endereço da API, é aqui.
   ========================================================================== */

/* --------------------------------------------------------- AS PEÇAS ------
   Medidas no próprio bateria.glb. Este modelo é um scan de fotogrametria —
   malha ÚNICA fundida, sem nomes de peça — então as posições NÃO puderam
   ser lidas da estrutura do arquivo. Foram obtidas pela GEOMETRIA: filtrando
   os triângulos cuja normal aponta para cima (é onde se bate) e agrupando-os
   por proximidade. Ver docs/tecnica.md.

   Valores já em METROS. Este modelo NÃO é girado (ver kit.js): ele já vem com
   o lado do baterista em +Z, que é onde o jogador fica. Por isso x e z aqui
   são os do próprio arquivo, sem inversão.

   Confere com um kit destro de verdade, visto de quem toca: chimbal na ponta
   esquerda, ride na direita, caixa à frente e um pouco à esquerda, surdo à
   direita. É essa a ordem das teclas A S D F J K L.

   O Y é medido a partir do PÉ do kit, e o pé é fixado por `APOIO_KIT` logo
   abaixo — não pelo bounding box. Isso é de propósito: enquanto o apoio saía
   do bbox, qualquer mexida na malha (cortar a base do scan, por exemplo)
   deslocava as sete alturas de uma vez, em silêncio.

   `r` é o raio da zona de acerto, 8% maior que a peça real: em VR o jogador
   não tem retorno tátil e precisa de margem. Se alguma peça ficar difícil de
   acertar no headset, é uma linha aqui.

   Ordem: da esquerda para a direita, casando com as teclas e com as faixas
   da pista de notas da fase 3.                                            */
export const PECAS = [
  { id:'chimbal', nome:'Chimbal', x:-0.719, y:0.721, z: 0.078, r:0.194, tecla:'KeyA', cor:0xc17dff, som:'chimbal' },
  { id:'crash',   nome:'Crash',   x:-0.486, y:0.916, z:-0.184, r:0.230, tecla:'KeyS', cor:0x66e0ff, som:'crash'   },
  { id:'caixa',   nome:'Caixa',   x:-0.375, y:0.575, z: 0.242, r:0.189, tecla:'KeyD', cor:0xffa64d, som:'caixa'   },
  { id:'tom2',    nome:'Tom 2',   x:-0.159, y:0.681, z:-0.081, r:0.157, tecla:'KeyF', cor:0x3ddc97, som:'tom2'    },
  { id:'tom1',    nome:'Tom 1',   x: 0.161, y:0.683, z:-0.080, r:0.162, tecla:'KeyJ', cor:0x4da3ff, som:'tom1'    },
  { id:'surdo',   nome:'Surdo',   x: 0.401, y:0.576, z: 0.184, r:0.189, tecla:'KeyK', cor:0xff5d6c, som:'surdo'   },
  { id:'ride',    nome:'Ride',    x: 0.676, y:0.799, z:-0.127, r:0.293, tecla:'KeyL', cor:0xffd34d, som:'ride'    },
];
export const PORID = Object.fromEntries(PECAS.map(p => [p.id, p]));

/* ------------------------------------------------------- O CENÁRIO -------
   `postoJogador` indica, em coordenadas do modelo e ANTES da rotação, onde
   o baterista fica; `alturaPiso` é o Y que vira o zero do jogo. Ver
   cena.js → encaixarCenario().

   O ARQUIVO SE CHAMAVA lab.glb E O CÓDIGO CHAMAVA TUDO DE "LABORATÓRIO",
   mas o modelo nunca foi um laboratório: é o cenário "World of Metal", uma
   paisagem industrial/rochosa, com alguns adereços acrescentados depois
   (amplificadores, uma laje, um cabo). O nome errado já custou tempo — foi
   preciso medir as duas caixas envolventes para descobrir que `lab.glb` e
   `world_of_metal_otimizado.glb` são o MESMO modelo. Daí `cenario.glb`,
   que diz o que a coisa é sem prometer o que ela não é, e continua
   valendo se o modelo for trocado um dia.

   A FONTE NÃO ESTÁ NO REPOSITÓRIO. `cenario.glb` foi gerado a partir de
   `world_of_metal_otimizado.glb`, que é grande demais e está no .gitignore.
   Quem precisar refazer pede o original para a equipe.                    */
export const CENARIO = {
  url:          'modelos/cenario.glb',
  escala:       1,              // modelo já em metros (~26 x 32 x 27 m)
  /* Ângulo em GRAUS. Estava 19.7 e era aplicado direto em `rotation.y`,
     que espera RADIANOS: 19,7 rad dão três voltas inteiras mais 48,7°.
     Funcionava porque foi ajustado no olho até ficar bom, mas lia como
     graus e não era. 48,73° é a mesma orientação, agora dita de verdade. */
  rotacaoGraus: 48.73,
  postoJogador: [ 2.8, 0.6 ],  // trecho rochoso central, entre os amplificadores
  alturaPiso:   2.0,            // Y do modelo que o jogo trata como chão
};
/* O modelo com os TRÊS PRATOS recortados em nodes próprios, para poderem
   balançar. `bateria.glb`, de onde este saiu, é uma malha fundida só —
   nenhuma peça dava para mover. Ver ferramentas/cortar-peca.mjs e
   src/balanco.js. Peça que este arquivo ainda não separou (os tambores)
   simplesmente não balança, e o jogo segue igual sem ela. */
export const URL_BATERIA = (() => {
  /* `?kit=uastc` e `?kit=etc1s` trocam o modelo por versões de teste com as
     texturas em KTX2, para comparar qualidade sem editar arquivo. São
     descartáveis: se a comparação não convencer, os dois .glb saem e esta
     função volta a ser uma linha. Nome desconhecido cai no padrão. */
  const VARIANTES = {
    uastc: 'modelos/bateria_uastc.glb',   // tudo em UASTC     13,6 MB · ~17,0 MB de VRAM
    misto: 'modelos/bateria_misto.glb',   // normal em UASTC    6,6 MB · ~10,7 MB de VRAM
    etc1s: 'modelos/bateria_etc1s.glb',   // tudo em ETC1S      3,2 MB ·  ~8,4 MB de VRAM
  };
  const p = new URLSearchParams(location.search).get('kit');
  return (p && VARIANTES[p]) || 'modelos/bateria_pratos.glb';
})();
/* O modelo JÁ VEM EM METROS: caixa de 35 cm (14"), chimbal de 36 cm (14") e
   ride de 54 cm (21") — medidas de bateria de verdade, conferidas em três
   referências independentes. Por isso escala 1.
   (A bateria anterior vinha em outra unidade e precisava de 0,591; aplicar
   aquele valor aqui encolhia o kit para 62 cm de altura.)                */
export const ESCALA_KIT = 1.0;

/* Onde ficam os PÉS do kit, em coordenadas do próprio arquivo (com o sinal
   trocado). O scan trazia um pedaço de chão digitalizado junto; ele foi
   cortado em y = −0,494, que é exatamente onde as sapatas dos suportes
   encostavam. Fixar o apoio aqui, em vez de deduzi-lo do bounding box,
   garante que as alturas das peças acima não se mexam sozinhas se a malha
   for otimizada de novo — o corte deixa franjas irregulares alguns
   centímetros abaixo, e o bbox obedeceria a elas.                         */
export const APOIO_KIT = 0.494;

/* Este kit é montado BAIXO: mesmo em tamanho real, as peles ficam entre 0,58
   e 0,80 m — desconfortável para quem joga EM PÉ. Sobre o estrado, as
   alturas ficam quase iguais às da versão já validada no headset.
   O jogador ainda ajusta ±45 cm a partir daqui (alavanca direita / [ ]).  */
export const ALTURA_INICIAL_KIT = 0.35;

/* ------------------------------------------------------- AS BAQUETAS -----
   COMO A BAQUETA FICA PRESA À MÃO.

   Até 09/09 a baqueta pendurava no `getController(i)`, que é o espaço do
   RAIO DE MIRA (`targetRaySpace`) — a direção para onde o controle APONTA,
   a mesma que desenha o ponteiro dos botões 3D. Só que ninguém segura uma
   baqueta alinhada com a mira: o WebXR tem um espaço separado justamente
   para isto, o `gripSpace`, definido como "a direção de uma vareta reta
   segurada na mão". É por isso que a baqueta saía reta demais na tela.

   Agora ela pendura no `getControllerGrip(i)`, e por cima disso ficam dois
   ângulos de gosto, que são o que um baterista de verdade faz com o pulso:

     inclinacao    a ponta cai um pouco abaixo do eixo da mão
     convergencia  as duas pontas se aproximam, apontando para o centro do kit

   ISTO É TRABALHO DE OLHO e nenhum número aqui vem de cálculo. Por isso os
   dois estão na URL — dá para ajustar de dentro do headset, sem editar
   arquivo e sem tirar o óculos:

     ?baq=18           inclina 18° em vez dos 12° padrão
     ?conv=0           baquetas paralelas
     ?punho=0          VOLTA AO COMPORTAMENTO ANTIGO (baqueta no raio de mira)

   A última é a saída de emergência: se em algum controle o `gripSpace` vier
   com outra orientação e a baqueta apontar para um lugar estranho, `?punho=0`
   devolve o jogo jogável na hora. Sem `gripSpace` (mão rastreada, por
   exemplo) o código cai sozinho nesse caminho e soma a `compensacaoDoRaio`,
   porque o raio de mira já nasce inclinado em relação à mão.

   MEXER AQUI MEXE NO JOGO, não só no visual: quem o jogo mede é a PONTA, e
   girar a haste move a ponta. Depois de mudar, vale conferir se as peças
   ainda são alcançadas com conforto.                                      */
function grausDaURL(chave, padrao){
  const p = new URLSearchParams(location.search).get(chave);
  if (p === null) return padrao;
  const g = Number(p);
  if (Number.isFinite(g) && g >= -60 && g <= 60) return g;
  console.warn(`[config] ?${chave}= ignorado: use um número de -60 a 60 (graus).`
    + ` Recebi "${p}". Seguindo com ${padrao}.`);
  return padrao;
}

export const BAQUETA = {
  /* 38 cm é baqueta 5A de verdade (a medida real é 40,6 cm; os 2 cm a menos
     descontam a parte que fica dentro da mão). */
  comprimento: 0.38,
  /* Pendura no punho. `?punho=0` volta para o raio de mira. */
  usarPunho: new URLSearchParams(location.search).get('punho') !== '0',
  /* Graus. Positivo = ponta para BAIXO. */
  inclinacao: grausDaURL('baq', 12),
  /* Graus. Positivo = pontas convergindo para o centro. */
  convergencia: grausDaURL('conv', 8),
  /* Somado à inclinação só quando a haste tem de pendurar no raio de mira,
     que já aponta mais para baixo que a mão. Chute honesto: só serve de
     ponto de partida, e só é usado no caminho de exceção. */
  compensacaoDoRaio: 15,
};

/* --------------------------------------------------------- A CARTA -------
   A fase de ritmo lê uma "carta": um JSON com os tempos de cada nota, em
   segundos da faixa. Trocar de música é trocar este caminho — nada no
   código do jogo sabe qual faixa está tocando.
   Ver ferramentas/midi-para-carta.mjs e frontend/public/cartas/.        */
/* O PADRAO e a Colour Me Red: e a carta que mostra o jogo como ele e --
   musica de banda de verdade, kit gravado na mesma sala, dinamica tirada da
   propria gravacao. Ela traz caixa e chimbal para o jogador; bumbo e crash
   vao na trilha automatica. */
const CARTA_PADRAO = 'colour-me-red';

/* `?carta=nome` troca a carta sem mexer em codigo nem commitar a escolha.
   Serve para comparar cartas e para testar faixa que nao vai para o
   repositorio. O sanitize evita montar caminho a partir da URL.

   `null` quando ninguem pediu — e essa distincao importa, porque a chave
   PRECISA vencer a carta do nivel (ver `cartaAgora`). Quem digitou `?carta=`
   na barra de endereco quer aquela carta, nao a que o nivel escolheria. */
export const CARTA_PEDIDA = (() => {
  const p = new URLSearchParams(location.search).get('carta');
  const nome = (p || '').replace(/[^\w-]/g, '');
  return nome || null;
})();

const caminhoCarta = (nome) => `cartas/${nome}.json`;

/** A carta que vale agora. Precedencia: `?carta=` > carta do nivel > padrao.
 *
 *  POR QUE O NIVEL PODE ESCOLHER A CARTA. Ate aqui o nivel so mexia em QUAIS
 *  pecas o jogador toca e em quao larga e a janela — e isso nao basta para um
 *  nivel de kit inteiro, porque `jogaveis:null` libera "tudo o que a carta
 *  trouxer", e a carta padrao so traz duas pecas. Nenhum ajuste de nivel
 *  inventa nota que a carta nao tem. Entao o nivel Profissa aponta para a
 *  `colour-me-red-cheio`: mesma musica, mesmo recorte, mesmo kit, mas com as
 *  sete pecas na parte do jogador.
 *
 *  @param {{carta?:string}} [nivel] o nivel corrente (NIVEIS[nivelAtual()]) */
export function cartaAgora(nivel){
  if (CARTA_PEDIDA) return caminhoCarta(CARTA_PEDIDA);
  return caminhoCarta((nivel && nivel.carta) || CARTA_PADRAO);
}


/* ------------------------------------------- SINCRONIA DO BICHO ----------
   Viés de tempo do encoste da caveira na pele. O PADRÃO É ZERO, e o certo é
   que continue zero: o encoste já cai no tempo da nota por construção (ver
   `bichos.js`, que apoia a caveira pelo QUEIXO e não pelo centro). Isto aqui
   é só a régua para ajustar de gosto dentro do headset.

   A HISTÓRIA, PORQUE ELA EXPLICA O NÚMERO. O caminho do bicho punha o CENTRO
   da caveira na altura da pele — ou seja, metade dela enterrada no tambor. O
   instante em que ela VISUALMENTE tocava vinha antes disso, quando o centro
   ainda estava a uma meia-altura de distância: 7,5 cm nas caveiras de 15 cm,
   e a 36,7 cm/s isso dá **205 ms ANTES da nota**. Quem joga sincroniza pelo
   toque, não pelo esmagamento, e por isso a batida saía adiantada — foi o
   que o Diego observou no headset, e a conta bate com o que ele viu.

   A correção foi geométrica, não de relógio: apoiar pelo queixo. Assim o
   toque cai em `dt = 0` para CADA caveira, com a meia-altura dela — o que
   também apaga um viés por peça, porque a do tom2 tem 12,4 cm de altura e as
   outras 15,0, e uma constante global as faria tocar em tempos diferentes.

   NADA AQUI MEXE NO JULGAMENTO. A batida continua medida contra o tempo da
   carta (ver `ritmoBatida`, em fases.js). Isto é onde o visual põe a
   referência para o corpo de quem joga, e nada mais.

     ?encoste=60       o toque acontece 60 ms DEPOIS da nota
     ?encoste=-40      40 ms antes
     ?encoste=0        o padrão: no tempo da nota

   O TETO DE +500 ms não é arbitrário: a nota é descartada como PERDEU em
   `JANELA_PERDA * janela` depois do tempo dela — 260 ms no Normal, 208 ms no
   Profissa. Viés positivo maior que isso faria a caveira ser recolhida ANTES
   de tocar, e o pouso não aconteceria na tela. O fases.js avisa no console
   quando os dois números se cruzam. O piso de -300 ms existe só para o
   denominador `ANTECEDENCIA + VIES` nunca chegar a zero.               */
export const VIES_ENCOSTE = (() => {
  const p = new URLSearchParams(location.search).get('encoste');
  if (p === null) return 0;
  const ms = Number(p);
  if (Number.isFinite(ms) && ms >= -300 && ms <= 500) return ms / 1000;
  console.warn(`[config] ?encoste= ignorado: use um número de -300 a 500 (ms).`
    + ` Recebi "${p}". Seguindo sem viés.`);
  return 0;
})();


/* ------------------------------------------------------ DIFICULDADE ------
   `jogaveis` lista as peças que o JOGADOR toca. Todo o resto da carta não
   desaparece: passa para a trilha automática e continua soando.

   Essa é a diferença que importa. Tirar o chimbal deixava a levada oca; com
   ele tocando sozinho a música fica inteira e o jogador cuida de uma parte
   só — que é como se aprende bateria de verdade, uma mão por vez.

   No fácil a parte é a CAIXA: é o backbeat, dá a forma da música, e é um
   alvo só, quase sempre no mesmo lugar. Mirar é o que mais custa para quem
   não toca, e sete alvos é o que trava.

   `janela` multiplica a tolerância de tempo. No fácil a de PERFEITO passa de
   90 para 162 ms, que perdoa falta de prática sem virar automático.       */
export const NIVEIS = {
  facil:  { nome:'Fácil',  jogaveis:['caixa'], janela:1.8 },
  /* `jogaveis: null` = o jogador toca TUDO que a carta traz. É o caso geral:
     um nível com lista fixa de peças nunca pediria tom, surdo, crash ou ride,
     e travaria qualquer carta que os tenha. */
  normal: { nome:'Normal', jogaveis:null,      janela:1.0 },

  /* O KIT INTEIRO. E aqui está o detalhe que confunde: `jogaveis:null` já é
     o do Normal, e mesmo assim o Normal pede duas peças. Não é o nível que
     limita — é a CARTA. A `colour-me-red` só tem notas de caixa e chimbal;
     crash e bumbo dela já nascem na trilha automática. Nenhum ajuste de
     nível inventa nota que a carta não tem.

     Por isso este nível traz `carta` (ver `cartaAgora`): a
     `colour-me-red-cheio` é a mesma faixa, o mesmo recorte e o mesmo kit,
     com as sete peças jogáveis — 116 de chimbal, 254 de caixa, 85 de ride,
     58 de crash e 17 de cada tom e do surdo.

     A janela é 0,8 e não 1,0 porque o kit inteiro já é a dificuldade nova;
     apertar demais o tempo em cima disso vira sorte. Em 0,8 o PERFEITO cai
     de 90 para 72 ms.

     UM AVISO SOBRE O SOM. O `kit` da carta declara amostra só para bumbo,
     caixa, chimbal e crash. Tom, surdo e ride caem na biblioteca do projeto
     (`sounds/<peca>.mp3`), que é outra bateria — soam, mas com timbre de
     outro kit. Some junto se um dia alguém gravar as três peças que faltam. */
  profissa: { nome:'Profissa', jogaveis:null, janela:0.8,
              carta:'colour-me-red-cheio' },
};
/* ------------------------------------------ MODO DE TESTE: `?sem=peca` ---
   Tira peças da PARTE DO JOGADOR na fase de ritmo, para exercitar as outras
   sem depender daquela. Nasceu de uma necessidade concreta: conferir que
   todos os instrumentos respondem, menos um.

     ?sem=caixa              o jogador toca as outras seis
     ?sem=caixa,ride         tira duas
     ?carta=teste&sem=caixa  ver a NOTA abaixo — quase sempre é isto que se quer

   ELE DEFINE O CONJUNTO, NÃO SUBTRAI DO NÍVEL. Parece detalhe e não é: o
   nível padrão é o `facil`, cujo `jogaveis` é `['caixa']`. Subtrair a caixa
   dali deixaria ZERO peças jogáveis e a fase de ritmo viraria uma música que
   se toca sozinha. Com a chave ligada, o conjunto passa a ser "todas as
   peças menos as pedidas", qualquer que seja o nível. A `janela` do nível
   continua valendo — a chave mexe em QUAIS peças, não em quão difícil é.

   NOTA SOBRE A CARTA. Uma peça só é tocável se a carta tiver notas dela. A
   `colour-me-red`, que é a padrão, traz caixa e chimbal para o jogador
   (bumbo e crash dela já nascem na trilha automática). Então `?sem=caixa`
   sozinho deixa você só com o chimbal, e não com seis instrumentos. Para
   exercitar as sete de verdade a carta tem de ser uma que as dispare —
   `teste` ou `colour-me-red-cheio`:

     ?carta=teste&sem=caixa
     ?carta=colour-me-red-cheio&sem=caixa

   Ou, sem chave nenhuma, o nível Profissa: ele já usa a `-cheio`.

   O QUE ELE NÃO MUDA: a calibração e o eco seguem pedindo todas as peças, e
   a RN06 continua valendo — bater na peça excluída ainda conta erro e zera o
   combo. A chave só decide quem toca o quê na fase de ritmo; o que o jogador
   não toca vira trilha automática e continua soando, como sempre.        */
export const PECAS_SEM = (() => {
  const p = new URLSearchParams(location.search).get('sem');
  if (!p) return [];
  const pedidas  = p.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  const validas   = pedidas.filter(id =>  PORID[id]);
  const invalidas = pedidas.filter(id => !PORID[id]);
  if (invalidas.length){
    console.warn(`[config] ?sem= ignorou peça desconhecida: ${invalidas.join(', ')}.`
      + ` Válidas: ${PECAS.map(x => x.id).join(', ')}`);
  }
  /* Excluir tudo não é um modo de teste, é um bug de digitação. Melhor
     ignorar e avisar do que entregar uma fase sem nada para tocar. */
  if (validas.length >= PECAS.length){
    console.warn('[config] ?sem= excluiria todas as peças — chave ignorada.');
    return [];
  }
  return validas;
})();

/** As peças que o JOGADOR toca na fase de ritmo, com o `?sem=` já aplicado.
 *  `null` continua significando "tudo o que a carta trouxer". */
export function jogaveisAgora(nivel){
  if (!PECAS_SEM.length) return nivel ? nivel.jogaveis : null;
  return PECAS.map(p => p.id).filter(id => !PECAS_SEM.includes(id));
}

const CHAVE_NIVEL = 'rrvr.nivel';
export function nivelAtual(){
  const k = localStorage.getItem(CHAVE_NIVEL);
  return NIVEIS[k] ? k : 'facil';
}
export function definirNivel(k){ if (NIVEIS[k]) localStorage.setItem(CHAVE_NIVEL, k); }

/* ------------------------------------------------------- QUALIDADE -------
   Se o Quest engasgar, estes três são os primeiros a mexer.               */
export const QUALIDADE = {
  // Resolução com que o headset renderiza. 1.0 é o padrão do navegador e é
  // conservador; 1.2 deixa tudo visivelmente mais nítido, mas custa
  // preenchimento. Baixe para 1.0 ou 0.9 se cair o quadro.
  escalaVR:   1.2,
  // 0 = nitidez máxima nas bordas; 1 = mais rápido, bordas borradas.
  foveacao:   0.3,
  // Filtragem anisotrópica. Não gasta VRAM — o GLTFLoader não liga sozinho.
  anisotropia: 8,
};

/* -------------------------------------------------------- O AMBIENTE -----
   De onde vem o reflexo dos pratos.

   Até 06/09 vinha do `RoomEnvironment` do three: um estúdio branco com
   luminárias retangulares, o padrão de quem quer material apresentável sem
   pensar no assunto. Só que o jogo se passa numa paisagem rochosa a céu
   aberto, e prato é METAL — o material que mais depende do que está
   refletido. Os pratos refletiam uma sala de estúdio que não existe e liam
   como plástico perolado. Não era falta de reflexo: era reflexo do lugar
   errado.

   Agora o ambiente é gerado da PRÓPRIA CENA. Depois que o `cenario.glb`
   carrega, seis faces são renderizadas UMA vez a partir da posição do kit e
   viram o `scene.environment`. Custo: zero de download, seis renders na
   carga, e nada por quadro depois. Ver cena.js → gerarAmbienteDaCena().

   `?amb=0` na URL volta para o ambiente provisório de gradiente, para
   comparar lado a lado sem editar arquivo. É a única forma honesta de
   ajustar isto: cada número aqui precisa de um "ficou bom?" na tela.     */
export const AMBIENTE = {
  ligado: new URLSearchParams(location.search).get('amb') !== '0',

  /* Resolução de CADA face do cubo, antes do PMREM. 256 é bastante: o que
     sai daqui vira reflexo borrado num prato curvo, não um espelho. Subir
     para 512 quadruplica o custo da captura e não aparece na tela.       */
  resolucao: 256,

  /* Altura da câmera de captura, em metros do MUNDO (não do kit). Com o kit
     na altura inicial os pratos ficam entre 1,07 e 1,27 m; capturar no meio
     deles é o que põe a linha do horizonte no lugar certo no reflexo. Não
     acompanha o ajuste de altura do jogador de propósito — regerar o cubemap
     a cada toque na alavanca seria seis renders por toque.               */
  altura: 1.15,

  /* O BOTÃO QUE DECIDE SE PRATO LÊ COMO METAL OU COMO PLÁSTICO.

     ATENÇÃO, E ISTO CUSTA TEMPO SE FOR DESCOBERTO NA MARRA: o scan é UM
     material só. Os quatro nodes do `bateria_pratos.glb` — `kit_resto`,
     `ride`, `chimbal`, `crash` — compartilhavam o mesmo `MeshStandardMaterial`,
     porque o `cortar-peca.mjs` separa GEOMETRIA, não material. Mexer no
     envMapIntensity mexia nos três pratos E nos 163.903 triângulos do corpo
     do kit ao mesmo tempo. `kit.js` agora clona o material para os pratos,
     e é por isso que existem dois números aqui em vez de um.

     1.0 é o que o glTF já traz. Comece comparando com `?amb=0` antes de
     mexer: o ambiente novo sozinho já muda muito, e subir intensidade em
     cima de um reflexo que já está certo é como acrescentar luz por cima de
     scan — piora e disfarça.                                             */
  intensidadePratos: 1.0,
  intensidadeKit:    1.0,

  /* A COR DO CÉU DURANTE A CAPTURA — e este é o número que mais pesa.

     Numa paisagem a céu aberto o céu é a maior fonte de luz que existe, e
     ele ocupa metade do cubo. Só que aqui o `scene.background` é `0x0a0e16`,
     quase preto: o que o jogador LÊ como céu no horizonte é a névoa
     (`0x2a3446`), e névoa não ilumina nada — ela é descartada na captura,
     senão vira um borrão cinza uniforme.

     Medido na região central do ride, variando só esta cor, com tudo o mais
     igual — quanto do brilho do prato vem do ambiente:

         0x0a0e16 (o fundo cru)     2,4%
         0x1c2740                   5,9%
         0x2a3446 (a cor da névoa)  ~9%
         0x3a4a63                  14,6%
         0x8fa3c4                  45,4%

     Com o fundo cru o reflexo existe e não se vê: 2,4% é ruído. O padrão é a
     cor da NÉVOA, porque é a que o jogador de fato enxerga no horizonte —
     capturar o `0x0a0e16` seria refletir um céu que ninguém vê.

     Subir daqui é decisão de arte, não de correção: clareia a cena inteira e
     afasta o jogo do visual escuro que ele tem hoje. `null` captura o fundo
     como está.                                                            */
  corDoCeu: 0x2a3446,
};

/* ---------------------------------------------------- A LUZ DE PALCO -----
   A `luzChave` era uma `DirectionalLight`: raios paralelos, sem posição real
   e sem queda com a distância — ilumina o mundo inteiro por igual. Serve para
   sol; não serve para palco.

   Agora é uma `SpotLight`, e a diferença que importa não é "mais luz", é luz
   CONCENTRADA: a poça cai na bateria e o entorno continua escuro. Foi o que
   sobrou faltando depois que o ambiente deixou de ser um estúdio branco.

   É UMA LUZ, NÃO DUAS. A directional foi convertida, não acompanhada — o
   orçamento por quadro já estava estourado (17,9 ms medidos contra 16,7 de
   um quadro a 60 Hz) e uma luz a mais custa em cada fragmento da tela.

   CUIDADO COM A INTENSIDADE. Spot é luz física: cai com o quadrado da
   distância (`decaimento: 2`). O 0,85 da directional não se traduz — a esta
   distância, o mesmo brilho pede algo perto de 10. Mexer na `posicao` muda a
   intensidade necessária junto, e é por isso que os dois moram lado a lado.

   `alvo` está em y ≈ 1,0 porque é a altura das peles com o kit na altura
   inicial. Não acompanha o ajuste de altura do jogador de propósito: o cone
   é largo o bastante para os ±45 cm, e mover a luz por quadro custaria
   recalcular a sombra.

   OS NÚMEROS SAÍRAM DE MEDIÇÃO, não de gosto. Medindo a luminância média do
   kit contra a da rocha do primeiro plano, com o brilho do kit sempre
   normalizado em ~26, o que muda é só o contraste:

     posição            ângulo   intens.   kit    rocha   razão
     (0.8, 3.4, 1.8)     0,62      40      24,9    8,3     3,0
     (0.8, 3.4, 1.8)     0,42      40      24,9    6,0     4,1
     (0.6, 2.8, 1.2)     0,42      22      25,4    3,3     7,7
     (0.5, 2.4, 1.0)     0,38      15      26,4    2,3    11,6
     (0.5, 2.4, 1.0)     0,45      15      26,4    2,7     9,8  <- este

   Aproximar a luz é o que faz o contraste, não subir a intensidade: a razão
   quase não muda com o brilho, e muda muito com a distância. O 0,45 é meio
   passo mais aberto que o de maior contraste porque a 0,38 os pratos das
   pontas caem fora da poça (ride 23,3 contra 26,0 aqui).                  */
export const PALCO = {
  posicao: [0, 3.0, 1.9],
  alvo:    [0, 1.0, 0],
  cor: 0xdfeaff,
  intensidade: 95,
  angulo:   0.50,   // radianos: meia-abertura do cone
  penumbra: 0.55,   // 0 = borda dura de holofote; 1 = toda esfumada
  alcance:  12,     // metros até apagar de vez
  decaimento: 2,    // 2 = física; 0 = sem queda com a distância
};

/* ------------------------------------------------ OS DOIS ESTADOS DE LUZ -
   O tutorial (calibração e eco) acontece com o MAPA CLARO: o jogador está
   aprendendo onde ficam as sete peças e precisa enxergar a cena. Na entrada
   da fase de ritmo as luzes caem, sobra a poça de palco, e é isso que separa
   "estou aprendendo" de "estou tocando".

   `hemisferica` é a intensidade da HemisphereLight; `ambiente` multiplica o
   reflexo do cubemap (`scene.environmentIntensity`); `palco` é o spot. No
   show o spot usa o `PALCO.intensidade` acima — um valor só, ajustado no
   olho, sem cópia para sair de sincronia.

   A transição é interpolada em `cena.js → animarLuzes()`, e não com
   `setTimeout` em degraus: luz que pula em dois passos lê como bug de
   carregamento, não como holofote apagando.                                */
export const LUZ = {
  transicao: 1.2,          // segundos do fade

  /* `fundo` É PARTE DA LUZ, e essa foi a surpresa da medição. O céu do jogo é
     `scene.background`, cor chapada: luz nenhuma o atinge. Medindo a região do
     céu, ela dava 1,1 de luminância com a hemisférica em 1,7 e com ela em 5,0
     — idêntica. Sem clarear o fundo, "mapa claro" não existe: por mais luz que
     se ponha, o jogador continua num descampado de céu preto.

     Os números abaixo saíram de medição por região, não de gosto —
     luminância média de 0 a 255, no mesmo enquadramento:

                                     rocha    kit    céu
       show                           12,1   49,5    1,1
       tutorial, 1ª tentativa
         (1.7 / 3.0, fundo escuro)     6,2   20,6    1,1  <- pior que o show
       tutorial adotado
         (5.0 / 7.0, fundo 0x243244)  13,7   30,5    7,7

     O tutorial ficar com a ROCHA mais clara e o KIT menos aceso que no show é
     o certo, e não um defeito: no tutorial a luz é do ambiente e o mapa todo
     se vê; no show é uma poça, e o que importa é a bateria. */
  tutorial: { hemisferica: 5.0, ambiente: 7.0, palco: 18, fundo: 0x243244 },
  show:     { hemisferica: 0.14, ambiente: 1.0,            fundo: 0x0a0e16 },
  //          palco do show = PALCO.intensidade
};

/* Decodificadores de Draco (geometria comprimida) e Basis (texturas KTX2).
   Servidos do PRÓPRIO domínio, não de CDN: rede que bloqueia CDN externo
   — e rede de faculdade bloqueia — faria nenhum modelo carregar.
   As pastas são copiadas de node_modules antes do build; ver
   frontend/scripts/copiar-decodificadores.mjs                             */
export const CAMINHO_DRACO = 'libs/draco/';
export const CAMINHO_BASIS = 'libs/basis/';

/* ------------------------------------------------------- DIFICULDADE ----- */
/* A pontuação não mora mais aqui. Havia um `PONTOS_ALVO = 900` decidindo o
   que era "vencer", e ele só funcionava para uma carta de um tamanho: quando
   a carta de ritmo passou de 133 para 505 notas, a meta era atingida nos
   primeiros vinte segundos e a barra ficava cravada no máximo o resto da
   música. O modelo agora é relativo à própria carta e vive em
   `pontuacao.js`. */

export const ECO_RODADAS = [3, 4, 5];   // tamanho do padrão em cada rodada

export const BPM = 80;
export const PADRAO_RITMO = [   // [peça, passo] — colcheias, sem repetições
  ['chimbal',0],['chimbal',1],['caixa',2],  ['chimbal',3],
  ['chimbal',4],['chimbal',5],['caixa',6],  ['chimbal',7],
  ['crash',8],  ['ride',9],   ['caixa',10], ['ride',11],
  ['ride',12],  ['ride',13],  ['caixa',14], ['ride',15],
  ['tom1',16],  ['tom1',17],  ['tom2',18],  ['tom2',19],
  ['surdo',20], ['surdo',21], ['caixa',22], ['crash',23],
];

/* --------------------------------------------------------- BACK-END ------
   Em produção (Vercel) o front e a API moram no mesmo domínio, então o
   caminho relativo '/api' basta e não há CORS.
   Em desenvolvimento o Vite roda em :5173 e a API em :3000 — por isso o
   endereço absoluto. Ver backend/README.                                  */
export const API_BASE = import.meta.env.DEV ? 'http://localhost:3000/api' : '/api';
