/* ============================================================================
   fases.js — as regras do jogo. Três desafios de tipos diferentes (RF07),
   a pontuação (RF08) e a conclusão (RF09).

   Regras de negócio que moram aqui:
     RN02 — cada desafio concluído gera uma quantidade determinada de pontos
     RN03 — um desafio não é contabilizado duas vezes
     RN05 — toda interação válida gera retorno visual
     RN06 — o sistema informa quando a interação não é permitida
     RN07 — o resultado só é registrado depois da conclusão
   ========================================================================== */

import * as THREE from 'three';
import { PECAS, PORID, CARTA_URL,
         NIVEIS, nivelAtual, jogaveisAgora } from './config.js';
import { musica, notasDoRecorte } from './musica.js';
import { registrarBatida } from './calibragem.js';
import { carregarBichos, desenharBichos, limparBichos,
         ANTECEDENCIA_BICHO } from './bichos.js';
import { jogo, cal, eco, ritmo, FASES, reiniciarEstado } from './estado.js';
import { synth } from './synth.js';
import { pistaG, relogio, definirLuz } from './cena.js';
import { zonas, mostrarRotulos, destacar } from './kit.js';
import { msg, julgamento, atualizarHUD, objetivo,
         telaJogando, telaResultado, mostrarCreditos,
         esconderResultado3D, avisoCentro, mostrarPular } from './ui.js';
import { enviarResultado } from './api.js';
import { baterPeca, acalmarBalanco } from './balanco.js';
import { PERFEITO, BOM, ERRADO, BONUS_RODADA,
         valorDaJogada } from './pontuacao.js';

/* --------------------------------------------------------- pontuação -----
   Duas entradas, e a diferença entre elas é o que mantém a precisão honesta.

   `marcar` é para JOGADA JULGADA: acertou no tempo, acertou torto, ou errou.
   Conta na média da precisão e mexe no combo.

   `bonus` é para OBJETIVO CUMPRIDO — fechar uma rodada de eco, por exemplo.
   Soma pontos e fica FORA da média: não é uma batida, e contá-la como
   batida perfeita inflaria a precisão de quem só chegou até a fase 2.

   A regra em si está em `pontuacao.js` (RN04); aqui só se aplica.          */
function marcar(qualidade){
  if (qualidade === ERRADO){
    jogo.combo = 0;
    jogo.erros++;
  } else {
    jogo.combo++;
    jogo.comboMax = Math.max(jogo.comboMax, jogo.combo);
    jogo.pontos += valorDaJogada(qualidade, jogo.combo);
    if (qualidade === PERFEITO) jogo.perfeitas++; else jogo.boas++;
  }
  atualizarHUD();
}
function bonus(n){ jogo.pontos += n; atualizarHUD(); }

/* ============================== A BATIDA ==================================
   Ponto único de entrada: venha do VR (baqueta), do teclado ou do mouse,
   toda batida passa por aqui. É o que garante que as três formas de jogar
   sigam exatamente as mesmas regras.                                      */
export function bater(zona, força = .8){
  const p = zona.p;
  synth.tocar(p.som, força);
  /* ANTES do desvio da calibragem e antes de julgar: peça de verdade se mexe
     quando é batida, não quando o jogo aprova a nota. */
  baterPeca(p.id, força);
  /* Durante a calibragem a batida é a amostra, não jogada. Aceitar baqueta
     importa: a latência dentro do headset é outra, e é lá que se joga. */
  if (registrarBatida()) return;
  zona.brilho = 1;                       // RN05 — retorno visual
  zona.disco.material.opacity = .55;

  if (!jogo.ativo || jogo.livre) return;
  if      (jogo.fase === 0) calibracaoBatida(p);
  else if (jogo.fase === 1) ecoBatida(p);
  else                      ritmoBatida(p);
}

/* ====================== FASE 1 — CALIBRAÇÃO ===============================
   Ensina a bateria: o jogo pede uma peça, o jogador acerta. Serve de
   tutorial sem parecer tutorial.                                          */
