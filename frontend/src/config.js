/* ============================================================================
   config.js — tudo que se ajusta sem entender o resto do código.
   Se você veio consertar posição, dificuldade ou endereço da API, é aqui.
   ========================================================================== */

/* --------------------------------------------------------- AS PEÇAS ------
   Posições medidas no próprio bateria.glb (o modelo foi analisado peça por
   peça) e já convertidas para METROS, com a bateria virada de frente para o
   jogador. `r` é o raio da zona de acerto — um pouco maior que a pele real,
   porque em VR o jogador não tem retorno tátil e precisa de margem.

   Se depois do teste no headset alguma peça estiver difícil de acertar,
   é uma linha aqui: aumente o `r` dela.                                    */
export const PECAS = [
  { id:'chimbal', nome:'Chimbal', x:-0.697, y:1.157, z: 0.106, r:0.21, tecla:'KeyA', cor:0xc17dff, som:'chimbal' },
  { id:'crash',   nome:'Crash',   x:-0.449, y:1.333, z:-0.054, r:0.34, tecla:'KeyS', cor:0x66e0ff, som:'crash'   },
  { id:'caixa',   nome:'Caixa',   x:-0.366, y:0.966, z: 0.255, r:0.20, tecla:'KeyD', cor:0xffa64d, som:'caixa'   },
  { id:'tom2',    nome:'Tom 2',   x:-0.152, y:1.116, z: 0.044, r:0.20, tecla:'KeyF', cor:0x3ddc97, som:'tom2'    },
  { id:'tom1',    nome:'Tom 1',   x: 0.160, y:1.116, z: 0.053, r:0.17, tecla:'KeyJ', cor:0x4da3ff, som:'tom1'    },
  { id:'surdo',   nome:'Surdo',   x: 0.450, y:0.934, z: 0.200, r:0.19, tecla:'KeyK', cor:0xff5d6c, som:'surdo'   },
  { id:'ride',    nome:'Ride',    x: 0.658, y:1.264, z: 0.011, r:0.40, tecla:'KeyL', cor:0xffd34d, som:'ride'    },
];
export const PORID = Object.fromEntries(PECAS.map(p => [p.id, p]));

/* ------------------------------------------------------- O CENÁRIO -------
   O laboratório veio do Sketchfab em coordenadas próprias. Em vez de
   reescrever o jogo para elas, giramos e deslocamos o LAB para que estes
   dois pontos caiam onde o jogo já espera o jogador e o reator.
   Ver cena.js → encaixarLab().                                            */
export const LAB = {
  url:          'modelos/lab.glb',
  postoJogador: [ 4.5, -1.0 ],  // onde o baterista fica, em coords do lab
                                // (deste lado da divisória de vidro o tanque
                                //  aparece inteiro, sem nada na frente)
  tanque:       [ 3.0, -5.0 ],  // o cilindro luminoso = nosso reator
  alturaPiso:   0.07,           // topo da malha de chão
};
export const URL_BATERIA = 'modelos/bateria.glb';
export const ESCALA_KIT  = 0.591;   // bumbo -> 0,56 m (22 pol)

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
