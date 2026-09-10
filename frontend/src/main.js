/* ============================================================================
   main.js — amarra tudo: entrada do jogador, sessão VR e o laço de render.

   Ordem de leitura sugerida para quem chega agora no projeto:
     config.js    o que se ajusta
     deteccao.js  o problema técnico central do jogo
     fases.js     as regras
     este arquivo o que liga uma coisa na outra
   ========================================================================== */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { VRButton }      from 'three/addons/webxr/VRButton.js';

import { PECAS } from './config.js';
import { jogo, cal, eco, ritmo } from './estado.js';
import { scene, camera, renderer, relogio, player,
         molduraDesktop, molduraVR, registrarOrbit, ajustarVisao, ajustarAvanco,
         carregarCenario, gerarAmbienteDaCena, animarLuzes, definirLuz,
         painelHUD, painelObj, flash, flashEstado } from './cena.js';
import * as menu3d from './menu3d.js';
import { carregarBichos } from './bichos.js';
import { medir as medirDesempenho, alternarResumo } from './desempenho.js';
import * as balanco from './balanco.js';
const { animarBalanco } = balanco;
import { kit, zonas, baquetas, carregarBateria, animarZonas,
         mostrarRotulos, destacar } from './kit.js';
import { detectarBatidas, processarPonta, simularBatida, testeIngenuo } from './deteccao.js';
import { bater, iniciar, concluir, ritmoAtualizar, ritmoIniciar,
         pularTutorial, abandonar, livreIniciar } from './fases.js';
import { musica, Musica } from './musica.js';
import { synth } from './synth.js';
import * as pontuacao from './pontuacao.js';
import { iniciarCalibragem, pararCalibragem, registrarBatida,
         concluirCalibragem, calibragem } from './calibragem.js';
import { NIVEIS, nivelAtual, definirNivel, cartaAgora,
         PECAS_SEM, jogaveisAgora } from './config.js';
import { $, msg, atualizarHUD, objetivo, telaCarregada, telaInicio, telaLivre,
         statusXR, falhaCarregamento, progressoCarregamento,
         telaResultado, calibragem3D, esconderResultado3D } from './ui.js';
import { carregarTrilhas } from './trilhas.js';

/* ------------------------------------------------------ carregamento -----
   A CAPTURA DO AMBIENTE PENDURA NO FIM DO CENÁRIO, e não num tempo fixo.
   O reflexo dos pratos é feito do próprio cenário: capturar antes de ele
   estar na cena devolve um cubo do vazio, e um `setTimeout` chutado devolve
   isso de vez em quando, na máquina de alguém, sem aviso. Ver
   cena.js → gerarAmbienteDaCena(). O kit não precisa ter chegado: ele é
   justamente o que a captura esconde.                                     */
carregarCenario(() => gerarAmbienteDaCena());
carregarBichos(kit);
carregarBateria(
  (ok) => {
    if (ok){ telaCarregada(); }
    else {
      falhaCarregamento('não encontrei <b>modelos/bateria.glb</b>.<br>' +
        'As zonas de acerto continuam funcionando — só falta o visual.');
      setTimeout(telaCarregada, 2500);
    }
    window.__pronto = true;
  },
  (ev) => {
    if (!ev.lengthComputable) return;
    progressoCarregamento(ev.loaded / ev.total * 100,
      `bateria.glb — ${(ev.total / 1048576).toFixed(2)} MB`);
  },
);

/* ============================ MODO NAVEGADOR (RF13) ======================= */
const orbit = new OrbitControls(camera, renderer.domElement);
orbit.target.set(0, 1.05, 0);
orbit.enableDamping = true;
orbit.enablePan = false;
orbit.minDistance = 1.0;
orbit.maxDistance = 4.5;
orbit.maxPolarAngle = Math.PI * .52;
registrarOrbit(orbit);
molduraDesktop();

$('teclas').innerHTML =
  PECAS.map(p => `<span class="kbd">${p.tecla.replace('Key','')}</span> ${p.nome}`).join('<br>')
  + '<br><span class="kbd">[</span> <span class="kbd">]</span> altura';

