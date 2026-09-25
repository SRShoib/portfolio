// The face: a point cloud sampled from the portrait cutout.
//
// The idea is halftone in reverse. Take the photo (background already removed, so transparent
// around the head), decide how much each pixel should "want" a particle, and scatter N particles
// with those odds. Bright pixels attract many particles, dark ones few, so the picture is redrawn
// as density: skin and collar glow, eyes, brows and the hair parting become gaps or shadows.
// With additive blending (see scene.js) that is enough for the face to read.
//
// Two halves, so the maths can be tested (and tuned) outside the browser:
//   loadFaceSource()  browser only: fetch the image, shrink it, read its pixels -> { width, height, lum, alpha }
//   sampleFace()      pure function of that source: no DOM, no I/O, same input -> same points

import { normalize, seededRandom } from './utils.js';

// The small WebP that scripts/optimize-images.mjs generates (about 19 KB, alpha preserved) is enough
// for a 256px sample and far cheaper than the 1.1 MB PNG, which is only the fallback.
const CUTOUT_URLS = ['/images/profile/portrait-cutout-480.webp', '/images/profile/portrait-cutout.png'];

// About 256px wide (CLAUDE.md). More pixels means finer detail in the weights but a bigger table to
// build on every slider tweak; 256 x ~294 = 75k pixels is instant.
const SAMPLE_WIDTH = 256;

// Pixels less opaque than this are treated as background and can never receive a particle.
const ALPHA_MIN = 0.05;

/**
 * The knobs (all tunable from the dev panel), applied per pixel as
 *   brightness = clamp(luminance * gain, 0, 1) ^ gamma
 *   weight     = alpha * vignette(reach) * (floor + (1 - floor) * brightness)
 * gain    multiplies luminance first. The photo is dark overall (mean luminance ~0.32), so a gain above 1
 *         pushes midtones toward "full"; the highlights clip, which is fine.
 * gamma   contrast of the density. 1 = follows brightness directly; above 1 concentrates particles in the
 *         brightest areas (features pop, the rest thins out); below 1 spreads them evenly.
 * floor   the weight a black pixel still gets, 0..1. At 0 the dark hair and suit vanish and the head has no
 *         outline; a little floor keeps the silhouette.
 * depth   how far bright areas sit toward the viewer, as a fraction of the face's width. 0 = a flat sheet.
 * reach   how far the portrait extends before it fades out, as a fraction of the image width. The photo is
 *         head and shoulders, and the wide shoulders would otherwise take most of the particles AND set the
 *         scale of the whole shape (see normalize() in utils.js), leaving the face small. An elliptical
 *         fade centred on the face, like a vignette on a bust portrait, spends the particles on the head
 *         and lets the shoulders dissolve. Smaller = tighter on the face. 1.6 or more turns it off.
 */
export const FACE_DEFAULTS = { gain: 1.4, gamma: 2.2, floor: 0.06, depth: 0.14, reach: 0.5 };

// Where the middle of the head is in the cutout, as a fraction of its height (top of hair ~0.07, chin ~0.53).
// This is specific to THIS photo; if the portrait is swapped for another crop, re-measure it.
const FACE_CENTRE_Y = 0.3;
// The fade covers the ellipse from this fraction of `reach` (still full strength) out to 1 (gone), and is
// 1.25x taller than wide because a head is.
const FADE_START = 0.55;
const ASPECT = 1.25;

// ---- Browser half: image -> pixel grid ----------------------------------------------------
function loadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`could not load ${url}`));
    image.src = url;
  });
}

/**
 * Turn RGBA pixel data (as from getImageData, or from sharp in a Node test) into the two grids the
 * sampler needs: luminance and opacity, both 0..1, one number per pixel.
 * Luminance uses the Rec. 709 weights: green counts most because the eye is most sensitive to it.
 */
export function sourceFromRGBA(data, width, height) {
  const lum = new Float32Array(width * height);
  const alpha = new Float32Array(width * height);
  for (let i = 0; i < width * height; i++) {
    const o = i * 4;
    lum[i] = (0.2126 * data[o] + 0.7152 * data[o + 1] + 0.0722 * data[o + 2]) / 255;
    alpha[i] = data[o + 3] / 255;
  }
  return { width, height, lum, alpha };
}

