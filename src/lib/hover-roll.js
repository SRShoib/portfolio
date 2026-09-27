// Hover "roll" text swap, the button/link hover from the reference recording (video/Screen
// Recording Hover.mp4): each CHARACTER of a label rolls up and out while an identical copy rolls
// up from below into its place, each one starting a beat after the one before it -- watching the
// real recording frame by frame confirmed the word does not move as one rigid block: the first
// letter is already settled while the last is still mid-roll, which is why this is a per-character
// GSAP stagger (motion.js's existing `stagger.char`, 0.015s) rather than a single CSS transition.
//
// It is JS-driven, on purpose, for two reasons: a CSS transition has no way to stagger its own
// children, and triggering per ELEMENT (pointerenter/focus on the exact link under the pointer)
// rather than per ANCESTOR means hovering one link in a group (a project card's Live/API docs/
// GitHub row) only ever animates that one link, never its siblings.
//
// Progressive enhancement, on purpose: a target's plain text is already a complete, accessible
// label, so with JS off -- or with reduced motion, checked below -- nothing here runs and every
// link/button stays exactly its plain self, still with its own :hover colour change.
import { gsap } from 'gsap';
import { ease, duration, prefersReducedMotion, stagger } from './motion.js';

// Every selector matches a label that is either the interactive element itself (a link/button) or
// a plain decorative span inside one (the monogram's "MHS", the menu toggle's "Menu", a pager
// link's small label) -- enhance() below finds the right element to listen on either way.
const TARGETS = [
  '.monogram span[aria-hidden]',
  '.site-nav__link',
  '.btn:not([data-copy-email])', // Resume, hero buttons, case-study Live/API docs/GitHub, footer Download resume
  '.menu-toggle .label',
  '.project-card__links a', // Live / API docs / GitHub on the home page cards
  '.project-card__case', // "Case study →"
  '.pub-card__doi',
  '.pub-card__credit .ext', // dataset sample credit ("... (Mendeley Data)")
  '.cs-back', // "← All projects"
  '.cs-pager__label', // "← Previous project" / "Next project →"
  '.about__links a', // Codeforces, LeetCode
  '.about__contests a', // contest standings + certificate links
  '.site-footer__links a', // GitHub, LinkedIn, Google Scholar, ResearchGate, ORCID
  '.site-footer__bottom a', // "Back to top ↑"
];

/** One character's clipped, two-line roll box. Both lines sit inside splitIntoChars()'s single
 *  aria-hidden wrapper, so neither needs its own aria-hidden here. */
function buildChar(char) {
  const line = document.createElement('span');
  line.className = 'roll__line';
  line.textContent = char;

  const inner = document.createElement('span');
  inner.className = 'roll__inner';
  inner.append(line, line.cloneNode(true));

  const roll = document.createElement('span');
  roll.className = 'roll';
  roll.append(inner);
  return roll;
}

/** Per-character delay: motion.js's `stagger.char`, shrunk so a long label (a DOI, a sentence)
 *  never takes longer in total than `stagger.group` -- the same cap `staggerEach()` in motion.js
 *  applies to item/card staggers, reused here for characters instead. */
function charStagger(count) {
  return count > 1 ? Math.min(stagger.char, stagger.group / (count - 1)) : 0;
}

/** Splits `el`'s first non-blank text node into one roll box per character, leaving real
 *  whitespace between words as plain text so long labels still wrap normally between words --
 *  only a single word (or an unbroken run like a DOI) can ever overflow its container, exactly as
 *  it could before this ran. Returns the `.roll__inner` elements in reading order, or `null` if
 *  `el` has no such text node (already rolled, or its label lives in a nested element instead).
 *
 *  The whole decorative run is wrapped in one `aria-hidden="true"` span and paired with a
 *  `.sr-only` span holding the plain original string, rather than leaving the visible characters
 *  exposed to assistive tech: a screen reader computes an element's accessible name by joining
 *  each CHILD ELEMENT's own name with a space, same as it would for any other run of sibling
 *  spans, so one span per letter turned every label into its letters read out individually
 *  ("C a u l i f l o w e r...") -- caught by checking the real accessibility tree, not by
 *  reasoning about the markup, since plain `.textContent` doesn't reproduce that space-joining
 *  and would have looked correct right up until a screen reader actually spoke it. */
function splitIntoChars(el) {
  const textNode = [...el.childNodes].find((node) => node.nodeType === Node.TEXT_NODE && node.textContent.trim());
  if (!textNode) return null;

  const decorative = document.createElement('span');
  decorative.setAttribute('aria-hidden', 'true');
  const inners = [];
  for (const piece of textNode.textContent.match(/\s+|\S+/g) ?? []) {
    if (/^\s/.test(piece)) {
      decorative.append(document.createTextNode(piece)); // real space/nbsp: keeps normal word wrapping
      continue;
    }
    for (const char of piece) {
      const roll = buildChar(char);
      decorative.append(roll);
      inners.push(roll.querySelector('.roll__inner'));
    }
  }

  const label = document.createElement('span');
  label.className = 'sr-only';
  label.textContent = textNode.textContent;

  textNode.replaceWith(decorative, label);
  return inners;
}

/** Rolls every character of `inners` up and out of view, staggered left to right, then snaps them
 *  straight back to rest (invisible: both lines hold the same character) so the next hover starts
 *  clean rather than compounding onto wherever a rapid re-hover interrupted the last one. */
function play(inners) {
  gsap.killTweensOf(inners);
  gsap.set(inners, { y: 0, willChange: 'transform' });
  gsap.to(inners, {
    y: '-100%',
    duration: duration.xs,
    ease: ease.out,
    stagger: charStagger(inners.length),
    onComplete: () => gsap.set(inners, { y: 0, clearProps: 'willChange' }),
  });
}

/** Wires one already-in-the-DOM label up: splits its text into rolling characters and plays the
 *  roll on pointer hover (mouse only -- a touch tap synthesizes pointerenter too, same filter
 *  header.js already uses for its menu preview) or keyboard focus, on whichever ancestor is
 *  actually the interactive control (the label itself, for most targets; its enclosing link/button
 *  for the monogram, the menu toggle, and a pager's small label). */
function enhance(labelEl) {
  const inners = splitIntoChars(labelEl);
  if (!inners?.length) return;

  const interactive = labelEl.closest('a, button') ?? labelEl;
  interactive.addEventListener('pointerenter', (event) => {
    if (event.pointerType === 'touch') return;
    play(inners);
  });
  interactive.addEventListener('focus', () => play(inners));
}

/** Enhance every matching label on the current page. Call once, after the DOM is parsed. */
export function initHoverRoll() {
  if (prefersReducedMotion()) return;
  for (const selector of TARGETS) {
    document.querySelectorAll(selector).forEach(enhance);
  }
}

/** Enhance one label built after `initHoverRoll()` already ran (the footer's mailto: link,
 *  assembled at runtime by sections/contact.js). */
export function enhanceRollLink(el) {
  if (prefersReducedMotion() || !el) return;
  enhance(el);
}