/* O texto continua falando da BATERIA porque é isso que o jogador vê mudar —
   quem de fato sobe e desce é ele (ver `ajustarVisao`, em cena.js). */
function alturaMudou(a){
  msg(`Altura da bateria: ${a >= 0 ? '+' : ''}${a.toFixed(2)} m`, 'ok', 1.1);
}
/* Aqui o número é a DISTÂNCIA de verdade, em metros do centro do kit, e não
   o deslocamento: "0,53 m" diz onde você está; "+0,03" não diria nada. */
function distanciaMudou(d){
  msg(`Distância da bateria: ${d.toFixed(2)} m`, 'ok', 1.1);
}

addEventListener('keydown', e => {
  if (registrarBatida()) return;   // calibragem em curso
  if (e.repeat) return;
  if (e.code === 'BracketLeft'){  ajustarVisao(-.03, alturaMudou); return; }
  if (e.code === 'BracketRight'){ ajustarVisao(+.03, alturaMudou); return; }
  const p = PECAS.find(p => p.tecla === e.code);
  if (!p) return;
  e.preventDefault();
  bater(zonas.find(z => z.p.id === p.id), .55 + Math.random()*.35);
});

// Clique no tambor. `arrastou` separa "girar a câmera" de "bater".
const ray = new THREE.Raycaster();
const pt  = new THREE.Vector2();
let arrastou = false;
renderer.domElement.addEventListener('pointerdown', () => { arrastou = false; });
renderer.domElement.addEventListener('pointermove', () => { arrastou = true; });
renderer.domElement.addEventListener('pointerup', e => {
  if (arrastou || renderer.xr.isPresenting) return;
  pt.x =  (e.clientX / innerWidth)  * 2 - 1;
  pt.y = -(e.clientY / innerHeight) * 2 + 1;
  ray.setFromCamera(pt, camera); ray.far = 8;
  const hits = ray.intersectObjects(zonas.map(z => z.disco), false);
  if (hits.length) bater(zonas.find(z => z.disco === hits[0].object), .8);
});

/* ========================= SUPORTE A VR (RF14/RF15) =======================
   Regra de ouro: o botão de VR só aparece se o modo immersive-vr existir.
   Sem suporte, aviso claro e o jogo segue jogável no teclado (RN10).      */
(async () => {
  if (!('xr' in navigator)){
    statusXR(false, 'navegador sem WebXR — use o modo teclado');
    return;
  }
  let ok = false;
  try { ok = await navigator.xr.isSessionSupported('immersive-vr'); } catch { /* ignora */ }
  if (ok){
    statusXR(true, 'VR disponível');
    $('vr-slot').appendChild(VRButton.createButton(renderer));
  } else {
    statusXR(false, 'sem immersive-vr aqui (precisa de headset + HTTPS) — modo teclado liberado');
  }
})();

/* ENTRAR EM VR NÃO COMEÇA A PARTIDA.
   Até 08/09 este bloco terminava em `if (!jogo.ativo) iniciar(false)`: quem
   tocava em ENTER VR na tela inicial era despejado no meio da fase 1 sem ter
   escolhido nível nem calibrado nada, e sem ter visto menu nenhum. O menu
   existia — em HTML, que não aparece dentro do headset.

   Agora entrar em VR leva ao MENU, o mesmo menu, desenhado em 3D
   (menu3d.js). Quem já estava jogando no monitor e colocou o headset no meio
   da partida continua de onde estava: aí a partida existe, e interrompê-la
   seria o defeito simétrico. */
renderer.xr.addEventListener('sessionstart', () => {
  orbit.enabled = false;
  $('tela-inicio').classList.add('hidden');
  $('tela-fim').classList.add('hidden');
  $('tela-cal').classList.add('hidden');
  $('hud').classList.add('hidden'); $('teclas').classList.add('hidden');
  $('btn-pular').classList.add('hidden'); $('btn-sair').classList.add('hidden');
  baquetas.forEach(b => { b.temAnterior = false; });
  molduraVR();
  menu3d.mostrar(jogo.ativo ? 'jogo' : 'menu');
  menu3d.revisar();
});
renderer.xr.addEventListener('sessionend', () => {
  orbit.enabled = true;
  molduraDesktop();
  menu3d.revisar();              // fora do VR nada disto se desenha
  if (jogo.ativo){
    $('hud').classList.remove('hidden');
    $('teclas').classList.remove('hidden');
    $('btn-sair').classList.remove('hidden');
    if (jogo.fase < 2 && !jogo.livre) $('btn-pular').classList.remove('hidden');
  } else telaInicio();
});

