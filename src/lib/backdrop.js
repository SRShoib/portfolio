// Whole-page background: a handful of slowly flowing, closed contour lines (an organic,
// topographic-map look) behind every section, always fixed to the viewport. Inspired by the
// reference recordings (video/Recording background effect.mp4, video/Recording background effect
// 2.mp4) — the technique itself (contour lines traced through an animated noise field) is a
// well-known, generic creative-coding method, not anything specific to that site; the palette,
// motion values and every line of code here are this project's own (CLAUDE.md rule 2: no borrowed
// assets, code or visual identity).
//
// Built from scratch rather than a dependency (CLAUDE.md rule 6): the noise function is a small
// hand-rolled 3D value-noise (a seeded permutation table, hashed the classic Perlin way, with
// trilinear + smoothstep interpolation) with time as the third axis, so the field itself evolves
// at every point independently — blobs form, merge and dissolve, with no net direction to the
// motion. The contour lines themselves come from marching squares, a standard, public-domain
// scalar-field-contouring algorithm — the same family of technique GIS software uses to draw
// elevation lines on a real topographic map.

import { gsap } from 'gsap';
import { conditions } from './motion.js';

const CELL_SIZE = 22; // CSS px per noise-sampling cell: keeps blob scale similar at any viewport size.
// Finer than a first pass would need purely for blob size -- the marching-squares grid resolution
// is also what makes the drawn lines read as smoothly curved rather than faceted, since each cell
// only ever contributes a straight segment; more, smaller segments approximate a curve better.
const FREQUENCY = 0.055; // how "zoomed in" the noise is, in cells; smaller = larger, softer blobs.
// Tuned together with CELL_SIZE: one noise cycle spans roughly CELL_SIZE / FREQUENCY CSS px (~400px
// at these values), so halving CELL_SIZE for resolution alone would have halved the blobs too
// without also lowering this.
const LEVELS = [0.36, 0.5, 0.64]; // contour thresholds drawn every frame: three nested bands
const TIME_SPEED = 0.05; // how fast time moves through the noise volume's 3rd axis (units/second)
const MAX_PIXEL_RATIO = 1.5; // thin strokes don't need full retina crispness; caps GPU/CPU cost
const FRAME_INTERVAL = 1 / 24; // redraw at ~24fps: smooth enough for a slow background, cheap
const PERM_SIZE = 256; // permutation table length, must be a power of two (see noise3D's mask)