function calibracaoIniciar(){
  cal.fila = PECAS.map(p => p.id).sort(() => Math.random() - .5);
  calibracaoProxima();
}
function calibracaoProxima(){
  cal.atual = cal.fila.shift();
  if (!cal.atual){ proximaFase(); return; }
  const p = PORID[cal.atual];
  objetivo(`Acerte: ${p.nome.toUpperCase()}`, '#' + p.cor.toString(16).padStart(6,'0'));
  destacar(cal.atual);
}
function calibracaoBatida(p){
  if (p.id === cal.atual){
    marcar(PERFEITO);
    julgamento('OK', '#3ddc97');
    destacar(null);
    calibracaoProxima();
  } else {
    marcar(ERRADO);                                // RN06
    julgamento('ERRADO', '#ff4d6d');
    synth.tocar('erro', .6);
    atualizarHUD();
  }
}

/* ============================ FASE 2 — ECO ================================
   O jogo toca um padrão, o jogador repete. Memória sequencial, três
   rodadas crescentes.                                                     */
const INTERVALO_ECO = 0.55;   // segundos entre notas do padrão

function ecoIniciar(){ eco.rodada = 0; ecoNovaRodada(); }

function ecoNovaRodada(){
  if (eco.rodada >= eco.tamanhos.length){ proximaFase(); return; }
  const n = eco.tamanhos[eco.rodada];
  const pool = PECAS.map(p => p.id);
  eco.padrao = [];
  while (eco.padrao.length < n){                  // sem repetir a peça anterior
    const id = pool[Math.floor(Math.random() * pool.length)];
    if (id !== eco.padrao[eco.padrao.length - 1]) eco.padrao.push(id);
  }
  eco.entrada = [];
  ecoTocarPadrao();
}

function ecoTocarPadrao(){
  eco.tocando = true;
  objetivo(`Rodada ${eco.rodada + 1}/${eco.tamanhos.length} — ouça…`, '#ffd34d');
  synth.ligar();
  // Agendado no relógio do ÁUDIO, não em setTimeout: setTimeout erra dezenas
  // de milissegundos e num jogo de ritmo isso é audível.
  const t0 = synth.agora + .5;
  eco.padrao.forEach((id, i) => {
    synth.tocar(PORID[id].som, .9, t0 + i*INTERVALO_ECO);
    // o brilho visual acompanha; aí sim setTimeout serve, é só estética
    setTimeout(() => {
      const z = zonas.find(z => z.p.id === id);
      z.brilho = 1; z.disco.material.opacity = .6; destacar(id);
    }, (t0 - synth.agora + i*INTERVALO_ECO) * 1000);
  });
  setTimeout(() => {
    eco.tocando = false; destacar(null);
    objetivo('Sua vez — repita', '#00d9ff');
  }, (t0 - synth.agora + eco.padrao.length*INTERVALO_ECO + .35) * 1000);
}

function ecoBatida(p){
  if (eco.tocando){ msg('Espere o padrão terminar.', 'bad', 1.2); return; }
  const esperado = eco.padrao[eco.entrada.length];
  if (p.id !== esperado){                          // RN06
    marcar(ERRADO);
    julgamento('ERRADO', '#ff4d6d');
    synth.tocar('erro', .7);
    eco.entrada = [];
    msg('Sequência quebrada — ouça de novo.', 'bad');
    atualizarHUD();
    setTimeout(ecoTocarPadrao, 900);
    return;
  }
  eco.entrada.push(p.id);
  marcar(PERFEITO);
  julgamento('OK', '#3ddc97');
  if (eco.entrada.length === eco.padrao.length){
    eco.rodada++; bonus(BONUS_RODADA); synth.tocar('nivel');
    msg(`Rodada ${eco.rodada}/${eco.tamanhos.length} concluída  +40`, 'gold');
    setTimeout(ecoNovaRodada, 1100);
  }
}

