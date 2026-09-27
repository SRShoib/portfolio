// The hero point cloud: a Three.js scene with one THREE.Points object that MORPHS between four
// shapes (face -> tooth -> leaf -> graph) as a single uniform, uProgress, moves from 0 to 3.
//
// This file is loaded with a dynamic import() from sections/hero.js, after first paint, so the
// ~135 KB (gzipped) of three.js never delays the page's text. Only the named classes used below are
// imported, which lets the bundler drop the parts of the library we never touch.
//
// Three.js in one paragraph. To draw anything you need:
//   Renderer  talks to the GPU and owns the <canvas>
//   Scene     the list of things to draw
//   Camera    the viewpoint and lens
//   Object    WHAT to draw = a geometry (the vertex data) + a material (how to shade it)
// Each frame: renderer.render(scene, camera).

import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  MathUtils,
  PerspectiveCamera,
  Plane,
  Points,
  Raycaster,
  Scene,
  ShaderMaterial,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three';
import { gsap } from 'gsap';
import { tints } from '../motion.js';
import { makeLeaf } from './shapes/leaf.js';
import { makeGraph } from './shapes/graph.js';
import { seededRandom } from './shapes/utils.js';
import { FACE_DEFAULTS, loadFaceSource, sampleFace } from './shapes/face.js';
import { loadToothSource, sampleTooth } from './shapes/tooth.js';
import vertexShader from './shaders/points.vert.glsl?raw'; // ?raw = import the file's text as a string
import fragmentShader from './shaders/points.frag.glsl?raw';

const FOV = 30; // vertical field of view in degrees; a narrow lens keeps perspective gentle
const MAX_PIXEL_RATIO = 2; // a 3x phone screen would draw 2.25x the pixels for no visible gain
const FIT_MARGIN = 1.2; // how much empty space around the shape (bigger = shape appears smaller)
// Idle motion so the depth is visible: the cloud turns left and right about the vertical axis,
// following sin(time * speed) * angle. `angle` is the peak turn in radians (0.5 is about 29 degrees).
const SWAY = { speed: 0.4, angle: 0.5 };
// Cursor tilt (CLAUDE.md: "the whole cloud rotates slightly toward the cursor with lerp") ADDS to the
// sway above rather than replacing it. MAX_TILT is in radians, reached when the cursor sits at the
// horizontal edge of the visual; TILT_DAMPING is how quickly the current tilt eases toward that
// target (bigger = snappier, see MathUtils.damp below).
const MAX_TILT = 0.25;
const TILT_DAMPING = 4;
// How quickly the repel effect itself (not any one particle's push, which is instant per frame) fades
// in when the cursor arrives and out when it leaves.
const REPEL_DAMPING = 5;

// uProgress endpoints, in the order the real design visits them (CLAUDE.md, "Hero: morphing point
// cloud"). Every shape now lives in the SAME geometry (see buildGeometry below), so "switching
// shapes" is just moving this number — no rebuild, unlike M3b's setShape().
const SHAPE_PROGRESS = { face: 0, tooth: 1, leaf: 2, graph: 3 };

// Particle count and diameter (world units), tuned by eye across all four shapes at once (unlike
// M3b, sizing is no longer per-shape: every particle attribute now lives in one geometry and morphs
// continuously, so there is no single moment to hold one shape's "current" size against). 20k on
// desktop, 6k on mobile (CLAUDE.md).
export const DEVICE_PRESETS = {
  desktop: { count: 20000, size: 0.022 },
  mobile: { count: 6000, size: 0.032 },
};

/**
 * The face's positions, or the leaf's as a last-resort fallback if the face's own source is
 * unusable (should only happen if every pixel's weight collapses to 0 — see face.js). Never
 * throws, so a rebuild can never crash the scene over a slider dragged to a strange combination.
 */
function buildFacePositions(count, faceSource, faceParams) {
  const positions = faceSource && sampleFace(faceSource, count, faceParams);
  if (positions) return positions;
  console.warn('[pointcloud] face sampling produced nothing (source missing or every weight is 0); using the leaf instead');
  return makeLeaf(count);
}

/**
 * Create the point cloud inside `container` (the hero's visual slot). Loads the face and tooth
 * sources up front — every shape morphs through the whole sequence once scroll drives it (M3d), so
 * loading both now, whichever `shape` you start on, is not wasted work. Throws if WebGL is
 * unavailable; the caller keeps the portrait photo then.
 *
 * @param {HTMLElement} container element that gives the canvas its size (CSS decides, we follow)
 * @param {{shape: string, count: number, size: number, faceParams: object}} options `shape` is
 *   only the STARTING point on the 0-3 sequence (see SHAPE_PROGRESS); moving through the rest is
 *   what setProgress() is for.
 */
