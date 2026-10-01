// Hover "roll" text swap, the button/link hover from the reference recording (video/Screen
// Recording Hover.mp4): each CHARACTER of a label rolls up and out while an identical copy rolls
// up from below into its place, each one starting a beat after the one before it -- watching the
// real recording frame by frame confirmed the word does not move as one rigid block: the first
// letter is already settled while the last is still mid-roll, which is why this is a per-character
// GSAP stagger (motion.js's existing `stagger.char`, 0.015s) rather than a single CSS transition.
// Moving the pointer away reverses it: the label rolls back DOWN and out, with another identical
// copy arriving from ABOVE -- the same motion played backwards, not just an instant snap back.
//
// It is JS-driven, on purpose, for two reasons: a CSS transition has no way to stagger its own
// children, and triggering per ELEMENT (pointerenter/pointerleave/focus/blur on the exact link
// under the pointer) rather than per ANCESTOR means hovering one link in a group (a project card's
// Live/API docs/GitHub row) only ever animates that one link, never its siblings.
//
// Progressive enhancement, on purpose: a target's plain text is already a complete, accessible
// label, so with JS off -- or with reduced motion, checked below -- nothing here runs and every
// link/button stays exactly its plain self, still with its own :hover colour change.
import { gsap } from 'gsap';
import { afterFirstPaint, ease, duration, prefersReducedMotion, stagger } from './motion.js';

// Every selector matches a label that is either the interactive element itself (a link/button) or
// a plain decorative span inside one (the monogram's "MHS", the menu toggle's "Menu", a pager
// link's small label) -- enhance() below finds the right element to listen on either way.
const TARGETS = [
  '.monogram span[aria-hidden]',
  '.site-nav__link',
  '.btn', // Resume, hero buttons, case-study Live/API docs/GitHub, footer Download resume + Copy email
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
  '.split__link', // "See publications" / "See selected work"
];

// A roll plays in three positions, one line-height apart: ABOVE (rest, entered from a leave),
// CURRENT (rest, the very first paint) and BELOW (rest, entered from an enter). All three are
// identical text, so which one is actually showing at rest is never visible -- only the MOTION
// between them is. Three physical copies (not two) are what make the effect reversible: sliding
// the same two-copy strip back down would just uncover empty space, since there is nothing above
// the first copy to slide in.
const REST = -1; // the middle copy, in units of "one character's own line height"
const ENTERED = -2; // one line further up: the BELOW copy has taken its place
const LEFT = 0; // one line back down: the ABOVE copy has taken its place

/** One character's clipped, three-line roll box. All three lines sit inside splitIntoChars()'s
 *  single aria-hidden wrapper, so none of them needs its own aria-hidden here. */
function buildChar(char) {
  const line = document.createElement('span');
  line.className = 'roll__line';
  line.textContent = char;

  const inner = document.createElement('span');
  inner.className = 'roll__inner';
  inner.append(line, line.cloneNode(true), line.cloneNode(true));

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
 *  it could before this ran. Returns `{ decorative, inners }` (the wrapper and its `.roll__inner`
 *  elements, in reading order), or `null` if `el` has no such text node (already rolled, or its
 *  label lives in a nested element instead).
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
  // base.css's `.above-stretched` (position: relative; z-index: 1): a `.stretched` link's real
  // clickable area is its own ::after, absolutely positioned to cover its whole parent card, which
  // paints ABOVE normal-flow content in the same stacking context regardless of DOM nesting -- so
  // without this, this span (a plain, non-positioned child of the link) never receives a pointer
  // event at all, anywhere in the card, even directly over its own visible text. Harmless where
  // there is no such overlay to begin with (position: relative with no offset does not move
  // anything), so it is simplest to add to every target rather than only the ones that need it.
  decorative.classList.add('above-stretched');
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
  return { decorative, inners };
}

/** One character's own line height in pixels: `.roll`'s rendered height is exactly `1lh` (its CSS
 *  in base.css), so reading it back gives the true pixel figure with no unit-conversion of its own
 *  -- read fresh on every call (not cached), so a later resize (this site's headings and labels are
 *  all fluid-clamped, not fixed sizes) can never leave a stale distance behind. */
function lineHeightOf(inner) {
  return inner.parentElement.getBoundingClientRect().height;
}