// ---- Cursor-follow organic blob (fine pointers only; see initBackdrop) ---------------------
// Reuses the EXACT same technique as the ambient background above -- marching squares over the
// noise field -- instead of a separate shape system built from circles. A smooth, falling-off
// "bump" is added to the field's values in a small region near the (lagged) cursor, then filled
// wherever the BIASED field crosses a threshold. Three earlier attempts (a single noise-wobbled
// blob, then a cluster of merged circles, then circles with a wavy edge) all still fundamentally
// read as "rounded", however organic the tuning: every one of them was built from a smooth base
// shape (a circle) with perturbation added on top. Tracing the SAME noisy field the background
// lines already flow through means the boundary's irregularity is the real thing, not a
// perturbation of something rounder underneath -- it inherits the ambient background's own
// non-circular character for free, and reads as visibly consistent with it.
const CURSOR_LAMBDA = 8; // how tightly the head point tracks the real pointer
const TAIL_LAMBDA = 5; // how tightly the tail point tracks the head -- slower on purpose, so the
// tail lags further behind during fast movement (the same "lag of a lag" idea used elsewhere in
// this file), which is what makes the blob elongate while moving and contract to one point at rest.
const ENERGY_LAMBDA = 6; // how fast the blob's strength rises/falls toward its target
const SPEED_FOR_FULL_ENERGY = 900; // cursor speed (CSS px/s) that brings the blob fully in
const BUMP_RADIUS = 130; // CSS px: how far the bump reaches perpendicular to the head-tail line
const BUMP_STRENGTH = 0.65; // added to the field value at the head/tail line itself, tapering
// linearly to 0 at BUMP_RADIUS -- comfortably above CURSOR_FILL_THRESHOLD at the centre, at the
// real noise's own typical range by the edge, so the interplay of bump + already-flowing noise
// decides the exact boundary there, not the bump's own (perfectly smooth) falloff shape alone.
const CURSOR_FILL_THRESHOLD = 0.78; // deliberately HIGHER than the ambient bands' own max (0.64),
// a dedicated value rather than reusing one of LEVELS -- caught by screenshotting, not by
// reasoning about the bump formula alone: at a mid-level threshold like 0.5, a naturally-high
// patch of the SAME noise the ambient blobs are made from can combine with the bump and stay
// "inside" far past where the bump itself has finished tapering, which showed up as a hard
// rectangular clip at whatever bounding box the fill pass iterated. A threshold safely above the
// noise's own typical range means only the bump can realistically cross it, keeping the blob's
// real size predictable and close to BUMP_RADIUS, the same way the box below assumes.
const BLOB_BUFFER_SIZE = 640; // CSS px square offscreen buffer: comfortably covers the head-tail
// segment's typical spread plus the worst-case box margin below, on every side.
// The iterated region has to reach further out than BUMP_RADIUS itself: the bump tapers to 0
// there, but the field's real, already-flowing noise can independently be above
// CURSOR_FILL_THRESHOLD at that distance regardless of the bump -- and if the box stopped exactly
// at BUMP_RADIUS, that still-"inside" area past the box edge would hard-clip into a visible
// straight line (caught by screenshotting, not by reasoning about the bump formula alone). Sized
// for the worst case: noise at its own maximum (~1) still needs the bump to have fully finished
// tapering before the combined value can drop back under threshold.
const BOX_MARGIN = BUMP_RADIUS * (1 + (1 - CURSOR_FILL_THRESHOLD) / BUMP_STRENGTH);

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

/** Trilinear-interpolated 3D value noise, hashed the classic Perlin way: a seeded permutation
 *  table (shuffled once) chains three lookups to turn an integer (x, y, z) lattice point into an
 *  index into a table of random values, wrapped with a bitmask (PERM_SIZE is a power of two) so
 *  sampling never runs off the table. Time is just this function's z axis, one call site down in
 *  drawFrame() -- the field's own values genuinely change at every fixed (x, y) as z advances, so
 *  blobs independently form, merge and dissolve instead of the whole field sliding in one
 *  direction (which is all a 2D noise sampled through a moving x/y offset could ever produce).
 *  Returns roughly 0..1. */
function makeNoise3D(seed) {
  const rand = mulberry32(seed);
  const mask = PERM_SIZE - 1;
  const perm = new Uint8Array(PERM_SIZE);
  for (let i = 0; i < PERM_SIZE; i++) perm[i] = i;
  for (let i = PERM_SIZE - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [perm[i], perm[j]] = [perm[j], perm[i]];
  }
  const values = new Float32Array(PERM_SIZE);
  for (let i = 0; i < PERM_SIZE; i++) values[i] = rand();
  const hash = (xi, yi, zi) => values[perm[(perm[(perm[xi & mask] + yi) & mask] + zi) & mask]];
  const smooth = (t) => t * t * (3 - 2 * t);

  return (x, y, z) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const zi = Math.floor(z);
    const sx = smooth(x - xi);
    const sy = smooth(y - yi);
    const sz = smooth(z - zi);
    const x00 = lerp(hash(xi, yi, zi), hash(xi + 1, yi, zi), sx);
    const x10 = lerp(hash(xi, yi + 1, zi), hash(xi + 1, yi + 1, zi), sx);
    const x01 = lerp(hash(xi, yi, zi + 1), hash(xi + 1, yi, zi + 1), sx);
    const x11 = lerp(hash(xi, yi + 1, zi + 1), hash(xi + 1, yi + 1, zi + 1), sx);
    const y0 = lerp(x00, x10, sy);
    const y1 = lerp(x01, x11, sy);
    return lerp(y0, y1, sz);
  };
}