/* ================================= LAÇO ==================================
   Em WebXR o laço é do renderer, NÃO requestAnimationFrame: o headset roda
   a 72–120 Hz e é ele quem dita o ritmo.                                  */
const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();
let giroPronto = true;
let avancoPronto = true;
let xPronto = true;
let aPronto = true;
let bPronto = true;

renderer.setAnimationLoop(() => {
  medirDesempenho();              // primeiro: mede o intervalo entre quadros
  const dt = Math.min(relogio.getDelta(), .05);
  const t  = relogio.elapsedTime;

  detectarBatidas(dt, bater);     // antes de qualquer outra coisa
  ritmoAtualizar();
  animarZonas(dt, t);
  animarBalanco(dt);
  animarLuzes(dt);                // transição tutorial → show, quando há uma

  camera.getWorldPosition(_v);
  painelHUD.lookAt(_v);
  painelObj.lookAt(_v);
  camera.getWorldQuaternion(_q);
  zonas.forEach(z => z.rotulo.quaternion.copy(_q));

  if (renderer.xr.isPresenting){
    /* O ponteiro dos botões 3D. Um raycast contra no máximo oito planos por
       controle — desprezível ao lado do resto do quadro, e ele mesmo sai de
       graça quando não há botão visível. */
    menu3d.atualizarPonteiros();

    for (const src of (renderer.xr.getSession()?.inputSources || [])){
      const g = src.gamepad;
      if (!g) continue;

      // alavanca direita ↑↓ ajusta a altura da bateria ao corpo do jogador
      if (src.handedness === 'right'){
        const y = g.axes?.[3] || 0;
        if (Math.abs(y) > .7 && giroPronto){
          giroPronto = false;
          ajustarVisao(y < 0 ? .03 : -.03, alturaMudou);
          setTimeout(() => { giroPronto = true; }, 140);
        }
      }

      /* ALAVANCA ESQUERDA ↑↓ APROXIMA E AFASTA — a outra metade da mesma
         ideia. A direita ajusta a altura desde sempre; faltava a distância,
         que é a outra medida de corpo que muda de pessoa para pessoa. O
         posto padrão encostou no bumbo em 09/09, então na prática este
         ajuste serve para AFASTAR: à frente sobram 3 cm. */
      if (src.handedness === 'left'){
        const y = g.axes?.[3] || 0;
        if (Math.abs(y) > .7 && avancoPronto){
          avancoPronto = false;
          ajustarAvanco(y < 0 ? .03 : -.03, distanciaMudou);
          setTimeout(() => { avancoPronto = true; }, 140);
        }
      }

      /* A DO CONTROLE DIREITO PULA PARA A MÚSICA.
         `sessionstart` começa uma partida com `iniciar(false)`, ou seja, pelo
         tutorial — o que é certo para quem nunca viu o kit, e é exatamente o
         que sobra no caminho de quem já viu. O atalho existia ("Só a música"),
         mas em HTML: dava para clicar antes de entrar no VR e não depois.

         Chama o MESMO `pularTutorial()` do botão da tela, e não
         `iniciar(false, true)`: reiniciar a partida jogava fora os pontos da
         calibração que o jogador já tinha feito, e o A é justamente para quem
         está no meio dela. A partida segue valendo para o ranking desde
         07/09 (ver fases.js).

         Só age nas fases 0 e 1 — `pularTutorial` já garante isso, porque na
         fase de ritmo o A reiniciaria a música na cara de quem está tocando. */
      if (src.handedness === 'right' && g.buttons?.[4]?.pressed && aPronto){
        aPronto = false;
        setTimeout(() => { aPronto = true; }, 700);
        if (pularTutorial()) msg('Pulando para a música', 'gold', 1.6);
      }

      /* X DO CONTROLE ESQUERDO INICIA A CALIBRAGEM.
         Sem isto o painel 3D de calibragem seria enfeite: dentro do headset
         não existe o botão de HTML que a começa, então o jogador não tinha
         como medir de lá — e é lá que a medida importa mais, porque a
         latência é maior e o golpe vem da baqueta, não da tecla.

         Índice 4 é o X/A no perfil `xr-standard` do Touch. Nenhum botão era
         lido antes, então não há conflito; o gatilho e o grip seguem livres
         porque a batida é movimento, não botão. */
      /* B DO CONTROLE DIREITO MOSTRA O RESUMO DA MEDIÇÃO.
         O painel ao vivo só conhece os últimos 1,7 s, e ninguém decora seis
         números em quatro momentos jogando de headset. Isto abre a
         estatística da sessão INTEIRA, separada por fase, numa placa só —
         feita para o jogador tirar print e sair do headset com o dado.

         Índice 5 é o B/Y no perfil `xr-standard` do Touch; o A (índice 4)
         já pula para a música, e o gatilho e o grip seguem livres, porque a
         batida é movimento, não botão. Só faz efeito com `?perf=1`: sem
         gravação não há o que resumir. */
      if (src.handedness === 'right' && g.buttons?.[5]?.pressed && bPronto){
        bPronto = false;
        setTimeout(() => { bPronto = true; }, 600);   // anti-repique do botão
        alternarResumo();
      }

      if (src.handedness === 'left' && g.buttons?.[4]?.pressed && xPronto){
        xPronto = false;
        setTimeout(() => { xPronto = true; }, 600);   // anti-repique do botão
        if (!calibragem.ativa) comecarCalibragem();
      }
    }
    if (flash.visible){
      const p = camera.getWorldPosition(new THREE.Vector3());
      const d = camera.getWorldDirection(new THREE.Vector3());
      flash.position.copy(p).addScaledVector(d, 1.5).add(new THREE.Vector3(0, -.42, 0));
      flash.quaternion.copy(_q);
      if (performance.now() > flashEstado.ate) flash.visible = false;
    }
  } else {
    flash.visible = false;
    orbit.update();
  }

  renderer.render(scene, camera);
});

