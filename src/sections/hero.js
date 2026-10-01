// Hero visual: upgrades the portrait slot to the WebGL point cloud, and (this milestone) drives it
// from scroll.
//
// The hero's text, buttons and the portrait <picture> are plain HTML and are already on screen
// (CLAUDE.md rule 3: content first, motion second). This module only ADDS to that. If anything
// here is skipped or fails, whether reduced motion, no WebGL, or a blocked script, the visitor
// still sees the portrait photo.
//
// M3d scope: a pinned ScrollTrigger drives uProgress over 150vh, swaps the research captions, and
// (fine pointers only) adds the cursor repel + lerped tilt. The scene itself lives in
// lib/pointcloud/scene.js and is loaded with a dynamic import() only when actually needed.

import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { afterFirstPaint, conditions } from '../lib/motion.js';
import { scrollToTarget } from '../lib/scroll.js';
import { preloaderDone } from './preloader.js';

// The design's shape 0 (CLAUDE.md, "Hero: morphing point cloud"): the visitor's own face, no
// caption, since the hero text right beside it already introduces them. If the cutout image can't
// be sampled, createPointCloud starts at the tooth instead (see scene.js).
const DEFAULT_SHAPE = 'face';

// CLAUDE.md rule 4's hero budget: 150vh of pinned scroll drives uProgress 0 -> 3.
const PIN_VH = 1.5;

// Which uProgress value each caption belongs to (SHAPE_PROGRESS in scene.js, repeated here rather
// than imported: pulling in scene.js just for these three numbers would mean importing everything
// else it imports too, defeating the point of loading it lazily).
const CAPTION_PROGRESS = { tooth: 1, leaf: 2, graph: 3 };
// A caption dims to this opacity rather than 0 when its shape is not showing — a "seen next / seen
// already" list item, not a hole that appears and disappears in the layout (there is no caption for
// the face, so at rest on progress 0 every item sits at this dim baseline; none does at progress 1-3).
// This is a RESTING state, not a mid-transition frame (whichever shape is current, the other two
// sit here for as long as the visitor looks at it), so it still has to clear WCAG AA on its own —
// CLAUDE.md's "the fully revealed state must meet AA contrast" is written for a reveal that
// finishes; this dim state never does. hero.css sets the caption color to --text (16.8:1) rather
// than --muted for the same reason: at 0.5 opacity over --bg, --text composites to #817F79, which
// measures 4.82:1 — --muted needs about 0.73 opacity to clear 4.5:1 at all, leaving almost no room
// to actually dim anything (verified with WCAG's relative-luminance formula, not eyeballed).
const CAPTION_DIM = 0.5;

let mm = null;

/**
 * Cheap, synchronous capability check: can this browser get a WebGL context at all? Used to skip
 * the pin and caption scrubbing entirely on a device that can never render the cloud (CLAUDE.md's
 * fallback: "the three research captions as a static list", the SAME plain presentation reduced
 * motion gets — not a pin with no shape to show inside it). A throwaway canvas that is never added to
 * the page is the standard way to ask this without needing three.js's own (much larger) check; the
 * context this creates is never used and is left for the browser to reclaim, same as any other
 * capability probe of this kind.
 */
function isWebGLAvailable() {
  try {
    const canvas = document.createElement('canvas');
    return !!(window.WebGLRenderingContext && (canvas.getContext('webgl2') || canvas.getContext('webgl')));
  } catch {
    return false;
  }
}

/**
 * Dim or brighten each research caption by how close `progress` is to its own shape. A caption's
 * opacity is a plain triangle: 1 exactly at its shape, fading to CAPTION_DIM one whole shape away
 * on either side. No easing on top (CLAUDE.md's motion principles: "linear for anything scrubbed by
 * scroll" — Lenis already smooths the scroll position this is driven by).
 */
function updateCaptions(captions, progress) {
  captions.forEach((li) => {
    const target = CAPTION_PROGRESS[li.dataset.shape];
    const closeness = Math.max(0, 1 - Math.abs(progress - target));
    li.style.opacity = String(CAPTION_DIM + (1 - CAPTION_DIM) * closeness);
  });
}

