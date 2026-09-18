/* ============================================================================
   menu3d.js — A INTERFACE QUE EXISTE DENTRO DO HEADSET.

   HTML não aparece em VR. Até aqui isso era resolvido com PLACAS de leitura
   (painelHUD, painelObj, painelCentro em cena.js): o jogador via, mas não
   podia responder. Tudo que exigia decisão dele — começar a partida, escolher
   o nível, pular o tutorial, voltar ao menu — ou acontecia ANTES de entrar no
   VR, na tela de HTML, ou virava botão de controle, que ninguém descobre sem
   ler documentação.

   O TESTE DE 08/09 MOSTROU O PREÇO DISSO: quem entrava em VR pelo menu caía
   direto no meio de uma partida, sem ter escolhido nada, e no fim da música
   não tinha como sair.

   Este arquivo é o que faltava: botões de verdade em 3D, apontados com o
   controle e acionados com o GATILHO. FICA FIXO ATRÁS DA BATERIA (mesmo
   Z de sempre, -2,00 m do posto do jogador): é a primeira coisa visível ao
   entrar no VR e volta ao mesmo lugar sempre que o jogador sai de uma
   partida ou fecha um submenu.

   POR QUE O GATILHO E NÃO A BAQUETA. A baqueta seria mais coerente com o
   jogo, mas a mesma detecção que reconhece uma batida (deteccao.js, trajeto
   varrido de cima para baixo) dispararia o botão em qualquer movimento
   descendente perto dele — e o jogador de bateria move as mãos o tempo todo.
   Botão de menu não pode ter falso positivo. O gatilho, além disso, estava
   livre: a batida é MOVIMENTO, nenhum botão de controle a produz.

   15/09 — MENU REFEITO. Antes o menu principal era um poço de botões: JOGAR,
   Modo livre, uma fileira de níveis e Calibrar, tudo no mesmo plano. Virou
   quatro opções limpas — JOGAR em destaque, Modo livre, Créditos, Calibrar —
   e duas delas (Jogar e Modo livre) abrem um CARROSSEL: um cartão por vez,
   setas nas duas pontas para trocar, e o mesmo cartão aceita ser ARRASTADO
   com o gatilho pressionado (ver a seção do ponteiro, mais abaixo). Tocar no
   cartão de uma música abre a dificuldade NA FRENTE dela — mesmo carrossel,
   conteúdo trocado, sem um novo painel flutuando em outro lugar. O modo
   livre usa o MESMO componente de carrossel, só sem a etapa de dificuldade —
   é o pedido de origem: "essa interface vai ser igual para o modo livre,
   apenas com a diferença de não ter dificuldade".

   ONDE CADA GRUPO APARECE, e nunca dois ao mesmo tempo:
     'menu'       antes da partida — JOGAR, Modo livre, Créditos, Calibrar
     'jogarLista' o carrossel de músicas do Jogar + a dificuldade em overlay
     'livre'      o carrossel de faixas do modo livre (sem dificuldade)
     'creditos'   time do projeto + crédito de cada música e faixa
     'jogo'       durante a partida — PULAR (só nas fases 0 e 1) e SAIR
     'cal'        durante a calibragem aberta pelo menu — só FECHAR
     'fim'        sobre o painel de resultado — JOGAR DE NOVO e MENU

   O grupo inteiro pendura em `uiVR`, um único filho de `scene`. Isso não é
   arrumação: `gerarAmbienteDaCena()` esconde todos os filhos da cena que não
   sejam o cenário ou luz antes de capturar o cubemap, e um grupo só é uma
   linha a menos para alguém esquecer ali.
   ========================================================================== */

import * as THREE from 'three';
import { scene, camera, renderer, placa } from './cena.js';
import { baquetas } from './kit.js';

/* Tudo que este módulo desenha vive aqui dentro. */
export const uiVR = new THREE.Group();
uiVR.name = 'ui-vr';
scene.add(uiVR);

/* Distância dos painéis: 2,6 m do posto do jogador (o posto está em z=+0,62).
   Longe o bastante para não brigar com os pratos, perto o bastante para o
   texto ser legível sem apertar os olhos. */
const Z = -2.00;

/* ------------------------------------------------------------- botões ----- */

/** Um botão. É uma placa de canvas com estado de foco — o mesmo `placa()` das
 *  outras mensagens 3D, para o visual não divergir com o tempo.
 *
 *  `rotulo` pode ser uma linha (string) ou várias (array) — os cartões do
 *  carrossel usam duas: título e crédito. `m.userData.tams`/`.cores`, quando
 *  definidos depois de criado o botão, dão tamanho e cor por linha (o botão
 *  comum, de uma linha só, não precisa mexer nisso). Em foco ou "ligado" as
 *  cores por linha somem de propósito: o texto claro sobre o fundo ciano é
 *  o que garante contraste, e cor por linha é pensada para o fundo escuro. */
function botao(rotulo, w, h, acao, tam = .52){
  const m = placa(w, h, Math.max(256, Math.round(w * 560)));
  m.name = 'botao3d';
  m.userData.acao = acao;
  m.userData.rotulo = rotulo;
  m.userData.ligado = false;      // estado "selecionado" — usado pela dificuldade
  m.userData.foco = false;
  m.userData.repintar = () => {
    const { foco, ligado, rotulo, tams, cores } = m.userData;
    const destacado = foco || ligado;
    const corBase = destacado ? '#06131b' : '#e8eef8';
    m.userData.pintar(rotulo, {
      tam, tams,
      cor: corBase,
      cores: destacado ? undefined : cores,
      fundo: foco ? 'rgba(0,217,255,.95)'
                  : ligado ? 'rgba(0,217,255,.72)' : 'rgba(17,24,38,.92)',
      borda: foco ? 'rgba(232,238,248,.95)' : 'rgba(0,217,255,.45)',
    });
  };
  m.userData.repintar();
  return m;
}

