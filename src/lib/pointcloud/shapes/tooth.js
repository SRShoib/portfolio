// The tooth: N points sampled off the SURFACE of a 3D model, instead of built from a formula
// (the leaf) or a photo (the face). Two halves again, matching face.js and for the same reason:
//   loadToothSource()  browser only: fetch and parse the GLB -> a THREE.Mesh (or null)
//   sampleTooth()      turns a mesh into points; also builds the procedural fallback

import { Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshSurfaceSampler } from 'three/addons/math/MeshSurfaceSampler.js';
import { normalize, seededRandom } from './utils.js';

const GLB_URL = '/models/tooth.glb';

// ---- Browser half: fetch the model --------------------------------------------------------
/**
 * Load the GLB and return its first mesh. Resolves null (never rejects) if the file is missing
 * or fails to parse, so the caller can fall back to the procedural molar (CLAUDE.md: "If the file
 * is missing, generate a stylized procedural molar").
 */
export async function loadToothSource() {
  try {
    const loader = new GLTFLoader();
    const gltf = await loader.loadAsync(GLB_URL);
    let mesh = null;
    gltf.scene.traverse((node) => {
      if (!mesh && node.isMesh) mesh = node;
    });
    if (!mesh) throw new Error('the GLB has no mesh');
    return mesh;
  } catch (error) {
    console.warn(`[tooth] ${error.message}: using the procedural molar instead`);
    return null;
  }
}

// ---- Sampling a real mesh's surface -----------------------------------------------------
/**
 * MeshSurfaceSampler picks random points ON the mesh's triangles, weighted by triangle AREA (a big
 * triangle gets proportionally more points than a sliver), so the density looks even over the
 * surface regardless of how the model happened to be modelled. It needs a Mesh (geometry + a
 * material object, though the material's appearance is never used) and, if the geometry has no
 * per-vertex colour or normal to sample, `build()` still works from positions alone.
 */
function sampleMesh(mesh, count, seed) {
  const sampler = new MeshSurfaceSampler(mesh).build();
  // MeshSurfaceSampler takes its randomness from Math.random unless you hand it your own generator,
  // so without this a tuning slider would reshuffle every point on every change (see leaf.js).
  sampler.randomFunction = seededRandom(seed);

  const positions = new Float32Array(count * 3);
  const point = new Vector3(); // sample() calls .set()/.addScaledVector() on this, so a plain {x,y,z} won't do
  for (let i = 0; i < count; i++) {
    sampler.sample(point);
    positions[i * 3] = point.x;
    positions[i * 3 + 1] = point.y;
    positions[i * 3 + 2] = point.z;
  }
  return positions;
}

// ---- Procedural fallback: crown + two roots ----------------------------------------------
/**
 * A stylized molar with no model file: a lumpy dome (the crown, with four low bumps, or "cusps",
 * the way a back tooth has) sitting on two tapered roots. Every point is placed directly in 3D
 * (there is no mesh to sample), using the same kind of (u, v) parameterisation as the leaf:
 * u runs along whichever curve we are placing points on, v is the angle around it.
 *
 * The two parts are built to MEET exactly at y = 0 (the gumline): the crown is a dome from its
 * apex down to its equator, and the equator IS the rim at y = 0 (a plain hemisphere, not a partial
 * one), so there is no seam. Each root starts at that same y = 0, at a radius no bigger than the
 * crown's, so it reads as emerging from underneath the crown rather than floating beside it.
 */
function sampleProceduralMolar(count, seed) {
  const rand = seededRandom(seed);
  const positions = new Float32Array(count * 3);

  const CROWN_SHARE = 0.6; // the rest goes to the two roots
  const CROWN_RADIUS = 0.95;
  const CROWN_HEIGHT = 0.62; // flattens the hemisphere: a tooth crown is domed, not a half-ball
  const CUSPS = 4; // low bumps on the biting surface, arranged in a ring
  const ROOT_LENGTH = 1.3;
  const ROOT_SPACING = 0.4; // each root's centre, inset within the crown's footprint
  const ROOT_BASE_RADIUS = 0.3; // where a root meets the crown; kept under ROOT_SPACING so the two don't overlap

  const nCrown = Math.round(count * CROWN_SHARE);
  const nRoot = Math.round((count - nCrown) / 2); // split evenly, left over goes to the second root

  let written = 0;
  const put = (x, y, z) => {
    positions[written++] = x;
    positions[written++] = y;
    positions[written++] = z;
  };

  // Crown: apex at polar = 0 (the biting surface), rim at polar = PI/2 (a full hemisphere, so the
  // rim sits exactly at y = 0). Sampled evenly over the dome's surface AREA, not over the angle:
  // the standard trick is to pick cos(polar) uniformly, not polar itself, or points would bunch
  // at the apex (small circles near a pole cover less area per degree than circles near the equator).
  for (let i = 0; i < nCrown; i++) {
    const polar = Math.acos(1 - rand()); // 1 - rand(): cos(polar) uniform over [0, 1] = the full hemisphere
    const azimuth = rand() * Math.PI * 2;
    // Cusps ripple the middle of the dome and fade to 0 at both the apex and the rim (sin(2x) is 0 at
    // x = 0 and x = PI/2), so the rim itself stays a clean circle for the roots to join onto.
    const bump = 1 + 0.07 * Math.cos(CUSPS * azimuth) * Math.sin(polar * 2);
    const radius = CROWN_RADIUS * bump;
    const x = radius * Math.sin(polar) * Math.cos(azimuth);
    const z = radius * Math.sin(polar) * Math.sin(azimuth);
    const y = radius * Math.cos(polar) * CROWN_HEIGHT;
    put(x, y, z);
  }

  // Roots: two cones tapering downward (a molar has two or three; two keeps the point budget simple),
  // each with a slight outward curve, sampled evenly along their surface area (a cone widens toward
  // its base, so more points must land near the top for an even density: hence sqrt(u) below).
  for (const side of [-1, 1]) {
    for (let i = 0; i < nRoot; i++) {
      const u = Math.sqrt(rand()); // u=0 at the gumline (wide end, y=0), u=1 at the root's tip
      const azimuth = rand() * Math.PI * 2;
      const radius = (1 - u) * ROOT_BASE_RADIUS + 0.02;
      const curve = 0.15 * u * u; // the tip curves outward, away from the tooth's centre
      const cx = side * (ROOT_SPACING + curve);
      const cy = -ROOT_LENGTH * u;
      put(cx + radius * Math.cos(azimuth), cy, radius * Math.sin(azimuth));
    }
  }

  return positions;
}

/**
 * @param {THREE.Mesh|null} mesh from loadToothSource(), or null to use the procedural molar
 * @returns {Float32Array} count*3 positions, centred, longest side 2
 */
export function sampleTooth(mesh, count, seed = 3) {
  const positions = mesh ? sampleMesh(mesh, count, seed) : sampleProceduralMolar(count, seed);
  return normalize(positions);
}
