// Publications: on tablet+ with motion, the five cards start fanned like a hand of stacked
// papers and spread out into their normal grid position as the section scrolls into view. Once
// settled, publications.css's own hover-expand rule (the same effect split.css uses for the
// Research/Engineering cards) takes over -- see the `settled` flag below for how control hands
// off from this scroll-driven tween to that plain CSS rule.
//
// CLAUDE.md rule 4 is explicit that this section stays UNPINNED, scrubbed during normal scroll
// -- unlike the hero, statement and journey timeline, it does not reserve any of the page's
// 300vh pinned-scroll budget. Below 48em (the breakpoint in publications.css where the grid
// itself becomes a single column -- CLAUDE.md's "a plain list on mobile") and with reduced
// motion, this module returns without touching the DOM and the cards simply sit in their plain,
// fully-readable position from the very first frame (with no inline transform ever set, the
// hover-expand rule already applies immediately, nothing to hand off).

import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { conditions } from '../lib/motion.js';

const FAN_STEP_DEG = 6; // rotation between neighbouring cards, so 5 cards span -12deg..+12deg
const FAN_SCALE = 0.92;
const CARD_DURATION = 1;
const CARD_STAGGER = 0.16; // offset between each card's slice of the shared scrub timeline

let mm = null;

export function initPublications() {
  const wrap = document.querySelector('.pubs__lists');
  const cards = wrap ? [...wrap.querySelectorAll('.pub-card')] : [];
  if (!wrap || !cards.length) return;

  mm = gsap.matchMedia();

  // Three named conditions: `tablet` gates the effect on and off, and `wide` exists only so this
  // whole callback re-runs (remeasuring every card's position from scratch) when the grid's own
  // column count changes at 64em -- the fan's start offsets are pixel deltas to each card's
  // CURRENT natural spot, which moves at both breakpoints. A resize that stays within one
  // bracket (say 800px -> 900px) does not retrigger this, so the fan can go very slightly stale
  // until the next breakpoint crossing or reload -- an acceptable rough edge for a decorative
  // scroll effect, not worth the extra machinery to chase.
  mm.add({ motion: conditions.motion, tablet: '(min-width: 48em)', wide: '(min-width: 64em)' }, (context) => {
    // matchMedia calls back on every change to ANY listed condition, whether or not it is the one
    // this callback cares about, and does not gate execution for us -- both must be checked here,
    // the same way hero.js and statement.js check `motion` before doing anything pin- or
    // scrub-related. Missing the `motion` check once left the fan running under reduced motion.
    if (!context.conditions.motion || !context.conditions.tablet) return;

    const tl = gsap.timeline({ paused: true });
    const anchor = wrap.getBoundingClientRect();
    const anchorX = anchor.left + anchor.width / 2;
    const anchorY = anchor.top + anchor.height * 0.35; // near the top: cards fan outward and down

    cards.forEach((card, i) => {
      const rect = card.getBoundingClientRect();
      const dx = anchorX - (rect.left + rect.width / 2);
      const dy = anchorY - (rect.top + rect.height / 2);
      const angle = (i - (cards.length - 1) / 2) * FAN_STEP_DEG;
      // Cards paint in DOM order, so the LAST card (i = cards.length - 1) is always the one
      // sitting visually on top of the pile -- painting order is fixed and nothing here changes
      // it. It has to be the FIRST to leave (like dealing off the top of a hand of cards), or it
      // spends the back half of the scroll sitting on top of whichever earlier card has already
      // finished settling underneath it, hiding that card exactly like a deck reshuffling itself
      // backwards would. Reversing the stagger (last card gets position 0, first card gets the
      // largest position) is what actually fixed a real bug: the fan used to hand out positions
      // in DOM order, so the top-painted card also left last and sat over the settled first card
      // for a big stretch of the scroll -- easy to land on with an ordinary scroll gesture, since
      // it covered roughly the back third of the whole range, not just a brief instant.
      const position = (cards.length - 1 - i) * CARD_STAGGER;
      tl.fromTo(
        card,
        { x: dx, y: dy, rotation: angle, scale: FAN_SCALE },
        { x: 0, y: 0, rotation: 0, scale: 1, duration: CARD_DURATION, ease: 'none' },
        position,
      );
    });

    // Both ends are pinned to the wrap's own TOP edge, not its bottom: with `bottom 70%` the
    // scrub used to span the wrap's entire height, which -- across two lists and up to three rows
    // -- meant the fan was still resolving well after the first row had scrolled out of view, so
    // it visibly settled while the viewport showed a LATER row, not the first one. Tying `end` to
    // `top 20%` instead makes the whole transition a fixed, modest slice of scroll (about 55% of
    // one viewport height) right as the section arrives, so it is fully settled while the first
    // row is still on screen, however many rows follow underneath.
    //
    // `settled` gates a one-off `clearProps` rather than calling it on every update at progress 1:
    // the scrub tween keeps setting an inline `transform` (x/y/rotation/scale) all the way through,
    // and an inline style always wins over publications.css's own hover-expand rule below no matter
    // its specificity -- so once the fan has fully settled, the inline transform is cleared to hand
    // control to that CSS rule. Scrolling back up past `end` (progress < 1 again) just flips the
    // flag back; the scrub tween itself resumes writing the inline transform on its own very next
    // update, since clearing a prop doesn't detach the tween, only removes what's currently applied.
    let settled = false;
    const trigger = ScrollTrigger.create({
      trigger: wrap,
      start: 'top 75%',
      end: 'top 20%',
      scrub: true,
      animation: tl,
      onUpdate(self) {
        if (self.progress >= 1 && !settled) {
          settled = true;
          gsap.set(cards, { clearProps: 'transform' });
        } else if (self.progress < 1 && settled) {
          settled = false;
        }
      },
    });

    return () => {
      trigger.kill();
      tl.kill();
      gsap.set(cards, { clearProps: 'transform' });
    };
  });
}

export function destroyPublications() {
  mm?.revert(); // runs the cleanup above
  mm = null;
}
