// Dev-only tuning panel (lil-gui). hero.js imports this behind `if (import.meta.env.DEV)`, and
// Vite replaces that condition with `false` in production and drops the branch, so neither this
// file nor lil-gui is ever part of the shipped site. (Check: search dist/ for "lil-gui".)

import GUI from 'lil-gui';
import { DEVICE_PRESETS } from './scene.js';

/** Add the panel for a cloud made by createPointCloud(). Returns a function that removes it. */
export function attachDebugPanel(cloud) {
  const gui = new GUI({ title: 'Point cloud (dev only)' });
  // lil-gui is position: fixed at the top right, which is where the Resume button lives.
  gui.domElement.style.top = 'calc(var(--header-h) + 0.5rem)';
  // On a phone the open panel would cover most of the cloud. Start collapsed there; tap to open.
  if (window.innerWidth < 768) gui.close();

  // Free: setProgress only touches a uniform (see scene.js), so this can update live on every
  // drag tick, not just on release, and scrubbing it by hand is the whole point of this control
  // (CLAUDE.md, M3c: "a lil-gui slider to scrub uProgress by hand"). Since M3d, uProgress is ALSO
  // driven from outside the panel (the hero's scroll pin), so this slider needs .listen(): without
  // it, a controller only redraws when its OWN input changes, and would sit stuck at its last value
  // while you scrolled straight past it. .listen() polls the value every frame and keeps it in sync.
  gui
    .add(cloud.params, 'progress', 0, 3, 0.001)
    .name('uProgress (0 face, 1 tooth, 2 leaf, 3 graph)')
    .onChange((value) => cloud.setProgress(value))
    .listen();

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

  // A quick way to compare the two real device tiers. A button, not a slider, because one click
  // sets count AND size together; nothing to drag.
  const applyPreset = (device) => {
    const preset = DEVICE_PRESETS[device];
    cloud.setCount(preset.count);
    cloud.setSize(preset.size);
    // The two calls above changed cloud.params directly, but the sliders drawn on screen don't
    // know that: they only redraw when YOU move them. Tell every controller to re-read its value.
    gui.controllersRecursive().forEach((controller) => controller.updateDisplay());
  };
  gui.add({ fn: () => applyPreset('desktop') }, 'fn').name('preset: desktop (20k)');
  gui.add({ fn: () => applyPreset('mobile') }, 'fn').name('preset: mobile (6k)');

  // Face-only knobs (CLAUDE.md, M3b: "tune luminance weighting, depth and point size until the
  // face reads clearly"). Always visible: unlike M3b there is no single "current shape" to gate
  // this on any more (the cloud can sit anywhere along the whole sequence at once), and these
  // still tune the SAME aFace data whichever part of the sequence uProgress happens to be showing.
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

  // Handy for poking at from the browser console: __cloud.params, __cloud.canvas ...
  window.__cloud = cloud;

  return () => {
    gui.destroy();
    delete window.__cloud;
  };
}
