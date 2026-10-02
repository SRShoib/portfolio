// Statement: a short pinned section (CLAUDE.md rule 4's 50vh budget) where the words of the
// statement brighten from dim to full opacity as you scroll through the pin. The accent colour on
// key words is already in the static HTML and is never touched here -- only opacity animates
// (CLAUDE.md's motion principles: "The statement scrub changes opacity only; the accent color on
// key words stays fixed"), so the fully-revealed state is exactly the plain CSS AA-contrast state
// statement.css already describes.

import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';
import { conditions } from '../lib/motion.js';

gsap.registerPlugin(SplitText);

const PIN_VH = 0.5; // CLAUDE.md rule 4's statement budget
const DIM_OPACITY = 0.2;

let mm = null;

export function initStatement() {
  const section = document.querySelector('.statement');
  const text = section?.querySelector('.statement__text');
  if (!section || !text) return;

  mm = gsap.matchMedia();

  // Reduced motion: this whole function is skipped, so the paragraph is never split and stays the
  // plain, fully-opaque, AA-contrast HTML that is already on the page.
  mm.add({ motion: conditions.motion }, () => {
    // type: 'words' wraps each word (and, since the accent span is inline, each word inside it) in
    // its own <span>, keeping the accent class and colour exactly where it was. `tag: 'span'`
    // because the default wrapper is a <div>, which is invalid inside a <p>. `aria: 'none'` opts
    // out of SplitText's default behaviour, which puts aria-label on the <p> (invalid there, and
    // ignored by many screen readers) and aria-hidden="true" on every word -- that would make the
    // whole statement silent to assistive tech. Word spans stay in the accessibility tree instead.
    const split = new SplitText(text, { type: 'words', tag: 'span', wordsClass: 'statement__word', aria: 'none' });

    gsap.set(split.words, { opacity: DIM_OPACITY });

    // Pinned for exactly 50vh (a function, not a fixed number, so a resize recalculates it --
    // lib/scroll.js already calls ScrollTrigger.refresh() after fonts and images load).
    const pin = ScrollTrigger.create({
      trigger: section,
      start: 'center center',
      end: () => `+=${window.innerHeight * PIN_VH}`,
      pin: true,
      refreshPriority: 9, // right after the hero's pin (10), before everything it pushes down; see hero.js
    });

    // A second, separate trigger drives the word brightening, scrubbed over a slightly LONGER
    // range that starts before the pin engages (as the section approaches) and ends exactly when
    // the pin releases. That means the first words are already brightening on the way in, instead
    // of every word waiting, dim, for the pin to grab the page first.
    const reveal = gsap.to(split.words, {
      opacity: 1,
      duration: 1,
      stagger: 0.3, // several words are mid-fade at once, rather than one at a time
      ease: 'none', // scrubbed by scroll: Lenis already smooths the input (see motion.js)
      scrollTrigger: {
        trigger: section,
        start: 'top 75%',
        end: () => pin.end,
        scrub: true,
      },
    });

    return () => {
      pin.kill();
      reveal.scrollTrigger?.kill();
      reveal.kill();
      split.revert(); // restores the plain <p>, so toggling reduced motion never nests spans
    };
  });
}

export function destroyStatement() {
  mm?.revert(); // runs the cleanup above
  mm = null;
}
