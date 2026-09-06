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
         molduraDesktop, molduraVR, registrarOrbit,
         carregarCenario,
         painelHUD, painelObj, flash, flashEstado } from './cena.js';
import { carregarBichos } from './bichos.js';
import { medir as medirDesempenho, alternarResumo } from './desempenho.js';
import * as balanco from './balanco.js';
const { animarBalanco } = balanco;
import { kit, zonas, baquetas, carregarBateria, animarZonas,
         ajustarAltura, mostrarRotulos, destacar } from './kit.js';
import { detectarBatidas, processarPonta, simularBatida, testeIngenuo } from './deteccao.js';
import { bater, iniciar, concluir, ritmoAtualizar, ritmoIniciar } from './fases.js';
import { musica, Musica } from './musica.js';
import { synth } from './synth.js';
import * as pontuacao from './pontuacao.js';
import { iniciarCalibragem, pararCalibragem, registrarBatida,
         concluirCalibragem, calibragem } from './calibragem.js';
import { NIVEIS, nivelAtual, definirNivel, CARTA_URL } from './config.js';
import { $, msg, atualizarHUD, objetivo, telaCarregada, telaInicio,
         statusXR, falhaCarregamento, progressoCarregamento,
         telaResultado, calibragem3D } from './ui.js';

/* ------------------------------------------------------ carregamento ----- */
carregarCenario();
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

function alturaMudou(a){
  msg(`Altura da bateria: ${a >= 0 ? '+' : ''}${a.toFixed(2)} m`, 'ok', 1.1);
}

addEventListener('keydown', e => {
  if (registrarBatida()) return;   // calibragem em curso
  if (e.repeat) return;
  if (e.code === 'BracketLeft'){  ajustarAltura(-.03, alturaMudou); return; }
  if (e.code === 'BracketRight'){ ajustarAltura(+.03, alturaMudou); return; }
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
    statusXR(true, 'VR disponível — as baquetas são seus controles');
    $('vr-slot').appendChild(VRButton.createButton(renderer));
  } else {
    statusXR(false, 'sem immersive-vr aqui (precisa de headset + HTTPS) — modo teclado liberado');
  }
})();

renderer.xr.addEventListener('sessionstart', () => {
  orbit.enabled = false;
  telaInicio(); $('tela-inicio').classList.add('hidden');
  $('hud').classList.add('hidden'); $('teclas').classList.add('hidden');
  baquetas.forEach(b => { b.temAnterior = false; });
  molduraVR();
  if (!jogo.ativo) iniciar(false);
});
renderer.xr.addEventListener('sessionend', () => {
  orbit.enabled = true;
  molduraDesktop();
  if (jogo.ativo){
    $('hud').classList.remove('hidden');
    $('teclas').classList.remove('hidden');
  } else telaInicio();
});

/* ================================= LAÇO ==================================
   Em WebXR o laço é do renderer, NÃO requestAnimationFrame: o headset roda
   a 72–120 Hz e é ele quem dita o ritmo.                                  */
