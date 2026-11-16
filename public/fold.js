import { setupCamp } from './campinho.js';

const fold = document.querySelector('#fold');
const cover = document.querySelector('#paper-cover');
const popup = document.querySelector('#popup');
const toggle = document.querySelector('#fold-toggle');
const toggleLabel = document.querySelector('#fold-label');
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const camp = setupCamp(popup, reduced);
let press;

function setOpen(open, moveFocus = true) {
  fold.toggleAttribute('data-open', open);
  popup.inert = !open;
  popup.setAttribute('aria-hidden', String(!open));
  toggle.setAttribute('aria-expanded', String(open));
  toggleLabel.textContent = open ? 'Fechar o convite' : 'Abrir o convite';
  camp.setOpen(open);
  if (moveFocus) (open ? document.querySelector('#camp-title') : toggle).focus({ preventScroll: true });
}

toggle.hidden = false;
toggle.addEventListener('click', () => setOpen(!fold.hasAttribute('data-open')));
popup.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') setOpen(false);
});

cover.addEventListener('pointerdown', (event) => {
  if (!event.isPrimary || event.button !== 0 || fold.hasAttribute('data-open')) return;
  press = { id: event.pointerId, x: event.clientX, y: event.clientY, dragging: false };
});

fold.addEventListener('pointermove', (event) => {
  if (press?.id !== event.pointerId) return;
  const distance = Math.abs(event.clientX - press.x);
  const vertical = Math.abs(event.clientY - press.y);
  if (!press.dragging && distance > 11 && distance > vertical * 1.25) {
    press.dragging = true;
    fold.setPointerCapture(event.pointerId);
    fold.classList.add('dragging');
  }
  if (press.dragging) {
    press.distance = distance;
    if (!reduced.matches) {
      fold.style.setProperty('--drag-angle', -Math.min(85, distance / cover.offsetWidth * 180) + 'deg');
    }
  }
});

function finishDrag(event) {
  if (press?.id !== event.pointerId) return;
  const dx = Math.abs(event.clientX - press.x);
  const dy = Math.abs(event.clientY - press.y);
  const open = event.type === 'pointerup' && (press.dragging ? (press.distance ?? dx) >= 48 : dx < 8 && dy < 8);
  press = undefined;
  fold.classList.remove('dragging');
  fold.style.removeProperty('--drag-angle');
  if (open) setOpen(true);
}

for (const event of ['pointerup', 'pointercancel']) window.addEventListener(event, finishDrag);
cover.addEventListener('pointerleave', (event) => {
  if (!press?.dragging) finishDrag(event);
});
