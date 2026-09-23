// Shared motion vocabulary. Every animation in the site pulls its eases, durations and
// staggers from here, so the whole site moves with one personality and you tune it in one
// place. The same values exist as CSS custom properties in styles/tokens.css for CSS
// transitions; checkTokenSync() (dev only) warns if the two copies ever disagree.

import { gsap } from 'gsap';
import { CustomEase } from 'gsap/CustomEase';

gsap.registerPlugin(CustomEase);

// ---- Eases ------------------------------------------------------------------------
// A cubic-bezier is defined by its two control points: [x1, y1, x2, y2]. The same four
// numbers work in CSS (`cubic-bezier(.22,1,.36,1)`) and, through CustomEase, in GSAP.
export const bezier = {
  out: [0.22, 1, 0.36, 1], // fast start, long soft landing: for reveals
  inOut: [0.65, 0, 0.35, 1], // slow-fast-slow: for wipes and pin transitions
};

// Register once under short names, then any tween can say `ease: ease.out`.
CustomEase.create('out', bezier.out.join(','));
CustomEase.create('inOut', bezier.inOut.join(','));

export const ease = {
  out: 'out',
  inOut: 'inOut',
  // Anything scrubbed by scroll stays linear: Lenis already smooths the scroll itself, and
  // easing on top would make the animation lag behind (and overshoot) the scrollbar.
  linear: 'none',
};

// ---- Durations (seconds) -----------------------------------------------------------
export const duration = { xs: 0.2, s: 0.4, m: 0.7, l: 1.1, xl: 1.6 };

// ---- Stagger (seconds between items) -------------------------------------------------
export const stagger = {
  item: 0.06, // cards and chips
  group: 0.6, // a whole staggered group never takes longer than this in total
  word: 0.03,
  char: 0.015,
};

/** Per-item delay for `count` items: 0.06 each, shrunk so the group total never exceeds 0.6s. */
export function staggerEach(count) {
  return count > 1 ? Math.min(stagger.item, stagger.group / (count - 1)) : 0;
}

// ---- Reveals: run once at `top 85%`, rise 24px while fading in -----------------------
export const reveal = { start: 'top 85%', y: 24, duration: duration.m, ease: ease.out };

// ---- gsap.matchMedia conditions ---------------------------------------------------------
// Named so the callbacks read like sentences:
//   mm.add(conditions, ({ conditions: { motion, desktop } }) => { ... })
export const conditions = {
  motion: '(prefers-reduced-motion: no-preference)',
  reduce: '(prefers-reduced-motion: reduce)',
  desktop: '(min-width: 1024px)',
  fine: '(pointer: fine) and (hover: hover)',
};

/** True when the visitor has asked the OS/browser for less motion. */
export const prefersReducedMotion = () => window.matchMedia(conditions.reduce).matches;

/** A duration by name, capped at `xs` (0.2s) for reduced motion. Use for one-off JS tweens. */
export const motionDuration = (name) => (prefersReducedMotion() ? duration.xs : duration[name]);

// ---- Point-cloud tints (used by the hero shaders in M3) ---------------------------------
// Mixed inside the shader, so JS needs them as well as CSS. Keep in sync with tokens.css.
export const tints = {
  face: '#F2D6BC',
  tooth: '#F4F1E8',
  leaf: '#8FCFA3',
  graph: '#7FB5FF',
};

// ---- Dev-only guard ------------------------------------------------------------------
/** Warn (dev only) if styles/tokens.css and this file describe different motion values or tints. */
export function checkTokenSync() {
  const css = getComputedStyle(document.documentElement);
  const read = (name) => css.getPropertyValue(name).trim().toLowerCase().replace(/\s+/g, '');
  const expected = {
    '--ease-out': `cubic-bezier(${bezier.out.join(',')})`,
    '--ease-in-out': `cubic-bezier(${bezier.inOut.join(',')})`,
    '--tint-face': tints.face.toLowerCase(),
    '--tint-tooth': tints.tooth.toLowerCase(),
    '--tint-leaf': tints.leaf.toLowerCase(),
    '--tint-graph': tints.graph.toLowerCase(),
  };
  // Under reduced motion CSS deliberately collapses s..xl to xs, so only check durations otherwise.
  if (!prefersReducedMotion()) {
    for (const [name, seconds] of Object.entries(duration)) expected[`--dur-${name}`] = `${seconds}s`;
  }
  const drift = Object.entries(expected).filter(([name, value]) => read(name) !== value);
  if (drift.length) {
    console.warn(
      '[tokens] motion.js and tokens.css are out of sync:',
      drift.map(([name, value]) => `${name}: css="${read(name)}" js="${value}"`),
    );
  }
}
