// Màn hình mở đầu và thanh tiến độ tải
import { prefersReducedMotion } from './config.js';
import { btnSkipIntroEl, introCounterEl, introEl, introFillEl } from './dom.js';
import { campus, map } from './map.js';
import { overviewCamera, startSpin } from './camera.js';

const introCompletedSteps = new Set();
let introTarget = 0;
let introCurrent = 0;
let introClosed = false;
let introRafId = null;

export function closeIntro(immediate = false) {
  if (introClosed) return;
  introClosed = true;
  if (introRafId) cancelAnimationFrame(introRafId);
  if (immediate || prefersReducedMotion) {
    introEl.style.display = 'none';
    map.jumpTo(overviewCamera());
    return;
  }
  introEl.classList.add('is-leaving');
  setTimeout(() => {
    introEl.style.display = 'none';
  }, 600);
  // Mở màn: từ góc gần thẳng đứng quét vòng 52° về góc tổng quan, độ phơi sáng tăng dần
  const target = overviewCamera();
  map.jumpTo({ ...target, zoom: target.zoom - 0.55, pitch: 18, bearing: target.bearing - 52 });
  campus.playIntro(3000);
  map.easeTo({ ...target, duration: 3000, easing: (t) => 1 - Math.pow(1 - t, 3) });
  map.once('moveend', () => startSpin());
}

function tickIntro() {
  introCurrent += (introTarget - introCurrent) * 0.14;
  if (Math.abs(introTarget - introCurrent) < 0.4) {
    introCurrent = introTarget;
  }
  introCounterEl.textContent = String(Math.round(introCurrent)).padStart(3, '0');
  introFillEl.style.clipPath = `inset(0 ${100 - introCurrent}% 0 0)`;

  if (introCurrent < 100 || introTarget < 100) {
    introRafId = requestAnimationFrame(tickIntro);
  } else if (!introClosed) {
    setTimeout(() => closeIntro(false), 180);
  }
}

export function markIntroStep(stepKey) {
  if (introCompletedSteps.has(stepKey)) return;
  introCompletedSteps.add(stepKey);
  introTarget = Math.min(100, introCompletedSteps.size * 25);
  if (prefersReducedMotion) {
    introCurrent = introTarget;
    introCounterEl.textContent = String(introTarget).padStart(3, '0');
    introFillEl.style.clipPath = `inset(0 ${100 - introTarget}% 0 0)`;
    if (introTarget >= 100) closeIntro(true);
    return;
  }
  if (!introRafId && !introClosed) {
    introRafId = requestAnimationFrame(tickIntro);
  }
}

btnSkipIntroEl.addEventListener('click', () => closeIntro(false));