/** Texto sem interação — título, subtítulo, rótulo de seção. */
function texto(linhas, w, h, o = {}){
  const m = placa(w, h, Math.max(256, Math.round(w * 560)));
  m.userData.pintar(linhas, { fundo:false, tam:o.tam || .6, cor:o.cor || '#e8eef8',
                              cores:o.cores, tams:o.tams });
  return m;
}

/* ------------------------------------------------------ AS AÇÕES --------- */

const acoes = {};   // preenchido por definirAcoes(), lá do main.js
const disparar = nome => (...a) => { const f = acoes[nome]; if (f) f(...a); };

/* ============================================================ MENU ======= */
/* ---- 'menu': quatro opções, e só isso ------------------------------------
   JOGAR em destaque (maior, no topo), Modo livre e Créditos abaixo, na mesma
   fileira de peso, e Calibrar por último — é ajuste, não é um modo. */
const grupoMenu = new THREE.Group(); grupoMenu.name = 'menu-vr'; uiVR.add(grupoMenu);

const tituloMenu = texto(['DRUMFALL'], 1.5, .26, { tam:.85, cor:'#00d9ff' });
tituloMenu.position.set(0, 2.32, Z); grupoMenu.add(tituloMenu);

const btJogar = botao('JOGAR', 1.05, .28, () => abrirCarrosselJogar(), .60);
btJogar.position.set(0, 1.92, Z); grupoMenu.add(btJogar);

const btLivreTop = botao('Modo livre', 1.05, .21, disparar('livre'), .52);
btLivreTop.position.set(0, 1.63, Z); grupoMenu.add(btLivreTop);

const btCreditosTop = botao('Créditos', 1.05, .19, () => abrirCreditos(), .50);
btCreditosTop.position.set(0, 1.38, Z); grupoMenu.add(btCreditosTop);

const btCalibrarTop = botao('Calibrar atraso', 1.05, .18, disparar('calibrar'), .48);
btCalibrarTop.position.set(0, 1.15, Z); grupoMenu.add(btCalibrarTop);

const rodapeMenu = texto(['aponte o controle e aperte o gatilho'], 1.5, .11,
                         { tam:.72, cor:'#6f7f96' });
rodapeMenu.position.set(0, .96, Z); grupoMenu.add(rodapeMenu);

/* ============================================ O PAINEL DE RECORDES =======
   Os três melhores de CADA música, ao lado do menu. É só leitura — placa, não
   botão — e mora dentro de `grupoMenu`: aparece com o menu e some com ele, sem
   uma linha a mais em `aplicar()`.

   OS NÚMEROS NÃO SÃO DAQUI. `definirRecordes` recebe as seções já prontas de
   recordes.js (que fala com a API e cruza com musicas.json); este arquivo só
   desenha. Mesma divisão do carrossel: quem sabe de dados não sabe de 3D.

   LARGURA DE PÓDIO FIXA. `placa()` reparte a altura igualmente entre as linhas
   que recebe, então um painel com menos linhas ganharia letra maior sozinho.
   Por isso cada página tem SEMPRE o mesmo número de linhas (cabeçalho, dois
   blocos de música com título e três posições, um espaço, o rodapé), com
   linhas em branco onde faltar. O corpo do texto não muda de uma página para
   a outra nem quando o primeiro jogador aparece.

   Duas músicas por página; passando disso as páginas se alternam sozinhas a
   cada 8 s — o painel não tem botão de propósito, para não competir com o
   JOGAR pelo gatilho. */
const MUSICAS_POR_PAGINA = 2;
const painelRecordes = placa(1.10, 1.25, 720);
painelRecordes.name = 'recordes3d';
painelRecordes.position.set(1.50, 1.68, Z);
painelRecordes.rotation.y = -.26;          // vira de frente para quem olha o menu
grupoMenu.add(painelRecordes);

let _recSecoes = [], _recOffline = false, _recPagina = 0;
const COR_POSICAO = ['#ffd34d', '#c9d3e0', '#d9955b'];    // ouro, prata, bronze
const pontosBR = n => Number(n).toLocaleString('pt-BR');

function pintarRecordes(){
  const paginas = Math.max(1, Math.ceil(_recSecoes.length / MUSICAS_POR_PAGINA));
  if (_recPagina >= paginas) _recPagina = 0;
  const grupo = _recSecoes.slice(_recPagina * MUSICAS_POR_PAGINA,
                                 (_recPagina + 1) * MUSICAS_POR_PAGINA);

  const linhas = ['RECORDES'], cores = ['#00d9ff'], tams = [.78];
  const add = (t, c, tam) => { linhas.push(t); cores.push(c); tams.push(tam); };

  for (let b = 0; b < MUSICAS_POR_PAGINA; b++){
    const sec = grupo[b];
    if (b > 0) add('', '#e8eef8', .5);
    if (!sec){ for (let i = 0; i < 4; i++) add('', '#e8eef8', .5); continue; }
    add(sec.titulo, '#e8eef8', .62);
    for (let i = 0; i < 3; i++){
      const it = sec.itens[i];
      if (it) add(`${it.posicao}º  ${it.nome}  ·  ${pontosBR(it.pontos)}`, COR_POSICAO[i], .52);
      else if (i === 0) add(_recOffline ? 'ranking offline' : 'ninguém jogou ainda', '#6f7f96', .48);
      else add('', '#e8eef8', .5);
    }
  }
  if (!grupo.length){
    // sem manifesto e sem API: não há o que listar, e o painel diz por quê
    add(_recOffline ? 'ranking offline' : 'nenhuma música cadastrada', '#6f7f96', .5);
  }
  add(paginas > 1 ? `‹ ${_recPagina + 1} / ${paginas} ›` : '', '#6f7f96', .48);

  painelRecordes.userData.pintar(linhas, { cores, tams,
    fundo:'rgba(10,14,22,.86)', borda:'rgba(0,217,255,.35)' });
}

/** @param {{id:string,titulo:string,itens:{posicao:number,nome:string,pontos:number}[]}[]} secoes
 *  @param {boolean} offline a API não respondeu — troca "ninguém jogou" por "offline" */
