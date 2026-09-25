// Helpers shared by every shape generator (leaf now; face, tooth and graph in M3b/M3c).
//
// A "shape" in this project is nothing more than a Float32Array of N*3 numbers: x0,y0,z0, x1,y1,z1, ...
// That flat layout is exactly what a WebGL vertex buffer wants, so it goes to the GPU with no
// conversion (see BufferAttribute in scene.js).

/**
 * A seeded random number generator (mulberry32). Same seed -> same sequence, every time.
 *
 * Why not Math.random()? The leaf would be a different leaf on every page load, and changing the
 * particle count in the dev panel would reshuffle everything. A seeded generator makes the shape
 * reproducible, which also makes screenshots comparable while you tune it.
 * (Bit-twiddling, not maths worth memorising: it just scrambles a 32-bit counter well.)
 */
export function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296; // [0, 1)
  };
}

/**
 * Move a shape so its bounding box is centred on the origin, and scale it so the box's longest
 * side equals `size` (default 2, i.e. it spans -1..+1 along its longest axis). Edits in place.
 *
 * Every shape goes through this, so that when the morph arrives in M3c each shape occupies the
 * same volume and the camera never has to change. Centring uses the bounding-box middle, not the
 * average of the points, so a shape with a dense patch does not sit off-centre.
 */
export function normalize(positions, size = 2) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < positions.length; i += 3) {
    for (let axis = 0; axis < 3; axis++) {
      const value = positions[i + axis];
      if (value < min[axis]) min[axis] = value;
      if (value > max[axis]) max[axis] = value;
    }
  }
  const centre = min.map((lo, axis) => (lo + max[axis]) / 2);
  const longest = Math.max(max[0] - min[0], max[1] - min[1], max[2] - min[2]);
  const scale = longest > 0 ? size / longest : 1;
  for (let i = 0; i < positions.length; i += 3) {
    for (let axis = 0; axis < 3; axis++) {
      positions[i + axis] = (positions[i + axis] - centre[axis]) * scale;
    }
  }
  return positions;
}