/* =========================== FASE 3 — RITMO ===============================
   As notas descem por faixas até a linha do alvo. O que manda aqui é o
   relógio da MÚSICA (musica.tempo), não o de render nem `setTimeout`: os
   dois derrapam dezenas de milissegundos e o jogador ouve a diferença.

   Todos os tempos — das notas e do relógio — são segundos ABSOLUTOS da
   faixa. Ter uma escala de tempo só, em vez de converter para "tempo de
   recorte", elimina uma classe inteira de bug de meio compasso.

   A trilha AUTOMÁTICA é o bumbo. O Quest não rastreia os pés, então ele não
   é tocável; mas numa levada de rock o bumbo é metade da música, e sem ele
   a coisa fica irreconhecível. Então o jogo toca. Ela é agendada com
   antecedência no relógio do áudio, nunca disparada no quadro — agendar é o
   que garante que caia no lugar mesmo se o render engasgar.               */

const JANELA_PERFEITO = .09, JANELA_BOM = .24, JANELA_PERDA = .26;
/* Multiplicadas pelo nível escolhido — ver NIVEIS em config.js. */
let JP = JANELA_PERFEITO, JB = JANELA_BOM, JX = JANELA_PERDA;

/* Espera antes de o som entrar, para as primeiras notas já estarem descendo
   quando a música começa. Sem isto a primeira nota nasce em cima da linha. */
const ESPERA_INICIAL = ANTECEDENCIA_BICHO + 0.8;

/* A trilha automática é agendada TODA DE UMA VEZ, no início da fase, e não
   quadro a quadro.

   Agendar por quadro parece mais econômico e está errado: `requestAnimationFrame`
   congela quando a aba sai de foco ou o jogador tira o headset, e aí o bumbo
   simplesmente para e não volta. Já o relógio do áudio continua andando — a
   música seguiria sem a levada.

   São umas dezenas de notas por música; o Web Audio agenda isso sem suar. O
   preço é ter de guardar as fontes para poder cancelar se a fase reiniciar. */

/* A pista distante deixou de ser usada: quem indica a nota agora é o bicho
   que desce sobre a própria peça (ver bichos.js). O grupo continua existindo
   porque as placas de VR moram nele — só as faixas e a linha de alvo saíram. */
function montarPista(){
  if (ritmo.construido) return;
  for (let i = 0; i < PECAS.length; i++) PECAS[i]._faixaX = 0;
  ritmo.construido = true;
}

function limparNotas(){
  pararAuto();
  limparBichos();          // zera o count das sete malhas: nada a descartar
  ritmo.notas = [];
}