export function definirRecordes(secoes, offline = false){
  _recSecoes = secoes || [];
  _recOffline = !!offline;
  pintarRecordes();
}
pintarRecordes();

setInterval(() => {
  if (_tela !== 'menu' || _recSecoes.length <= MUSICAS_POR_PAGINA) return;
  _recPagina++;
  pintarRecordes();
}, 8000);

/* ==================================================== O CARROSSEL ========
   Um componente só, usado pelo Jogar (com dificuldade) e pelo modo livre
   (sem). Um cartão por vez, setas em cada ponta, arrasto opcional com o
   gatilho (ver `arrastavel` mais abaixo). Nasceu do pedido de origem: "a
   mesma interface para o modo livre, só sem dificuldade" — então o
   carrossel em si NÃO SABE o que acontece ao escolher um item; quem chama
   `criarCarrossel` decide, no `onEscolher`.

   POR QUE CARTÃO ÚNICO E NÃO LISTA EMPILHADA. O modo livre chegou a ter um
   teto de três faixas (ver o histórico no git) porque a pilha vertical
   esbarrava na bateria, vista do posto do jogador. Um cartão só, sempre no
   mesmo lugar, não tem esse problema — a lista pode crescer sem limite de
   altura, só de paciência para arrastar até ela. */
function criarCarrossel({ y = 1.72, w = 1.30, h = .50, onEscolher }){
  const g = new THREE.Group();
  let itens = [], indice = 0;

  const cartao = botao('', w, h, () => { if (itens.length) onEscolher(itens[indice], indice); }, .62);
  cartao.position.set(0, y, Z);
  cartao.userData.tams  = [.62, .34];
  cartao.userData.cores = ['#e8eef8', '#8c9bb5'];
  /* Sem isto o gatilho pressionado sobre o cartão SÓ escolheria o item —
     `arrastavel` avisa o ponteiro (mais abaixo) para segurar a ação até
     saber se o jogador soltou no lugar (toque) ou arrastou (página). */
  cartao.userData.arrastavel = true;
  cartao.userData.onArrastar = dir => mudar(dir);
  g.add(cartao);

  const larguraSeta = .15, vaoSeta = .045;
  const btAnterior = botao('‹', larguraSeta, .30, () => mudar(-1), .70);
  btAnterior.position.set(-(w/2 + vaoSeta + larguraSeta/2), y, Z);
  g.add(btAnterior);

  const btProxima = botao('›', larguraSeta, .30, () => mudar(1), .70);
  btProxima.position.set(w/2 + vaoSeta + larguraSeta/2, y, Z);
  g.add(btProxima);

  const indicador = texto([''], w, .09, { tam:.55, cor:'#6f7f96' });
  indicador.position.set(0, y - h/2 - .105, Z);
  g.add(indicador);

  function redesenhar(){
    const item = itens[indice];
    cartao.userData.rotulo = item
      ? [item.titulo, item.creditos || item.dica || '']
      : ['Nada cadastrado ainda', ''];
    cartao.userData.repintar();
    indicador.userData.pintar([itens.length ? `‹ ${indice + 1} / ${itens.length} ›` : ''],
      { fundo:false, tam:.55, cor:'#6f7f96' });
    const mostraSetas = itens.length > 1;
    btAnterior.visible = mostraSetas;
    btProxima.visible  = mostraSetas;
  }

  function mudar(dir){
    if (itens.length < 2) return;
    indice = (indice + dir + itens.length) % itens.length;
    redesenhar();
  }

  /** Troca a lista inteira e volta para o primeiro item — chamado quando o
   *  manifesto chega (ver `montarMusicas`/`montarTrilhas`) e sempre que a
   *  tela reabre, para não deixar o carrossel no meio de onde alguém saiu. */
  function definir(lista){
    itens = lista || [];
    indice = 0;
    redesenhar();
  }

  return { grupo:g, definir, mudar, atual:() => itens[indice] || null };
}

/* ---- 'jogarLista': o carrossel de músicas do Jogar ------------------------
   Duas telas dentro do mesmo grupo, que nunca aparecem juntas: a lista de
   músicas (`subLista`) e a dificuldade (`subDificuldade`), que substitui a
   lista NO MESMO LUGAR quando um cartão é escolhido — "a dificuldade abre na
   frente da música", só que sem um segundo painel flutuando em outra
   profundidade: é a mesma moldura, conteúdo trocado, do jeito que a
   calibragem já troca de lugar com o resultado no `painelCentro`. */
const grupoJogarLista = new THREE.Group(); grupoJogarLista.name = 'jogar-lista-vr';
uiVR.add(grupoJogarLista);

const subLista = new THREE.Group(); grupoJogarLista.add(subLista);

const tituloJogar = texto(['ESCOLHA A MÚSICA'], 1.5, .22, { tam:.72, cor:'#00d9ff' });
tituloJogar.position.set(0, 2.28, Z); subLista.add(tituloJogar);

const carrosselJogar = criarCarrossel({
  y: 1.72,
  onEscolher: (musica) => abrirDificuldade(musica),
});
subLista.add(carrosselJogar.grupo);

const dicaJogar = texto(['aponte e aperte o gatilho — ou segure e arraste para o lado'],
                        1.6, .10, { tam:.62, cor:'#6f7f96' });
dicaJogar.position.set(0, 1.22, Z); subLista.add(dicaJogar);

const btVoltarJogar = botao('‹ Voltar', .78, .19, () => mostrar('menu'), .50);
btVoltarJogar.position.set(0, 1.06, Z); subLista.add(btVoltarJogar);

/* ---- a dificuldade, em overlay do mesmo carrossel ------------------------- */
const subDificuldade = new THREE.Group(); grupoJogarLista.add(subDificuldade);

let _musicaEscolhida = null;

const tituloDificuldade = texto([''], 1.5, .20, { tam:.68, cor:'#00d9ff' });
tituloDificuldade.position.set(0, 2.16, Z); subDificuldade.add(tituloDificuldade);

