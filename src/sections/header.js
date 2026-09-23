// Header behaviour. For now that is the small-screen menu: open/close state, Escape,
// and closing when a link is chosen. The staggered link reveal, preview-image crossfade
// and focus trap are M4.

import { startScroll, stopScroll } from '../lib/scroll.js';

let teardown = null;

export function initHeader() {
  const header = document.querySelector('[data-header]');
  const toggle = header?.querySelector('[data-menu-toggle]');
  const nav = header?.querySelector('#site-nav');
  if (!header || !toggle || !nav) return;

  const root = document.documentElement;
  const wide = window.matchMedia('(min-width: 48em)'); // must match the breakpoint in header.css
  const isOpen = () => toggle.getAttribute('aria-expanded') === 'true';

  function setOpen(open) {
    if (open === isOpen()) return;
    toggle.setAttribute('aria-expanded', String(open));
    header.toggleAttribute('data-menu-open', open); // CSS shows the menu from this attribute
    root.classList.toggle('is-menu-open', open); // CSS stops the page behind it from scrolling
    if (open) stopScroll(); // …and Lenis, which would otherwise still glide the page
    else startScroll();
  }

  const onToggle = () => setOpen(!isOpen());

  const onKeydown = (event) => {
    if (event.key === 'Escape' && isOpen()) {
      setOpen(false);
      toggle.focus(); // hand focus back to the button that opened the menu
    }
  };

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
  };
}

export function destroyHeader() {
  teardown?.();
  teardown = null;
}
