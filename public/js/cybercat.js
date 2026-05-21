// ===== CYBER-CAT — Comportamento Natural =====
let cyberCatEl = null;
let cyberCatAnim = null;

// Estado interno do gato
const CAT_STATE = {
  x: 80,
  dir: 1,       // 1=direita, -1=esquerda
  speed: 1.3,
  mode: 'walk', // 'walk' | 'sit' | 'meow'
  modeTimer: 0,
  walkDuration: 0,
  sitDuration: 0,
  frameTick: 0,
  walkFrame: 0,
};

const CAT_MEOW_MSGS = ['Meow~', 'NyAAa~', '01101101', 'nya~', '>^.^<', '0x1337', 'mrrrow~'];

function _catGetBottomY() {
  // Gato fica na faixa inferior da tela (últimos ~80px)
  return window.innerHeight - 52;
}

function _catShowMeow() {
  if (!cyberCatEl) return;
  const bubble = document.createElement('div');
  bubble.className = 'cat-meow-bubble';
  bubble.textContent = CAT_MEOW_MSGS[Math.floor(Math.random() * CAT_MEOW_MSGS.length)];
  // Posicionar acima do gato
  bubble.style.left = (CAT_STATE.x - 10) + 'px';
  bubble.style.top = (_catGetBottomY() - 32) + 'px';
  document.body.appendChild(bubble);
  setTimeout(() => bubble.remove(), 2400);
}

function _catPickNewWalkDuration() {
  // Caminha por 3~9 segundos (180~540 frames @ 60fps)
  return 180 + Math.floor(Math.random() * 360);
}

function _catPickNewSitDuration() {
  // Senta por 2~5 segundos
  return 120 + Math.floor(Math.random() * 180);
}

export function spawnCyberCat() {
  removeCyberCat();
  cyberCatEl = document.createElement('div');
  cyberCatEl.id = 'cyber-cat';
  cyberCatEl.textContent = '🐱';
  CAT_STATE.x = 80;
  CAT_STATE.dir = 1;
  CAT_STATE.mode = 'walk';
  CAT_STATE.walkDuration = _catPickNewWalkDuration();
  CAT_STATE.modeTimer = 0;
  CAT_STATE.frameTick = 0;
  CAT_STATE.walkFrame = 0;
  document.body.appendChild(cyberCatEl);
  animateCyberCat();
}

export function removeCyberCat() {
  if (cyberCatEl) { cyberCatEl.remove(); cyberCatEl = null; }
  if (cyberCatAnim) { cancelAnimationFrame(cyberCatAnim); cyberCatAnim = null; }
  // Remover quaisquer balões restantes
  document.querySelectorAll('.cat-meow-bubble').forEach(b => b.remove());
}

function animateCyberCat() {
  if (!cyberCatEl) return;
  const W = window.innerWidth;
  const marginL = 24, marginR = W - 36;
  const catY = _catGetBottomY();
  CAT_STATE.modeTimer++;

  if (CAT_STATE.mode === 'walk') {
    // Andar horizontalmente
    CAT_STATE.x += CAT_STATE.speed * CAT_STATE.dir;

    // Bounce nas bordas
    if (CAT_STATE.x >= marginR) { CAT_STATE.dir = -1; CAT_STATE.x = marginR; }
    if (CAT_STATE.x <= marginL) { CAT_STATE.dir = 1; CAT_STATE.x = marginL; }

    // Animação de andar — alterna frames
    CAT_STATE.frameTick++;
    if (CAT_STATE.frameTick >= 14) {
      CAT_STATE.frameTick = 0;
      CAT_STATE.walkFrame = (CAT_STATE.walkFrame + 1) % 2;
    }
    cyberCatEl.textContent = CAT_STATE.walkFrame === 0 ? '🐱' : '😺';
    cyberCatEl.style.transform = CAT_STATE.dir < 0 ? 'scaleX(-1)' : 'scaleX(1)';
    cyberCatEl.style.transition = 'none';

    // Decidir sentar após walkDuration frames
    if (CAT_STATE.modeTimer >= CAT_STATE.walkDuration) {
      CAT_STATE.mode = 'sit';
      CAT_STATE.modeTimer = 0;
      CAT_STATE.sitDuration = _catPickNewSitDuration();
      cyberCatEl.textContent = '😸';
    }

  } else if (CAT_STATE.mode === 'sit') {
    // Sentado — imóvel
    cyberCatEl.textContent = '😸';
    cyberCatEl.style.transform = CAT_STATE.dir < 0 ? 'scaleX(-1)' : 'scaleX(1)';

    // No início do sit, tocar miau
    if (CAT_STATE.modeTimer === 1) _catShowMeow();

    // Segundo miau aleatório no meio do sit
    if (CAT_STATE.modeTimer === Math.floor(CAT_STATE.sitDuration * 0.55) && Math.random() < 0.55) {
      _catShowMeow();
    }

    // Terminar de sentar — voltar a andar
    if (CAT_STATE.modeTimer >= CAT_STATE.sitDuration) {
      CAT_STATE.mode = 'walk';
      CAT_STATE.modeTimer = 0;
      CAT_STATE.walkDuration = _catPickNewWalkDuration();
      // Às vezes mudar de direção ao levantar
      if (Math.random() < 0.4) CAT_STATE.dir *= -1;
    }
  }

  cyberCatEl.style.left = CAT_STATE.x + 'px';
  cyberCatEl.style.top  = catY + 'px';

  cyberCatAnim = requestAnimationFrame(animateCyberCat);
}


export { CAT_STATE };
