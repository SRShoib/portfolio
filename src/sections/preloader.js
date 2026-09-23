// Preloader: the SHOIB wordmark rises in letter by letter, then the panel wipes away upward.
//
// Whether it plays is decided BEFORE first paint by the inline script in partials/head.html
// (home page only, once per session, never with reduced motion, by adding .is-preloading to
// <html>). This module only performs the animation and cleans up. That split means: no flash of
// page content before the panel, and JS-off visitors never see it at all.

import { gsap } from 'gsap';
import { duration, ease, stagger } from '../lib/motion.js';
import { startScroll, stopScroll } from '../lib/scroll.js';

const SEEN_KEY = 'preloader-seen'; // must match the inline script in head.html
const MAX_SECONDS = 0.8; // hard budget from CLAUDE.md

let timeline = null;

// Later milestones (the hero intro in M3) can `await preloaderDone` to start after the wipe.
let resolveDone;
export const preloaderDone = new Promise((resolve) => (resolveDone = resolve));

function finish() {
  document.documentElement.classList.remove('is-preloading');
  startScroll();
  resolveDone();
}

export function initPreloader() {
  // Mark it seen straight away so a reload mid-animation doesn't replay it. sessionStorage can
  // throw (blocked storage, private modes), and the page must never break because of that.
  try {
    sessionStorage.setItem(SEEN_KEY, '1');
  } catch {
    /* ignore */
  }

  const panel = document.querySelector('[data-preloader-el]');
  if (!panel || !document.documentElement.classList.contains('is-preloading')) {
    finish(); // not playing this visit (or the failsafe timer already dismissed it)
    return;
  }

  stopScroll();
  const chars = panel.querySelectorAll('.preloader__char');

  // A timeline sequences tweens on one shared clock. The third argument of each call is the
  // position: an absolute time in seconds from the start of the timeline.
  //   0.00 - 0.32s  letters rise out of their mask (0.2s each, 0.03s apart, 5 letters)
  //   0.40 - 0.80s  the panel's bottom edge sweeps up to the top (clip-path inset)
  timeline = gsap
    .timeline({ onComplete: finish })
    .fromTo(
      chars,
      { yPercent: 110, opacity: 1 }, // start fully below the mask; opacity 1 undoes the CSS hide
      { yPercent: 0, duration: duration.xs, ease: ease.out, stagger: stagger.word },
      0,
    )
    .fromTo(
      panel,
      { clipPath: 'inset(0% 0% 0% 0%)' },
      { clipPath: 'inset(0% 0% 100% 0%)', duration: duration.s, ease: ease.inOut },
      0.4,
    );

  if (import.meta.env.DEV && timeline.duration() > MAX_SECONDS + 1e-6) {
    console.warn(`[preloader] ${timeline.duration()}s exceeds the ${MAX_SECONDS}s budget`);
  }
}

export function destroyPreloader() {
  timeline?.kill();
  timeline = null;
  document.documentElement.classList.remove('is-preloading');
  startScroll();
}
