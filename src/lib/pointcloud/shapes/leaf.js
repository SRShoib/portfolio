// The leaf: a procedural point cloud, no model file needed.
//
// The idea is to describe the leaf with two 1-D functions of "u" (0 at the base of the blade, 1 at
// the tip) and let random numbers fill in the rest:
//   halfWidth(u)  how far the blade reaches each side of the midrib at height u  -> the two outline curves
//   midribX(u)    how far the midrib itself has bent sideways at height u
// A point on the blade is then addressed by (u, v): u = how far up, v = -1..+1 = how far across
// (0 on the midrib, +-1 on the outline). Turning (u, v) into x, y, z is one small function, blade().

import { normalize, seededRandom } from './utils.js';

const LENGTH = 2; // blade length along y, before normalisation rescales everything
const MAX_HALF_WIDTH = 0.62;
const STEM_LENGTH = 0.3;
const TILT = -0.32; // radians around z; negative leans the tip to the right
const VEIN_PAIRS = 7;
const JITTER = 0.012; // random nudge on every point, so the leaf looks stippled, not plotted

// Share of the particle budget for each part. Whatever is left over fills the blade.
// "Denser along the midrib and veins" is just this: those parts get many points on a thin line.
const SHARE = { outline: 0.1, midrib: 0.06, stem: 0.02, veins: 0.24 };

// Widest about 38% of the way up (an "ovate" leaf: fat near the base, tapering to a point).
// pow(u, 0.72) moves the widest point below the middle; the outer pow(..., 1.1) sharpens the tip.
const halfWidth = (u) => MAX_HALF_WIDTH * Math.pow(Math.sin(Math.PI * Math.pow(u, 0.72)), 1.1);

// The two outline curves are not mirror images: one side is up to 8% wider. Real leaves are
// never symmetric, and perfect symmetry is what makes procedural shapes look synthetic.
const edgeWidth = (u, side) => halfWidth(u) * (1 + 0.08 * side * Math.sin(Math.PI * u));

// The midrib curves gently to the right toward the tip.
const midribX = (u) => 0.12 * u * u;

/** The 3D point [x, y, z] for blade coordinates (u, v): u up the blade, v across it (-1..+1). */
function blade(u, v, rand) {
  const w = edgeWidth(u, Math.sign(v) || 1);
  return [
    midribX(u) + v * w,
    u * LENGTH,
    // "Slight 3D curvature": the edges droop away from the viewer (a V-fold along the midrib)
    // and the tip curls back a little. Depth is only about 12% of the leaf's height, but it is
    // what makes the leaf visibly turn, rather than slide, when the scene sways.
    -0.28 * Math.abs(v) * w - 0.3 * (u - 0.35) ** 2 + 0.04 + (rand() - 0.5) * JITTER,
  ];
}

/**
 * Turn "a random number in 0..1" into "a position along a curve, evenly spaced by LENGTH".
 *
 * Picking u uniformly along the outline would NOT give evenly spaced points: near the base the
 * outline sweeps sideways a long way for a tiny change in u, so the points would thin out there.
 * Instead: measure the curve's cumulative length at many steps, then invert it (inverse-CDF
 * sampling). Returns a function r -> u.
 */
function arcLengthSampler(pointAt, steps = 512) {
  const cumulative = new Float64Array(steps + 1);
  let [px, py] = pointAt(0);
  for (let i = 1; i <= steps; i++) {
    const [x, y] = pointAt(i / steps);
    cumulative[i] = cumulative[i - 1] + Math.hypot(x - px, y - py);
    [px, py] = [x, y];
  }
  const total = cumulative[steps];
  return (r) => {
    const target = r * total;
    let lo = 0;
    let hi = steps;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1; // binary search: the largest step still shorter than the target
      if (cumulative[mid] < target) lo = mid;
      else hi = mid;
    }
    const span = cumulative[hi] - cumulative[lo];
    const fraction = span > 0 ? (target - cumulative[lo]) / span : 0;
    return (lo + fraction) / steps;
  };
}

/**
 * Generate the leaf.
 * @param {number} count number of particles
 * @param {number} seed  change it for a different (but equally reproducible) leaf
 * @returns {Float32Array} count*3 positions, centred on the origin, longest side = 2
 */
export function makeLeaf(count, seed = 7) {
  const rand = seededRandom(seed);
  const positions = new Float32Array(count * 3);
  let written = 0;
  const put = ([x, y, z]) => {
    // Tilt the whole leaf around z (a 2D rotation), then store.
    const c = Math.cos(TILT);
    const s = Math.sin(TILT);
    positions[written++] = x * c - y * s;
    positions[written++] = x * s + y * c;
    positions[written++] = z;
  };

  const nOutline = Math.round(count * SHARE.outline);
  const nMidrib = Math.round(count * SHARE.midrib);
  const nStem = Math.round(count * SHARE.stem);
  const nVeins = Math.round(count * SHARE.veins);
  const nFill = count - nOutline - nMidrib - nStem - nVeins;

  // 1. Outline: both edges (v = -1 and +1), spaced evenly along the curve's length.
  const outlineAt = arcLengthSampler((u) => [midribX(u) + halfWidth(u), u * LENGTH]);
  for (let k = 0; k < nOutline; k++) {
    put(blade(outlineAt(rand()), rand() < 0.5 ? -1 : 1, rand));
  }

  // 2. Midrib: a line straight up the middle, lifted a touch toward the viewer (it is a ridge).
  for (let k = 0; k < nMidrib; k++) {
    const [x, y, z] = blade(rand() * 0.985, 0, rand);
    put([x, y, z + 0.03]);
  }

  // 3. Stem (petiole): a short curved stalk below the base.
  for (let k = 0; k < nStem; k++) {
    const t = rand();
    put([-0.06 * t * t + (rand() - 0.5) * JITTER, -STEM_LENGTH * t, (rand() - 0.5) * JITTER]);
  }

  // 4. Side veins: pairs leaving the midrib and sweeping up and outward. Left and right veins
  //    alternate (offset by half a step), as they do on a real leaf. `vein % 2` picks the side,
  //    `vein >> 1` the pair; cycling through them gives every vein the same number of points.
  for (let k = 0; k < nVeins; k++) {
    const vein = k % (VEIN_PAIRS * 2);
    const side = vein % 2 === 0 ? -1 : 1;
    const pair = vein >> 1;
    const u0 = 0.09 + (0.66 * (pair + (side > 0 ? 0.5 : 0))) / VEIN_PAIRS; // where it leaves the midrib
    const t = rand(); // 0 at the midrib, 1 near the outline
    const u = u0 + 0.2 * (1 - u0 * 0.5) * t; // rises as it goes out...
    const v = side * 0.93 * Math.pow(t, 0.85); // ...stopping just short of the edge
    const [x, y, z] = blade(u, v, rand);
    put([x + (rand() - 0.5) * JITTER, y + (rand() - 0.5) * JITTER, z]);
  }

  // 5. Fill: scatter points across the blade's area. Choosing u and v uniformly would crowd points
  //    where the blade is narrow (the same number of points in less area). Rejection sampling fixes
  //    that: propose a random (u, v), keep it with probability proportional to the local width.
  for (let k = 0; k < nFill; k++) {
    let u;
    let v;
    do {
      u = rand();
      v = (rand() * 2 - 1) * 0.97;
    } while (rand() * MAX_HALF_WIDTH > edgeWidth(u, Math.sign(v)));
    put(blade(u, v, rand));
  }

  return normalize(positions);
}
