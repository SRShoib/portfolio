// Whole-page background: a handful of slowly flowing, closed contour lines (an organic,
// topographic-map look) behind every section, always fixed to the viewport. Inspired by the
// reference recording (video/Recording background effect.mp4) — the technique itself (contour
// lines traced through an animated noise field) is a well-known, generic creative-coding method,
// not anything specific to that site; the palette, motion values and every line of code here are
// this project's own (CLAUDE.md rule 2: no borrowed assets, code or visual identity).
//
// Built from scratch rather than a dependency (CLAUDE.md rule 6): the noise function is a small
// hand-rolled 2D value-noise (a seeded permutation grid + smoothstep interpolation), animated by
// slowly drifting the sampling coordinates through the noise space (a domain warp) instead of
// needing true 3D/4D noise for the time axis. The contour lines themselves come from marching
// squares, a standard, public-domain scalar-field-contouring algorithm — the same family of
// technique GIS software uses to draw elevation lines on a real topographic map.

import { gsap } from 'gsap';
import { conditions } from './motion.js';

const CELL_SIZE = 22; // CSS px per noise-sampling cell: keeps blob scale similar at any viewport size.
// Finer than a first pass would need purely for blob size -- the marching-squares grid resolution
// is also what makes the drawn lines read as smoothly curved rather than faceted, since each cell
// only ever contributes a straight segment; more, smaller segments approximate a curve better.
const FREQUENCY = 0.037; // how "zoomed in" the noise is, in cells; smaller = larger, softer blobs.
// Tuned together with CELL_SIZE: one noise cycle spans roughly CELL_SIZE / FREQUENCY CSS px, so
// halving CELL_SIZE for resolution alone would have halved the blobs too without also lowering this.
const LEVELS = [0.36, 0.5, 0.64]; // contour thresholds drawn every frame: three nested bands
const DRIFT_SPEED = 0.05; // domain-warp speed (noise-space units per second)
const MAX_PIXEL_RATIO = 1.5; // thin strokes don't need full retina crispness; caps GPU/CPU cost
const FRAME_INTERVAL = 1 / 24; // redraw at ~24fps: smooth enough for a slow background, cheap
const NOISE_SIZE = 256; // permutation grid side length, must be a power of two (see noise2D's mask)

/** A tiny seeded PRNG (mulberry32), just to fill the noise permutation grid deterministically. */
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t = (t + Math.imul(t ^ (t >>> 7), t | 61)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Bilinear-interpolated 2D value noise over a seeded grid, wrapped with a bitmask (NOISE_SIZE is
 *  a power of two) so sampling never runs off the edge of the grid. Returns roughly 0..1. */
function makeNoise2D(seed) {
  const rand = mulberry32(seed);
  const grid = new Float32Array(NOISE_SIZE * NOISE_SIZE);
  for (let i = 0; i < grid.length; i++) grid[i] = rand();
  const mask = NOISE_SIZE - 1;
  const smooth = (t) => t * t * (3 - 2 * t);

  return (x, y) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const xf = x - xi;
    const yf = y - yi;
    const x0 = xi & mask;
    const x1 = (xi + 1) & mask;
    const y0 = yi & mask;
    const y1 = (yi + 1) & mask;
    const v00 = grid[y0 * NOISE_SIZE + x0];
    const v10 = grid[y0 * NOISE_SIZE + x1];
    const v01 = grid[y1 * NOISE_SIZE + x0];
    const v11 = grid[y1 * NOISE_SIZE + x1];
    const sx = smooth(xf);
    const sy = smooth(yf);
    const a = v00 + (v10 - v00) * sx;
    const b = v01 + (v11 - v01) * sx;
    return a + (b - a) * sy;
  };
}

/** Fractal Brownian motion: a few octaves of the same noise at doubling frequency and halving
 *  amplitude, summed and renormalised to ~0..1. Softens the raw grid's blocky look into the
 *  rounder, more organic shape contour lines need to read as "flowing" rather than "gridded". */
