// Custom cursor: a small dot that tracks the pointer exactly, plus a larger ring that lags
// behind it, eased every frame with a frame-rate-independent damp (the same idea the hero point
// cloud uses for its own cursor-follow rotation -- see LEARNING.md M3d -- reimplemented here in
// one line instead of importing three.js just for MathUtils.damp, which would blow the initial-JS
// budget for a module that loads eagerly on every page, not lazily like the hero's scene).
//
// Fine pointers only (a touchscreen has no hover to speak of) and only when motion is allowed:
// this is a purely decorative enhancement layered on top of the real system cursor (CLAUDE.md
// rule 3), so skipping it under reduced motion or on touch loses no content or function.

import { gsap } from 'gsap';
import { conditions } from './motion.js';

const RING_LAMBDA = 18; // higher = the ring catches up to the dot faster
const HOVER_SELECTOR = 'a, button, [role="button"], input, textarea, select, summary';

let mm = null;

/** Frame-rate-independent damping: moves `current` a fraction of the way to `target` no matter
 *  the frame's duration `dt` (seconds), so the ring's lag looks the same at 60fps or 144fps. */
function damp(current, target, lambda, dt) {
  return current + (target - current) * (1 - Math.exp(-lambda * dt));
}

export function initCursor() {
  mm = gsap.matchMedia();

  mm.add({ motion: conditions.motion, fine: conditions.fine }, (context) => {
    if (!context.conditions.motion || !context.conditions.fine) return;

    const dot = document.createElement('div');
    dot.className = 'cursor-dot';
    const ring = document.createElement('div');
    ring.className = 'cursor-ring';
    ring.innerHTML = '<span class="cursor-ring__shape"></span>';
    document.body.append(dot, ring);
    document.documentElement.classList.add('has-cursor'); // base.css: hides the native cursor

    let targetX = window.innerWidth / 2;
    let targetY = window.innerHeight / 2;
    let ringX = targetX;
    let ringY = targetY;
    let ready = false;
    let lastTime = performance.now();

    const onMove = (event) => {
      targetX = event.clientX;
      targetY = event.clientY;
      dot.style.transform = `translate3d(${targetX}px, ${targetY}px, 0)`;
      if (!ready) {
        ready = true; // first real position: reveal both, and start the ring exactly there (no swoop-in)
        ringX = targetX;
        ringY = targetY;
        dot.classList.add('is-visible');
        ring.classList.add('is-visible');
      }
    };

    const onOver = (event) => {
      if (event.target.closest?.(HOVER_SELECTOR)) ring.classList.add('is-hover');
    };
    const onOut = (event) => {
      if (event.target.closest?.(HOVER_SELECTOR)) ring.classList.remove('is-hover');
    };

    function tick() {
      const now = performance.now();
      const dt = (now - lastTime) / 1000;
      lastTime = now;
      ringX = damp(ringX, targetX, RING_LAMBDA, dt);
      ringY = damp(ringY, targetY, RING_LAMBDA, dt);
      ring.style.transform = `translate3d(${ringX}px, ${ringY}px, 0)`;
    }

    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerover', onOver);
    document.addEventListener('pointerout', onOut);
    gsap.ticker.add(tick);

    return () => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerover', onOver);
      document.removeEventListener('pointerout', onOut);
      gsap.ticker.remove(tick);
      document.documentElement.classList.remove('has-cursor');
      dot.remove();
      ring.remove();
    };
  });
}

export function destroyCursor() {
  mm?.revert(); // runs the cleanup above
  mm = null;
}