/** Fractal Brownian motion: a few octaves of the same noise at doubling frequency and halving
 *  amplitude, summed and renormalised to ~0..1. Softens the raw grid's blocky look into the
 *  rounder, more organic shape contour lines need to read as "flowing" rather than "gridded".
 *  Doubling z's frequency too, along with x and y, is what makes the finer detail churn faster
 *  than the big blob shapes -- the same relationship FBM always has between scale and rate. */
function makeFbm(noise3D, octaves = 3) {
  return (x, y, z) => {
    let sum = 0;
    let amp = 0.5;
    let freq = 1;
    let ampTotal = 0;
    for (let i = 0; i < octaves; i++) {
      sum += noise3D(x * freq, y * freq, z * freq) * amp;
      ampTotal += amp;
      amp *= 0.5;
      freq *= 2;
    }
    return sum / ampTotal;
  };
}

const lerp = (a, b, t) => a + (b - a) * t;

/** Frame-rate-independent damping: moves `current` a fraction of the way to `target` no matter the
 *  frame's duration `dt` (seconds) -- the same idea lib/cursor.js uses for its own lagging ring. */
function damp(current, target, lambda, dt) {
  return current + (target - current) * (1 - Math.exp(-lambda * dt));
}

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

/** The fill counterpart to EDGE_TABLE's stroke segments above: adds the "inside" (above-threshold)
 *  polygon for one marching-squares cell to `path`, by walking the cell's perimeter (TL, TR, BR,
 *  BL) and including each inside corner plus each edge's threshold-crossing point wherever two
 *  consecutive corners disagree. The two ambiguous "saddle" cases (5, 10) are special-cased into
 *  their two separate corner triangles -- the general walk would otherwise connect them into one
 *  self-intersecting bowtie -- using the same diagonal convention EDGE_TABLE already commits to. */
function addFillPolygon(path, x0, y0, size, tl, tr, br, bl, threshold) {
  const c = (tl > threshold ? 8 : 0) | (tr > threshold ? 4 : 0) | (br > threshold ? 2 : 0) | (bl > threshold ? 1 : 0);
  if (c === 0) return;
  if (c === 15) {
    path.rect(x0, y0, size, size);
    return;
  }
  if (c === 5 || c === 10) {
    const top = edgePoint('top', x0, y0, size, tl, tr, br, bl, threshold);
    const right = edgePoint('right', x0, y0, size, tl, tr, br, bl, threshold);
    const bottom = edgePoint('bottom', x0, y0, size, tl, tr, br, bl, threshold);
    const left = edgePoint('left', x0, y0, size, tl, tr, br, bl, threshold);
    if (c === 5) {
      // TR and BL inside: a triangle at each of those two corners.
      path.moveTo(x0 + size, y0);
      path.lineTo(top[0], top[1]);
      path.lineTo(right[0], right[1]);
      path.closePath();
      path.moveTo(x0, y0 + size);
      path.lineTo(left[0], left[1]);
      path.lineTo(bottom[0], bottom[1]);
      path.closePath();
    } else {
      // TL and BR inside.
      path.moveTo(x0, y0);
      path.lineTo(top[0], top[1]);
      path.lineTo(left[0], left[1]);
      path.closePath();
      path.moveTo(x0 + size, y0 + size);
      path.lineTo(right[0], right[1]);
      path.lineTo(bottom[0], bottom[1]);
      path.closePath();
    }
    return;
  }
  const corners = [
    { x: x0, y: y0, v: tl, edge: 'top' },
    { x: x0 + size, y: y0, v: tr, edge: 'right' },
    { x: x0 + size, y: y0 + size, v: br, edge: 'bottom' },
    { x: x0, y: y0 + size, v: bl, edge: 'left' },
  ];
  let started = false;
  const moveOrLine = (x, y) => {
    if (!started) {
      path.moveTo(x, y);
      started = true;
    } else path.lineTo(x, y);
  };
  for (let k = 0; k < 4; k++) {
    const cur = corners[k];
    const next = corners[(k + 1) % 4];
    const curIn = cur.v > threshold;
    if (curIn) moveOrLine(cur.x, cur.y);
    if (curIn !== next.v > threshold) {
      const [ex, ey] = edgePoint(cur.edge, x0, y0, size, tl, tr, br, bl, threshold);
      moveOrLine(ex, ey);
    }
  }
  path.closePath();
}