/**
 * Load the cutout and read its pixels. Resolves null (never rejects) if no image can be loaded, so the
 * caller can simply leave the face stage out (CLAUDE.md: "the page never breaks").
 */
export async function loadFaceSource() {
  for (const url of CUTOUT_URLS) {
    try {
      const image = await loadImage(url);
      const width = SAMPLE_WIDTH;
      const height = Math.round((SAMPLE_WIDTH * image.naturalHeight) / image.naturalWidth);
      // An offscreen canvas is just a <canvas> that is never put in the page. Drawing the image into
      // a smaller one is the cheapest way to downscale with decent filtering, and getImageData then
      // hands back the pixels as bytes (r, g, b, a per pixel).
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      context.imageSmoothingQuality = 'high';
      context.drawImage(image, 0, 0, width, height);
      return sourceFromRGBA(context.getImageData(0, 0, width, height).data, width, height);
    } catch (error) {
      console.warn(`[face] ${error.message}`);
    }
  }
  console.warn('[face] no portrait cutout available: the point cloud will skip the face stage');
  return null;
}

// ---- Pure half: pixel grid -> particles ---------------------------------------------------
/**
 * Scatter `count` particles over the face, more where the weights are higher.
 *
 * Inverse-CDF sampling, the same idea as the leaf's outline (see leaf.js) but in 2D:
 *   1. give every pixel a weight; running total = the "cumulative distribution" (cdf)
 *   2. draw a random number r in [0, total); the pixel where the running total first passes r is
 *      the winner. A pixel with twice the weight owns twice as much of the range, so is twice as likely.
 * Each particle uses a FIXED number of random draws (r, then a jitter in x and in y), from a seeded
 * generator. So the r values are the same on every call, and when you tune a weight the particles
 * slide smoothly to their new pixels instead of reshuffling. That is why the dev panel feels continuous.
 *
 * @returns {Float32Array|null} count*3 positions, centred, longest side 2; null if nothing is opaque
 */
export function sampleFace(source, count, params = FACE_DEFAULTS, seed = 11) {
  const { width, height, lum, alpha } = source;
  const { gain, gamma, floor, depth, reach } = { ...FACE_DEFAULTS, ...params };

  // The vignette is an ellipse centred on the face: d = 0 at the centre, 1 on the outer edge.
  const cx = width / 2;
  const cy = height * FACE_CENTRE_Y;
  const rx = reach * width;
  const ry = rx * ASPECT;

  const cdf = new Float64Array(width * height);
  let total = 0;
  for (let i = 0; i < cdf.length; i++) {
    if (alpha[i] > ALPHA_MIN) {
      const px = i % width;
      const py = (i - px) / width;
      const d = Math.hypot((px + 0.5 - cx) / rx, (py + 0.5 - cy) / ry);
      // smoothstep(a, b, d) ramps 0 -> 1 as d goes from a to b (needs a < b), so 1 - it fades OUT.
      const t = Math.min(1, Math.max(0, (d - FADE_START) / (1 - FADE_START)));
      const vignette = 1 - t * t * (3 - 2 * t);
      const brightness = Math.pow(Math.min(1, lum[i] * gain), gamma);
      total += alpha[i] * vignette * (floor + (1 - floor) * brightness);
    }
    cdf[i] = total; // stays flat across background pixels, so they can never be chosen
  }
  if (total === 0) return null;

  const rand = seededRandom(seed);
  const positions = new Float32Array(count * 3);
  for (let k = 0; k < count; k++) {
    const r = rand() * total;
    // Binary search: the first pixel whose running total is above r. Because the total only grows on
    // pixels with weight, the pixel found is one with positive weight.
    let lo = 0;
    let hi = cdf.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (cdf[mid] > r) hi = mid;
      else lo = mid + 1;
    }
    const px = lo % width;
    const py = (lo - px) / width;

    // Jitter inside the pixel, or the cloud would sit on a visible 256-wide grid.
    positions[k * 3] = px + rand();
    positions[k * 3 + 1] = -(py + rand()); // image y points down, 3D y points up
    // z from the pixel's own brightness (not the weight): bright skin sits forward, dark hair and
    // suit sit back. Scaled by the image width so `depth` means the same thing at any sample size.
    positions[k * 3 + 2] = lum[lo] * depth * width;
  }
  return normalize(positions);
}