/* Um botão por nível, montados a partir da lista que o main.js entrega. A
   lista NÃO está escrita aqui de propósito: `NIVEIS` já ganhou uma chave nova
   uma vez (o Profissa, em 09/09) e a cópia à mão do main.js tinha ficado para
   trás na ocasião. Ver o "contrato de id" em claude/nivel-profissa.md — este
   é o mesmo contrato, sem HTML.

   OS RÓTULOS AQUI SÃO OS DO PEDIDO — "fácil, médio, difícil" — e não o
   `nome` de `NIVEIS` (que continua 'Fácil'/'Normal'/'Profissa' em todo o
   resto do jogo: HTML, `pintarNivel`, os comentários de config.js). Trocar
   `nome` ali teria efeito em lugares que este pedido não pediu para mexer;
   o mapa abaixo é só o texto do botão, aqui dentro. Nível novo que não
   estiver no mapa cai no `nome` original — nunca fica sem rótulo. */
const ROTULO_DIFICULDADE = { facil:'Fácil', normal:'Médio', profissa:'Difícil' };
const botoesNivel = new Map();
const grupoNiveis = new THREE.Group(); subDificuldade.add(grupoNiveis);

/** @param {{chave:string,nome:string}[]} lista */
export function montarNiveis(lista){
  for (const b of botoesNivel.values()){ grupoNiveis.remove(b); b.geometry.dispose(); }
  botoesNivel.clear();
  const larg = .40, vao = .04;
  const total = lista.length * larg + (lista.length - 1) * vao;
  lista.forEach((n, i) => {
    const rotulo = ROTULO_DIFICULDADE[n.chave] || n.nome;
    const b = botao(rotulo, larg, .19,
      () => disparar('iniciarComNivel')(n.chave, _musicaEscolhida && _musicaEscolhida.id), .58);
    b.position.set(-total/2 + larg/2 + i*(larg+vao), 1.86, Z);
    grupoNiveis.add(b);
    botoesNivel.set(n.chave, b);
  });
}

const btVoltarDificuldade = botao('‹ Voltar', .78, .18,
  () => { _musicaEscolhida = null; atualizarSubtelaJogar(); }, .48);
btVoltarDificuldade.position.set(0, 1.30, Z); subDificuldade.add(btVoltarDificuldade);

function abrirDificuldade(musica){
  _musicaEscolhida = musica;
  atualizarSubtelaJogar();
}

function atualizarSubtelaJogar(){
  const escolhida = !!_musicaEscolhida;
  subLista.visible       = grupoJogarLista.visible && !escolhida;
  subDificuldade.visible = grupoJogarLista.visible && escolhida;
  if (escolhida){
    tituloDificuldade.userData.pintar([_musicaEscolhida.titulo], { fundo:false, tam:.68, cor:'#00d9ff' });
  }
}

/** Abre o carrossel do Jogar sempre no primeiro cartão, sem dificuldade
 *  escolhida — reabrir depois de jogar não pode deixar a tela de dificuldade
 *  de uma sessão anterior no ar. */
function abrirCarrosselJogar(){
  _musicaEscolhida = null;
  mostrar('jogarLista');
}

/** Recebe a lista de músicas jogáveis (ver `musicas.js`/`carregarMusicas`) e
 *  monta o carrossel. Chamado do main.js, do mesmo jeito que `montarTrilhas`.
 *  Guarda a lista também para a tela de Créditos (ver `atualizarCreditos`). */
export function montarMusicas(lista){
  carrosselJogar.definir(lista);
  _musicasCred = lista || [];
  atualizarCreditos();
}

/** Escreve o nível escolhido e o atraso calibrado, chamado pelo
 *  `pintarNivel()` do main.js sempre que um dos dois muda — inclusive vindo
 *  dos botões de HTML, fora do VR. Marca o botão "ligado" na dificuldade e
 *  escreve o status logo abaixo dos três botões. */
export function pintarMenu(chaveAtual, subtitulo = ''){
  for (const [chave, b] of botoesNivel){
    b.userData.ligado = (chave === chaveAtual);
    b.userData.repintar();
  }
  subStatusDificuldade.userData.pintar([subtitulo], { fundo:false, tam:.55, cor:'#8c9bb5' });
}

const subStatusDificuldade = texto([''], 1.5, .10, { tam:.55, cor:'#8c9bb5' });
subStatusDificuldade.position.set(0, 1.58, Z); subDificuldade.add(subStatusDificuldade);

/* ---- 'livre': o carrossel de faixas do modo livre -------------------------
   O MESMO componente do Jogar, sem a etapa de dificuldade: escolher um
   cartão aqui já inicia a partida. "Só bateria" é sempre o primeiro cartão —
   é o modo livre como ele sempre foi, antes de existir faixa nenhuma, e o
   que quem só quer bater no tambor está procurando. */
const grupoLivre = new THREE.Group(); grupoLivre.name = 'livre-vr'; uiVR.add(grupoLivre);

const tituloLivre = texto(['MODO LIVRE'], 1.5, .22, { tam:.72, cor:'#00d9ff' });
tituloLivre.position.set(0, 2.28, Z); grupoLivre.add(tituloLivre);

const SO_BATERIA = { id:null, titulo:'Só bateria', dica:'sem faixa — entra direto, como sempre' };

const carrosselLivre = criarCarrossel({
  y: 1.72,
  onEscolher: (item) => {
    if (item.id) disparar('trilha')(item.id);
    else disparar('livreSemFaixa')();
  },
});
grupoLivre.add(carrosselLivre.grupo);

const dicaLivre = texto(['aponte e aperte o gatilho — ou segure e arraste para o lado'],
                        1.6, .10, { tam:.62, cor:'#6f7f96' });
dicaLivre.position.set(0, 1.22, Z); grupoLivre.add(dicaLivre);

