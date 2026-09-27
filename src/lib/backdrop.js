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

// ---- Cursor-follow bubble cluster (fine pointers only; see initBackdrop) -------------------
// A chain of soft circles, each lagging the one before it, rendered with a "gooey" SVG filter
// (feGaussianBlur into feColorMatrix's alpha row) so overlapping circles melt into one smooth,
// rounded shape instead of stacking as separate discs: the blur spreads each circle's alpha into
// its neighbours, then the alpha-boosting matrix snaps every pixel back toward fully opaque or
// fully transparent, so only the smoothly-merged silhouette survives.
const CURSOR_LAMBDA = 9; // how tightly the lead orb tracks the real pointer
const ORB_LAMBDA = 16; // how tightly each trailing orb tracks the orb ahead of it in the chain --
// tight on purpose: consecutive orbs must stay close enough that their TRUE (unfiltered) circles
// overlap GENEROUSLY at any real movement speed, not just barely touch. Measured directly
// (getImageData at each orb's centre and at the midpoint between consecutive pairs) that ctx.filter
// runs once PER fill() call, not once over the accumulated canvas -- so the goo filter can only
// smooth an overlap that already exists geometrically, never bridge a genuine gap, no matter how
// large the blur. A first pass got the merge technically connected (alpha 255 at every midpoint)
// but with just barely enough overlap for that -- which reads as separate round "bubbles" pinched
// together at a narrow neck, not one continuous "blob": a wide, confident overlap is what actually
// produces the reference's broad, gentle undulations instead of a visible waist at each join.
const ENERGY_LAMBDA = 6; // how fast the cluster's visibility rises/falls toward its target
const SPEED_FOR_FULL_ENERGY = 900; // cursor speed (CSS px/s) that fades the cluster fully in
const NUM_ORBS = 3; // circles in the trailing chain -- fewer, bigger orbs read as one mass more
// easily than a longer chain of smaller ones, which starts looking like a caterpillar of bubbles
// however smoothly each join is bridged.
const ORB_RADIUS = 95; // CSS px, base value before the per-frame breathing noise in
// drawCursorBubble() -- comfortably more than half the chain's typical spacing at ORB_LAMBDA
// above, so consecutive orbs keep a wide, generous geometric overlap even while jittered.
const ORB_JITTER = 20; // CSS px of perpendicular drift, at most -- organic curvature, kept well
// inside the overlap margin above so the jitter can't accidentally pull the shape apart.
const GOO_BUFFER_SIZE = 420; // CSS px square offscreen buffer the cluster is composited from
const GOO_BLUR_STD_DEV = 20; // feGaussianBlur std deviation, px: only needs to soften an already-
// (generously) overlapping union into a smooth bridge now, not stretch to reach across a gap.

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

