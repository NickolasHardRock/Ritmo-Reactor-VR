/* ============================================================================
   recordes.js — O PÓDIO DE CADA MÚSICA, na tela principal.

   Junta as duas fontes que o painel precisa e as entrega aos dois desenhos:

     musicas.json   (`musicas`)  QUAIS músicas existem e como se chamam — é o
                                 dono da lista, o mesmo que alimenta o carrossel
     GET /ranking/musicas        QUEM são os três melhores em cada uma

   Cruzar os dois é o que faz uma música que ninguém jogou aparecer com "ninguém
   jogou ainda" em vez de sumir do painel, e uma música tirada do manifesto
   parar de aparecer mesmo que o banco ainda guarde partidas dela.

   Os dois desenhos são os mesmos de sempre neste jogo — HTML no navegador e
   placa 3D dentro do headset (ver ui.js, que explica por que são dois). Este
   módulo escreve nos dois de uma vez, para um não ficar para trás.

   NOME DE JOGADOR É TEXTO DIGITADO POR QUALQUER UM. No HTML entra por
   `textContent`, nunca `innerHTML`; na placa 3D vai para o canvas, que não
   interpreta marcação.
   ========================================================================== */

import { buscarRankingPorMusica } from './api.js';
import * as menu3d from './menu3d.js';

const PODIO = 3;

let _seq = 0;            // descarta resposta atrasada de uma busca anterior
let _ultimas = null;     // últimas seções vindas da API — para não piscar vazio se cair
let _musicas = [];       // o manifesto; guardado aqui para o gancho do menu não precisar dele

/** Puro, sem rede nem tela: cruza o manifesto com o que a API devolveu.
 *  @param {{id:string,titulo:string}[]} musicas  o manifesto (musicas.json)
 *  @param {{musica:string,titulo:string,itens:object[]}[]|null} daApi
 *  @returns {{id:string,titulo:string,itens:object[]}[]} */
export function montarSecoes(musicas, daApi){
  const porSlug = new Map((daApi || []).map(m => [m.musica, m]));
  if (!musicas || !musicas.length){
    // sem manifesto (não carregou): melhor mostrar o que o banco sabe do que nada
    return (daApi || []).map(m => ({ id: m.musica, titulo: m.titulo || m.musica,
                                     itens: (m.itens || []).slice(0, PODIO) }));
  }
  return musicas.map(m => ({
    id: m.id,
    titulo: m.titulo,
    itens: ((porSlug.get(m.id) || {}).itens || []).slice(0, PODIO),
  }));
}

const fmt = n => Number(n).toLocaleString('pt-BR');

/** O painel do card de HTML (navegador com `?menu2d=1`). */
function desenharHTML(secoes, offline){
  const raiz = document.getElementById('recordes-lista');
  if (!raiz) return;
  raiz.textContent = '';
  if (!secoes.length){
    const p = document.createElement('p');
    p.className = 'rec-vazio';
    p.textContent = offline ? 'ranking offline' : 'nenhuma música cadastrada';
    raiz.appendChild(p);
    return;
  }
  for (const sec of secoes){
    const bloco = document.createElement('div');
    bloco.className = 'rec-musica';
    const t = document.createElement('strong');
    t.textContent = sec.titulo;
    bloco.appendChild(t);
    if (!sec.itens.length){
      const p = document.createElement('p');
      p.className = 'rec-vazio';
      p.textContent = offline ? 'ranking offline' : 'ninguém jogou ainda';
      bloco.appendChild(p);
    } else {
      const ol = document.createElement('ol');
      for (const it of sec.itens){
        const li = document.createElement('li');
        const n = document.createElement('span'); n.textContent = it.nome;
        const p = document.createElement('b');    p.textContent = fmt(it.pontos);
        li.append(n, p);
        ol.appendChild(li);
      }
      bloco.appendChild(ol);
    }
    raiz.appendChild(bloco);
  }
}

/** Busca o pódio e redesenha os dois painéis. Nunca lança: com a API fora do
 *  ar o painel mostra o último pódio conhecido, ou "ranking offline".
 *
 *  @param musicas o manifesto (musicas.json), quando acabou de chegar. Sem o
 *         argumento vale o último recebido — é o caso do gancho "menu aberto",
 *         que roda antes do manifesto existir e não deve depender dele. */
export async function atualizarRecordes(musicas){
  if (musicas) _musicas = musicas;
  musicas = _musicas;
  const eu = ++_seq;
  const daApi = await buscarRankingPorMusica(PODIO);
  if (eu !== _seq) return;                 // uma busca mais nova já respondeu

  let secoes, offline = false;
  if (daApi){
    secoes = montarSecoes(musicas, daApi);
    _ultimas = daApi;
  } else if (_ultimas){
    secoes = montarSecoes(musicas, _ultimas);   // dados velhos valem mais que um painel vazio
  } else {
    secoes = montarSecoes(musicas, []);
    offline = true;
  }
  menu3d.definirRecordes(secoes, offline);
  desenharHTML(secoes, offline);
}