/* O SAIR DE PARTIDA passa por aqui: quem chega ao FIM de uma faixa do modo
   livre volta para esta mesma lista, com a partida livre ainda em curso — daí
   o `voltarLivre` continuar sendo uma ação do main.js (`voltarDaLista`, que
   sabe abandonar a partida se ela existir) e não um `mostrar('menu')` direto. */
const btVoltarLivre = botao('‹ Voltar', .78, .19, disparar('voltarLivre'), .50);
btVoltarLivre.position.set(0, 1.06, Z); grupoLivre.add(btVoltarLivre);

/** Recebe a lista de faixas do manifesto (trilhas.js) e monta o carrossel,
 *  com "Só bateria" sempre na frente. Chamado do main.js. Guarda a lista
 *  também para a tela de Créditos. */
export function montarTrilhas(lista){
  carrosselLivre.definir([SO_BATERIA, ...(lista || [])]);
  _trilhasCred = lista || [];
  atualizarCreditos();
}

/* ---- 'creditos': o time e a atribuição de cada faixa ----------------------
   "Crédito que não aparece não é crédito" já era a regra do resultado de
   partida (ver `mostrarCreditos` em ui.js); aqui é a mesma regra num lugar
   que não depende de terminar uma música para ser visto. Reúne o crédito de
   toda música do Jogar e toda faixa do modo livre, sempre que uma das duas
   listas chega (ver `atualizarCreditos`, chamada por `montarMusicas` e
   `montarTrilhas`) — nunca escrito à mão, pelo mesmo motivo de sempre. */
const grupoCreditos = new THREE.Group(); grupoCreditos.name = 'creditos-vr'; uiVR.add(grupoCreditos);

const tituloCreditos = texto(['CRÉDITOS'], 1.5, .22, { tam:.72, cor:'#00d9ff' });
tituloCreditos.position.set(0, 2.30, Z); grupoCreditos.add(tituloCreditos);

const painelCreditos = texto([''], 1.7, .95, { tam:.5, cor:'#e8eef8' });
painelCreditos.position.set(0, 1.68, Z); grupoCreditos.add(painelCreditos);

const btVoltarCreditos = botao('‹ Voltar', .78, .19, () => mostrar('menu'), .50);
btVoltarCreditos.position.set(0, 1.06, Z); grupoCreditos.add(btVoltarCreditos);

let _musicasCred = [], _trilhasCred = [];

/* Time do projeto — fixo, é identidade do trabalho e não vem de manifesto
   nenhum (ver README.md, seção "Integrantes"). O resto da lista é montado a
   partir do que `montarMusicas`/`montarTrilhas` já carregaram. */
function atualizarCreditos(){
  const linhas = [
    'Diego · Nickolas · Bruno · Danilo',
    'ADS — Senac Joinville · Profª Claudia Werlich',
    '',
  ];
  const tams  = [.62, .40, .30];
  const cores = ['#e8eef8', '#8c9bb5', '#8c9bb5'];
  for (const m of _musicasCred){
    if (!m.creditos) continue;
    linhas.push(`♪ ${m.titulo} — ${m.creditos}`); tams.push(.30); cores.push('#6f7f96');
  }
  for (const t of _trilhasCred){
    if (!t.creditos) continue;
    linhas.push(`♪ ${t.titulo} — ${t.creditos}`); tams.push(.30); cores.push('#6f7f96');
  }
  painelCreditos.userData.pintar(linhas, { fundo:false, tams, cores });
}
atualizarCreditos();

function abrirCreditos(){ mostrar('creditos'); }

/* ---- 'jogo': o que o jogador precisa no meio da partida ----------------- */
const grupoJogo = new THREE.Group(); grupoJogo.name = 'jogo-vr'; uiVR.add(grupoJogo);

/* À DIREITA, na altura dos painéis, e não no centro: o centro é por onde a
   baqueta desce. Um botão no caminho da mão seria acertado sem querer — e
   ainda tamparia a bateria, que é o que o jogador precisa ver. */
const btPular = botao('Pular ›', .68, .20, disparar('pular'), .54);
btPular.position.set(1.38, 1.80, -2.05); grupoJogo.add(btPular);

const btSair = botao('Sair', .68, .18, disparar('sair'), .50);
btSair.position.set(1.38, 1.56, -2.05); grupoJogo.add(btSair);

/* ---- 'cal': a calibragem, que empresta o painel do meio -----------------
   A contagem e o resultado da medição são desenhados no `painelCentro`
   (ui.js → calibragem3D), que fica em z=−2,30 — ATRÁS do menu, que está em
   z=−2,00. Deixar os dois ligados esconderia a medição justamente atrás dos
   botões. Então o menu sai e fica só uma saída, no mesmo lugar em que o
   resultado de partida põe as suas. É o equivalente 3D do modal de HTML
   "Ajustes", que também cobre a tela e tem um Fechar. */
const grupoCal = new THREE.Group(); grupoCal.name = 'cal-vr'; uiVR.add(grupoCal);
const btFecharCal = botao('Fechar', .78, .20, disparar('fecharCal'), .50);
btFecharCal.position.set(0, 1.02, -2.28); grupoCal.add(btFecharCal);

/* ---- 'fim': sob o painel de resultado ------------------------------------ */
const grupoFim = new THREE.Group(); grupoFim.name = 'fim-vr'; uiVR.add(grupoFim);

/* O `painelCentro` do resultado é 1,62 × 1,04 em y=1,72 — ou seja, sua borda
   de baixo está em 1,20. Os botões ficam logo abaixo dela, e no mesmo z, para
   os dois lerem como uma coisa só. */
const btDeNovo = botao('Jogar de novo', .78, .20, disparar('denovo'), .50);
btDeNovo.position.set(-.42, 1.05, -2.28); grupoFim.add(btDeNovo);

const btMenu = botao('Menu', .78, .20, disparar('menu'), .50);
btMenu.position.set(.42, 1.05, -2.28); grupoFim.add(btMenu);

/* ------------------------------------------------------- visibilidade ---- */

let _tela = null;          // 'menu' | 'jogarLista' | 'livre' | 'creditos' | 'jogo' | 'fim' | 'cal' | null
let _pular = false;        // o PULAR só existe nas fases 0 e 1