/** Moves every character of `inners` to `steps` line-heights above its resting position (see the
 *  REST/ENTERED/LEFT constants), staggered left to right, then snaps back to REST once the tween
 *  finishes -- invisible, since all three copies are identical text -- so the next hover in either
 *  direction always starts from the same clean baseline instead of compounding onto wherever a
 *  rapid re-hover interrupted the last one. */
function play(inners, steps) {
  gsap.killTweensOf(inners);
  gsap.set(inners, { willChange: 'transform' });
  gsap.to(inners, {
    y: (_i, target) => steps * lineHeightOf(target),
    duration: duration.s,
    ease: ease.out,
    stagger: charStagger(inners.length),
    onComplete: () => gsap.set(inners, { y: (_i, target) => REST * lineHeightOf(target), clearProps: 'willChange' }),
  });
}

/** Wires one already-in-the-DOM label up: splits its text into rolling characters and plays the
 *  roll forward on pointer hover (mouse only -- a touch tap synthesizes pointerenter too, same
 *  filter header.js already uses for its menu preview) or keyboard focus, and back in reverse on
 *  pointer leave or blur.
 *
 *  Pointer events listen on the DECORATIVE wrapper itself, not on the interactive link/button --
 *  several targets (a project card's "Case study", the Research/Engineering split's "See
 *  publications"/"See selected work") are a `.stretched` link (base.css): the actual clickable
 *  area is that link's own `::after`, sized to cover its WHOLE parent card, not just its visible
 *  text. Listening on the link itself rolled the label from anywhere in the card; the decorative
 *  span's rendered box is only ever the small visible text, wherever it happens to sit, so it
 *  naturally only ever receives pointer events actually over that text. Focus/blur still listen on
 *  the real interactive element (the label itself, for most targets; its enclosing link/button for
 *  the monogram, the menu toggle, and a pager's small label) -- a plain `<span>` is never
 *  focusable, and tabbing to a stretched link is never spatially ambiguous the way a mouse is. */
// interactive element -> its current { enter, leave }, so re-enhancing a label whose text changed
// at runtime (contact.js's "Copy email" -> "Copied" -> "Copy email") can remove the PREVIOUS pair
// before adding a new one, instead of quietly stacking duplicate focus/blur listeners on the same
// persistent button every time its label changes.
const rollListeners = new WeakMap();

function enhance(labelEl) {
  const split = splitIntoChars(labelEl);
  if (!split?.inners.length) return;
  const { decorative, inners } = split;

  gsap.set(inners, { y: (_i, target) => REST * lineHeightOf(target) });

  const interactive = labelEl.closest('a, button') ?? labelEl;
  const enter = () => play(inners, ENTERED);
  const leave = () => play(inners, LEFT);
  decorative.addEventListener('pointerenter', (event) => {
    if (event.pointerType !== 'touch') enter();
  });
  decorative.addEventListener('pointerleave', (event) => {
    if (event.pointerType !== 'touch') leave();
  });

  const previous = rollListeners.get(interactive);
  if (previous) {
    interactive.removeEventListener('focus', previous.enter);
    interactive.removeEventListener('blur', previous.leave);
  }
  interactive.addEventListener('focus', enter);
  interactive.addEventListener('blur', leave);
  rollListeners.set(interactive, { enter, leave });
}

/** Enhance every matching label on the current page. Call once, after the DOM is parsed.
 *
 *  Deferred with `afterFirstPaint()`, the same helper hero.js uses to push its own heavy setup off
 *  the critical path: measured directly, splitting every target's text into characters (roughly
 *  750 of them on the home page) blocked the main thread for ~40ms when it ran synchronously here,
 *  ahead of the header, preloader and hero. Purely decorative and purely additive (every target is
 *  already its plain, fully readable, fully accessible self without it), so a visitor can hover a
 *  link in the brief window before this resolves and simply gets that component's existing
 *  `:hover` colour change with no roll yet -- not broken, just not yet enhanced. */
export function initHoverRoll() {
  if (prefersReducedMotion()) return;
  afterFirstPaint().then(() => {
    for (const selector of TARGETS) {
      document.querySelectorAll(selector).forEach(enhance);
    }
  });
}

/** Enhance one label built after `initHoverRoll()` already ran (the footer's mailto: link,
 *  assembled at runtime by sections/contact.js). */
export function enhanceRollLink(el) {
  if (prefersReducedMotion() || !el) return;
  enhance(el);
}