/* ------------------------------------------------------------ botões ----- */
$('btn-jogar').onclick = () => iniciar(false);
/* MODO LIVRE ABRE A LISTA, não a partida. Ele caía direto na bateria solta;
   agora a escolha "só bateria ou uma faixa para acompanhar" acontece antes,
   e "só bateria" é o primeiro item da lista — o caminho antigo, com um clique
   a mais e nenhuma surpresa. */
$('btn-livre').onclick = () => abrirLivre();
/* "Só a música" saiu do menu em 07/09. O mesmo salto virou o botão PULAR, que
   aparece durante o tutorial — no momento em que a vontade de pular existe, e
   não antes de o jogo começar. O caminho `iniciar(false, true)` continua no
   código, exposto em `window.__jogo` para os testes. */
$('btn-pular').onclick = () => { if (pularTutorial()) msg('Pulando para a música', 'gold', 1.4); };
$('btn-again').onclick = () => iniciar(false);
/* `esconderResultado3D` junto: o placar 3D não some com a tela de HTML, e
   quem voltasse ao menu depois de uma partida o deixava pendurado no ar. */
$('btn-menu').onclick  = () => { jogo.ativo = false; esconderResultado3D(); telaInicio(); };
$('btn-sair').onclick  = () => { if (abandonar()) msg('Partida abandonada', 'bad', 1.6); };
$('btn-livre-voltar').onclick = () => voltarDaLista();

/* ------------------------------------------- os mesmos botões, em 3D -----
   O menu3d não importa nada de `fases.js`: fecharia o ciclo
   fases → ui → menu3d → fases. Quem conhece as duas pontas é este arquivo,
   que já era o lugar onde todo botão de HTML é ligado. Cada ação abaixo é a
   MESMA função do botão equivalente na tela — o jogo não tem dois caminhos,
   tem duas maneiras de apertar o mesmo. */
