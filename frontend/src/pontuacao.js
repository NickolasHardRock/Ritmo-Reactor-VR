/* ============================================================================
   pontuacao.js — o modelo de pontuação, e só ele.

   POR QUE UM ARQUIVO SÓ PARA ISSO. Antes a regra morava espalhada: um
   `pontuar(20)` na fase 1, um `pontuar(Math.round(25 * mult))` na fase 3, e
   uma constante `PONTOS_ALVO = 900` no config decidindo o que era "vencer".
   Cada fase pontuava numa escala própria, e a soma só fazia sentido por
   acidente — bastou a carta de ritmo crescer de 133 para 505 notas para o
   alvo virar piada, atingido nos primeiros vinte segundos.

   Aqui não há dependência de DOM nem de Three.js: são funções puras sobre
   números. É o que permite conferir a regra rodando `node` e sem abrir uma
   janela 3D — e é o que a documentação aponta em RN04.

   AS TRÊS MEDIDAS, E POR QUE SÃO TRÊS.

   1. PRECISÃO (0..100%) — a média da qualidade das jogadas. Não depende do
      tamanho da carta: 90% numa carta de 40 notas é a mesma coisa que 90%
      numa de 500. É a medida JUSTA, e é dela que saem as estrelas.

   2. PONTOS — precisão vezes o multiplicador de sequência, acumulado. Aqui
      o tamanho da carta ENTRA de propósito: pontos medem o quanto você
      jogou bem, e uma música mais longa rende mais. É a medida de PLACAR,
      a que vale para o ranking.

   3. MULTIPLICADOR (x1..x4) — sobe de dez em dez acertos seguidos e volta a
      x1 no primeiro erro. É a medida do MOMENTO: é ela que faz doer errar a
      trigésima nota seguida, e é ela que fica na barra da tela.

   Uma medida só não daria conta das três perguntas. Precisão sozinha não
   cria tensão; pontos sozinhos punem quem escolhe a música curta; o
   multiplicador sozinho não diz como foi a partida.
   ========================================================================== */

/* Valor de uma jogada julgada. Cem para o acerto cheio faz a precisão sair
   direto em porcentagem, sem conversão no meio do caminho. */
export const PERFEITO = 100;
export const BOM      = 50;
export const ERRADO   = 0;

/* Em que combo cada degrau do multiplicador abre. Dez é curto o bastante
   para o jogador iniciante ver o x2 na primeira música, e longo o bastante
   para o x4 ser conquista. */
export const DEGRAUS  = [10, 20, 30];
export const MULT_MAX = DEGRAUS.length + 1;

/* Fechar uma rodada de eco não é uma jogada julgada — é um objetivo cumprido.
   Entra como bônus: soma pontos e NÃO entra na média da precisão. */
export const BONUS_RODADA = 200;

/* Precisão mínima para cada quantidade de estrelas, de 5 para 1. O primeiro
   degrau é 95 e não 100 porque exigir perfeição absoluta para a nota máxima
   transforma a quinta estrela em sorte, não em habilidade. */
export const CORTES_ESTRELA = [95, 85, 70, 50, 1];

/** Multiplicador para um dado combo. */
export function multiplicador(combo){
  let m = 1;
  for (const d of DEGRAUS) if (combo >= d) m++;
  return Math.min(m, MULT_MAX);
}

/** Quanto falta, de 0 a 1, para o próximo degrau. No topo devolve 1 — a
 *  barra cheia é a leitura certa de "não tem mais para onde subir". */
export function progressoDoDegrau(combo){
  const anterior = DEGRAUS.filter(d => combo >= d).pop() ?? 0;
  const proximo  = DEGRAUS.find(d => combo < d);
  if (proximo === undefined) return 1;
  return (combo - anterior) / (proximo - anterior);
}

/** Pontos que uma jogada vale, já com o multiplicador. */
export function valorDaJogada(qualidade, combo){
  return qualidade * multiplicador(combo);
}

/** Precisão em %, ponderada: um BOM vale metade de um PERFEITO.
 *
 *  A versão anterior contava acerto como acerto e pronto, então uma partida
 *  toda em BOM aparecia como 100% — e o jogador não tinha como saber que
 *  havia margem para melhorar. */
export function precisaoPonderada(perfeitas, boas, erros){
  const julgadas = perfeitas + boas + erros;
  if (!julgadas) return 0;
  return Math.round((perfeitas * PERFEITO + boas * BOM) / (julgadas * PERFEITO) * 100);
}

/** Estrelas, de 0 a 5, a partir da precisão. */
export function estrelas(precisao){
  for (let i = 0; i < CORTES_ESTRELA.length; i++)
    if (precisao >= CORTES_ESTRELA[i]) return CORTES_ESTRELA.length - i;
  return 0;
}

/** As estrelas desenhadas, para telas e para o painel 3D do VR. */
export function estrelasEmTexto(n){
  return '★'.repeat(n) + '☆'.repeat(5 - n);
}

/** A frase de fechamento. Sem reator, o fim da partida precisa de uma
 *  leitura própria — e ela vem da precisão, não de uma meta de pontos que
 *  cada carta atingiria num tamanho diferente. */
export function veredito(n){
  return [
    { titulo:'Sem ritmo ainda',   sub:'Nenhuma jogada entrou no tempo. Tente o nível Fácil.' },
    { titulo:'Deu para ouvir',    sub:'A levada aparece de vez em quando. Insista no mesmo trecho.' },
    { titulo:'Está saindo',       sub:'Metade da levada já está no lugar.' },
    { titulo:'Bem tocado',        sub:'A música se sustenta do começo ao fim.' },
    { titulo:'Muito bem tocado',  sub:'Quase tudo no tempo, e sequências longas.' },
    { titulo:'Impecável',         sub:'Precisão de baterista. Nada a corrigir.' },
  ][n];
}