export async function createPointCloud(container, { shape = 'leaf', count, size, faceParams = FACE_DEFAULTS } = {}) {
  // ---- Renderer ------------------------------------------------------------------------
  // Built FIRST, before fetching anything: a device with no WebGL throws right here, and the
  // caller (hero.js) keeps the portrait photo. Fetching the portrait cutout and the ~460 KB tooth
  // GLB before this check would waste that download on exactly the visitors least able to afford
  // it. antialias off: each point is already soft-edged by the shader, and multisampling costs GPU
  // time. alpha on: the canvas is transparent, so the page background shows through the gaps.
  const renderer = new WebGLRenderer({ antialias: false, alpha: true, powerPreference: 'high-performance' });
  renderer.setClearColor(0x000000, 0); // clear to fully transparent black each frame
  const canvas = renderer.domElement;
  canvas.className = 'hero__canvas';
  canvas.setAttribute('aria-hidden', 'true'); // decorative; the captions and portrait alt carry the meaning
  container.appendChild(canvas);

  // Both loaders resolve null on failure rather than rejecting (see face.js / tooth.js), so one
  // missing asset can never stop the other from loading, and Promise.all is safe to use here.
  const [faceSource, toothMesh] = await Promise.all([loadFaceSource(), loadToothSource()]);
  // CLAUDE.md's documented fallback: "If the cutout is missing, skip the face stage: the sequence
  // starts at the tooth (uProgress 1 -> 3)". Tooth itself can't be "missing" in the same sense:
  // sampleTooth always produces something, real mesh or procedural molar.
  let startProgress = SHAPE_PROGRESS[shape] ?? 0;
  if (startProgress === 0 && !faceSource) startProgress = SHAPE_PROGRESS.tooth;

  // ---- Camera and scene ------------------------------------------------------------------
  const scene = new Scene();
  const camera = new PerspectiveCamera(FOV, 1, 0.1, 50); // aspect is set properly in resize()

  // ---- Material: our own shaders ---------------------------------------------------------
  // A ShaderMaterial runs YOUR GLSL instead of a built-in look. `uniforms` are values the CPU
  // sets and every particle reads identically (size, colour...); `attributes` (below, on the
  // geometry) are per-particle. Uniforms are wrapped in { value } so three can watch them for changes.
  const material = new ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: {
      uSize: { value: size },
      uScale: { value: 1 }, // real value set in resize()
      uProgress: { value: startProgress },
      // One colour per shape (hex in, linear-light out — the fragment shader converts back). Fixed
      // for the shape's whole lifetime: unlike M3b, nothing ever REASSIGNS these; the vertex shader
      // mixes between them per particle, the same way it mixes positions (see points.vert.glsl).
      uColorFace: { value: new Color(tints.face) },
      uColorTooth: { value: new Color(tints.tooth) },
      uColorLeaf: { value: new Color(tints.leaf) },
      uColorGraph: { value: new Color(tints.graph) },
      // Additive light adds up: where many particles overlap (the leaf's veins, a graph node) the
      // sum exceeds 1 and the colour clips toward white. A lower opacity keeps every tint visible
      // in the densest places, across all four shapes (a single compromise value, as with uSize).
      uOpacity: { value: 0.5 },
      // Cursor repel (see the vertex shader and tick() below). uMouse starts far outside every
      // shape's -1..1 box so nothing is repelled before any pointer activity has been recorded.
      uMouse: { value: new Vector3(1000, 1000, 1000) },
      uRepelStrength: { value: 0 },
    },
    transparent: true, // needed for blending to apply at all
    blending: AdditiveBlending, // overlapping particles add their light: dense areas glow
    depthWrite: false, // translucent particles must not hide each other behind invisible depth
  });

  // ---- Geometry: the per-particle data ----------------------------------------------------
  // A BufferGeometry is a bag of named typed arrays ("attributes"), one entry per vertex. Every
  // shape needs the SAME number of vertices, because morphing is done by INDEX: particle 7's face
  // position and particle 7's tooth position are simply whatever each sampler happened to produce
  // at that index, no relation to each other beyond "the same particle". That is deliberate (see
  // LEARNING.md): a plain index correspondence is what the staggering and mid-transition scatter
  // are there to disguise, turning an otherwise ordinary "points sliding to new spots" into
  // something that reads as scattering apart and re-forming.
  //
  // tooth/leaf/graph do not depend on `faceParams`, so rebuilding them every time only the face's
  // sliders change would be wasted work (a full GLB re-sample, a full leaf and graph re-generation,
  // for numbers that did not affect them). They are cached here and only rebuilt when the PARTICLE
  // COUNT changes; only aFace is rebuilt on every call.
  let cachedCount = null;
  let cachedTooth;
  let cachedLeaf;
  let cachedGraph;
  const ensureSharedShapes = (n) => {
    if (cachedCount === n) return;
    cachedTooth = sampleTooth(toothMesh, n);
    cachedLeaf = makeLeaf(n);
    cachedGraph = makeGraph(n);
    cachedCount = n;
  };

  const state = { count, faceParams: { ...faceParams } };
  const buildGeometry = (n) => {
    ensureSharedShapes(n);
    const geo = new BufferGeometry();
    const faceAttr = new BufferAttribute(buildFacePositions(n, faceSource, state.faceParams), 3);
    // `position` is the one attribute three.js itself reads, purely to COUNT the vertices to draw
    // (see the vertex shader's header comment); its VALUES are never read by our shader, so it
    // shares aFace's exact buffer rather than wasting a second copy of the same numbers.
    geo.setAttribute('position', faceAttr);
    geo.setAttribute('aFace', faceAttr);
    geo.setAttribute('aTooth', new BufferAttribute(cachedTooth, 3));
    geo.setAttribute('aLeaf', new BufferAttribute(cachedLeaf, 3));
    geo.setAttribute('aGraph', new BufferAttribute(cachedGraph, 3));
    // aRandom: one float per particle, from a seeded generator so it is stable between rebuilds.
    const rand = seededRandom(1234);
    const randoms = new Float32Array(n);
    for (let i = 0; i < n; i++) randoms[i] = rand();
    geo.setAttribute('aRandom', new BufferAttribute(randoms, 1));
    return geo;
  };
  let geometry = buildGeometry(state.count);

  // Points = "draw this geometry as one dot per vertex". (Mesh would draw triangles, Line lines.)
  const points = new Points(geometry, material);
  scene.add(points);

  /** The one place a geometry is actually rebuilt: dispose the old one, build and mount a new one. */
  function rebuildGeometry() {
    const next = buildGeometry(state.count);
    geometry.dispose();
    geometry = next;
    points.geometry = next;
  }

  // Numbers the dev panel edits. Kept in one object so lil-gui can bind to it directly. `face` is a
  // nested object (not spread flat) so a GUI folder can bind straight to its fields.
  const params = { count: state.count, size, progress: startProgress, face: state.faceParams };

  // ---- Sizing --------------------------------------------------------------------------
  // CSS decides how big the container is; the canvas just follows it.
  const tanHalfFov = Math.tan(MathUtils.degToRad(FOV) / 2);
  function resize() {
    const width = container.clientWidth;
    const height = container.clientHeight;
    if (!width || !height) return; // hidden or not laid out yet

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO));
    // Third argument false = do not write width/height into the canvas's style; the stylesheet
    // (100% x 100%) does that. Otherwise we would fight the CSS and could feed back into the observer.
    renderer.setSize(width, height, false);

    camera.aspect = width / height;
    // Place the camera so a box spanning -1..+1 in x and y (every shape is normalised to that) fits
    // with room to spare. Visible half-height at distance d is d * tan(fov/2), and the half-width
    // is that times the aspect; solve for d on whichever side is the tighter one.
    const distanceToFitHeight = 1 / tanHalfFov;
    const distanceToFitWidth = 1 / (camera.aspect * tanHalfFov);
    camera.position.z = Math.max(distanceToFitHeight, distanceToFitWidth) * FIT_MARGIN;
    camera.updateProjectionMatrix();

    // pixels per world unit at distance 1 = (canvas height in device pixels) / (world height seen at distance 1).
    // The canvas's height attribute already includes the pixel ratio, so this is device pixels.
    material.uniforms.uScale.value = canvas.height / (2 * tanHalfFov);
  }

  // ---- Cursor: repel + lerped tilt -------------------------------------------------------
  // Reused every frame instead of allocated fresh, so the render loop makes no garbage: a Raycaster
  // to turn a 2D pointer position into a 3D ray, a fixed ground Plane (world-space z = 0, roughly
  // where the cloud sits) for it to hit, and two Vector3 scratch objects for the hit point.
  const raycaster = new Raycaster();
  const groundPlane = new Plane(new Vector3(0, 0, 1), 0);
  const worldHit = new Vector3();
  const localHit = new Vector3();
  const pointerNDC = new Vector2(); // normalised device coords (-1..1), relative to THIS canvas
  let pointerActive = false;
  let currentTilt = 0; // radians, lerped toward targetTilt every frame (see tick())

  // ---- The frame loop --------------------------------------------------------------------
  // Driven by gsap.ticker (the same clock Lenis and ScrollTrigger use, see lib/scroll.js) instead
  // of a private requestAnimationFrame loop, so scroll-driven changes (M3d) and the drawing happen
  // in the same frame. `time` is seconds since the ticker started; `deltaMs` is milliseconds since
  // the previous tick (GSAP's ticker convention), used below to make the lerps frame-rate independent.
  const tick = (time, deltaMs) => {
    // A fresh page's first tick has no previous frame to measure from; treat it as one 60fps frame
    // rather than a huge or zero delta (either would make the very first damp() step misbehave).
    // Also capped at 100ms: a backgrounded tab throttles requestAnimationFrame, so the tick that
    // finally runs when the tab regains focus can report a multi-second deltaMs (gsap.ticker's
    // lagSmoothing is off, see lib/scroll.js) -- left uncapped, currentTilt and uRepelStrength
    // (both damp()'d below) would jump straight to their targets in one frame instead of easing.
    // `time` itself needs no such cap: it already reflects true elapsed wall time on its own (see
    // the comment below on why that is correct, not a bug).
    const dt = Math.min((deltaMs || 16.67) / 1000, 0.1);

    // Kept LIVE even while offscreen — cheap (a couple of trig and damp() calls). `points.rotation.y`
    // itself would be fine either way: it is a PURE function of the absolute `time`, so recomputing it
    // fresh on the first tick after becoming visible again gives exactly the value continuous sway
    // would already show at that moment, no catching up needed (verified: recomputing it here or only
    // after the visibility check below produces the identical number for the same `time` — there is no
    // stored rotation to go stale). `currentTilt`, just below, is different: it is a damped, ACCUMULATED
    // value, not a lookup, so freezing ITS update would leave it stuck wherever it was when the hero
    // left the viewport, needing its usual second or so to visibly ease back to rest AFTER returning,
    // rather than having already settled during the (often longer) time spent offscreen. Keeping both
    // together here is simpler than treating them differently for a distinction this small, and costs
    // nothing extra: a sin() and two damp() calls, done or skipped, are not where the frame budget goes.
    const targetTilt = pointerActive ? MathUtils.clamp(pointerNDC.x, -1, 1) * MAX_TILT : 0;
    // MathUtils.damp: a frame-rate-independent lerp — the ONLY frame-independent alternative to
    // `current += (target - current) * fixedFraction`, which would ease faster on a high refresh-rate
    // display and slower on a stuttering one.
    currentTilt = MathUtils.damp(currentTilt, targetTilt, TILT_DAMPING, dt);
    points.rotation.y = Math.sin(time * SWAY.speed) * SWAY.angle + currentTilt;
    // Fades the repel effect in when the cursor arrives and out when it leaves, on top of the
    // shader's own spatial (distance-based) falloff — see the comment in points.vert.glsl. Kept live
    // for the same reason as `currentTilt` above (this is also a damped, accumulated value, not a
    // lookup): so it has already faded to 0 by the time rendering resumes, not stuck mid-fade.
    material.uniforms.uRepelStrength.value = MathUtils.damp(
      material.uniforms.uRepelStrength.value,
      pointerActive ? 1 : 0,
      REPEL_DAMPING,
      dt,
    );

    // Everything below only matters for what actually gets DRAWN, which is exactly the part that
    // pauses while the hero is offscreen (see the IntersectionObserver set up below): the cursor
    // raycast (whose only purpose is feeding the next render) and the render call itself, by far the
    // most expensive line in this function. gsap.ticker still calls tick() every frame regardless —
    // pausing OUR work here is what saves the GPU time, not stopping the ticker, which other things
    // (Lenis, ScrollTrigger) still need running.
    if (!isVisible) return;

    // The repel shader code (see points.vert.glsl) needs uMouse in THIS object's own, currently
    // rotating, local space, so the rotation set above must land in matrixWorld before the raycast
    // below reads it — updateMatrixWorld() forces that now rather than waiting for render().
    points.updateMatrixWorld();
    if (pointerActive) {
      raycaster.setFromCamera(pointerNDC, camera);
      // intersectPlane returns null if the ray is parallel to the plane (never happens with this
      // camera, which always looks roughly down -z, but cheap to guard regardless).
      if (raycaster.ray.intersectPlane(groundPlane, worldHit)) {
        points.worldToLocal(localHit.copy(worldHit));
        material.uniforms.uMouse.value.copy(localHit);
      }
    }

    renderer.render(scene, camera);
  };

  const observer = new ResizeObserver(resize);
  observer.observe(container);

  // Pause rendering (and the cursor raycast that feeds it — see tick()) while the hero is scrolled
  // out of view: once the visitor is reading the Statement or Stats sections, this canvas is invisible
  // but gsap.ticker would otherwise keep calling tick() 60 times a second for nothing, burning battery
  // and GPU time on frames nobody sees. `entry.isIntersecting` starts true here (the hero is normally
  // the first thing on the page); the observer corrects that shortly after if it is ever wrong.
  let isVisible = true;
  const visibilityObserver = new IntersectionObserver(([entry]) => {
    isVisible = entry.isIntersecting;
  });
  visibilityObserver.observe(container);

  resize();
  tick(0); // draw one frame BEFORE revealing the canvas, so it never fades in empty
  gsap.ticker.add(tick);

  // A CSS transition only runs if the browser has already COMPUTED the starting style (opacity 0)
  // before the class below changes it; if both happen in one go, the first style it ever computes
  // is the final one and the canvas pops in. Any layout read forces that computation, and resize()
  // above already does (it reads clientWidth), so this line is currently redundant. It stays as
  // insurance: reorder this function and the fade would silently stop working.
  void canvas.offsetWidth;
  container.classList.add('is-webgl');

  return {
    params,
    canvas,

    setSize(value) {
      params.size = value;
      material.uniforms.uSize.value = value; // uniforms are free to change: no rebuild
    },

    /**
     * Record the cursor's position (in CSS pixels, e.g. straight from a PointerEvent's clientX/Y)
     * for the repel + tilt effect. Converts to this canvas's own normalised device coordinates
     * (-1..1); the actual raycast happens once per frame in tick(), not on every call, so this
     * stays cheap even if the caller listens on `window` and gets far more events than frames.
     */
    setPointer(clientX, clientY) {
      const rect = canvas.getBoundingClientRect();
      pointerNDC.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      pointerNDC.y = -((clientY - rect.top) / rect.height) * 2 + 1; // screen Y grows down, NDC Y grows up
      pointerActive = true;
    },

    /** No active pointer: repel strength damps to 0 and the cursor tilt eases back to plain sway. */
    clearPointer() {
      pointerActive = false;
    },

    /**
     * Move along the face -> tooth -> leaf -> graph sequence. Free: every shape's data already
     * lives in the geometry (see buildGeometry above), so this is a plain uniform update, exactly
     * like setSize — no rebuild, however often or however smoothly it is called (a scroll handler
     * in M3d will call this every frame).
     */
    setProgress(value) {
      params.progress = value;
      material.uniforms.uProgress.value = value;
    },

    /**
     * Change the particle count. Unlike a uniform this needs a NEW geometry: a BufferAttribute's
     * length is fixed when it is created. The old geometry's GPU buffers are freed explicitly
     * with dispose(), because the garbage collector cannot see GPU memory.
     */
    setCount(n) {
      state.count = n;
      params.count = n;
      rebuildGeometry();
    },

    /**
     * Merge new face-weighting values (gain, gamma, floor, depth, reach; see face.js) and rebuild.
     * A no-op patch (call with nothing) still rebuilds from the current params.face, which is what
     * the dev panel does: it has already written the dragged value into params.face itself. Only
     * aFace is actually recomputed (see ensureSharedShapes): tooth, leaf and graph are unaffected
     * by these numbers and are reused as-is.
     */
    setFaceParams(patch = {}) {
      Object.assign(state.faceParams, patch);
      rebuildGeometry();
    },

    destroy() {
      gsap.ticker.remove(tick);
      observer.disconnect();
      visibilityObserver.disconnect();
      container.classList.remove('is-webgl'); // the portrait photo comes back
      geometry.dispose();
      material.dispose();
      renderer.dispose();
      renderer.forceContextLoss(); // hand the GPU context back now; browsers only allow ~16 at once
      canvas.remove();
    },
  };
}