/** Shortest distance from (px, py) to the segment (ax, ay)-(bx, by) -- used to bias the noise
 *  field along the whole head-to-tail line rather than just at one point, so the cursor blob's
 *  bump region elongates into a capsule while moving fast and contracts to a simple circle once
 *  the head and tail catch up to each other at rest. */
function distanceToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  const t = lenSq > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq)) : 0;
  return Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
}

export function initBackdrop() {
  let mm = gsap.matchMedia();

  // Both conditions, not just `motion` (the about.js portrait reveal uses the same pattern, for
  // the same reason): reduced-motion visitors still get the canvas and its first static frame --
  // only the per-frame animation loop below is what actually needs to be skipped for them. `fine`
  // gates the cursor-follow blob specifically (a touchscreen has no hovering pointer to follow),
  // the same condition lib/cursor.js already uses for its own pointer-only enhancement.
  mm.add({ motion: conditions.motion, reduce: conditions.reduce, fine: conditions.fine }, (context) => {
    const { reduce, fine } = context.conditions;
    const canvas = document.createElement('canvas');
    canvas.className = 'backdrop';
    canvas.setAttribute('aria-hidden', 'true'); // decorative, carries no content of its own
    document.body.prepend(canvas); // first child: base.css's z-index puts it behind everything regardless

    const ctx = canvas.getContext('2d');
    const noise3D = makeNoise3D(1234);
    const fbm = makeFbm(noise3D);

    let cols = 0;
    let rows = 0;
    let dpr = 1;
    let time = 0;
    let lastFrameTime = 0;

    // Reads the accent colour's own RGB straight from the page rather than hard-coding it a
    // second time here, so tokens.css stays the one place the palette is actually defined.
    const lineColor = getComputedStyle(document.documentElement).getPropertyValue('--line').trim();

    // Cursor-follow blob state: a head point tracking the real pointer, and a tail point tracking
    // the head with more lag -- see LEARNING.md for why this needs lagged positions and an
    // "energy" value rather than just biasing the field at the raw pointer position.
    const cursorEnabled = !reduce && fine;
    let hasPointer = false;
    let pointerTargetX = 0;
    let pointerTargetY = 0;
    let prevTargetX = 0;
    let prevTargetY = 0;
    let energy = 0;
    let headX = 0;
    let headY = 0;
    let tailX = 0;
    let tailY = 0;

    function onPointerMove(event) {
      pointerTargetX = event.clientX;
      pointerTargetY = event.clientY;
      if (!hasPointer) {
        hasPointer = true; // first real position: start head and tail exactly there, no swoop-in
        prevTargetX = headX = tailX = pointerTargetX;
        prevTargetY = headY = tailY = pointerTargetY;
      }
    }

    // A small, reused offscreen buffer: composited onto the main canvas once per frame, the same
    // proven alpha-handling this file already established (a single ctx.globalAlpha draw at the
    // very end) rather than trying to apply alpha to several separate draws directly on the main
    // canvas, which would multiply together instead of combining the way a flat value should.
    const blobCanvas = document.createElement('canvas');
    blobCanvas.width = BLOB_BUFFER_SIZE;
    blobCanvas.height = BLOB_BUFFER_SIZE;
    const blobCtx = blobCanvas.getContext('2d');

    /** Fills the region where the ambient noise field, locally biased by a falling-off bump along
     *  the head-tail line, crosses CURSOR_FILL_THRESHOLD -- reusing addFillPolygon() (the SAME
     *  marching squares the stroked contour lines below use) over a small local grid, into the
     *  offscreen buffer. `baseValues` is the UNBIASED field drawFrame() already computed for the
     *  ambient lines this frame; reusing it here means this only ever costs one extra distance
     *  calculation per grid vertex in the local region, not a second noise evaluation. */
    function drawCursorBlob(amount, baseValues, valueCols, rows, cols) {
      const half = BLOB_BUFFER_SIZE / 2;
      const anchorX = (headX + tailX) / 2;
      const anchorY = (headY + tailY) / 2;
      const minGx = Math.max(0, Math.floor((Math.min(headX, tailX) - BOX_MARGIN) / CELL_SIZE));
      const maxGx = Math.min(cols - 1, Math.ceil((Math.max(headX, tailX) + BOX_MARGIN) / CELL_SIZE));
      const minGy = Math.max(0, Math.floor((Math.min(headY, tailY) - BOX_MARGIN) / CELL_SIZE));
      const maxGy = Math.min(rows - 1, Math.ceil((Math.max(headY, tailY) + BOX_MARGIN) / CELL_SIZE));
      if (minGx > maxGx || minGy > maxGy) return;

      const strength = BUMP_STRENGTH * amount;
      const bumpAt = (gx, gy) => {
        const dist = distanceToSegment(gx * CELL_SIZE, gy * CELL_SIZE, headX, headY, tailX, tailY);
        return dist < BUMP_RADIUS ? strength * (1 - dist / BUMP_RADIUS) : 0;
      };

      blobCtx.clearRect(0, 0, BLOB_BUFFER_SIZE, BLOB_BUFFER_SIZE);
      blobCtx.save();
      blobCtx.translate(half - anchorX, half - anchorY); // draw in page coordinates, buffer just follows
      blobCtx.beginPath();
      for (let gy = minGy; gy <= maxGy; gy++) {
        const rowTop = gy * valueCols;
        const rowBottom = (gy + 1) * valueCols;
        for (let gx = minGx; gx <= maxGx; gx++) {
          const tl = baseValues[rowTop + gx] + bumpAt(gx, gy);
          const tr = baseValues[rowTop + gx + 1] + bumpAt(gx + 1, gy);
          const br = baseValues[rowBottom + gx + 1] + bumpAt(gx + 1, gy + 1);
          const bl = baseValues[rowBottom + gx] + bumpAt(gx, gy + 1);
          addFillPolygon(blobCtx, gx * CELL_SIZE, gy * CELL_SIZE, CELL_SIZE, tl, tr, br, bl, CURSOR_FILL_THRESHOLD);
        }
      }
      blobCtx.fillStyle = '#ffffff'; // opaque white: only the alpha channel survives compositing below
      blobCtx.fill();

      // A directional shade, masked to the shape's own silhouette via `source-atop` (verified in
      // isolation first, sampling actual pixel values, before relying on it here -- see
      // LEARNING.md): paints new colour only where the existing canvas content already has alpha,
      // keeping that alpha, so the gradient lands exactly inside the just-filled shape above with
      // no separate clip path needed. A flat single colour would read as a paper cutout, not a
      // rounded volume.
      blobCtx.globalCompositeOperation = 'source-atop';
      const shadeSize = BUMP_RADIUS * 1.7;
      const shade = blobCtx.createRadialGradient(
        anchorX - BUMP_RADIUS * 0.4,
        anchorY - BUMP_RADIUS * 0.45,
        0,
        anchorX,
        anchorY,
        shadeSize,
      );
      shade.addColorStop(0, '#ffffff'); // highlight, as if lit from the upper-left
      shade.addColorStop(0.55, '#a0a0a0');
      shade.addColorStop(1, '#323232'); // shadowed edge, away from the light
      blobCtx.fillStyle = shade;
      blobCtx.fillRect(anchorX - shadeSize, anchorY - shadeSize, shadeSize * 2, shadeSize * 2);
      blobCtx.restore(); // also resets globalCompositeOperation/translate before next frame's clearRect

      ctx.save();
      ctx.globalAlpha = 0.22 * amount;
      ctx.drawImage(blobCanvas, anchorX - half, anchorY - half);
      ctx.restore();
    }

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

    function drawFrame(dt) {
      const valueCols = cols + 1;
      const values = new Float32Array(valueCols * (rows + 1));
      const z = time * TIME_SPEED; // the noise volume's 3rd axis: real time, not a spatial offset
      for (let gy = 0; gy <= rows; gy++) {
        for (let gx = 0; gx <= cols; gx++) {
          values[gy * valueCols + gx] = fbm(gx * FREQUENCY, gy * FREQUENCY, z);
        }
      }

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      if (cursorEnabled && hasPointer) {
        // Speed drives a TARGET energy, which is itself damped toward -- rising and falling
        // smoothly instead of snapping -- so a single quick flick doesn't pop the blob instantly to
        // full strength, and stopping doesn't cut it off either; both ease, matching the reference
        // recording's fade in/out rather than a hard on/off.
        const speed = dt > 0 ? Math.hypot(pointerTargetX - prevTargetX, pointerTargetY - prevTargetY) / dt : 0;
        prevTargetX = pointerTargetX;
        prevTargetY = pointerTargetY;
        const targetEnergy = Math.min(speed / SPEED_FOR_FULL_ENERGY, 1);
        energy = damp(energy, targetEnergy, ENERGY_LAMBDA, dt);

        // The tail chases the head, which chases the real pointer -- a lag of a lag, so the
        // head-tail line naturally spreads out along the recent path while moving fast (elongating
        // the bump into a capsule) and collapses onto one point once it stops.
        headX = damp(headX, pointerTargetX, CURSOR_LAMBDA, dt);
        headY = damp(headY, pointerTargetY, CURSOR_LAMBDA, dt);
        tailX = damp(tailX, headX, TAIL_LAMBDA, dt);
        tailY = damp(tailY, headY, TAIL_LAMBDA, dt);

        if (energy > 0.01) drawCursorBlob(energy, values, valueCols, rows, cols);
      }

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

    // Advances the noise volume's time axis in fixed steps (not by however long the frame actually
    // took) so the flow's speed never depends on the redraw rate, only capped so a stalled tab's
    // first tick back can't lurch the field forward by several seconds' worth of evolution in one
    // jump (the same class of bug this project's hero point cloud and cursor both had to be fixed
    // for).
    function tick(_frameTime, deltaMs) {
      const dt = Math.min((deltaMs || 16.67) / 1000, 0.1);
      lastFrameTime += dt;
      if (lastFrameTime < FRAME_INTERVAL) return;
      const frameDt = lastFrameTime;
      time += frameDt;
      lastFrameTime = 0;
      drawFrame(frameDt);
    }

    resize();
    drawFrame(0); // one frame immediately, so reduced motion (which never starts the loop) isn't blank

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
    if (cursorEnabled) document.addEventListener('pointermove', onPointerMove);

    window.addEventListener('resize', resize);

    return () => {
      gsap.ticker.remove(tick);
      window.removeEventListener('resize', resize);
      if (onVisibilityChange) document.removeEventListener('visibilitychange', onVisibilityChange);
      if (cursorEnabled) document.removeEventListener('pointermove', onPointerMove);
      canvas.remove();
    };
  });

  return () => mm.revert();
}