const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();
let giroPronto = true;
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

  camera.getWorldPosition(_v);
  painelHUD.lookAt(_v);
  painelObj.lookAt(_v);
  camera.getWorldQuaternion(_q);
  zonas.forEach(z => z.rotulo.quaternion.copy(_q));

  if (renderer.xr.isPresenting){
    for (const src of (renderer.xr.getSession()?.inputSources || [])){
      const g = src.gamepad;
      if (!g) continue;

      // alavanca direita ↑↓ ajusta a altura da bateria ao corpo do jogador
      if (src.handedness === 'right'){
        const y = g.axes?.[3] || 0;
        if (Math.abs(y) > .7 && giroPronto){
          giroPronto = false;
          ajustarAltura(y < 0 ? .03 : -.03, alturaMudou);
          setTimeout(() => { giroPronto = true; }, 140);
        }
      }

      /* A DO CONTROLE DIREITO PULA PARA A MÚSICA.
         `sessionstart` começa uma partida com `iniciar(false)`, ou seja, pelo
         tutorial — o que é certo para quem nunca viu o kit, e é exatamente o
         que sobra no caminho de quem já viu. O atalho existia ("Só a música"),
         mas em HTML: dava para clicar antes de entrar no VR e não depois.

         Reaproveita `iniciar(false, true)`, o mesmo caminho do botão, então o
         `atalho` fica marcado e a partida não entra no ranking — pular o
         tutorial não pode render pontuação comparável com quem jogou inteiro.

         Só age nas fases 0 e 1: na fase de ritmo, A reiniciaria a música na
         cara de quem está tocando. */
      if (src.handedness === 'right' && g.buttons?.[4]?.pressed && aPronto){
        aPronto = false;
        setTimeout(() => { aPronto = true; }, 700);
        if (jogo.fase < 2){
          iniciar(false, true);
          msg('Pulando para a música', 'gold', 1.6);
        }
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
$('btn-livre').onclick = () => iniciar(true);
$('btn-musica').onclick = () => iniciar(false, true);   // direto na fase de ritmo
$('btn-again').onclick = () => iniciar(false);
$('btn-menu').onclick  = () => { telaInicio(); jogo.ativo = false; };


/* ------------------------------------------------- nível e calibragem ----- */
function pintarNivel(){
  const k = nivelAtual();
  for (const [id, chave] of [['btn-nivel-facil','facil'], ['btn-nivel-normal','normal']]){
    const b = $(id); if (!b) continue;
    b.style.borderColor = chave === k ? 'var(--cyan)' : 'var(--line)';
    b.style.color       = chave === k ? 'var(--cyan)' : 'var(--ink)';
  }
  const c = Musica.calibragem;
  const m = $('nivel-msg');
  if (m){
    /* Antes do primeiro toque não existe AudioContext, então o navegador ainda
       não tem número nenhum para dar — dizer "0 ms" ali seria inventar. */
    const auto = musica.latencia;
    m.textContent = c !== null
      ? `atraso: ${Math.round(c*1000)} ms`
      : (auto > 0 ? `atraso não calibrado — usando ${Math.round(auto*1000)} ms do navegador`
                  : 'atraso ainda não calibrado');
  }
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

$('btn-nivel-facil').onclick  = () => { definirNivel('facil');  pintarNivel(); };
$('btn-nivel-normal').onclick = () => { definirNivel('normal'); pintarNivel(); };

function limparContagem(){
  const el = $('cal-contagem');
  if (!el) return;
  el.textContent = '';
  el.classList.remove('vai');
}

$('btn-calibrar').onclick = () => {
  $('cal-progresso').textContent = '—';
  $('cal-resultado').textContent = '';
  limparContagem();
  document.getElementById('tela-cal').classList.remove('hidden');
};
$('cal-fechar').onclick = () => {
  /* Fechar no meio da medição não pode jogar fora o que já foi medido: se
     houver amostras suficientes, conclui antes de cancelar. Antes daqui, dez
     batidas boas e um clique no X davam em nada — sem aviso. */
  concluirCalibragem();
  pararCalibragem();
  limparContagem();
  calibragem3D(null);
  document.getElementById('tela-cal').classList.add('hidden');
  pintarNivel();
};
/* Com nome porque agora tem DOIS gatilhos: o botão da tela e o X do controle
   esquerdo, para quem está dentro do headset e não vê botão de HTML. */
function comecarCalibragem(){
  if (calibragem.ativa) return;
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
pintarNivel();

/* Crédito da faixa já na abertura, sem esperar a fase de ritmo carregar: quem
   emprestou a música merece aparecer antes de o jogo começar, não só depois.
   Falha em silêncio — carta ausente é caso normal (ver `CARTA_URL`). */
fetch(CARTA_URL)
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
  simularBatidaVR: (id, vel, dt, desvio) => simularBatida(id, bater, vel, dt, desvio),
  testeIngenuo,
};
