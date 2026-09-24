// Dev-only tuning panel (lil-gui). hero.js imports this behind `if (import.meta.env.DEV)`, and
// Vite replaces that condition with `false` in production and drops the branch, so neither this
// file nor lil-gui is ever part of the shipped site. (Check: search dist/ for "lil-gui".)

import GUI from 'lil-gui';

/** Add the panel for a cloud made by createPointCloud(). Returns a function that removes it. */
export function attachDebugPanel(cloud) {
  const gui = new GUI({ title: 'Point cloud (dev only)' });
  // lil-gui is position: fixed at the top right, which is where the Resume button lives.
  gui.domElement.style.top = 'calc(var(--header-h) + 0.5rem)';
  // On a phone the open panel would cover most of the cloud. Start collapsed there; tap to open.
  if (window.innerWidth < 768) gui.close();

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

  // Handy for poking at from the browser console: __cloud.params, __cloud.canvas ...
  window.__cloud = cloud;

  return () => {
    gui.destroy();
    delete window.__cloud;
  };
}