function makeFbm(noise2D, octaves = 3) {
  return (x, y) => {
    let sum = 0;
    let amp = 0.5;
    let freq = 1;
    let ampTotal = 0;
    for (let i = 0; i < octaves; i++) {
      sum += noise2D(x * freq, y * freq) * amp;
      ampTotal += amp;
      amp *= 0.5;
      freq *= 2;
    }
    return sum / ampTotal;
  };
}

const lerp = (a, b, t) => a + (b - a) * t;

/** The interpolated point where the contour crosses one edge of a cell, given that edge's two
 *  corner values. Falls back to the edge's midpoint on a degenerate (equal-value) edge rather than
 *  dividing by zero. */
function edgePoint(edge, x0, y0, size, tl, tr, br, bl, threshold) {
  switch (edge) {
    case 'top': {
      const d = tr - tl;
      return [lerp(x0, x0 + size, d ? (threshold - tl) / d : 0.5), y0];
    }
    case 'bottom': {
      const d = br - bl;
      return [lerp(x0, x0 + size, d ? (threshold - bl) / d : 0.5), y0 + size];
    }
    case 'left': {
      const d = bl - tl;
      return [x0, lerp(y0, y0 + size, d ? (threshold - tl) / d : 0.5)];
    }
    default: {
      // 'right'
      const d = br - tr;
      return [x0 + size, lerp(y0, y0 + size, d ? (threshold - tr) / d : 0.5)];
    }
  }
}

// Standard marching-squares case table: bit = 8*TL + 4*TR + 2*BR + 1*BL (1 = above threshold).
// Each entry lists which cell EDGES the contour crosses, as pairs to connect with one line segment
// each. Cases 5 and 10 are the ambiguous "saddle" cases (diagonal corners agree, adjacent corners
// don't) and get two segments instead of one; there is no universally "correct" way to resolve
// which diagonal reading is right, but the wrong choice is only ever a single cell's worth of a
// very thin, low-opacity line, never a visible seam in a background this subtle.
const EDGE_TABLE = {
  1: [['left', 'bottom']],
  2: [['bottom', 'right']],
  3: [['left', 'right']],
  4: [['top', 'right']],
  5: [
    ['top', 'right'],
    ['left', 'bottom'],
  ],
  6: [['top', 'bottom']],
  7: [['top', 'left']],
  8: [['top', 'left']],
  9: [['top', 'bottom']],
  10: [
    ['top', 'left'],
    ['right', 'bottom'],
  ],
  11: [['top', 'right']],
  12: [['left', 'right']],
  13: [['bottom', 'right']],
  14: [['left', 'bottom']],
};