menu3d.definirAcoes({
  jogar:    () => iniciar(false),
  livre:    () => abrirLivre(),
  /* A lista do modo livre, dentro do headset. As três ações são as mesmas
     que os botões de HTML disparam — o jogo não tem dois caminhos. */
  livreSemFaixa: () => iniciar(true),
  trilha:      (id) => { const t = porTrilha(id); if (t) iniciar(true, false, t); },
  voltarLivre:   () => voltarDaLista(),
  nivel:    (chave) => { definirNivel(chave); pintarNivel(); lerCarta(); },
  calibrar:  () => comecarCalibragem(),
  fecharCal: () => fecharAjustes(),
  pular:    () => { if (pularTutorial()) msg('Pulando para a música', 'gold', 1.4); },
  sair:     () => { if (abandonar()) msg('Partida abandonada', 'bad', 1.6); },
  denovo:   () => iniciar(false),
  menu:     () => { jogo.ativo = false; esconderResultado3D(); telaInicio(); },
});
/* A lista de níveis sai de `NIVEIS`, não de uma cópia à mão: mesmo contrato
   do `pintarNivel` e dos ids `btn-nivel-<chave>` no HTML. */
menu3d.montarNiveis(Object.keys(NIVEIS).map(c => ({ chave:c, nome:NIVEIS[c].nome })));


/* =================== A LISTA DO MODO LIVRE ================================
   Faixas SEM BATERIA, para quem sabe tocar acompanhar. O manifesto é
   `public/trilhas.json` (ver trilhas.js); os botões saem dele, nos dois
   lugares — na tela e em 3D — e nunca de uma cópia escrita à mão. Foi a lição
   dos níveis: a lista fixa é o que fica para trás quando alguém acrescenta
   uma faixa, e acrescentar faixa é justamente o que se vai fazer aqui.

   O manifesto é carregado uma vez, na abertura, e é 400 bytes de JSON — nada
   do áudio vem agora. Cada faixa só é baixada quando alguém a escolhe (ver
   `livreIniciar`, em fases.js).                                            */
let trilhas = [];
const porTrilha = (id) => trilhas.find(t => t.id === id) || null;

function abrirLivre(){ telaLivre(); }

/** A SAÍDA DA LISTA, e ela tem de servir aos dois jeitos de chegar nela.
 *
 *  Vindo do menu, não há partida: é só voltar. Vindo do FIM de uma faixa, a
 *  partida livre continua ativa — e sair da lista sem abandoná-la deixaria o
 *  jogo tocando por baixo da tela inicial, com o HUD escondido e sem nenhum
 *  botão que o encerre. As duas pontas caem no menu; a diferença é o que
 *  precisa ser desligado no caminho. */
function voltarDaLista(){
  if (jogo.ativo) abandonar();
  else telaInicio();
}

function montarListaLivre(){
  const el = $('livre-lista');
  if (!el) return;
  el.textContent = '';

  /* "SÓ BATERIA" NO TOPO, e com a cor de ação: é o modo livre como ele era
     antes de existir faixa nenhuma, o único item que não depende de baixar
     nada, e o que alguém que só quer bater no tambor está procurando. */
  const b0 = document.createElement('button');
  b0.className = 'principal';
  b0.dataset.trilha = '';
  b0.appendChild(document.createTextNode('Só bateria'));
  const s0 = document.createElement('small');
  s0.textContent = 'sem faixa — entra direto, como o modo livre de sempre';
  b0.appendChild(s0);
  b0.onclick = () => iniciar(true);
  el.appendChild(b0);

  for (const t of trilhas){
    const b = document.createElement('button');
    b.dataset.trilha = t.id;
    /* `textContent` e não `innerHTML`: o manifesto é nosso, mas título e
       crédito são texto de arquivo, e texto de arquivo não vira marcação. */
    b.appendChild(document.createTextNode(t.titulo));
    if (t.creditos){
      const s = document.createElement('small');
      s.textContent = t.creditos;
      b.appendChild(s);
    }
    b.onclick = () => iniciar(true, false, t);
    el.appendChild(b);
  }

  if (!trilhas.length){
    const p = document.createElement('p');
    p.className = 'vazio';
    p.textContent = 'Nenhuma faixa cadastrada ainda. Coloque o MP3 em '
      + 'public/sounds/livre/ e acrescente a entrada em public/trilhas.json.';
    el.appendChild(p);
  }
}

