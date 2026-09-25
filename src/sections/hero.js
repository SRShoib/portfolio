// Hero visual: upgrades the portrait slot to the WebGL point cloud.
//
// The hero's text, buttons and the portrait <picture> are plain HTML and are already on screen
// (CLAUDE.md rule 3: content first, motion second). This module only ADDS to that. If anything
// here is skipped or fails, whether reduced motion, no WebGL, or a blocked script, the visitor
// still sees the portrait photo.
//
// M3b scope: the face (from the portrait cutout) or the tooth (from the GLB, or a procedural
// fallback), still no morphing or scroll (that is M3c/M3d, when a fourth shape, the graph, joins
// them). The scene itself lives in lib/pointcloud/scene.js and is loaded with a dynamic import()
// only when it is actually needed.

import { gsap } from 'gsap';
import { conditions } from '../lib/motion.js';
import { preloaderDone } from './preloader.js';

// The design's shape 0 (CLAUDE.md, "Hero: morphing point cloud"): the visitor's own face, no
// caption, since the hero text right beside it already introduces them. If the cutout image can't
// be sampled, createPointCloud falls back to the tooth itself (see scene.js) and corrects the
// size preset below to match.
const DEFAULT_SHAPE = 'face';

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

        // The dynamic import(): Vite splits scene.js (and everything it imports: three.js, the
        // face and tooth samplers) into their own file, fetched now.
        const { createPointCloud, SHAPE_PRESETS } = await import('../lib/pointcloud/scene.js');
        if (cancelled) return;

        const device = desktop ? 'desktop' : 'mobile';
        cloud = await createPointCloud(visual, { shape: DEFAULT_SHAPE, ...SHAPE_PRESETS[DEFAULT_SHAPE][device] });
        if (cancelled) {
          cloud.destroy();
          return;
        }
        // createPointCloud silently falls back to another shape if the requested one's source
        // failed to load (see scene.js); when that happens, correct the size to that shape's own
        // tuned preset instead of leaving it at the shape we asked for but didn't get.
        if (cloud.params.shape !== DEFAULT_SHAPE) cloud.setSize(SHAPE_PRESETS[cloud.params.shape][device].size);

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
