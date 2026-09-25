// Case-study pages (M5): every section below the hero fades and rises into view once, the same
// way sections/stats.js already reveals the proof stats, and the architecture SVG draws itself
// on -- nodes fade in, then the connecting arrows trace themselves via stroke-dashoffset -- the
// first time it scrolls into view. Reduced motion or no JS: nothing here ever runs, so every
// section and the diagram simply show their plain, fully-drawn static HTML/SVG (CLAUDE.md rule
// 3). 404.html and the home page also load this entry (project.js/main.js); this module just
// finds nothing to do on either and returns.

import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { conditions, duration, ease, reveal, staggerEach } from '../lib/motion.js';

let mm = null;

/** Fade + rise `el` in once it scrolls to `reveal.start`, or immediately if the page already
 *  loaded scrolled past that point (the same onEnter-missed fix documented in stats.js). */
function revealOnce(el) {
  gsap.set(el, { opacity: 0, y: reveal.y });
  const run = () => gsap.to(el, { opacity: 1, y: 0, duration: reveal.duration, ease: reveal.ease });
  const trigger = ScrollTrigger.create({ trigger: el, start: reveal.start, once: true, onEnter: run });
  if (trigger.progress > 0) {
    trigger.kill();
    run();
  }
  return trigger;
}

/** Sets every node to faded-and-shrunk and every line to fully retracted, ready to animate in.
 *  A loop-back line (dashed via CSS, `.diagram-line--loop`) only gets its dash OFFSET set here --
 *  giving it a dasharray too would replace its dash pattern with one long solid dash the moment
 *  the reveal finishes. */
function prepDiagram(svg) {
  const nodes = [...svg.querySelectorAll('.diagram-node')];
  const lines = [...svg.querySelectorAll('.diagram-line')];
  gsap.set(nodes, { opacity: 0, scale: 0.86, transformOrigin: '50% 50%' });
  lines.forEach((line) => {
    const length = line.getTotalLength();
    if (!line.classList.contains('diagram-line--loop')) line.style.strokeDasharray = String(length);
    line.style.strokeDashoffset = String(length);
  });
  return { nodes, lines };
}

/** Builds the (paused) draw-on timeline and starts it via the same onEnter/already-past pattern
 *  as revealOnce, rather than attaching scrollTrigger straight to the timeline: that keeps this
 *  module's two ScrollTriggers behaving identically and avoids relying on toggleActions'
 *  slightly different "already in view" handling. */
function animateDiagram(mount, { nodes, lines }) {
  const tl = gsap.timeline({ paused: true });
  if (nodes.length) {
    tl.to(nodes, { opacity: 1, scale: 1, duration: duration.s, ease: ease.out, stagger: staggerEach(nodes.length) });
  }
  if (lines.length) {
    tl.to(
      lines,
      { strokeDashoffset: 0, duration: duration.m, ease: ease.out, stagger: staggerEach(lines.length) },
      nodes.length ? '-=0.15' : 0,
    );
  }

  const trigger = ScrollTrigger.create({ trigger: mount, start: reveal.start, once: true, onEnter: () => tl.play() });
  if (trigger.progress > 0) {
    trigger.kill();
    tl.play();
  }
  return { trigger, tl };
}

export function initCaseStudy() {
  const revealTargets = [...document.querySelectorAll('.cs-cover, .cs-section, .cs-pager__link')];
  const diagramMount = document.querySelector('[data-diagram-mount]');
  const svg = diagramMount?.querySelector('svg.diagram');
  if (!revealTargets.length && !svg) return; // not a case-study page (404.html, home)

  mm = gsap.matchMedia();

  mm.add({ motion: conditions.motion }, () => {
    const triggers = revealTargets.map(revealOnce);
    const diagram = svg ? animateDiagram(diagramMount, prepDiagram(svg)) : null;

    return () => {
      triggers.forEach((t) => t.kill());
      gsap.set(revealTargets, { clearProps: 'opacity,transform' });
      if (diagram) {
        diagram.trigger.kill();
        diagram.tl.kill();
        gsap.set(svg.querySelectorAll('.diagram-node'), { clearProps: 'opacity,transform' });
        svg.querySelectorAll('.diagram-line').forEach((line) => {
          line.style.strokeDasharray = '';
          line.style.strokeDashoffset = '';
        });
      }
    };
  });
}

export function destroyCaseStudy() {
  mm?.revert(); // runs the cleanup above
  mm = null;
}