/* 16/09 — O PAINEL 3D VIRA A TELA PADRÃO DO PC, não só do headset. Até aqui
   `_forcar` só existia para depuração (`forcarForaDoVR(true)` no console) e
   começava desligado. Agora começa LIGADO por padrão: quem abre o jogo pelo
   navegador já vê o mesmo menu de quem está de headset — JOGAR, Modo livre,
   Créditos, Calibrar — apontado e clicado com o mouse (ver a seção do mouse,
   mais abaixo), em vez da tela antiga em HTML.

   `?menu2d=1` na URL volta ao comportamento antigo (tela HTML, painel 3D
   escondido fora do VR) — é o que `ferramentas/teste-jogo.mjs` usa, porque
   ainda automatiza clicando em botões de HTML (`#btn-jogar` etc.), que
   ficam escondidos quando o painel 3D está no comando (ver `ui.js`). */
let _forcar = new URLSearchParams(location.search).get('menu2d') !== '1';

/** Nada disto aparece fora do VR: no navegador o mesmo papel é do HTML, e
 *  desenhar os dois deixaria a tela com dois menus empilhados. */
function aplicar(){
  const emVR = renderer.xr.isPresenting || _forcar;
  grupoMenu.visible       = emVR && _tela === 'menu';
  grupoJogarLista.visible = emVR && _tela === 'jogarLista';
  grupoLivre.visible      = emVR && _tela === 'livre';
  grupoCreditos.visible   = emVR && _tela === 'creditos';
  grupoJogo.visible       = emVR && _tela === 'jogo';
  grupoFim.visible        = emVR && _tela === 'fim';
  grupoCal.visible        = emVR && _tela === 'cal';
  btPular.visible = _pular;
  atualizarSubtelaJogar();
  if (!grupoMenu.visible && !grupoJogarLista.visible && !grupoLivre.visible
      && !grupoCreditos.visible && !grupoJogo.visible && !grupoFim.visible
      && !grupoCal.visible) limparFoco();
}

/** @param {'menu'|'jogarLista'|'livre'|'creditos'|'jogo'|'fim'|'cal'|null} qual */
export function mostrar(qual){
  /* Reabrir o Jogar nunca pode deixar a dificuldade de uma visita anterior
     no ar — sem isto, sair no meio da escolha e voltar mostraria a tela
     errada até tocar em "Voltar" duas vezes. */
  if (qual === 'jogarLista') _musicaEscolhida = null;
  _tela = qual;
  aplicar();
  /* O menu principal acabou de abrir: o painel de recordes pede os números de
     novo (uma partida pode ter acabado de mudar o pódio). O que faz isso é o
     main.js — importar a API daqui fecharia um ciclo, como as outras ações. */
  if (qual === 'menu') disparar('menuAberto')();
}
export function mostrarPular3D(v){ _pular = !!v; aplicar(); }
export function telaAtual(){ return _tela; }

/** Verdadeiro quando o painel 3D é quem manda fora do VR (o padrão, desde
 *  16/09, a menos que `?menu2d=1` esteja na URL). `ui.js` usa isto para
 *  saber se o card de HTML equivalente (tela-inicio, tela-livre, tela-fim)
 *  deve ficar escondido, em vez de empilhado por cima do painel 3D — os
 *  dois cobrindo a tela ao mesmo tempo escondem um ao outro. */
export function painelAtivoForaDoVR(){ return _forcar; }

/* ============================ O PONTEIRO =================================
   Um raio por controle. Ele NÃO fica sempre ligado: durante a partida
   apareceria atravessando a bateria a cada movimento de braço. A regra é

     - menu, carrossel, créditos ou resultado abertos → raio sempre visível
     - partida em curso                                → raio só quando aponta

   O custo é um raycast contra no máximo uma dúzia de planos por controle,
   por quadro. Insignificante ao lado dos 357 mil triângulos da cena.

   15/09 — O ARRASTO. O cartão do carrossel é ao mesmo tempo um BOTÃO (tocar
   escolhe o item) e uma ÁREA DE ARRASTO (segurar o gatilho e mover o
   controle para o lado troca de página). As duas coisas não podem disparar
   juntas: apertar o gatilho de leve, sem mover, tem de ESCOLHER; apertar e
   arrastar tem de TROCAR DE PÁGINA e não escolher nada por engano.

   A saída foi atrasar a ação: um cartão com `userData.arrastavel` não
   dispara no `selectstart` (a pressão) como todo outro botão — só guarda o
   ponto em que o raio tocou o cartão. A cada quadro, enquanto o gatilho
   segue pressionado, mede-se o quanto esse ponto andou; passado um limiar,
   isso já é arrasto, a página vira e a escolha fica cancelada para aquele
   toque. Se o gatilho solta antes de cruzar o limiar, foi um toque — e só
   aí a ação do cartão dispara, no `selectend`. */

const CURSOR = new THREE.Mesh(
  new THREE.SphereGeometry(.012, 10, 10),
  new THREE.MeshBasicMaterial({ color:0xffffff, depthTest:false }));
CURSOR.renderOrder = 10; CURSOR.visible = false; uiVR.add(CURSOR);

const ponteiros = baquetas.map(b => {
  const geo = new THREE.BufferGeometry().setFromPoints(
    [new THREE.Vector3(0,0,0), new THREE.Vector3(0,0,-1)]);
  const linha = new THREE.Line(geo, new THREE.LineBasicMaterial({
    color:0x00d9ff, transparent:true, opacity:.7 }));
  linha.name = 'ponteiro';
  linha.visible = false;
  b.ctrl.add(linha);
  return { ctrl:b.ctrl, linha, alvo:null, baqueta:b, arrasto:null };
});

const _m = new THREE.Matrix4();
const _ray = new THREE.Raycaster();
_ray.far = 8;
let _focado = null;

