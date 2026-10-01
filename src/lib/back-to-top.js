// A floating "back to top" button, present on every page regardless of scroll position (unlike
// the plain text link in the footer, which only exists at the very bottom of the page). Built and
// appended here, not written into a partial, because it is page chrome rather than page content --
// the same reasoning src/lib/cursor.js and src/lib/backdrop.js already follow for their own
// JS-only, every-page elements.

import { ScrollTrigger } from 'gsap/ScrollTrigger';
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

  // Visible once the visitor has scrolled roughly past the first screen -- not tied to any one
  // section, so the same threshold works on the home page and on every case study. `start` is a
  // function so a resize (e.g. rotating a phone) re-measures it on the next ScrollTrigger.refresh().
  ScrollTrigger.create({
    trigger: document.body,
    start: () => `top -${window.innerHeight}`,
    end: () => ScrollTrigger.maxScroll(window),
    toggleClass: { targets: button, className: 'is-visible' },
  });
}
