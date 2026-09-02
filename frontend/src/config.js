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
  { id:'crash',   nome:'Crash',   x:-0.405, y:0.773, z:-0.101, r:0.286, tecla:'KeyS', cor:0x66e0ff, som:'crash'   },
  { id:'caixa',   nome:'Caixa',   x:-0.375, y:0.575, z: 0.242, r:0.189, tecla:'KeyD', cor:0xffa64d, som:'caixa'   },
  { id:'tom2',    nome:'Tom 2',   x:-0.159, y:0.681, z:-0.081, r:0.157, tecla:'KeyF', cor:0x3ddc97, som:'tom2'    },
  { id:'tom1',    nome:'Tom 1',   x: 0.161, y:0.683, z:-0.080, r:0.162, tecla:'KeyJ', cor:0x4da3ff, som:'tom1'    },
  { id:'surdo',   nome:'Surdo',   x: 0.401, y:0.576, z: 0.184, r:0.189, tecla:'KeyK', cor:0xff5d6c, som:'surdo'   },
  { id:'ride',    nome:'Ride',    x: 0.676, y:0.799, z:-0.127, r:0.293, tecla:'KeyL', cor:0xffd34d, som:'ride'    },
];
export const PORID = Object.fromEntries(PECAS.map(p => [p.id, p]));

/* ------------------------------------------------------- O CENÁRIO -------
   O cenário é uma malha única centrada na origem (~2 m de extensão).
   `escala` amplia para tamanho de sala; `postoJogador` indica, em coords
   do modelo (ANTES da escala), onde o baterista fica. Ver cena.js →
   encaixarLab().                                                          */
export const LAB = {
  url:          'modelos/lab.glb',
  escala:       5,              // 2 m × 5 = sala de ~10 m
  postoJogador: [ 0, 0.1 ],    // centro do modelo (x, z em coords do lab)
  alturaPiso:   -0.50,         // Y do chão em coords do modelo (antes da escala)
};
export const URL_BATERIA = 'modelos/bateria.glb';
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

/* Decodificadores de Draco (geometria comprimida) e Basis (texturas KTX2).
   Servidos do PRÓPRIO domínio, não de CDN: rede que bloqueia CDN externo
   — e rede de faculdade bloqueia — faria nenhum modelo carregar.
   As pastas são copiadas de node_modules antes do build; ver
   frontend/scripts/copiar-decodificadores.mjs                             */
export const CAMINHO_DRACO = 'libs/draco/';
export const CAMINHO_BASIS = 'libs/basis/';

/* ------------------------------------------------------- DIFICULDADE ----- */
export const PONTOS_ALVO = 900;   // pontuação que enche o reator (100%)
export const CARGA_MINIMA = 60;   // % de carga para considerar a missão vencida

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