export async function ritmoIniciar(){
  limparNotas();                       // senão vazam malhas a cada replay
  montarPista();

  /* Dificuldade: rala as peças de marcação e alarga as janelas. Feito aqui,
     na hora de tocar, e não na carta — assim a mesma carta serve para os dois
     níveis e trocar de nível não exige reconverter nada. */
  const nivel = NIVEIS[nivelAtual()] || NIVEIS.normal;
  /* A lista de peças do jogador sai daqui, e não de `nivel.jogaveis` direto,
     porque a chave `?sem=` do config pode substituí-la. A `janela` continua
     vindo do nível: a chave escolhe QUAIS peças, não a dificuldade. */
  const jog = jogaveisAgora(nivel);
  JP = JANELA_PERFEITO * nivel.janela;
  JB = JANELA_BOM      * nivel.janela;
  JX = JANELA_PERDA    * nivel.janela;

  let recorte;
  try {
    const carta = await musica.carregarCarta(CARTA_URL);
    recorte = notasDoRecorte(carta);
    /* SÓ O NOME DA FAIXA. O painel dizia também quais peças tocar ("— toque
       só a CAIXA") ou o nome do nível, e isso ocupava a maior parte de uma
       placa que o jogador lê de relance no meio da música. A informação não
       se perde: a peça que se deve tocar já é indicada pelo bicho que desce
       sobre o próprio tambor (ver bichos.js), que é retorno mais direto que
       texto — e o nível é escolha feita no menu, dois cliques antes.

       Isso também apaga uma armadilha: com a chave `?sem=` ligada, o rótulo
       do nível fácil anunciava "toque só a CAIXA" justamente quando a caixa
       era a única peça que o jogador NÃO tocava. */
    mostrarCreditos();
    objetivo(carta.titulo ? `♪ ${carta.titulo}` : 'Acerte no tempo', '#00d9ff');
  } catch (e){
    // Carta ou faixa faltando não pode derrubar a partida: sem a fase 3 o
    // jogador ainda tem calibração e eco, e o resultado é registrado.
    console.warn('[ritmo] carta não carregou:', e);
    msg('A fase de ritmo não pôde carregar', '#ff4d6d', 2.4);
    setTimeout(concluir, 1200);
    return;
  }

  /* O que o jogador não toca não é descartado: vira trilha automática e
     continua soando. Assim o nível fácil não deixa a música oca — ela toca
     inteira e o jogador cuida de uma parte. */
  const escolhidas = [], extras = [];
  for (const n of recorte.notas){
    if (!jog || jog.includes(n.peca)) escolhidas.push(n);
    // Um pouco mais baixas que o normal, para a batida do jogador se
    // destacar do que a máquina toca.
    else extras.push({ t:n.t, som:n.peca, forca:(n.forca ?? .7) * .8 });
  }

  ritmo.notas = escolhidas.map((n, i) => ({
    t: n.t, id: n.peca, forca: n.forca ?? .85, julgada: false,
    /* Semente por nota: sem ela todos os bichos flutuariam em uníssono,
       o que lê como enfeite em vez de bicho. */
    semente: (i * 2.399963) % 6.283,
  }));
  ritmo.auto  = recorte.auto.concat(extras).sort((a,b) => a.t - b.t);
  ritmo.iAuto = 0;
  ritmo.fim   = recorte.fim;

  musica.tocar(recorte.inicio, ESPERA_INICIAL);
  agendarAuto();
  ritmo.ativo = true;
}

/** Agenda a trilha automática inteira e guarda as fontes para cancelamento. */
function agendarAuto(){
  pararAuto();
  for (const a of ritmo.auto){
    const f = synth.tocar(a.som || 'bumbo', a.forca ?? .9, musica.quandoNoAudio(a.t));
    if (f) ritmo.fontesAuto.push(f);
  }
  ritmo.iAuto = ritmo.auto.length;
}

/** Cancela o que ainda não soou. Sem isto, reiniciar a fase deixa a trilha
 *  antiga tocando por cima da nova. */
function pararAuto(){
  for (const f of ritmo.fontesAuto){ try { f.stop(); } catch { /* já soou */ } }
  ritmo.fontesAuto = [];
  ritmo.iAuto = 0;
}

function ritmoBatida(p){
  if (!ritmo.ativo) return;
  const agora = musica.tempo;
  let alvo = null, menorDist = JB;
  for (const n of ritmo.notas){
    if (n.julgada || n.id !== p.id) continue;
    const d = Math.abs(n.t - agora);
    if (d < menorDist){ menorDist = d; alvo = n; }
  }
  if (!alvo){                                      // RN06 — bateu fora de hora
    marcar(ERRADO); julgamento('FORA', '#ff4d6d'); return;
  }
  alvo.julgada = true;                             // RN03
  /* O multiplicador não é mais calculado aqui: `marcar` o aplica a partir do
     combo, com a mesma tabela que a fase 1 e a fase 2 usam. Antes esta fase
     tinha uma escala própria (25 e 12 pontos, multiplicador contínuo até
     x2), e a soma das três fases só fazia sentido por acidente. */
  if (menorDist < JP){
    marcar(PERFEITO); julgamento('PERFEITO', '#ffd34d');
  } else {
    marcar(BOM);      julgamento('BOM', '#3ddc97');
  }
}

