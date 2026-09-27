// Hover "roll" text swap, the button/link hover from the reference recording (video/Screen
// Recording Hover.mp4): on hover or focus, a label's text rolls up and out while an identical
// copy rolls up from below into its place. The CSS transition lives in base.css (.roll,
// .roll__inner, .roll__line); this module only builds the two-line markup it needs, once per
// page load, for a fixed list of short, known-safe labels.
//
// Progressive enhancement, on purpose: a target's plain text is already a complete, accessible
// label, so with JS off -- or with reduced motion, checked below -- nothing here runs and every
// link/button stays exactly its plain self, still with its own :hover colour change.
//
// Only SHORT, fixed-width labels are listed in TARGETS. A label long enough to wrap would have
// its second line clipped by .roll's fixed one-line height, so two real labels are deliberately
// left out: the publications dataset credit line (a full sentence, .ext but outside
// .project-card__links) and .cs-pager__title (a project name, which can run to three or four
// words and does wrap on a narrow phone) -- the pager's own short label ("Previous project" /
// "Next project") still rolls, only the title next to it does not.
import { prefersReducedMotion } from './motion.js';

const TARGETS = [
  '.monogram span[aria-hidden]',
  '.site-nav__link',
  '.btn:not([data-copy-email])', // Resume, case-study Live/API docs/GitHub, footer Download resume
  '.menu-toggle .label',
  '.project-card__links a', // Live / API docs / GitHub on the home page cards
  '.project-card__case', // "Case study →"
  '.pub-card__doi',
  '.cs-back', // "← All projects"
  '.cs-pager__label', // "← Previous project" / "Next project →"
  '.site-footer__links a', // GitHub, LinkedIn, Google Scholar, ResearchGate, ORCID
  '.site-footer__bottom a', // "Back to top ↑"
];

/** Wrap `el`'s first non-blank text node in the two-line roll structure, in place. Skips `el` if
 *  it has no such text node (already rolled, or the label lives in a nested element instead). */
function rollify(el) {
  const textNode = [...el.childNodes].find((node) => node.nodeType === Node.TEXT_NODE && node.textContent.trim());
  if (!textNode) return;

  const line = document.createElement('span');
  line.className = 'roll__line';
  line.textContent = textNode.textContent;

  const clone = line.cloneNode(true);
  clone.setAttribute('aria-hidden', 'true'); // the visible copy already carries the accessible name

  const inner = document.createElement('span');
  inner.className = 'roll__inner';
  inner.append(line, clone);

  const roll = document.createElement('span');
  roll.className = 'roll';
  roll.append(inner);

  textNode.replaceWith(roll);
}

/** Enhance every matching label on the current page. Call once, after the DOM is parsed. */
export function initHoverRoll() {
  if (prefersReducedMotion()) return;
  for (const selector of TARGETS) {
    document.querySelectorAll(selector).forEach(rollify);
  }
}