export function initBackdrop() {
  let mm = gsap.matchMedia();

  // Both conditions, not just `motion` (the about.js portrait reveal uses the same pattern, for
  // the same reason): reduced-motion visitors still get the canvas and its first static frame --
  // only the per-frame animation loop below is what actually needs to be skipped for them. `fine`
  // gates the cursor-follow bubble specifically (a touchscreen has no hovering pointer to follow),
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

    // Cursor-follow bubble state: a chain of orbs that trails the real pointer, spreading out
    // while it moves and collapsing back to nothing once it stops -- see LEARNING.md for why this
    // needs its own lagged positions and an "energy" value rather than just drawing at the raw
    // pointer position.
    const cursorEnabled = !reduce && fine;
    let hasPointer = false;
    let pointerTargetX = 0;
    let pointerTargetY = 0;
    let prevTargetX = 0;
    let prevTargetY = 0;
    let energy = 0;
    const orbX = new Array(NUM_ORBS).fill(0);
    const orbY = new Array(NUM_ORBS).fill(0);

    function onPointerMove(event) {
      pointerTargetX = event.clientX;
      pointerTargetY = event.clientY;
      if (!hasPointer) {
        hasPointer = true; // first real position: start every trailing orb exactly there
        prevTargetX = pointerTargetX;
        prevTargetY = pointerTargetY;
        orbX.fill(pointerTargetX);
        orbY.fill(pointerTargetY);
      }
    }

    // A small, reused offscreen buffer: the blur filter's cost scales with the AREA it runs over,
    // so the goo effect is composited from a buffer just big enough for the cluster, not the
    // whole page canvas -- independent of viewport size.
    const gooCanvas = document.createElement('canvas');
    gooCanvas.width = GOO_BUFFER_SIZE;
    gooCanvas.height = GOO_BUFFER_SIZE;
    const gooCtx = gooCanvas.getContext('2d');

    // The classic "gooey" SVG filter (feGaussianBlur into feColorMatrix's ALPHA row): a canvas
    // `blur() contrast()` filter string was tried first and measured directly -- it left separately
    // blurred circles with no merging at all, because CSS contrast() only touches colour, not alpha
    // (confirmed by screenshotting the raw buffer, not assumed from a recipe). feColorMatrix's alpha
    // row genuinely rewrites alpha (newAlpha = 12*oldAlpha - 4), which is what pushes each blurred
    // pixel back to fully opaque or fully transparent. Also directly measured: ctx.filter runs once
    // per fill() call, not once over the whole accumulated buffer, so this can only smooth an
    // overlap that's already there geometrically (ORB_RADIUS/ORB_LAMBDA above guarantee that), never
    // bridge a true gap between orbs.
    const gooSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    gooSvg.setAttribute('width', '0');
    gooSvg.setAttribute('height', '0');
    gooSvg.style.position = 'absolute';
    // An explicit, generous filter region: SVG filters default to a 120%-padded box around
    // whatever's drawn, which can clip a wide blur -- found by testing wider std-deviations in
    // isolation and seeing the effect disappear entirely once the blur exceeded that default box.
    gooSvg.innerHTML = `<filter id="backdrop-goo" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur in="SourceGraphic" stdDeviation="${GOO_BLUR_STD_DEV}" result="blur" /><feColorMatrix in="blur" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 12 -4" /></filter>`;
    document.body.append(gooSvg);

    /** A soft, liquid-looking bubble cluster centred near (cx, cy): each orb is a filled circle,
     *  drawn into the small offscreen buffer under the goo filter above so touching orbs melt into
     *  one smooth silhouette. Perfect, identically-sized circles merged in a straight line reads as
     *  a clean geometric capsule, not liquid -- reusing the SAME noise field the background uses,
     *  each orb's radius breathes and its position drifts sideways off the straight cursor-to-tail
     *  line, both continuously evolving with time, so the merged shape's width and curvature vary
     *  organically along its length instead of being a uniform-width pill. */
    function drawCursorBubble(cx, cy, amount) {
      const half = GOO_BUFFER_SIZE / 2;
      gooCtx.clearRect(0, 0, GOO_BUFFER_SIZE, GOO_BUFFER_SIZE);
      gooCtx.filter = 'url(#backdrop-goo)';
      gooCtx.fillStyle = '#fff'; // opaque white: only the alpha channel survives compositing below
      const z = time * TIME_SPEED;
      for (let i = 0; i < NUM_ORBS; i++) {
        // Perpendicular to the chain's local direction (its neighbours' positions), not the orb's
        // own direction of travel -- so the wobble reads as the SHAPE twisting, not the cursor
        // trail jittering side to side.
        const a = i > 0 ? i - 1 : i;
        const b = i < NUM_ORBS - 1 ? i + 1 : i;
        const dx = orbX[b] - orbX[a];
        const dy = orbY[b] - orbY[a];
        const segLen = Math.hypot(dx, dy) || 1;
        const perpX = -dy / segLen;
        const perpY = dx / segLen;
        const wobble = fbm(i * 0.9, 0, z * 3) * 2 - 1; // roughly -1..1, drifts continuously
        const jx = orbX[i] + perpX * wobble * ORB_JITTER;
        const jy = orbY[i] + perpY * wobble * ORB_JITTER;
        const radiusNoise = 0.75 + 0.5 * fbm(i * 1.3 + 10, 0, z * 2); // roughly 0.75..1.25
        gooCtx.beginPath();
        gooCtx.arc(jx - cx + half, jy - cy + half, ORB_RADIUS * radiusNoise, 0, Math.PI * 2);
        gooCtx.fill();
      }
      gooCtx.filter = 'none';

      // A `fillRect` tinted with `--text` then masked in via `destination-in` was tried first, but
      // measured directly (sampling the main canvas's own pixels): the result came back wrong on
      // both colour and alpha, not just "a bit off" -- rather than chase why a two-step composite
      // wasn't behaving as the spec suggests, simplified to the one thing actually needed. `--text`
      // is already very close to white, so the plain white goo shape IS the tint; only the overall
      // opacity (energy) still needs applying, which a single globalAlpha draw does directly.
      ctx.save();
      ctx.globalAlpha = 0.16 * amount;
      ctx.drawImage(gooCanvas, cx - half, cy - half);
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
        // smoothly instead of snapping -- so a single quick flick doesn't pop the cluster instantly
        // to full size, and stopping doesn't cut it off either; both ease, matching the reference
        // recording's fade in/out rather than a hard on/off.
        const speed = dt > 0 ? Math.hypot(pointerTargetX - prevTargetX, pointerTargetY - prevTargetY) / dt : 0;
        prevTargetX = pointerTargetX;
        prevTargetY = pointerTargetY;
        const targetEnergy = Math.min(speed / SPEED_FOR_FULL_ENERGY, 1);
        energy = damp(energy, targetEnergy, ENERGY_LAMBDA, dt);

        // Orb 0 chases the real pointer; every orb after it chases the ONE BEFORE IT -- a lag of a
        // lag, so the chain naturally spreads out along the recent path while moving fast, and
        // collapses back onto a single point once it stops, all from one repeated damp() call.
        orbX[0] = damp(orbX[0], pointerTargetX, CURSOR_LAMBDA, dt);
        orbY[0] = damp(orbY[0], pointerTargetY, CURSOR_LAMBDA, dt);
        for (let i = 1; i < NUM_ORBS; i++) {
          orbX[i] = damp(orbX[i], orbX[i - 1], ORB_LAMBDA, dt);
          orbY[i] = damp(orbY[i], orbY[i - 1], ORB_LAMBDA, dt);
        }

        if (energy > 0.01) drawCursorBubble(orbX[0], orbY[0], energy);
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
      gooSvg.remove();
      canvas.remove();
    };
  });

  return () => mm.revert();
}