/** Move as notas e detecta as que passaram batido. Roda a cada quadro. */
export function ritmoAtualizar(){
  if (!ritmo.ativo) return;
  const agora = musica.tempo;
  const t = relogio.elapsedTime;
  let restantes = 0;
  const visiveis = [];

  for (const n of ritmo.notas){
    if (n.julgada) continue;
    const dt = n.t - agora;
    if (dt > ANTECEDENCIA_BICHO){ restantes++; continue; }   // ainda não nasceu
    if (dt < -JX){                                           // passou batido
      n.julgada = true;
      marcar(ERRADO); julgamento('PERDEU', '#ff4d6d');
      continue;
    }
    restantes++;
    const p = PORID[n.id];
    /* O `id` vai junto porque agora é ele que escolhe a caveira: uma por
       peça, na cor da peça (ver bichos.js). Sem ele o bicho não sabe com
       qual malha se desenhar. */
    if (p) visiveis.push({ id:n.id, x:p.x, y:p.y, z:p.z, dt, semente:n.semente });
  }
  /* Mais perto primeiro: se passar do teto de instâncias, quem cai fora é o
     bicho mais distante, que é o que menos importa agora. */
  visiveis.sort((a, b) => a.dt - b.dt);
  desenharBichos(visiveis, t);

  // Acaba quando não há mais nota E a faixa passou do fim do recorte: sem a
  // segunda condição a música seria cortada no meio do último compasso.
  if (!restantes && agora >= ritmo.fim){
    ritmo.ativo = false;
    pararAuto();
    limparBichos();
    musica.parar();
    setTimeout(concluir, 900);
  }
}

/* ======================= A ABERTURA DO SHOW ==============================
   O que separa "estou aprendendo" de "estou tocando". Chamado nos dois
   caminhos que levam ao ritmo: terminar o eco, ou apertar Pular.

   A ORDEM IMPORTA. O som de holofote e a queda da luz saem juntos, no mesmo
   instante; só depois vem a contagem. Disparar a contagem junto com o fade
   faria o "3" aparecer enquanto a cena ainda está clara, e o gesto inteiro
   perde a leitura de "apagaram as luzes, vai começar".

   `setTimeout` aqui é legítimo, ao contrário do resto do arquivo: isto é
   apresentação, não ritmo. O que não pode derrapar é a MÚSICA, e ela é
   agendada pelo relógio do áudio dentro de `ritmoIniciar()`.              */
const ESPERA_PREPARE = 1200;   // ms de "PREPARE-SE" enquanto a luz cai
const PASSO_CONTAGEM = 800;    // ms por número da contagem

export function abrirShow(){
  destacar(null);
  mostrarPular(false);
  objetivo('Prepare-se', '#e8eef8');
  synth.ligar();
  synth.tocar('holofote');
  definirLuz('show');
  avisoCentro(['PREPARE-SE'], '#e8eef8');
  setTimeout(() => contagem(3), ESPERA_PREPARE);
}

function contagem(n){
  /* Voltar ao menu no meio da contagem é possível (o botão Menu zera
     `ativo`), e sem esta guarda a música começaria sozinha por cima da tela
     inicial alguns segundos depois. */
  if (!jogo.ativo){ avisoCentro(null); return; }
  if (n <= 0){ avisoCentro(null); ritmoIniciar(); return; }
  avisoCentro([String(n), 'PREPARE-SE'], '#00d9ff');
  /* Chimbal, não um bipe: é a contagem que baterista dá, e é a mesma entrada
     que a calibragem já usa. */
  synth.tocar('chimbal', .35);
  setTimeout(() => contagem(n - 1), PASSO_CONTAGEM);
}

