// Smooth scrolling: Lenis (the smoothing) + GSAP ScrollTrigger (the scroll-linked animation),
// wired to one clock. Every other module that needs to scroll, stop or start scrolling goes
// through the helpers exported here, never straight to Lenis.

import Lenis from 'lenis';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { conditions } from './motion.js';

gsap.registerPlugin(ScrollTrigger);

// Mobile browsers hide and show the address bar while you scroll, which fires resize events.
// Left alone, ScrollTrigger would recalculate every pinned section on each of those and the
// page would jump. This tells it to ignore height-only resizes on touch devices.
ScrollTrigger.config({ ignoreMobileResize: true });

let lenis = null; // null whenever reduced motion is on
let mm = null; // the gsap.matchMedia context that owns the Lenis instance

export const getLenis = () => lenis;
export const stopScroll = () => lenis?.stop();
export const startScroll = () => lenis?.start();

/**
 * Scroll to an element (or selector), landing just below the fixed header.
 * Uses Lenis when it is running and the browser's own scrolling otherwise.
 *
 * "Just below the header" is one CSS value, `scroll-padding-top: var(--header-h)` in base.css.
 * The browser honours it natively, and Lenis (1.3+) reads it too, so both paths land in the
 * same place with no offset maths here. (Passing our own offset as well would count the
 * header twice: an easy mistake, and the first version of this function made it.)
 */
export function scrollToTarget(target, { immediate = false } = {}) {
  const el = typeof target === 'string' ? document.querySelector(target) : target;
  if (!el) return false;

  if (lenis) lenis.scrollTo(el, { immediate });
  else el.scrollIntoView({ block: 'start' });
  return true;
}

// Header links are written as "/#work" so they also work from the case-study pages. Lenis's
// built-in anchor support only recognises "#work", so we handle same-page hash links ourselves.
function onAnchorClick(event) {
  if (event.defaultPrevented || event.button !== 0) return;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

  const link = event.target.closest?.('a[href]');
  if (!link) return;

  const url = new URL(link.href, location.href);
  const samePage = url.origin === location.origin && url.pathname === location.pathname;
  if (!samePage || url.hash.length < 2) return; // different page: let the browser navigate

  const target = document.getElementById(decodeURIComponent(url.hash.slice(1)));
  if (!target) return;

  event.preventDefault();
  scrollToTarget(target);
  if (location.hash !== url.hash) history.pushState(null, '', url.hash);
  // preventDefault skipped the browser's own "move focus to the target" step. Do it by hand so
  // keyboard and screen-reader users continue from the section they jumped to.
  if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
  target.focus({ preventScroll: true });
}

export function initScroll() {
  mm = gsap.matchMedia();

  // Only the `motion` condition is passed, so this callback re-runs only when the visitor
  // toggles their reduced-motion setting. With reduced motion on it never runs: no Lenis, and
  // the browser scrolls natively. matchMedia calls the returned function to clean up.
  mm.add({ motion: conditions.motion }, () => {
    const instance = new Lenis({
      autoRaf: false, // we drive it from gsap.ticker below, not from its own requestAnimationFrame
    });
    lenis = instance;

    // 1) Every time Lenis moves the page, tell ScrollTrigger the scroll position changed.
    instance.on('scroll', ScrollTrigger.update);

    // 2) Advance Lenis on GSAP's clock so both libraries update in the same frame.
    //    gsap.ticker passes seconds; Lenis.raf wants milliseconds.
    const tick = (seconds) => instance.raf(seconds * 1000);
    gsap.ticker.add(tick);

    // GSAP normally "smooths over" long frames by slowing its clock. Lenis would then be fed
    // a clock that disagrees with real time and the scroll would stutter, so turn it off.
    gsap.ticker.lagSmoothing(0);

    // A backgrounded tab throttles (often to a near-standstill) requestAnimationFrame, so with
    // lag smoothing deliberately off, the tick that finally runs when the tab regains focus can
    // report a multi-second elapsed time straight into Lenis -- which it would otherwise try to
    // reconcile in one step, reading as a sudden scroll jump/stutter rather than the smooth glide
    // Lenis exists for. Stopping Lenis while hidden and starting it again on return means there is
    // nothing to reconcile: the scroll position never tried to move while nobody could see it.
    const onVisibilityChange = () => {
      if (document.hidden) instance.stop();
      else instance.start();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      gsap.ticker.remove(tick);
      gsap.ticker.lagSmoothing(500, 33); // GSAP's default, restored
      instance.destroy();
      if (lenis === instance) lenis = null;
    };
  });

  document.addEventListener('click', onAnchorClick);

  // Pinned sections measure the page. Fonts and images change its height after first layout,
  // so re-measure once web fonts are ready and once everything (images too) has loaded.
  document.fonts?.ready.then(() => ScrollTrigger.refresh());
  window.addEventListener('load', () => ScrollTrigger.refresh(), { once: true });
}

export function destroyScroll() {
  document.removeEventListener('click', onAnchorClick);
  mm?.revert(); // runs the cleanup above, which destroys Lenis
  mm = null;
}
