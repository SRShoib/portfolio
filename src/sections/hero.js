// Hero visual: upgrades the portrait slot to the WebGL point cloud.
//
// The hero's text, buttons and the portrait <picture> are plain HTML and are already on screen
// (CLAUDE.md rule 3: content first, motion second). This module only ADDS to that. If anything
// here is skipped or fails, whether reduced motion, no WebGL, or a blocked script, the visitor
// still sees the portrait photo.
//
// M3a scope: one shape (the leaf), no morphing, no scroll. The scene itself lives in
// lib/pointcloud/scene.js and is loaded with a dynamic import() only when it is actually needed.

import { gsap } from 'gsap';
import { conditions } from '../lib/motion.js';
import { preloaderDone } from './preloader.js';

// 20k particles on desktop, 6k on phones (CLAUDE.md). `size` is the particle diameter in world
// units; phones get bigger particles so fewer of them still read as a shape. Tuned in M3b.
const CLOUD = {
  desktop: { count: 20000, size: 0.022 },
  mobile: { count: 6000, size: 0.04 },
};

let mm = null;

/**
 * Resolve once the browser has painted the page's first frame AND has a moment to spare.
 * requestAnimationFrame callbacks run just BEFORE a frame is painted, so from inside one we ask
 * for an idle moment: that arrives after the paint. Safari has no requestIdleCallback, hence the
 * setTimeout fallback.
 */
function afterFirstPaint() {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      if ('requestIdleCallback' in window) requestIdleCallback(() => resolve(), { timeout: 1000 });
      else setTimeout(resolve, 100);
    });
  });
}

export function initHero() {
  const visual = document.querySelector('.hero__visual');
  if (!visual) return;

  mm = gsap.matchMedia();

  // matchMedia re-runs this whole function when any listed condition flips (say, a tablet
  // rotating past 1024px or the visitor toggling reduced motion), first running the cleanup
  // that was returned last time. So the cloud is always built for the current conditions.
  mm.add({ motion: conditions.motion, desktop: conditions.desktop }, (context) => {
    const { motion, desktop } = context.conditions;

    // Reduced motion: no WebGL at all. three.js is not even downloaded; the portrait stays.
    if (!motion) return;

    let cloud = null;
    let removeDebugPanel = null;
    let cancelled = false; // set by the cleanup: the async steps below check it after each await

    (async () => {
      try {
        await preloaderDone; // don't compete with the preloader animation for the main thread
        await afterFirstPaint(); // text and portrait are on screen before we fetch anything heavy
        if (cancelled) return;

        // The dynamic import(): Vite splits scene.js and three.js into their own file, fetched now.
        const { createPointCloud } = await import('../lib/pointcloud/scene.js');
        if (cancelled) return;

        cloud = createPointCloud(visual, desktop ? CLOUD.desktop : CLOUD.mobile);

        if (import.meta.env.DEV) {
          const { attachDebugPanel } = await import('../lib/pointcloud/debug.js');
          if (!cancelled) removeDebugPanel = attachDebugPanel(cloud);
        }
      } catch (error) {
        // No WebGL, a blocked chunk, a lost network: the portrait photo is still there. Say so in the console.
        console.warn('[hero] point cloud not started, keeping the portrait photo:', error);
      }
    })();

    return () => {
      cancelled = true;
      removeDebugPanel?.();
      cloud?.destroy();
    };
  });
}

export function destroyHero() {
  mm?.revert(); // runs the cleanup above
  mm = null;
}
