// The hero point cloud: a Three.js scene with one THREE.Points object.
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
  Points,
  Scene,
  ShaderMaterial,
  WebGLRenderer,
} from 'three';
import { gsap } from 'gsap';
import { tints } from '../motion.js';
import { makeLeaf } from './shapes/leaf.js';
import { seededRandom } from './shapes/utils.js';
import vertexShader from './shaders/points.vert.glsl?raw'; // ?raw = import the file's text as a string
import fragmentShader from './shaders/points.frag.glsl?raw';

const FOV = 30; // vertical field of view in degrees; a narrow lens keeps perspective gentle
const MAX_PIXEL_RATIO = 2; // a 3x phone screen would draw 2.25x the pixels for no visible gain
const FIT_MARGIN = 1.2; // how much empty space around the shape (bigger = shape appears smaller)
// Idle motion so the depth is visible: the cloud turns left and right about the vertical axis,
// following sin(time * speed) * angle. `angle` is the peak turn in radians (0.5 is about 29 degrees).
const SWAY = { speed: 0.4, angle: 0.5 };

/**
 * Create the point cloud inside `container` (the hero's visual slot).
 * Throws if WebGL is unavailable; the caller keeps the portrait photo in that case.
 *
 * @param {HTMLElement} container element that gives the canvas its size (CSS decides, we follow)
 * @param {{count: number, size: number}} options particle count, and particle diameter in world units
 */
export function createPointCloud(container, { count, size }) {
  // ---- Renderer ------------------------------------------------------------------------
  // antialias off: each point is already soft-edged by the shader, and multisampling costs GPU time.
  // alpha on: the canvas is transparent, so the page background shows through the gaps.
  const renderer = new WebGLRenderer({ antialias: false, alpha: true, powerPreference: 'high-performance' });
  renderer.setClearColor(0x000000, 0); // clear to fully transparent black each frame
  const canvas = renderer.domElement;
  canvas.className = 'hero__canvas';
  canvas.setAttribute('aria-hidden', 'true'); // decorative; the captions and portrait alt carry the meaning
  container.appendChild(canvas);

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
      uColor: { value: new Color(tints.leaf) }, // hex in, linear-light out (the fragment shader converts back)
      // Additive light adds up: where many particles overlap (the veins) the sum exceeds 1 and the
      // colour clips toward white. A lower opacity keeps the tint visible in the densest places.
      uOpacity: { value: 0.5 },
    },
    transparent: true, // needed for blending to apply at all
    blending: AdditiveBlending, // overlapping particles add their light: dense areas glow
    depthWrite: false, // translucent particles must not hide each other behind invisible depth
  });

  // ---- Geometry: the per-particle data ----------------------------------------------------
  // A BufferGeometry is a bag of named typed arrays ("attributes"), one entry per vertex. For
  // Points, one vertex = one particle. `position` is special (three reads it to know how many
  // vertices there are); anything else we name ourselves and read in the vertex shader.
  const buildGeometry = (n) => {
    const geo = new BufferGeometry();
    // BufferAttribute(array, itemSize): itemSize 3 = every 3 numbers are one vec3 (x, y, z).
    geo.setAttribute('position', new BufferAttribute(makeLeaf(n), 3));
    // aRandom: one float per particle, from a seeded generator so it is stable between rebuilds.
    const rand = seededRandom(1234);
    const randoms = new Float32Array(n);
    for (let i = 0; i < n; i++) randoms[i] = rand();
    geo.setAttribute('aRandom', new BufferAttribute(randoms, 1));
    return geo;
  };
  let geometry = buildGeometry(count);

  // Points = "draw this geometry as one dot per vertex". (Mesh would draw triangles, Line lines.)
  const points = new Points(geometry, material);
  scene.add(points);

  // Numbers the dev panel edits. Kept in one object so lil-gui can bind to it directly.
  const params = { count, size };

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

  // ---- The frame loop --------------------------------------------------------------------
  // Driven by gsap.ticker (the same clock Lenis and ScrollTrigger use, see lib/scroll.js) instead
  // of a private requestAnimationFrame loop, so in M3d the scroll-driven changes and the drawing
  // happen in the same frame. `time` is seconds since the ticker started.
  const tick = (time) => {
    points.rotation.y = Math.sin(time * SWAY.speed) * SWAY.angle;
    renderer.render(scene, camera);
  };

  const observer = new ResizeObserver(resize);
  observer.observe(container);
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
     * Change the particle count. Unlike a uniform this needs a NEW geometry: a BufferAttribute's
     * length is fixed when it is created. The old geometry's GPU buffers are freed explicitly
     * with dispose(), because the garbage collector cannot see GPU memory.
     */
    setCount(n) {
      const next = buildGeometry(n);
      geometry.dispose();
      geometry = next;
      points.geometry = next;
      params.count = n;
    },

    destroy() {
      gsap.ticker.remove(tick);
      observer.disconnect();
      container.classList.remove('is-webgl'); // the portrait photo comes back
      geometry.dispose();
      material.dispose();
      renderer.dispose();
      renderer.forceContextLoss(); // hand the GPU context back now; browsers only allow ~16 at once
      canvas.remove();
    },
  };
}