export function initHero() {
  const visual = document.querySelector('.hero__visual');
  const heroSection = document.querySelector('.hero');
  if (!visual || !heroSection) return;

  const captions = [...document.querySelectorAll('.hero__captions li[data-shape]')];
  const skipButton = document.querySelector('.hero a[href="#work"]');

  mm = gsap.matchMedia();

  // matchMedia re-runs this whole function when any listed condition flips (say, a tablet
  // rotating past 1024px or the visitor toggling reduced motion), first running the cleanup
  // that was returned last time. So the cloud is always built for the current conditions.
  mm.add({ motion: conditions.motion, desktop: conditions.desktop }, (context) => {
    const { motion, desktop } = context.conditions;

    // Reduced motion: no WebGL, no pinning at all (CLAUDE.md's engineering requirements). The
    // portrait stays, the captions stay at their plain CSS opacity (1, a static list, per the
    // hero's documented fallback), and "View projects" is a normal, un-pinned anchor jump — the
    // skip logic below exists only to counter a PIN, so with no pin there is nothing to counter.
    if (!motion) return;

    // No WebGL: the SAME fallback as reduced motion (CLAUDE.md groups them together: "the hero's
    // visual slot shows the plain portrait photo... and the three research captions as a static
    // list"), not a pin with nothing to show inside it. Checked here, before the pin below is ever
    // created, rather than after the point cloud fails to load: the point cloud's own WebGLRenderer
    // construction (scene.js) would tell us the same thing, but only after the async asset loading
    // below, by which time the pin would already be engaged (and possibly mid-scroll) and undoing it
    // would risk exactly the snap-back this milestone's pin-timing design (M3d) tries to avoid.
    if (!isWebGLAvailable()) return;

    // ---- Pin + scroll-driven progress, set up SYNCHRONOUSLY -----------------------------------
    // This does not wait for the point cloud (which loads asynchronously, below): the PIN itself
    // must exist from the visitor's very first scroll, or a visitor who scrolls during that load
    // window would sail straight past the hero, and the pin appearing moments later would have to
    // snap the page back up into place to reserve its 150vh. Creating it now means the 150vh of
    // scroll space is reserved from the first frame, whether or not the cloud has loaded into it
    // yet — scrolling through it before that just holds the (still-portrait) hero a little longer.
    let scrollProgress = 0;
    let cloud = null; // assigned once the async load below finishes; optional-chained until then
    const trigger = ScrollTrigger.create({
      trigger: heroSection,
      start: 'top top',
      // A function, not a fixed number: recalculated on ScrollTrigger.refresh() (lib/scroll.js
      // already calls that after fonts and images load), so a resize never leaves a stale pin length.
      end: () => `+=${window.innerHeight * PIN_VH}`,
      pin: true,
      // `scrub: true` (not a number): Lenis already smooths the raw scroll input before ScrollTrigger
      // ever sees it, so uProgress tracks the CURRENT (already-eased) scroll position exactly. Adding
      // a numeric scrub on top would smooth an already-smoothed value, which reads as extra lag/mush
      // rather than extra polish (the same reasoning motion.js gives for using `ease: 'none'` here).
      scrub: true,
      onUpdate(self) {
        scrollProgress = self.progress * 3; // 0..1 across the pin -> 0..3 across the four shapes
        cloud?.setProgress(scrollProgress);
        updateCaptions(captions, scrollProgress);
      },
    });
    updateCaptions(captions, scrollProgress); // dim every caption immediately: resting on the face, progress 0

    // "View projects" needs to jump straight to #work, not animate through 150vh of morphing to get
    // there. scrollToTarget's default (used by every other link on the page, via onAnchorClick in
    // lib/scroll.js) is a smooth Lenis animation, which would still visually race through the whole
    // sequence on the way past it; { immediate: true } cuts straight there instead. Attached directly
    // to the button (not routed through scroll.js) because this "skip a pinned section" behaviour is
    // specific to this one link, and onAnchorClick already steps aside for any click that arrives
    // with defaultPrevented set, which this listener does before scroll.js's own handler sees it.
    // Bypassing onAnchorClick means also repeating the two things it would otherwise have done for
    // us: updating the URL hash, and moving keyboard focus to the landed section (without this, a
    // keyboard or screen-reader visitor who activates this one button, unlike every other link on
    // the page, would jump visually but stay tabbing from wherever they started).
    const onSkipClick = (event) => {
      event.preventDefault();
      scrollToTarget('#work', { immediate: true });
      if (location.hash !== '#work') history.pushState(null, '', '#work');
      const target = document.getElementById('work');
      if (target) {
        if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
        target.focus({ preventScroll: true });
      }
    };
    skipButton?.addEventListener('click', onSkipClick);

    // ---- The point cloud itself, loaded asynchronously -----------------------------------------
    let removeDebugPanel = null;
    let removeCursor = null;
    let cancelled = false; // set by the cleanup: the async steps below check it after each await

    (async () => {
      try {
        // The tooth GLB (~460 KB) and the face cutout are only ever fetched from INSIDE scene.js
        // (loadToothSource()/loadFaceSource()), which does not even exist until the dynamic import()
        // below has finished downloading and executing -- so today, those two network requests only
        // start after the preloader wait, the idle wait, AND the whole three.js chunk's transfer,
        // one waterfall stacked behind another. A <link rel="preload"> hint asks the browser to fetch
        // the bytes immediately regardless of what our JS is doing, so by the time createPointCloud()
        // actually asks for them, the response is already in the HTTP cache (or most of the way
        // there) instead of only starting then. Only added here, inside the branch that has already
        // confirmed motion is allowed and WebGL exists, so a visitor who will never need these bytes
        // never fetches them.
        for (const href of ['/models/tooth.glb', '/images/profile/portrait-cutout-480.webp']) {
          const link = document.createElement('link');
          link.rel = 'preload';
          link.as = href.endsWith('.glb') ? 'fetch' : 'image';
          if (link.as === 'fetch') link.crossOrigin = 'anonymous'; // required for "fetch"-destination preloads to be reused
          link.href = href;
          document.head.append(link);
        }

        await preloaderDone; // don't compete with the preloader animation for the main thread
        await afterFirstPaint(); // text and portrait are on screen before we fetch anything heavy
        if (cancelled) return;

        // The dynamic import(): Vite splits scene.js (and everything it imports: three.js, the
        // face, tooth and graph builders) into their own file, fetched now.
        const { createPointCloud, DEVICE_PRESETS } = await import('../lib/pointcloud/scene.js');
        if (cancelled) return;

        const device = desktop ? 'desktop' : 'mobile';
        cloud = await createPointCloud(visual, { shape: DEFAULT_SHAPE, ...DEVICE_PRESETS[device] });
        if (cancelled) {
          cloud.destroy();
          return;
        }
        // Catch up to wherever the visitor has already scrolled to while this was loading (see the
        // comment above the trigger: the pin exists from the first frame, the cloud does not).
        cloud.setProgress(scrollProgress);

        if (import.meta.env.DEV) {
          const { attachDebugPanel } = await import('../lib/pointcloud/debug.js');
          if (!cancelled) removeDebugPanel = attachDebugPanel(cloud);
        }

        // Cursor repel + tilt, fine pointers only (CLAUDE.md: the custom cursor elsewhere on the
        // site is also fine-pointer-only). A nested matchMedia, not a plain if-check, so plugging in
        // a mouse (or undocking one) toggles this correctly without a page reload.
        const cursorMM = gsap.matchMedia();
        cursorMM.add({ fine: conditions.fine }, () => {
          // Listens on the whole window, not just the canvas: the tilt should feel like the cloud is
          // "aware of you" even while your cursor is over the text beside it, not only when it is
          // directly over the small canvas. The repel effect needs no separate gating for this: the
          // raycast naturally lands far from every particle whenever the cursor is far from the
          // canvas, and the shader's own distance falloff (see points.vert.glsl) does the rest.
          const onPointerMove = (event) => cloud.setPointer(event.clientX, event.clientY);
          // A blur (switching apps/tabs) is a simpler, more reliable signal than trying to catch
          // every way a pointer can leave the viewport, for a detail this minor.
          const onBlur = () => cloud.clearPointer();
          window.addEventListener('pointermove', onPointerMove);
          window.addEventListener('blur', onBlur);
          return () => {
            window.removeEventListener('pointermove', onPointerMove);
            window.removeEventListener('blur', onBlur);
            cloud.clearPointer();
          };
        });
        removeCursor = () => cursorMM.revert();
      } catch (error) {
        // The common "no WebGL at all" case is already handled above, before the pin is even
        // created; this catches rarer failures once we thought WebGL was available — a context lost
        // moments later, a blocked chunk, a dropped network request. The portrait photo is still
        // there either way (scene.js never gets far enough to touch the DOM before throwing), but
        // the pin and captions, already running, are not undone: see the comment on isWebGLAvailable.
        console.warn('[hero] point cloud not started, keeping the portrait photo:', error);
      }
    })();

    return () => {
      cancelled = true;
      trigger.kill();
      skipButton?.removeEventListener('click', onSkipClick);
      removeCursor?.();
      removeDebugPanel?.();
      cloud?.destroy();
    };
  });
}

export function destroyHero() {
  mm?.revert(); // runs the cleanup above
  mm = null;
}