export function initBackdrop() {
  let mm = gsap.matchMedia();

  // Both conditions, not just `motion` (the about.js portrait reveal uses the same pattern, for
  // the same reason): reduced-motion visitors still get the canvas and its first static frame --
  // only the per-frame animation loop below is what actually needs to be skipped for them.
  mm.add({ motion: conditions.motion, reduce: conditions.reduce }, (context) => {
    const { reduce } = context.conditions;
    const canvas = document.createElement('canvas');
    canvas.className = 'backdrop';
    canvas.setAttribute('aria-hidden', 'true'); // decorative, carries no content of its own
    document.body.prepend(canvas); // first child: base.css's z-index puts it behind everything regardless

    const ctx = canvas.getContext('2d');
    const noise2D = makeNoise2D(1234);
    const fbm = makeFbm(noise2D);

    let cols = 0;
    let rows = 0;
    let dpr = 1;
    let time = 0;
    let lastFrameTime = 0;

    // Reads the accent colour's own RGB straight from the page rather than hard-coding it a
    // second time here, so tokens.css stays the one place the palette is actually defined.
    const lineColor = getComputedStyle(document.documentElement).getPropertyValue('--line').trim();

    function resize() {
      const width = window.innerWidth;
      const height = window.innerHeight;
      dpr = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); // draw in CSS-pixel coordinates from here on
      cols = Math.ceil(width / CELL_SIZE) + 1;
      rows = Math.ceil(height / CELL_SIZE) + 1;
    }

    function drawFrame() {
      const valueCols = cols + 1;
      const values = new Float32Array(valueCols * (rows + 1));
      // Domain warp: a slowly drifting offset stands in for a true time axis on the noise, which
      // would otherwise need a 3D (or 4D, with octaves) noise function instead of this 2D one.
      const wx = Math.cos(time * DRIFT_SPEED) * 3;
      const wy = Math.sin(time * DRIFT_SPEED * 0.8) * 3;
      for (let gy = 0; gy <= rows; gy++) {
        for (let gx = 0; gx <= cols; gx++) {
          values[gy * valueCols + gx] = fbm(gx * FREQUENCY + wx, gy * FREQUENCY + wy);
        }
      }

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.strokeStyle = lineColor;
      ctx.lineWidth = 1;
      ctx.globalAlpha = 0.6;
      // Each cell still only ever draws one straight segment, but rounding its ends softens the
      // facet where it meets its neighbour's segment, so the finer grid above reads as a smooth,
      // flowing curve instead of a chain of visible corners.
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      for (const threshold of LEVELS) {
        ctx.beginPath();
        for (let cy = 0; cy < rows; cy++) {
          const rowTop = cy * valueCols;
          const rowBottom = (cy + 1) * valueCols;
          for (let cx = 0; cx < cols; cx++) {
            const tl = values[rowTop + cx];
            const tr = values[rowTop + cx + 1];
            const br = values[rowBottom + cx + 1];
            const bl = values[rowBottom + cx];
            const c = (tl > threshold ? 8 : 0) | (tr > threshold ? 4 : 0) | (br > threshold ? 2 : 0) | (bl > threshold ? 1 : 0);
            const pairs = EDGE_TABLE[c];
            if (!pairs) continue;
            const x0 = cx * CELL_SIZE;
            const y0 = cy * CELL_SIZE;
            for (const [edgeA, edgeB] of pairs) {
              const [ax, ay] = edgePoint(edgeA, x0, y0, CELL_SIZE, tl, tr, br, bl, threshold);
              const [bx, by] = edgePoint(edgeB, x0, y0, CELL_SIZE, tl, tr, br, bl, threshold);
              ctx.moveTo(ax, ay);
              ctx.lineTo(bx, by);
            }
          }
        }
        ctx.stroke();
      }
    }

    // Advances the domain-warp clock in fixed steps (not by however long the frame actually took)
    // so the flow's speed never depends on the redraw rate, only capped so a stalled tab's first
    // tick back can't lurch the field forward by several seconds' worth of drift in one jump (the
    // same class of bug this project's hero point cloud and cursor both had to be fixed for).
    function tick(_frameTime, deltaMs) {
      const dt = Math.min((deltaMs || 16.67) / 1000, 0.1);
      lastFrameTime += dt;
      if (lastFrameTime < FRAME_INTERVAL) return;
      time += lastFrameTime;
      lastFrameTime = 0;
      drawFrame();
    }

    resize();
    drawFrame(); // one frame immediately, so reduced motion (which never starts the loop) isn't blank

    let onVisibilityChange = null;
    if (!reduce) {
      gsap.ticker.add(tick);
      // A backgrounded tab throttles requestAnimationFrame; gsap.ticker keeps running Lenis and
      // ScrollTrigger regardless (lib/scroll.js), so this only needs to skip its OWN redraw work
      // while hidden, not stop the ticker itself.
      onVisibilityChange = () => {
        if (!document.hidden) lastFrameTime = 0; // drop whatever partial interval had built up
      };
      document.addEventListener('visibilitychange', onVisibilityChange);
    }

    window.addEventListener('resize', resize);

    return () => {
      gsap.ticker.remove(tick);
      window.removeEventListener('resize', resize);
      if (onVisibilityChange) document.removeEventListener('visibilitychange', onVisibilityChange);
      canvas.remove();
    };
  });

  return () => mm.revert();
}
