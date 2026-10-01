// A floating "back to top" button, present on every page once the visitor has scrolled past the
// first screen, all the way down to the bottom of the page -- the footer included. It is the only
// back-to-top control: the footer's own text link was removed in its favour. Built and appended
// here, not written into a partial, because it is page chrome rather than page content -- the same
// reasoning src/lib/cursor.js and src/lib/backdrop.js already follow for their own JS-only,
// every-page elements.

import { scrollToTarget } from './scroll.js';

export function initBackToTop() {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'back-to-top';
  button.setAttribute('aria-label', 'Back to top');
  button.innerHTML =
    '<svg class="back-to-top__icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
    '<path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M12 19V6M6 12l6-6 6 6"/>' +
    '</svg>';
  document.body.append(button);

  button.addEventListener('click', () => scrollToTarget('#top'));

  // Visible once the visitor has scrolled roughly past the first screen, and from then on until the
  // very bottom -- not tied to any one section, so the same rule works on the home page and on every
  // case study.
  //
  // A plain scroll listener rather than a ScrollTrigger, because a trigger needs an `end` and "the
  // bottom of the page" is not a number that stays put. The first version used
  // `end: ScrollTrigger.maxScroll(window)`, which was measured before the pinned sections (hero,
  // statement, timeline) had added their pin spacing, so it ended ~1,500px short of the real bottom
  // and the button vanished before the footer came into view. Comparing the live scroll position
  // needs no measured end at all. `scroll` fires under Lenis too, since Lenis moves the page with
  // window.scrollTo.
  const update = () => button.classList.toggle('is-visible', window.scrollY > window.innerHeight);
  window.addEventListener('scroll', update, { passive: true });
  update(); // a reload can restore a scroll position part-way down the page
}
