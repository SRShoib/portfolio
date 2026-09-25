// About portrait: a clip-path wipe from the bottom while the <img> inside scales from 1.15 down
// to 1, the first time the section scrolls into view (once, like every other reveal in this
// codebase -- reveal.start = 'top 85%', from motion.js). The frame does the clipping and the
// <img> does the scaling because base.css's "Image frames" block already makes the frame the
// `overflow: hidden` window and the <img> the absolutely-positioned thing inside it -- the exact
// split this reveal needs, already there for every framed picture on the site.
//
// Reduced motion swaps this for a plain opacity fade capped at duration.xs (200ms). CLAUDE.md
// calls this out explicitly for the portrait ("Reduced motion: a simple fade-in"), unlike the
// other one-shot reveals in this codebase (stats, case-study, timeline, publications), which skip
// animating altogether under reduced motion because their UN-animated default state is already
// the fully visible one -- here the full-motion state starts the frame fully clipped away, so
// reduced motion needs its own, much smaller, animation rather than just doing nothing.

import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { conditions, duration, ease, reveal } from '../lib/motion.js';

let mm = null;

export function initAbout() {
  const frame = document.querySelector('.about__portrait');
  const img = frame?.querySelector('img');
  if (!frame || !img) return;

  mm = gsap.matchMedia();

  mm.add({ motion: conditions.motion, reduce: conditions.reduce }, (context) => {
    const { motion, reduce } = context.conditions;

    if (reduce) {
      gsap.set([frame, img], { opacity: 0 });
      const run = () => gsap.to([frame, img], { opacity: 1, duration: duration.xs, ease: ease.out });
      const trigger = ScrollTrigger.create({ trigger: frame, start: reveal.start, once: true, onEnter: run });
      // Page loaded (or a same-page hash link landed) already scrolled past `start`: onEnter is
      // edge-triggered and would never fire, so run immediately instead (same fix as stats.js).
      if (trigger.progress > 0) {
        trigger.kill();
        run();
      }
      return () => {
        trigger.kill();
        gsap.set([frame, img], { clearProps: 'opacity' });
      };
    }

    if (!motion) return; // neither `no-preference` nor `reduce` matched (should not happen)

    gsap.set(frame, { clipPath: 'inset(0% 0 100% 0)', willChange: 'clip-path' });
    gsap.set(img, { scale: 1.15, willChange: 'transform' });

    const tl = gsap
      .timeline({ paused: true, onComplete: () => gsap.set([frame, img], { clearProps: 'willChange' }) })
      .to(frame, { clipPath: 'inset(0% 0 0% 0)', duration: duration.l, ease: ease.inOut }, 0)
      .to(img, { scale: 1, duration: duration.l, ease: ease.out }, 0);

    const trigger = ScrollTrigger.create({ trigger: frame, start: reveal.start, once: true, onEnter: () => tl.play() });
    if (trigger.progress > 0) {
      trigger.kill();
      tl.play();
    }

    return () => {
      trigger.kill();
      tl.kill();
      gsap.set(frame, { clearProps: 'clipPath,willChange' });
      gsap.set(img, { clearProps: 'scale,willChange' });
    };
  });
}

export function destroyAbout() {
  mm?.revert(); // runs the cleanup above
  mm = null;
}