/** O botão Pular, e o A do controle direito em VR. Vai direto para o ritmo
 *  passando pela mesma abertura de quem terminou o tutorial — pular não é
 *  entrar pela porta de trás, é abreviar o caminho.
 *
 *  DESDE 07/09 A PARTIDA CONTINUA VALENDO PARA O RANKING. Antes o atalho
 *  ficava fora, porque era chave de teste; agora que pular é parte do fluxo,
 *  deixar fora significaria que quase ninguém ranqueia. */
export function pularTutorial(){
  if (!jogo.ativo || jogo.livre || jogo.fase >= 2) return false;
  jogo.fase = 2;
  mostrarRotulos(false);
  atualizarHUD();
  abrirShow();
  return true;
}

/* ======================== FLUXO DA PARTIDA ================================ */
function proximaFase(){
  jogo.fase++;
  if (jogo.fase >= 1) mostrarRotulos(false);       // já aprendeu as peças
  if (jogo.fase >= 3){ concluir(); return; }
  /* A entrada do ritmo não é "mais uma fase": é o show começando. Quem cuida
     do aviso, do som e do tempo é a abertura, então este caminho sai aqui e
     não cai no msg/setTimeout genérico abaixo. */
  if (jogo.fase === 2){ atualizarHUD(); abrirShow(); return; }
  synth.tocar('nivel');
  msg(`Fase ${jogo.fase + 1}: ${FASES[jogo.fase].nome}`, 'gold', 2.4);
  atualizarHUD();
  setTimeout(ecoIniciar, 1600);
}

/** RF02 — inicia uma nova partida.
 *  @param livre  modo treino: toca à vontade, sem pontuar
 *  @param direto pula calibração e eco e cai na fase de ritmo. Serve para
 *         testar a música sem jogar 40 segundos antes, e para demonstrar em
 *         sala. Uma partida assim NÃO vai para o ranking: ela pulou dois
 *         terços do jogo e a pontuação não é comparável com as completas. */
export function iniciar(livre = false, direto = false){
  reiniciarEstado(livre, direto);
  ritmo.notas.forEach(n => n.mesh && (n.mesh.visible = false));
  destacar(null);
  mostrarRotulos(true);
  acalmarBalanco();          // peça não começa a partida balançando da anterior
  /* O painel 3D de resultado não se esconde sozinho: sem isto o placar da
     partida anterior fica pendurado no ar durante a nova. */
  esconderResultado3D();
  avisoCentro(null);
  telaJogando();
  /* Toda partida começa com o MAPA CLARO, sem fade: o tutorial é para
     enxergar as sete peças. Sem o `imediato`, jogar de novo depois de uma
     partida começaria no escuro do show anterior e clarearia sozinho. */
  definirLuz('tutorial', true);
  synth.ligar();
  atualizarHUD();
  if (livre){ mostrarPular(false); objetivo('Modo livre — toque à vontade', '#8c9bb5'); return; }
  if (direto){
    jogo.fase = 2;
    mostrarRotulos(false);          // quem vem direto não está aprendendo o kit
    atualizarHUD();
    abrirShow();
    return;
  }
  mostrarPular(true);
  objetivo('Fase 1 — Calibração', '#00d9ff');
  calibracaoIniciar();
}

/** RF09/RF10 — fecha a partida, mostra o placar e só ENTÃO registra (RN07). */
export function concluir(){
  jogo.duracao = (performance.now() - jogo.t0) / 1000;
  jogo.ativo = false;
  ritmo.ativo = false;
  mostrarPular(false);
  avisoCentro(null);
  telaResultado();
  synth.tocar('nivel');
  setTimeout(() => synth.tocar('ok'), 240);
  /* RN07: só depois de concluída. E TODA partida concluída entra — inclusive
     a de quem pulou o tutorial. Até 07/09 o atalho ficava fora, porque era
     chave de teste; desde que o Pular passou a ser parte do fluxo, excluí-lo
     deixaria o ranking quase vazio. Ver docs/testes.md. */
  enviarResultado();
}
