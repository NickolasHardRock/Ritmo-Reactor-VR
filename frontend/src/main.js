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
         carregarLab, animarReator,
         painelHUD, painelObj, flash, flashEstado } from './cena.js';
import { carregarBichos } from './bichos.js';
import { kit, zonas, baquetas, carregarBateria, animarZonas,
         ajustarAltura, mostrarRotulos, destacar } from './kit.js';
import { detectarBatidas, processarPonta, simularBatida, testeIngenuo } from './deteccao.js';
import { bater, iniciar, concluir, ritmoAtualizar, ritmoIniciar } from './fases.js';
import { musica, Musica } from './musica.js';
import { synth } from './synth.js';
import * as pontuacao from './pontuacao.js';
import { iniciarCalibragem, pararCalibragem, registrarBatida,
         concluirCalibragem } from './calibragem.js';
import { NIVEIS, nivelAtual, definirNivel, CARTA_URL } from './config.js';
import { $, msg, atualizarHUD, objetivo, telaCarregada, telaInicio,
         statusXR, falhaCarregamento, progressoCarregamento,
         telaResultado } from './ui.js';

/* ------------------------------------------------------ carregamento ----- */
carregarLab();
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

renderer.setAnimationLoop(() => {
  const dt = Math.min(relogio.getDelta(), .05);
  const t  = relogio.elapsedTime;

  detectarBatidas(dt, bater);     // antes de qualquer outra coisa
  ritmoAtualizar();
  animarZonas(dt, t);
  animarReator(dt, t);

  camera.getWorldPosition(_v);
  painelHUD.lookAt(_v);
  painelObj.lookAt(_v);
  camera.getWorldQuaternion(_q);
  zonas.forEach(z => z.rotulo.quaternion.copy(_q));

  if (renderer.xr.isPresenting){
    // alavanca direita ↑↓ ajusta a altura da bateria ao corpo do jogador
    for (const src of (renderer.xr.getSession()?.inputSources || [])){
      const ax = src.gamepad?.axes;
      if (!ax || src.handedness !== 'right') continue;
      const y = ax[3] || 0;
      if (Math.abs(y) > .7 && giroPronto){
        giroPronto = false;
        ajustarAltura(y < 0 ? .03 : -.03, alturaMudou);
        setTimeout(() => { giroPronto = true; }, 140);
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
  document.getElementById('tela-cal').classList.add('hidden');
  pintarNivel();
};
$('cal-comecar').onclick = () => {
  $('cal-resultado').textContent = '';
  $('cal-progresso').textContent = '—';
  $('cal-comecar').disabled = true;
  iniciarCalibragem(
    (n, total) => { $('cal-progresso').textContent = `${n} de ${total} batidas`; },
    (ms, disp, det) => {
      $('cal-comecar').disabled = false;
      limparContagem();
      if (ms === null){
        $('cal-resultado').innerHTML =
          '<span style="color:var(--warn)">Poucas batidas para medir — <strong>nada foi '
        + 'salvo</strong>. Tente de novo e bata junto com todos os cliques.</span>';
        return;
      }
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
    });
};
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
  atualizarHUD, telaResultado, pontuacao, synth,
  simularBatidaVR: (id, vel, dt, desvio) => simularBatida(id, bater, vel, dt, desvio),
  testeIngenuo,
};
