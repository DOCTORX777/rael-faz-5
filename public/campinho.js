import { ballContext, planKick, sampleKick } from './kick-motion.js';

// Painting order is controlled by the z-indexes in celebration.css.
const layers = [
  ['ceu', 610, 203], ['sol', 95, 93], ['nuvem1', 150, 51], ['nuvem2', 120, 64],
  ['morros', 530, 153], ['gramado', 610, 196], ['rede', 220, 106], ['trave', 250, 173],
  ['capivara', 150, 156], ['bandeirinhas', 250, 70], ['baloes', 90, 89], ['trofeu', 120, 106]
];

export function setupCamp(popup, reduced) {
  const pitch = popup.querySelector('.pitch');
  const scene = pitch.querySelector('.scene-art');
  const canvas = pitch.querySelector('#ball-render');
  const shadow = pitch.querySelector('#ball-shadow');
  const button = pitch.querySelector('.ball-button');
  const ball = button.querySelector('img');
  const result = pitch.querySelector('.goal');
  const confetti = pitch.querySelector('.confetti');
  const counter = popup.querySelector('#goals-count');
  let initialized = false;
  let tried3D = false;
  let open = false;
  let inView = false;
  let renderer;
  let shot;
  let idleClock = 0;
  let resultTimer;
  let cleanupTimer;
  let attempts = 0;
  let goals = 0;
  let gesture;
  let ignoreClickUntil = 0;
  let queuedScroll = false;
  const size = () => ({ width: pitch.clientWidth, height: pitch.clientHeight, diameter: button.offsetWidth });

  function updateVisibility() {
    const active = open && inView && !document.hidden && !reduced.matches;
    pitch.classList.toggle('scene-active', active);
    const rendered = renderer && !reduced.matches && shot?.mode !== 'css';
    pitch.dataset.engine = rendered ? 'three' : 'css';
    canvas.hidden = !rendered;
    renderer?.setActive(active && rendered);
  }

  function addLayers() {
    if (initialized) return;
    initialized = true;
    const critical = [];
    for (const [name, width, height] of layers) {
      const image = document.createElement('img');
      image.className = 'scene-layer layer-' + name;
      image.alt = '';
      image.width = width;
      image.height = height;
      image.decoding = 'async';
      image.srcset = '/assets/cena/' + name + '@2x.webp 2x';
      image.src = '/assets/cena/' + name + '.webp';
      scene.append(image);
      if (['ceu', 'gramado', 'trave', 'capivara'].includes(name)) critical.push(image.decode());
    }
    Promise.all(critical).then(() => pitch.classList.add('illustrated')).catch(() => {});
  }

  function setShadow(pose, box) {
    shadow.style.left = (100 * pose.x / box.width) + '%';
    shadow.style.top = (100 * pose.groundY / box.height + 3) + '%';
    shadow.style.scale = String(pose.shadowScale);
    shadow.style.opacity = String(pose.shadowOpacity);
  }

  function showResult(plan) {
    if (shot?.reported) return;
    shot.reported = true;
    if (!plan.saved) goals += 1;
    const tally = goals + (goals === 1 ? ' gol' : ' gols');
    counter.textContent = tally;
    result.textContent = plan.saved ? 'Defendeu!' : 'Goool!';
    result.setAttribute('aria-label', result.textContent + ' Placar: ' + tally);
    if (plan.saved) {
      pitch.style.setProperty('--keeper-x', (plan.goalX - pitch.clientWidth * .51) + 'px');
      pitch.classList.add('saving');
    } else {
      confetti.hidden = reduced.matches;
      pitch.classList.add('scored');
      if (goals === 3) pitch.classList.add('trophy-earned');
    }
  }

  function finish() {
    if (!shot) return;
    showResult(shot.plan);
    cleanupTimer = setTimeout(reset, 570);
  }

  function reset() {
    clearTimeout(resultTimer);
    clearTimeout(cleanupTimer);
    const previous = shot;
    shot = null;
    previous?.ballAnimation?.cancel();
    previous?.shadowAnimation?.cancel();
    button.removeAttribute('aria-disabled');
    result.textContent = '';
    result.removeAttribute('aria-label');
    confetti.hidden = true;
    pitch.classList.remove('scored', 'saving');
    const box = size();
    if (box.width && box.height) setShadow({ x: box.width * .42, groundY: box.height * .78, shadowOpacity: .28, shadowScale: 1 }, box);
    updateVisibility();
  }

  function frame(delta, box) {
    if (shot?.mode === 'three') {
      if (!shot.complete) {
        shot.elapsed += delta;
        const phase = Math.min(1, shot.elapsed / shot.plan.duration);
        shot.pose = sampleKick(shot.plan, phase);
        if (phase >= shot.plan.hit) showResult(shot.plan);
        if (phase === 1) {
          shot.complete = true;
          finish();
        }
      }
      setShadow(shot.pose, box);
      return shot.pose;
    }
    idleClock += delta * .001;
    const bounce = Math.abs(Math.sin(idleClock * 1.6)) * 4;
    const pose = { x: box.width * .42, y: box.height * .78 - bounce, groundY: box.height * .78,
      scale: 1, rotation: idleClock * .54, shadowScale: 1 - bounce / 35, shadowOpacity: .31 - bounce / 55 };
    setShadow(pose, box);
    return pose;
  }

  async function load3D() {
    if (tried3D || reduced.matches) return;
    tried3D = true;
    const context = ballContext(canvas, reduced.matches);
    if (!context) return;
    try {
      const { mountBall } = await import('./ball-3d.js');
      renderer = await mountBall(canvas, context, {
        size, sample: frame,
        onFailure() {
          renderer = undefined;
          if (shot) finish();
          updateVisibility();
        }
      });
      updateVisibility();
    } catch {
      renderer = undefined;
      updateVisibility();
    }
  }

  function shoot(drag = null) {
    if (!open || shot) return;
    const box = size();
    if (!box.width || !box.height) return;
    const plan = planKick(box.width, box.height, drag, ++attempts);
    button.setAttribute('aria-disabled', 'true');
    if (renderer && !reduced.matches) {
      shot = { plan, mode: 'three', elapsed: 0, pose: sampleKick(plan, 0) };
      return;
    }
    shot = { plan, mode: 'css' };
    if (reduced.matches) {
      finish();
      return;
    }
    const poses = Array.from({ length: 23 }, (_, index) => sampleKick(plan, index / 22));
    const duration = { duration: plan.duration, fill: 'forwards', easing: 'linear' };
    const current = shot;
    current.ballAnimation = ball.animate(poses.map(({ x, y, rotation, scale }) => ({
      transform: 'translate(' + (x - plan.startX) + 'px, ' + (y - plan.startY) + 'px) rotate(' + rotation + 'rad) scale(' + scale + ')'
    })), duration);
    current.shadowAnimation = shadow.animate(poses.map(({ x, groundY, shadowOpacity, shadowScale }) => ({
      transform: 'translate(' + (x - plan.startX) + 'px, ' + (groundY - plan.startY) + 'px)',
      opacity: shadowOpacity, scale: shadowScale
    })), duration);
    resultTimer = setTimeout(() => { if (shot === current) showResult(plan); }, plan.duration * plan.hit);
    current.ballAnimation.finished.then(() => { if (shot === current) finish(); }).catch(() => {});
  }

  button.addEventListener('click', () => {
    if (performance.now() >= ignoreClickUntil) shoot();
  });
  button.addEventListener('pointerdown', (event) => {
    if (!event.isPrimary || event.button !== 0 || shot) return;
    gesture = { id: event.pointerId, x: event.clientX, y: event.clientY };
    button.setPointerCapture(event.pointerId);
  });
  button.addEventListener('pointerup', (event) => {
    if (gesture?.id !== event.pointerId) return;
    const drag = { x: event.clientX - gesture.x, y: event.clientY - gesture.y };
    gesture = undefined;
    if (Math.hypot(drag.x, drag.y) < 13) return;
    ignoreClickUntil = performance.now() + 500;
    shoot(drag);
  });
  button.addEventListener('pointercancel', () => { gesture = undefined; });

  if ('IntersectionObserver' in window) {
    new IntersectionObserver((entries) => {
      inView = entries.some((entry) => entry.isIntersecting);
      updateVisibility();
    }).observe(pitch);
  } else inView = true;

  if ('ResizeObserver' in window) new ResizeObserver(() => { if (shot) reset(); }).observe(pitch);

  document.addEventListener('visibilitychange', updateVisibility);
  reduced.addEventListener('change', () => {
    reset();
    if (open) load3D();
  });
  window.addEventListener('scroll', () => {
    if (!open || !inView || reduced.matches || queuedScroll) return;
    queuedScroll = true;
    requestAnimationFrame(() => {
      queuedScroll = false;
      const y = pitch.getBoundingClientRect().top / window.innerHeight - .45;
      pitch.style.setProperty('--scene-scroll', Math.max(-10, Math.min(10, y * 24)) + 'px');
    });
  }, { passive: true });
  window.addEventListener('deviceorientation', (event) => {
    if (!open || !inView || reduced.matches || event.gamma == null) return;
    pitch.style.setProperty('--scene-tilt', Math.max(-8, Math.min(8, event.gamma * .21)) + 'px');
  });

  return {
    setOpen(value) {
      open = value;
      if (open) {
        addLayers();
        load3D();
      }
      reset();
    }
  };
}