/* Desenhada JÁ, com a lista vazia, e redesenhada quando o manifesto chega:
   assim a tela nunca existe sem o "Só bateria" — que é o item que funciona
   mesmo se o manifesto não carregar. */
montarListaLivre();
menu3d.montarTrilhas([]);
carregarTrilhas().then(l => {
  trilhas = l;
  montarListaLivre();
  menu3d.montarTrilhas(l);
});


/* ------------------------------------------------- nível e calibragem ----- */
function pintarNivel(){
  const k = nivelAtual();
  /* Varre as chaves de NIVEIS em vez de uma lista escrita à mão: nível novo
     passa a precisar só de um botão com id `btn-nivel-<chave>` no HTML. A
     lista fixa daqui já tinha ficado desatualizada uma vez. */
  for (const chave of Object.keys(NIVEIS)){
    const b = $(`btn-nivel-${chave}`); if (!b) continue;
    /* Classe, não estilo inline: o controle é segmentado agora, e o estado
       ativo é preenchimento em vez de borda — decidir isso no CSS deixa o
       visual num lugar só. */
    b.classList.toggle('on', chave === k);
  }
  const c = Musica.calibragem;
  const m = $('nivel-msg');
  /* Antes do primeiro toque não existe AudioContext, então o navegador ainda
     não tem número nenhum para dar — dizer "0 ms" ali seria inventar. */
  const auto = musica.latencia;
  const texto = c !== null
    ? `atraso: ${Math.round(c*1000)} ms`
    : (auto > 0 ? `atraso não calibrado — usando ${Math.round(auto*1000)} ms do navegador`
                : 'atraso ainda não calibrado');
  if (m) m.textContent = texto;
  /* O mesmo estado no menu 3D. Curto ali: a placa é lida a 2,6 m. */
  menu3d.pintarMenu(k, `${NIVEIS[k]?.nome || ''} · `
    + (c !== null ? `atraso ${Math.round(c*1000)} ms` : 'atraso não calibrado'));
}
/* AJUSTE FINO. Calibração medida é a base; o resto é gosto e reflexo de cada
   um, e ninguém acerta isso por cálculo — acerta jogando. Dez em dez
   milissegundos é o passo em que a diferença dá para sentir sem se perder. */
function nudge(ms){
  const atual = Musica.calibragem;
  const base = atual !== null ? atual : (musica.latencia || 0);
  const novo = Math.max(0, Math.min(base + ms/1000, 0.5));
  Musica.calibragem = novo;
  pintarNivel();
}
$('btn-atraso-menos').onclick = () => nudge(-10);
$('btn-atraso-mais').onclick  = () => nudge(+10);

/* Mesma varredura do `pintarNivel`, e pela mesma razão. O `lerCarta()` no
   fim entra porque o nível agora pode TROCAR de carta: sem ele, escolher
   Profissa no menu deixaria o crédito e o kit da carta anterior na tela até
   alguém recarregar a página. */
for (const chave of Object.keys(NIVEIS)){
  const b = $(`btn-nivel-${chave}`); if (!b) continue;
  b.onclick = () => { definirNivel(chave); pintarNivel(); lerCarta(); };
}

function limparContagem(){
  const el = $('cal-contagem');
  if (!el) return;
  el.textContent = '';
  el.classList.remove('vai');
}

$('btn-ajustes').onclick = () => {
  $('cal-progresso').textContent = '—';
  $('cal-resultado').textContent = '';
  limparContagem();
  document.getElementById('tela-cal').classList.remove('hidden');
};
/* Com nome porque tem dois gatilhos, como o `comecarCalibragem`: o X da tela
   e o botão Fechar em 3D, para quem mediu de dentro do headset. */
