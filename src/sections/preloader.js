// Preloader: the SHOIB wordmark rises in letter by letter, then the panel wipes away upward.
//
// Whether it plays is decided BEFORE first paint by the inline script in partials/head.html
// (home page only, once per session, never with reduced motion, by adding .is-preloading to
// <html>). This module only performs the animation and cleans up. That split means: no flash of
// page content before the panel, and JS-off visitors never see it at all.

import { gsap } from 'gsap';
import { ease } from '../lib/motion.js';
import { startScroll, stopScroll } from '../lib/scroll.js';

const SEEN_KEY = 'preloader-seen'; // must match the inline script in head.html

// The whole intro lasts 2 seconds. The project brief says "at most 0.8s", but 0.8s flashed past
// before the SHOIB wordmark could be read, so the site owner asked for about 2s on purpose: this
// number overrides the brief. It still only plays on a first visit per session, never with reduced
// motion. Change TOTAL_SECONDS and the three beats below to retime it.
const TOTAL_SECONDS = 2;

// Three beats on one timeline (all times in seconds from its start):
//   0.10 - 0.98  the five letters rise out of their mask, one after another (0.6s each, 0.07s apart)
//   0.98 - 1.40  hold: the whole word sits there, readable
//   1.40 - 2.00  the panel's bottom edge sweeps up to the top (a clip-path inset wipe)
const LETTER_START = 0.1;
const LETTER_DURATION = 0.6;
const LETTER_STAGGER = 0.07; // bigger than motion.js's 0.03 word stagger: these are huge display letters
const WIPE_DURATION = 0.6;
const WIPE_START = TOTAL_SECONDS - WIPE_DURATION;

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

  // A timeline sequences tweens on one shared clock. The last argument of each call is the
  // position: an absolute time in seconds from the start of the timeline. The wipe's position is
  // what leaves the "hold" gap between the two tweens: a timeline is as long as its last tween ends.
  timeline = gsap
    .timeline({ onComplete: finish })
    .fromTo(
      chars,
      { yPercent: 110, opacity: 1 }, // start fully below the mask; opacity 1 undoes the CSS hide
      { yPercent: 0, duration: LETTER_DURATION, ease: ease.out, stagger: LETTER_STAGGER },
      LETTER_START,
    )
    .fromTo(
      panel,
      { clipPath: 'inset(0% 0% 0% 0%)' },
      { clipPath: 'inset(0% 0% 100% 0%)', duration: WIPE_DURATION, ease: ease.inOut },
      WIPE_START,
    );

  if (import.meta.env.DEV && Math.abs(timeline.duration() - TOTAL_SECONDS) > 1e-6) {
    console.warn(`[preloader] the timeline is ${timeline.duration()}s, expected ${TOTAL_SECONDS}s`);
  }
}

export function destroyPreloader() {
  timeline?.kill();
  timeline = null;
  document.documentElement.classList.remove('is-preloading');
  startScroll();
}