/** Aponta `_ray` a partir do controle `p`, na direção que ele mira. Usado
 *  todo quadro (foco) e também ao apertar o gatilho sobre um alvo
 *  arrastável (ponto inicial do arrasto). */
function raioDoControle(p){
  _m.identity().extractRotation(p.ctrl.matrixWorld);
  _ray.ray.origin.setFromMatrixPosition(p.ctrl.matrixWorld);
  _ray.ray.direction.set(0, 0, -1).applyMatrix4(_m);
  return _ray;
}

function limparFoco(){
  if (_focado){ _focado.userData.foco = false; _focado.userData.repintar(); _focado = null; }
  for (const p of ponteiros){ p.linha.visible = false; p.alvo = null; p.arrasto = null; }
  CURSOR.visible = false;
}

/** Empilha em `r` este objeto (se tiver ação e estiver visível) e desce
 *  recursivamente pelos filhos. Existe porque o menu tem profundidades
 *  diferentes: os botões do menu principal são filhos diretos do grupo,
 *  mas o carrossel do Jogar fica um nível mais fundo (`jogarLista → subLista
 *  → carrossel → botão`) que o do modo livre e da dificuldade — uma busca
 *  de profundidade fixa (como esta função tinha até 16/09) inclui uns e
 *  esquece outros silenciosamente, sem erro nenhum: o botão só nunca
 *  responde a clique ou gatilho. Parar em `!obj.visible` também é o que
 *  respeita `subLista.visible`/`subDificuldade.visible`
 *  (`atualizarSubtelaJogar`): a metade escondida do carrossel do Jogar não
 *  pode virar alvo só porque o grupo de fora está visível. */
function coletarAlvos(obj, r){
  if (!obj.visible) return;
  if (obj.userData?.acao) r.push(obj);
  for (const filho of obj.children) coletarAlvos(filho, r);
}

function alvosVisiveis(){
  const r = [];
  for (const g of [grupoMenu, grupoJogarLista, grupoLivre, grupoCreditos,
                    grupoJogo, grupoFim, grupoCal]){
    if (!g.visible) continue;
    for (const o of g.children) coletarAlvos(o, r);
  }
  return r;
}

/** O limiar de arrasto, em metros no plano do cartão. O cartão do carrossel
 *  tem 1,30 m de largura — um pouco menos de um sexto disso já é um gesto
 *  claro de "para o lado" e ainda cabe num movimento de pulso, sem precisar
 *  esticar o braço. */
const LIMIAR_ARRASTO = .12;

/** Uma vez por quadro, dentro da sessão VR. */
export function atualizarPonteiros(){
  const alvos = alvosVisiveis();
  if (!alvos.length){ limparFoco(); return; }

  /* Com qualquer tela de menu aberta o raio fica visível mesmo sem acertar
     nada: é o único jeito de o jogador descobrir para onde está apontando.
     Só a partida em curso (`grupoJogo`) esconde o raio por padrão. */
  const sempre = grupoMenu.visible || grupoJogarLista.visible || grupoLivre.visible
              || grupoCreditos.visible || grupoFim.visible || grupoCal.visible;
  let novo = null, melhorDist = Infinity;

  for (const p of ponteiros){
    const ray = raioDoControle(p);
    const hit = ray.intersectObjects(alvos, false)[0];

    p.alvo = hit ? hit.object : null;
    p.linha.visible = !!hit || sempre;
    p.linha.scale.z = hit ? hit.distance : 3.2;
    p.linha.material.opacity = hit ? .95 : .35;

    if (hit && hit.distance < melhorDist){ melhorDist = hit.distance; novo = hit.object; }
    if (hit){ CURSOR.position.copy(hit.point); CURSOR.visible = true; }

    /* O arrasto em curso — ver a nota grande no topo desta seção. Mede-se
       contra o MESMO alvo que começou o gesto, não contra `hit`: enquanto
       o gatilho está pressionado o jogador pode escorregar para fora do
       cartão sem que o arrasto pare de ser acompanhado. */
    if (p.arrasto && !p.arrasto.moveu){
      const hitArrasto = ray.intersectObject(p.arrasto.alvo, false)[0];
      if (hitArrasto){
        const dx = hitArrasto.point.x - p.arrasto.xIni;
        if (Math.abs(dx) > LIMIAR_ARRASTO){
          p.arrasto.moveu = true;
          /* Arrastar para a ESQUERDA (dx negativo) revela a PRÓXIMA página,
             do mesmo jeito que um carrossel de app de celular. */
          p.arrasto.alvo.userData.onArrastar?.(dx < 0 ? 1 : -1);
          vibrar(p, .35, 15);
        }
      }
    }
  }
  if (!novo) CURSOR.visible = false;

  if (novo !== _focado){
    if (_focado){ _focado.userData.foco = false; _focado.userData.repintar(); }
    _focado = novo;
    if (_focado){
      _focado.userData.foco = true; _focado.userData.repintar();
      /* Um toque curto ao entrar no botão. Em VR o retorno tátil é o que
         substitui o "clique" que o dedo espera de uma interface. */
      for (const p of ponteiros) if (p.alvo === _focado) vibrar(p, .25, 12);
    }
  }
}

function vibrar(p, forca, ms){
  const i = ponteiros.indexOf(p);
  renderer.xr.getSession()?.inputSources?.[i]
    ?.gamepad?.hapticActuators?.[0]?.pulse?.(forca, ms);
}

/* O GATILHO. `selectstart` é o evento do three para o gatilho de qualquer
   controle de WebXR, e vale também para mão rastreada (pinça) — de graça.
   Só age se AQUELE controle estiver apontando para um botão: apertar o
   gatilho no meio da música, sem mirar, não pode fazer nada.

   Alvo ARRASTÁVEL não dispara aqui — ver a nota grande da seção do ponteiro.
   Guarda só o ponto inicial; a ação, se for um toque e não um arrasto,
   dispara no `selectend`, abaixo. */