function fecharAjustes(){
  /* Fechar no meio da medição não pode jogar fora o que já foi medido: se
     houver amostras suficientes, conclui antes de cancelar. Antes daqui, dez
     batidas boas e um clique no X davam em nada — sem aviso. */
  concluirCalibragem();
  pararCalibragem();
  limparContagem();
  calibragem3D(null);
  document.getElementById('tela-cal').classList.add('hidden');
  if (menu3d.telaAtual() === 'cal') menu3d.mostrar('menu');
  pintarNivel();
}
$('cal-fechar').onclick = fecharAjustes;
/* Com nome porque agora tem DOIS gatilhos: o botão da tela e o X do controle
   esquerdo, para quem está dentro do headset e não vê botão de HTML. */
function comecarCalibragem(){
  if (calibragem.ativa) return;
  /* Dentro do VR a medição é desenhada no `painelCentro`, que está ATRÁS do
     menu 3D. Sem trocar de tela, a contagem apareceria escondida pelos
     próprios botões. Ver o grupo 'cal' em menu3d.js. */
  if (menu3d.telaAtual() === 'menu') menu3d.mostrar('cal');
  $('cal-resultado').textContent = '';
  $('cal-progresso').textContent = '—';
  $('cal-comecar').disabled = true;
  iniciarCalibragem(
    (n, total) => {
      $('cal-progresso').textContent = `${n} de ${total} batidas`;
      calibragem3D([`${n}/${total}`, 'batidas registradas', 'continue batendo junto']);
    },
    (ms, disp, det) => {
      $('cal-comecar').disabled = false;
      limparContagem();
      if (ms === null){
        $('cal-resultado').innerHTML =
          '<span style="color:var(--warn)">Poucas batidas para medir — <strong>nada foi '
        + 'salvo</strong>. Tente de novo e bata junto com todos os cliques.</span>';
        calibragem3D(['—', 'poucas batidas: nada foi salvo',
                      'X no controle esquerdo mede de novo'], '#ffb84d');
        return;
      }
      /* O mesmo resultado no painel 3D. Fica na tela até o jogador começar
         outra coisa: no headset ele não tem como fechar um aviso, e um valor
         que aparece por dois segundos não dá para conferir. */
      calibragem3D([`${Math.round(ms)} ms`, 'atraso medido e salvo',
                    /* Curto de propósito: a terceira linha media 91% da
                       largura na versão anterior, e é a que cresce quando a
                       dispersão passa de dois dígitos. */
                    `dispersão ${Math.round(disp)} ms · `
                      + (disp < 60 ? 'medida firme' : 'irregular, repita')],
                   disp < 60 ? '#3ddc97' : '#ffb84d');
      if (det && det.usouPiso){
        $('cal-resultado').innerHTML =
          `<span style="color:var(--warn)">Sua medida deu ${Math.round(det.medida)} ms, `
        + `abaixo do que o navegador já declara (${Math.round(det.piso)} ms) — `
        + `guardei <strong>${Math.round(ms)} ms</strong>. `
        + `Se ainda parecer adiantado, use o ajuste fino.</span>`;
        pintarNivel();
        return;
      }
      // Dispersão alta quer dizer batida irregular: a mediana existe mas não
      // merece confiança, e é melhor avisar que fingir precisão.
      const confia = disp < 60;
      $('cal-resultado').innerHTML =
        `<span style="color:var(--${confia ? 'ok' : 'warn'})">` +
        `Atraso medido: <strong>${Math.round(ms)} ms</strong>` +
        ` (dispersão ${Math.round(disp)} ms)</span>` +
        (confia ? ' — salvo.' : ' — salvo, mas irregular. Vale repetir.');
      pintarNivel();
    },
    /* A contagem: 3, 2, 1 e depois a deixa. O zero não é "acabou", é
       "agora" — por isso troca de número para palavra. */
    (n) => {
      const el = $('cal-contagem');
      if (n > 0){ el.textContent = String(n); el.classList.remove('vai'); }
      else       { el.textContent = 'bata junto!'; el.classList.add('vai'); }
      calibragem3D(n > 0 ? [String(n), 'ouça os chimbais', 'na quarta, comece a bater']
                         : ['bata junto!', 'com a caixa, uma por segundo'],
                   n > 0 ? '#00d9ff' : '#3ddc97');
    });
}
$('cal-comecar').onclick = comecarCalibragem;

