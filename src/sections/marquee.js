// Tech-stack marquee: two rows of wordmarks scrolling in opposite directions, forever, at a calm
// ambient pixel speed that also reacts to how fast the page itself is being scrolled (Lenis's own
// `.velocity`, read off lib/scroll.js) and pauses while a fine pointer hovers the section.
//
// Reduced motion: this module never runs (the `motion`-only matchMedia condition below), so the
// two rows stay exactly as the static HTML has them -- a plain, fully-readable wrapped list
// (marquee.css) -- the same "skip the JS state entirely" approach the rest of this codebase uses
// for effects whose un-animated default is already the fully readable one (stats.js, timeline.js,
// publications.js, case-study.js).

import { gsap } from 'gsap';
import { conditions } from '../lib/motion.js';
import { getLenis } from '../lib/scroll.js';

const PX_PER_SEC = 32; // ambient speed at rest
const VELOCITY_BOOST = 0.025; // Lenis's `.velocity` is a per-frame pixel delta, not px/s -- small on purpose
const MAX_TIME_SCALE = 5; // caps how much a fast flick can speed the marquee up
const RESIZE_DEBOUNCE_MS = 200;

let mm = null;

/** Clones `row`'s children once (marked aria-hidden, so a screen reader only ever hears the real,
 *  once-through list) so the row is now exactly two copies wide -- translating it by one copy's
 *  width therefore loops seamlessly. Returns the originals, so cleanup can restore them exactly. */
function duplicate(row) {
  const items = [...row.children];
  row.append(
    ...items.map((el) => {
      const clone = el.cloneNode(true);
      clone.setAttribute('aria-hidden', 'true');
      return clone;
    }),
  );
  return items;
}

/** One infinite, linear loop: `direction` -1 moves left, 1 moves right. Distance is measured
 *  fresh (the row is already duplicated by the time this runs), so a resize is picked up cleanly. */
function buildLoop(row, direction) {
  const distance = row.scrollWidth / 2; // half: the row is two copies wide
  const from = direction < 0 ? 0 : -distance;
  const to = direction < 0 ? -distance : 0;
  gsap.set(row, { x: from, willChange: 'transform' });
  return gsap.to(row, { x: to, duration: distance / PX_PER_SEC, ease: 'none', repeat: -1 });
}

export function initMarquee() {
  const section = document.querySelector('.marquee');
  const rows = section ? [...section.querySelectorAll('.marquee__row')] : [];
  const toggle = section?.querySelector('[data-marquee-toggle]');
  const toggleLabel = toggle?.querySelector('[data-marquee-toggle-label]');
  if (!section || rows.length < 2) return;

  mm = gsap.matchMedia();

  mm.add({ motion: conditions.motion }, () => {
    section.dataset.marqueeJs = ''; // marquee.css: swaps flex-wrap for nowrap and clips the overflow
    const originals = rows.map(duplicate);
    let tweens = rows.map((row, i) => buildLoop(row, i % 2 === 0 ? -1 : 1));

    // ---- Speed reacts to scroll velocity, decaying back to PX_PER_SEC as Lenis's own velocity
    // decays once scrolling stops (Lenis resets it to 0 shortly after the scroll gesture ends). ---
    const tick = () => {
      const velocity = Math.abs(getLenis()?.velocity ?? 0);
      const scale = Math.min(MAX_TIME_SCALE, 1 + velocity * VELOCITY_BOOST);
      tweens.forEach((tween) => tween.timeScale(scale));
    };
    gsap.ticker.add(tick);

    // ---- Pause: hovering a fine pointer OR pressing the toggle button (WCAG 2.2.2 requires a
    // control that works without a mouse, which "pause on hover" alone does not give a keyboard
    // or touch user). Combined with `||` so leaving the row while the button is pressed doesn't
    // silently resume the loop the visitor asked to stop. -----------------------------------
    let hovering = false;
    let userPaused = false;
    const applyPauseState = () => {
      const paused = hovering || userPaused;
      tweens.forEach((t) => (paused ? t.pause() : t.resume()));
    };

    const onEnter = (event) => {
      if (event.pointerType === 'touch') return;
      hovering = true;
      applyPauseState();
    };
    const onLeave = (event) => {
      if (event.pointerType === 'touch') return;
      hovering = false;
      applyPauseState();
    };
    section.addEventListener('pointerenter', onEnter);
    section.addEventListener('pointerleave', onLeave);

    const onToggle = () => {
      userPaused = !userPaused;
      toggle.setAttribute('aria-pressed', String(userPaused));
      if (toggleLabel) toggleLabel.textContent = userPaused ? 'Play' : 'Pause';
      applyPauseState();
    };
    if (toggle) {
      toggle.hidden = false; // a dead button (no JS, reduced motion -- this branch never runs) stays hidden
      toggle.setAttribute('aria-pressed', 'false');
      toggle.addEventListener('click', onToggle);
    }

    // ---- Re-measure on resize: the fluid type scale keeps the rows' natural width changing ----
    let resizeTimer = 0;
    const onResize = () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        tweens.forEach((t) => t.kill());
        tweens = rows.map((row, i) => buildLoop(row, i % 2 === 0 ? -1 : 1));
        applyPauseState(); // a rebuilt tween starts running; re-apply hover/button pause if still active
      }, RESIZE_DEBOUNCE_MS);
    };
    window.addEventListener('resize', onResize);

    return () => {
      clearTimeout(resizeTimer);
      window.removeEventListener('resize', onResize);
      section.removeEventListener('pointerenter', onEnter);
      section.removeEventListener('pointerleave', onLeave);
      if (toggle) {
        toggle.removeEventListener('click', onToggle);
        toggle.hidden = true;
        toggle.removeAttribute('aria-pressed');
        if (toggleLabel) toggleLabel.textContent = 'Pause';
      }
      gsap.ticker.remove(tick);
      tweens.forEach((t) => t.kill());
      rows.forEach((row, i) => {
        gsap.set(row, { clearProps: 'transform,willChange' });
        row.replaceChildren(...originals[i]); // drop the clones, restore the once-through list
      });
      delete section.dataset.marqueeJs;
    };
  });
}

export function destroyMarquee() {
  mm?.revert(); // runs the cleanup above
  mm = null;
}
