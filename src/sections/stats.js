// Proof stats: each number counts up from 0 once, the first time the list scrolls into view.
//
// Reduced motion / no JS: this module either never runs or never touches the DOM, so the numbers
// stay exactly as authored in the static HTML (CLAUDE.md rule 1's content-first HTML).

import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { conditions, duration, ease, reveal, staggerEach } from '../lib/motion.js';
import { countUp } from '../lib/counters.js';

let mm = null;

export function initStats() {
  const list = document.querySelector('.stats__list');
  const numbers = list ? [...list.querySelectorAll('[data-count]')] : [];
  if (!list || !numbers.length) return;

  mm = gsap.matchMedia();

  mm.add({ motion: conditions.motion }, () => {
    const originals = numbers.map((el) => el.textContent); // restored on cleanup
    const step = staggerEach(numbers.length);
    let tweens = [];

    function run() {
      tweens = numbers.map((el, i) =>
        countUp(el, { to: Number(el.dataset.count), duration: duration.l, ease: ease.out, delay: i * step }),
      );
    }

    const trigger = ScrollTrigger.create({
      trigger: list,
      start: reveal.start, // 'top 85%'
      once: true,
      onEnter: run,
    });

    // ScrollTrigger's onEnter is edge-triggered: it fires on the transition INTO the trigger
    // range, which already happened, before this trigger existed, if the page loads (or the
    // visitor lands via a same-page hash link) already scrolled past `start`. Checked directly
    // against the ScrollTrigger source (the `stateChanged` guard in the update loop): a trigger
    // created mid-range never gets that transition, so onEnter would never fire and the numbers
    // would sit at "0" forever. `progress > 0` right after creation catches exactly that case.
    if (trigger.progress > 0) {
      trigger.kill();
      run();
    }

    return () => {
      trigger.kill();
      tweens.forEach((t) => t.kill());
      numbers.forEach((el, i) => (el.textContent = originals[i]));
    };
  });
}

export function destroyStats() {
  mm?.revert(); // runs the cleanup above
  mm = null;
}