/* Crédito da faixa já na abertura, sem esperar a fase de ritmo carregar: quem
   emprestou a música merece aparecer antes de o jogo começar, não só depois.
   Falha em silêncio — carta ausente é caso normal (ver `cartaAgora`).

   VIROU FUNÇÃO porque o nível pode trocar de carta, e aí isto precisa rodar
   de novo ao escolher outro nível. Note que quem chama é o clique no nível, e
   NÃO o `pintarNivel`: este último também roda a cada toque no ajuste fino de
   atraso, e buscar a carta a cada 10 ms de nudge seria uma requisição por
   clique sem nenhum motivo. */
function lerCarta(){
  fetch(cartaAgora(NIVEIS[nivelAtual()]))
    .then(r => r.ok ? r.json() : null)
    .then(c => {
      if (!c) return;
      if (c.creditos){
        const el = $('inicio-creditos');
        if (el) el.textContent = c.titulo ? `♪ ${c.titulo} — ${c.creditos}` : c.creditos;
      }
      /* Kit da carta pedido JÁ na abertura, e não quando a fase de ritmo
         começa: assim as três fases usam o mesmo kit e a bateria não troca de
         som no meio da partida. O synth guarda o pedido se o áudio ainda não
         existir — ele só nasce no primeiro toque do jogador. */
      synth.definirKit(c.kit || null);
    })
    .catch(() => {});
}

pintarNivel();
lerCarta();

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

atualizarHUD();
objetivo('Aguardando início', '#8c9bb5');

/* ------------------------------------------------ ponte para os testes ----
   docs/testes.md descreve como os testes automatizados usam isto.        */
window.__jogo = {
  jogo, cal, eco, ritmo, zonas, PECAS, kit, scene, camera, player, renderer, orbit, baquetas, THREE,
  bater, iniciar, concluir, mostrarRotulos, destacar, processarPonta,
  ritmoIniciar, ritmoAtualizar, musica,
  /* Expostos para conferir o modelo de pontuação de fora, sem jogar a
     partida inteira à mão. Foi assim que a tabela de multiplicador e as
     estrelas foram verificadas. */
  atualizarHUD, telaResultado, pontuacao, synth, balanco,
  /* Regerar o ambiente de fora é o único jeito de comparar reflexo A/B sem
     recarregar a página — e recarregar perde a posição da câmera, que é
     justamente o que se quer manter igual entre as duas fotos. NÃO chame por
     `import('/src/cena.js')`: o Vite serve o módulo com `?t=` depois de cada
     HMR, e o import devolve uma instância NOVA, com uma cena vazia. O sintoma
     é a função avisar "sem cenário na cena" enquanto o cenário está na tela. */
  gerarAmbienteDaCena,
  NIVEIS, nivelAtual, PECAS_SEM, jogaveisAgora,
  pularTutorial, abandonar,
  /* A lista do modo livre. `trilhas` é um getter porque o manifesto chega
     depois: exposta por valor, a ponte guardaria o array vazio da abertura. */
  get trilhas(){ return trilhas; },
  abrirLivre, voltarDaLista, montarListaLivre, livreIniciar,
  /* A interface 3D e o ajuste de altura ficam expostos porque nenhum dos dois
     dá para exercitar sem headset. `menu3d.forcarForaDoVR(true)` seguido de
     `menu3d.mostrar('menu')` desenha os painéis no monitor, para conferir
     texto e alinhamento; `ajustarVisao` mostra de fora que quem se move é o
     jogador, e não a bateria. */
  menu3d, ajustarVisao, ajustarAvanco,
  /* A transição de luz é movida pelo `dt` do laço, e laço de render para
     quando a aba perde o foco. Expor as duas permite conferir o fade
     passando o tempo na mão, sem depender de a janela estar visível. */
  definirLuz, animarLuzes,
  simularBatidaVR: (id, vel, dt, desvio) => simularBatida(id, bater, vel, dt, desvio),
  testeIngenuo,
};
