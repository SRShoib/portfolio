// Header behaviour: the small-screen fullscreen menu's open/close state, its staggered link
// reveal, the preview-image crossfade on hover/focus, and its focus trap.

import { gsap } from 'gsap';
import { duration, ease, prefersReducedMotion, reveal, staggerEach } from '../lib/motion.js';
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
  };
}

export function destroyHeader() {
  teardown?.();
  teardown = null;
}