for (const p of ponteiros){
  p.ctrl.addEventListener('selectstart', () => {
    const alvo = p.alvo;
    if (!alvo || !alvo.visible) return;
    if (alvo.userData.arrastavel){
      const hit = raioDoControle(p).intersectObject(alvo, false)[0];
      p.arrasto = { alvo, xIni: hit ? hit.point.x : 0, moveu:false };
      return;
    }
    vibrar(p, .6, 25);
    alvo.userData.acao?.();
  });
  p.ctrl.addEventListener('selectend', () => {
    const arrasto = p.arrasto;
    p.arrasto = null;
    if (!arrasto || arrasto.moveu) return;      // foi arrasto — já tratado
    if (arrasto.alvo.visible){                  // foi um toque — escolhe
      vibrar(p, .6, 25);
      arrasto.alvo.userData.acao?.();
    }
  });
}

/* ---------------------------------------- MOUSE, FORA DO VR ---------------
   16/09 — até aqui `forcarForaDoVR(true)` só desenhava os painéis no
   monitor; nada respondia ao mouse, porque `selectstart`/`selectend` são
   eventos de controle XR e não disparam fora de uma sessão. Isto é o
   equivalente de mouse do bloco do gatilho acima: mesmo raycast (agora a
   partir da CÂMERA e da posição do cursor na tela, não do controle), mesmo
   foco/realce ao passar por cima, e o mesmo gesto de arrasto do carrossel —
   `mousedown` guarda o ponto inicial, `mousemove` mede o quanto andou e
   troca de página passado o limiar, `mouseup` dispara a ação só se não
   virou arrasto. Só faz alguma coisa fora de uma sessão XR — dentro do
   headset o ponteiro segue sendo só dos controles. */
const _mouseNDC = new THREE.Vector2();
const _rayMouse = new THREE.Raycaster();
_rayMouse.far = 8;
let _focoMouse = null;
let _arrastoMouse = null;

function _ndcDoEvento(ev){
  const rect = renderer.domElement.getBoundingClientRect();
  _mouseNDC.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
  _mouseNDC.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
}

renderer.domElement.addEventListener('mousemove', ev => {
  if (renderer.xr.isPresenting) return;
  _ndcDoEvento(ev);
});

renderer.domElement.addEventListener('mousedown', ev => {
  if (renderer.xr.isPresenting || ev.button !== 0) return;
  _ndcDoEvento(ev);
  _rayMouse.setFromCamera(_mouseNDC, camera);
  const hit = _rayMouse.intersectObjects(alvosVisiveis(), false)[0];
  if (!hit || !hit.object.visible) return;
  const alvo = hit.object;
  if (alvo.userData.arrastavel){
    _arrastoMouse = { alvo, xIni: hit.point.x, moveu:false };
    return;
  }
  alvo.userData.acao?.();
});

renderer.domElement.addEventListener('mouseup', ev => {
  if (renderer.xr.isPresenting || ev.button !== 0) return;
  const arrasto = _arrastoMouse;
  _arrastoMouse = null;
  if (!arrasto || arrasto.moveu) return;         // foi arrasto — já tratado
  if (arrasto.alvo.visible) arrasto.alvo.userData.acao?.();
});

/** Uma vez por quadro, fora da sessão VR (o espelho de `atualizarPonteiros`
 *  para o mouse). Cuida do realce ao passar por cima, do cursor da página e
 *  do arrasto do carrossel em andamento. Só o main.js chama isto, no laço
 *  de fora do `if (renderer.xr.isPresenting)`. */
export function atualizarPonteiroMouse(){
  if (renderer.xr.isPresenting) return;
  const alvos = alvosVisiveis();
  if (!alvos.length){
    if (_focoMouse){ _focoMouse.userData.foco = false; _focoMouse.userData.repintar(); _focoMouse = null; }
    renderer.domElement.style.cursor = '';
    return;
  }

  _rayMouse.setFromCamera(_mouseNDC, camera);
  const hit = _rayMouse.intersectObjects(alvos, false)[0];
  const alvo = hit ? hit.object : null;

  if (alvo !== _focoMouse){
    if (_focoMouse){ _focoMouse.userData.foco = false; _focoMouse.userData.repintar(); }
    _focoMouse = alvo;
    if (_focoMouse){ _focoMouse.userData.foco = true; _focoMouse.userData.repintar(); }
  }
  renderer.domElement.style.cursor = alvo ? 'pointer' : '';

  /* O arrasto em curso — mesma lógica do bloco do gatilho, contra o MESMO
     alvo que começou o gesto, não contra `hit`. */
  if (_arrastoMouse && !_arrastoMouse.moveu){
    const hitArrasto = _rayMouse.intersectObject(_arrastoMouse.alvo, false)[0];
    if (hitArrasto){
      const dx = hitArrasto.point.x - _arrastoMouse.xIni;
      if (Math.abs(dx) > LIMIAR_ARRASTO){
        _arrastoMouse.moveu = true;
        _arrastoMouse.alvo.userData.onArrastar?.(dx < 0 ? 1 : -1);
      }
    }
  }
}

/** Liga as ações. Fica no main.js, que é quem já conhece `iniciar`,
 *  `pularTutorial` e companhia — importá-las aqui fecharia um ciclo
 *  (fases.js → ui.js → menu3d.js → fases.js). */
export function definirAcoes(mapa){ Object.assign(acoes, mapa); }

/** Chamado ao entrar e ao sair da sessão: a visibilidade depende de estar em
 *  VR, e o `isPresenting` só muda depois do evento. */
export function revisar(){ aplicar(); }

/** Desenha os painéis fora da sessão VR, onde eles normalmente não existem —
 *  para conferir texto e alinhamento sem colocar o headset, ou para jogar
 *  pelo navegador mesmo. Desde 16/09 o mouse também aponta e clica (ver
 *  `atualizarPonteiroMouse`, mais acima) — isto não é só visual, os botões
 *  respondem de verdade. Continua não substituindo o teste no Quest: o
 *  arrasto e o realce por toque só existem lá. */
export function forcarForaDoVR(v){ _forcar = !!v; aplicar(); }

aplicar();
