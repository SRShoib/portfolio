// Journey timeline: on desktop (>=1024px) with motion allowed, pins the section for exactly
// 100vh (CLAUDE.md rule 4's journey budget -- see timeline.css for the horizontal layout this
// scrubs across) and translates the track sideways as the visitor scrolls through the pin, the
// same pin-then-scrub shape sections/hero.js and sections/statement.js already use for their
// own budgeted pins.
//
// Below 1024px, and with reduced motion, this module returns without building anything: the
// CSS's horizontal layout is ALSO gated on the same width + motion media features (plus
// `html.js`, so a no-JS visitor never gets a horizontal layout nothing can scroll), so the two
// stay in lockstep -- wherever the vertical list is what CSS shows, this module has nothing to do.

import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { conditions } from '../lib/motion.js';

const PIN_VH = 1; // CLAUDE.md rule 4's journey-timeline budget: 100vh

let mm = null;

export function initTimeline() {
  const section = document.querySelector('.timeline');
  const track = section?.querySelector('.timeline__list');
  if (!section || !track) return;

  mm = gsap.matchMedia();

  mm.add({ motion: conditions.motion, desktop: conditions.desktop }, (context) => {
    // matchMedia calls back on every change to ANY listed condition, whether or not it is the one
    // this callback cares about, and does not gate execution for us -- both must be checked here,
    // the same way hero.js and statement.js check `motion` before doing anything pin- or
    // scrub-related. Missing the `motion` check once left the pin+scrub running under reduced
    // motion, which CLAUDE.md requires to fall back to the plain vertical list instead.
    if (!context.conditions.motion || !context.conditions.desktop) return;

    const pin = ScrollTrigger.create({
      trigger: section,
      start: 'top top',
      // A function, not a fixed number: recalculated on ScrollTrigger.refresh() (lib/scroll.js
      // already calls that after fonts and images load), so a resize never leaves a stale pin.
      end: () => `+=${window.innerHeight * PIN_VH}`,
      pin: true,
    });

    const scrub = gsap.to(track, {
      // How far the track has to travel is content width minus viewport width, not a fixed
      // number -- a function so `invalidateOnRefresh` below can recompute it once fonts (which
      // can reflow the track's width) are actually loaded.
      x: () => -Math.max(0, track.scrollWidth - section.clientWidth),
      ease: 'none', // scrubbed by scroll: Lenis already smooths the input (see motion.js)
      scrollTrigger: {
        trigger: section,
        start: 'top top',
        end: () => pin.end,
        scrub: true,
        invalidateOnRefresh: true,
      },
    });

    return () => {
      pin.kill();
      scrub.scrollTrigger?.kill();
      scrub.kill();
      gsap.set(track, { clearProps: 'transform' });
    };
  });
}

export function destroyTimeline() {
  mm?.revert(); // runs the cleanup above
  mm = null;
}
