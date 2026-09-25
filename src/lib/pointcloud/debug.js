// Dev-only tuning panel (lil-gui). hero.js imports this behind `if (import.meta.env.DEV)`, and
// Vite replaces that condition with `false` in production and drops the branch, so neither this
// file nor lil-gui is ever part of the shipped site. (Check: search dist/ for "lil-gui".)

import GUI from 'lil-gui';
import { SHAPE_PRESETS } from './scene.js';

const SHAPES = ['face', 'tooth', 'leaf'];

/** Add the panel for a cloud made by createPointCloud(). Returns a function that removes it. */
export function attachDebugPanel(cloud) {
  const gui = new GUI({ title: 'Point cloud (dev only)' });
  // lil-gui is position: fixed at the top right, which is where the Resume button lives.
  gui.domElement.style.top = 'calc(var(--header-h) + 0.5rem)';
  // On a phone the open panel would cover most of the cloud. Start collapsed there; tap to open.
  if (window.innerWidth < 768) gui.close();

  gui
    .add(cloud.params, 'shape', SHAPES)
    .name('shape')
    .onChange((value) => {
      cloud.setShape(value);
      faceFolder.show(value === 'face');
    });

  // onChange fires continuously while dragging. That is fine for a uniform (free), but a count
  // change rebuilds the geometry, so it only applies when you let go (onFinishChange).
  gui
    .add(cloud.params, 'size', 0.005, 0.12, 0.001)
    .name('point size')
    .onChange((value) => cloud.setSize(value));
  gui
    .add(cloud.params, 'count', 500, 50000, 500)
    .name('particle count')
    .onFinishChange((value) => cloud.setCount(value));

  // A quick way to compare the two real device tiers, sized per shape (see SHAPE_PRESETS in
  // scene.js: the same 20k/6k particles look better at a different point size per shape). These
  // are buttons, not sliders, because one click sets count AND size together; nothing to drag.
  const applyPreset = (device) => {
    const preset = SHAPE_PRESETS[cloud.params.shape][device];
    cloud.setCount(preset.count);
    cloud.setSize(preset.size);
    // The two calls above changed cloud.params directly, but the sliders drawn on screen don't
    // know that: they only redraw when YOU move them. Tell every controller to re-read its value.
    gui.controllersRecursive().forEach((controller) => controller.updateDisplay());
  };
  gui.add({ fn: () => applyPreset('desktop') }, 'fn').name('preset: desktop (20k)');
  gui.add({ fn: () => applyPreset('mobile') }, 'fn').name('preset: mobile (6k)');

  // Face-only knobs (CLAUDE.md, M3b: "tune luminance weighting, depth and point size until the
  // face reads clearly at 6k points"). `reach` controls the vignette that fades the shoulders out
  // (see face.js): it turned out to matter as much for legibility as the luminance weights do,
  // since it also sets how "zoomed in" the face ends up once the cloud is normalised.
  const faceFolder = gui.addFolder('Face (luminance weighting)');
  const faceControl = (key, min, max, step, label) =>
    faceFolder
      .add(cloud.params.face, key, min, max, step)
      .name(label)
      // Rebuilds the geometry (a full resample of ~75k pixels), so apply on release, like count.
      .onFinishChange(() => cloud.setFaceParams());
  faceControl('gain', 0.5, 3, 0.05, 'gain (brightness)');
  faceControl('gamma', 0.5, 4, 0.05, 'gamma (contrast)');
  faceControl('floor', 0, 0.6, 0.01, 'floor (min weight)');
  faceControl('depth', 0, 0.4, 0.01, 'depth (z from luminance)');
  faceControl('reach', 0.3, 1.6, 0.02, 'reach (vignette / zoom)');
  faceFolder.show(cloud.params.shape === 'face'); // hidden unless the face is the one showing

  // Handy for poking at from the browser console: __cloud.params, __cloud.canvas ...
  window.__cloud = cloud;

  return () => {
    gui.destroy();
    delete window.__cloud;
  };
}
