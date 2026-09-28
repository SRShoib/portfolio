// Header behaviour: the small-screen fullscreen menu's open/close state, its staggered link
// reveal, the preview-image crossfade on hover/focus, and its focus trap.

import { gsap } from 'gsap';
import { duration, ease, motionDuration, prefersReducedMotion, reveal, staggerEach } from '../lib/motion.js';
import { startScroll, stopScroll } from '../lib/scroll.js';

let teardown = null;

export function initHeader() {
  const header = document.querySelector('[data-header]');
  const toggle = header?.querySelector('[data-menu-toggle]');
  const nav = header?.querySelector('#site-nav');
  const main = document.getElementById('main');
  if (!header || !toggle || !nav || !main) return;

  const root = document.documentElement;
  const wide = window.matchMedia('(min-width: 48em)'); // must match the breakpoint in header.css
  const isOpen = () => toggle.getAttribute('aria-expanded') === 'true';

  const links = [...nav.querySelectorAll('.site-nav__link')];
  let linksTween = null;

  // ---- Preview crossfade -------------------------------------------------------------------
  // The template's images (see partials/header.html) are cloned into the page only once, on the
  // first hover/focus that needs one: nothing is downloaded on page load, with JS off, or on a
  // touch tap, and never at all for a visitor who only ever uses the Escape/click paths.
  const previewContainer = header.querySelector('[data-menu-preview]');
  const previewTemplate = header.querySelector('[data-menu-previews]');
  const previewLinks = links.filter((link) => link.dataset.preview);
  const previewImages = new Map(); // preview key -> <img>

  function ensurePreviews() {
    if (previewImages.size || !previewContainer || !previewTemplate) return;
    previewContainer.append(previewTemplate.content.cloneNode(true));
    previewContainer.querySelectorAll('[data-preview]').forEach((el) => {
      const img = el.querySelector('img');
      if (img) previewImages.set(el.dataset.preview, img);
    });
  }

  function showPreview(key) {
    ensurePreviews();
    previewImages.forEach((img, k) => img.classList.toggle('is-active', k === key));
  }
  function hidePreview() {
    previewImages.forEach((img) => img.classList.remove('is-active'));
  }

  const previewListeners = previewLinks.map((link) => {
    // pointerenter/leave don't bubble and don't fire for touch the way hover implies, but a touch
    // tap still dispatches them; pointerType filters that out, since a tap should just navigate.
    const onPointerEnter = (event) => {
      if (event.pointerType !== 'touch') showPreview(link.dataset.preview);
    };
    const onPointerLeave = (event) => {
      if (event.pointerType !== 'touch') hidePreview();
    };
    const onFocus = () => showPreview(link.dataset.preview);
    const onBlur = () => hidePreview();
    link.addEventListener('pointerenter', onPointerEnter);
    link.addEventListener('pointerleave', onPointerLeave);
    link.addEventListener('focus', onFocus);
    link.addEventListener('blur', onBlur);
    return () => {
      link.removeEventListener('pointerenter', onPointerEnter);
      link.removeEventListener('pointerleave', onPointerLeave);
      link.removeEventListener('focus', onFocus);
      link.removeEventListener('blur', onBlur);
    };
  });

  // ---- Sliding indicator + scroll-spy ---------------------------------------------------------
  // A pill that follows whichever link is hovered/focused, resting under the link for whichever
  // section is currently scrolled into view otherwise. It only ever shows in the wide inline nav:
  // header.css hides it in the narrow fullscreen menu, where its geometry assumptions (one shared
  // row height, an x-offset measured along that row) don't hold for a stacked column of links.
  const indicator = nav.querySelector('[data-nav-indicator]');
  const sectionLinks = links
    .map((link) => {
      const id = link.getAttribute('href')?.split('#')[1];
      const section = id && document.getElementById(id);
      return section ? { link, section } : null;
    })
    .filter(Boolean);

  let activeLink = null;
  let shownLink = null; // whichever link the pill is currently on, so a resize can re-measure it
  let hovering = false;

  function place(link, { animate = true } = {}) {
    if (!indicator) return;
    shownLink = link;
    const dur = animate ? motionDuration('s') : 0;
    if (!link) {
      gsap.to(indicator, { opacity: 0, duration: dur, ease: ease.out });
      return;
    }
    const navRect = nav.getBoundingClientRect();
    const linkRect = link.getBoundingClientRect();
    gsap.to(indicator, { x: linkRect.left - navRect.left, width: linkRect.width, opacity: 1, duration: dur, ease: ease.out });
  }

  const onLinkPointerEnter = (event) => {
    if (event.pointerType === 'touch') return;
    hovering = true;
    place(event.currentTarget);
  };
  const onLinkFocus = (event) => {
    hovering = true;
    place(event.currentTarget);
  };
  links.forEach((link) => {
    link.addEventListener('pointerenter', onLinkPointerEnter);
    link.addEventListener('focus', onLinkFocus);
  });

  // Listening on `nav` itself (not per link) means moving the pointer between two adjacent links
  // never fires a leave/restore in between -- pointerleave only fires once the pointer is outside
  // the whole nav, not between its children.
  const onNavPointerLeave = () => {
    hovering = false;
    place(activeLink);
  };
  // `focusout` bubbles (plain `blur` does not), so one listener on `nav` covers every link; the
  // `relatedTarget` check is the focus equivalent of the pointerleave reasoning above -- tabbing
  // from one link to the next is still "inside nav" and should not flicker back to `activeLink`.
  const onNavFocusOut = (event) => {
    if (nav.contains(event.relatedTarget)) return;
    hovering = false;
    place(activeLink);
  };
  nav.addEventListener('pointerleave', onNavPointerLeave);
  nav.addEventListener('focusout', onNavFocusOut);

  // "Currently in view" = has crossed a thin band near the middle of the viewport, so exactly one
  // section counts as active at a time instead of weighing partial-visibility percentages. Guarded
  // on sectionLinks.length: a case-study page shares this same header markup but has none of these
  // sections, so there is nothing to observe there and the pill only ever responds to hover.
  //
  // One nav target (#skills) sits INSIDE another (#about), so both can be "intersecting" the band
  // at once -- e.g. scrolled to the skills chips, #about still contains that scroll position too.
  // `intersecting` tracks every target's current state (not just what changed in the latest
  // callback batch), so `pickActive()` can always see the full picture and prefer whichever active
  // section is nested INSIDE the others (the more specific match) over an ancestor that merely
  // happens to also span that scroll position.
  let sectionObserver = null;
  if (indicator && sectionLinks.length) {
    const intersecting = new Map(sectionLinks.map(({ section }) => [section, false]));
    const pickActive = () => {
      const active = sectionLinks.filter(({ section }) => intersecting.get(section));
      const specific = active.find(({ section }) => !active.some((other) => other.section !== section && section.contains(other.section)));
      return (specific ?? active[active.length - 1])?.link ?? null;
    };
    sectionObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) intersecting.set(entry.target, entry.isIntersecting);
        const link = pickActive();
        if (!link || link === activeLink) return;
        activeLink?.classList.remove('is-current');
        activeLink = link;
        activeLink.classList.add('is-current');
        if (!hovering) place(activeLink);
      },
      { rootMargin: '-45% 0px -50% 0px' },
    );
    sectionLinks.forEach(({ section }) => sectionObserver.observe(section));
  }

  // Link positions/widths shift on resize (fluid type, breakpoint changes); re-measure whatever
  // the pill is currently showing instead of leaving it stale until the next hover.
  const onResize = () => {
    if (shownLink) place(shownLink, { animate: false });
  };
  window.addEventListener('resize', onResize);

  // ---- Open / close -------------------------------------------------------------------------
  function setOpen(open) {
    if (open === isOpen()) return;
    toggle.setAttribute('aria-expanded', String(open));
    header.toggleAttribute('data-menu-open', open); // CSS shows the menu from this attribute
    root.classList.toggle('is-menu-open', open); // CSS stops the page behind it from scrolling
    if (open) stopScroll(); // …and Lenis, which would otherwise still glide the page
    else startScroll();

    // Focus trap, part 1: everything the fullscreen overlay covers is made `inert` -- unreachable
    // by Tab, unclickable, AND skipped by a screen reader's swipe/browse navigation (not just Tab)
    // -- for as long as the menu is open. That is more than `main`: the skip link and the footer
    // are both siblings of `main` (see partials/header.html and every page's body), not inside it,
    // so inerting only `main` left both reachable by swipe gestures behind the mobile menu. Instead
    // this inerts every body child except the header itself. Part 2, the Tab wrap between the
    // header's own controls, is in onKeydown below.
    for (const el of document.body.children) {
      if (el !== header) el.inert = open;
    }

    linksTween?.kill();
    if (open && !prefersReducedMotion()) {
      // Staggered reveal: each link rises and fades in, capped (staggerEach) so five links never
      // take longer in total than motion.js's stagger.group budget. A short delay lets the
      // container's own opacity transition (header.css) get a head start, so the panel is
      // visibly there before its contents start arriving.
      linksTween = gsap.fromTo(
        links,
        { opacity: 0, y: reveal.y },
        { opacity: 1, y: 0, duration: duration.s, ease: ease.out, stagger: staggerEach(links.length), delay: 0.08 },
      );
    } else {
      // Closing, or reduced motion opening: no per-link transform. Clearing any inline styles a
      // previous stagger left means a link never appears half-faded in the >=768px inline nav,
      // which reuses this same markup without ever calling setOpen.
      gsap.set(links, { clearProps: 'opacity,transform' });
      if (!open) hidePreview();
    }
  }

  const onToggle = () => setOpen(!isOpen());

  // Focus trap, part 2: Tab/Shift+Tab cycles among the header's own focusable controls (the
  // monogram, the links, Resume, the toggle itself -- all of which stay visually on top of the
  // menu's own background; see header.css's stacking comment) instead of leaving the header
  // range once every other body child has gone `inert` above.
  function onKeydown(event) {
    if (event.key === 'Escape' && isOpen()) {
      setOpen(false);
      toggle.focus(); // hand focus back to the button that opened the menu
      return;
    }
    if (event.key !== 'Tab' || !isOpen()) return;
    const focusable = [...header.querySelectorAll('a[href], button')];
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  // Runs before scroll.js's document-level anchor handler (this listener is lower in the tree),
  // so Lenis is running again by the time that handler asks it to scroll.
  const onNavClick = (event) => {
    if (event.target.closest('a')) setOpen(false);
  };

  // Rotating a phone or resizing past 768px turns the menu into the inline nav: reset it.
  const onBreakpoint = () => {
    if (wide.matches) setOpen(false);
  };

  toggle.addEventListener('click', onToggle);
  nav.addEventListener('click', onNavClick);
  document.addEventListener('keydown', onKeydown);
  wide.addEventListener('change', onBreakpoint);

  teardown = () => {
    setOpen(false);
    toggle.removeEventListener('click', onToggle);
    nav.removeEventListener('click', onNavClick);
    document.removeEventListener('keydown', onKeydown);
    wide.removeEventListener('change', onBreakpoint);
    previewListeners.forEach((remove) => remove());
    linksTween?.kill();

    links.forEach((link) => {
      link.removeEventListener('pointerenter', onLinkPointerEnter);
      link.removeEventListener('focus', onLinkFocus);
    });
    nav.removeEventListener('pointerleave', onNavPointerLeave);
    nav.removeEventListener('focusout', onNavFocusOut);
    sectionObserver?.disconnect();
    window.removeEventListener('resize', onResize);
    if (indicator) gsap.killTweensOf(indicator);
  };
}

export function destroyHeader() {
  teardown?.();
  teardown = null;
}
