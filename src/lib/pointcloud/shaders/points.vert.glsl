// VERTEX SHADER: runs once per particle, on the GPU, every frame.
// Its jobs: pick where this particle sits along the face -> tooth -> leaf -> graph sequence, decide
// where that lands on screen (gl_Position), how big its square sprite is (gl_PointSize), and what
// colour it should be (vColor, read by the fragment shader).
//
// three.js prepends the declarations for `position`, `modelViewMatrix` and `projectionMatrix`
// when you use ShaderMaterial, so they are not declared here. `position` itself is not used below:
// every particle's real position comes from mixing the four shape attributes instead. A `position`
// attribute still has to exist on the geometry, because three reads ITS COUNT to know how many
// vertices to draw (see scene.js) — but nothing here reads its VALUES.

uniform float uSize;     // particle diameter in WORLD units (each shape spans about 2 units)
uniform float uScale;    // pixels per world unit at distance 1 from the camera (set in scene.js on resize)
uniform float uProgress; // 0 = face, 1 = tooth, 2 = leaf, 3 = graph; values between morph the two shapes either side

uniform vec3 uColorFace;
uniform vec3 uColorTooth;
uniform vec3 uColorLeaf;
uniform vec3 uColorGraph;

uniform vec3 uMouse;          // cursor's position in this object's OWN local space (see scene.js tick())
uniform float uRepelStrength; // 0..1, damped in scene.js: fades in on hover, out when the cursor leaves

attribute vec3 aFace;    // this particle's position when the cloud is fully the face
attribute vec3 aTooth;   // ...fully the tooth
attribute vec3 aLeaf;    // ...fully the leaf
attribute vec3 aGraph;   // ...fully the graph
attribute float aRandom; // a fixed random number 0..1 per particle, made once on the CPU

varying float vRandom; // handed on to the fragment shader, interpolated across the sprite
varying vec3 vColor;   // this particle's colour right now, already mixed for the current uProgress

// STAGGER is a SPAN, not an offset: the fraction of one segment's 0..1 range that staggering is
// allowed to eat into. It must stay below 1, or some particle's own window would have zero duration.
const float STAGGER = 0.5;
const float SCATTER = 0.22;
const float REPEL_RADIUS = 0.2; // world units: particles closer than this to uMouse are pushed away

// A cheap, deterministic pseudo-random number from one float. Not statistically rigorous — just
// good enough that every particle gets its own stable, unpredictable-looking scatter direction.
float hash(float seed) {
  return fract(sin(seed * 12.9898) * 43758.5453);
}

void main() {
  // Which of the three transitions (face->tooth, tooth->leaf, leaf->graph) uProgress is currently
  // in, and how far through it (0..1) — computed the SAME for every particle, from the RAW
  // uProgress. min(..., 2.0) keeps "graph, fully arrived" (progress == 3.0) inside the LAST segment
  // instead of asking for a 4th pair that does not exist.
  float progress = clamp(uProgress, 0.0, 3.0);
  float segment = min(floor(progress), 2.0);
  float t = clamp(progress - segment, 0.0, 1.0);

  // STAGGER, done so it CANNOT desync the resting shapes. A naive version shifts uProgress itself
  // per particle (say, +-0.3), which sounds right but is wrong: at uProgress = 0 exactly, a particle
  // shifted to +0.3 is already 30% of the way to the tooth, so the cloud is never fully, crisply
  // at rest on any shape — tried it, and the "resting" face came out permanently a little hazy at
  // the edges. Instead, each particle gets its own DELAY and DURATION, both measured in the SAME
  // 0..1 space as t, so its own local progress is clamped to exactly 0 before its delay ends and
  // exactly 1 by the time its window closes, however that window is placed:
  //   delay = aRandom * STAGGER        (0 for aRandom=0, up to STAGGER for aRandom=1)
  //   duration = 1 - STAGGER           (always positive, since STAGGER < 1)
  //   local = clamp((t - delay) / duration, 0, 1)
  // At t=0, (0 - delay) <= 0 for every particle, so local=0 for all of them, always. At t=1,
  // (1 - delay) >= (1 - STAGGER) = duration for every particle, so local=1 for all of them, always.
  // Only STRICTLY BETWEEN t=0 and t=1 do different particles (different delay) read different
  // local values, which is exactly the window staggering is meant to affect.
  float delay = aRandom * STAGGER;
  float duration = 1.0 - STAGGER;
  float local = clamp((t - delay) / duration, 0.0, 1.0);

  // Ease the BLEND itself: smoothstep's S-curve (3t^2 - 2t^3) starts and ends slowly and moves
  // fastest through the middle, so a particle eases into and out of motion rather than travelling
  // at a constant speed the instant its window opens. (Teach: attributes, mix(), easing, staggering.)
  float eased = smoothstep(0.0, 1.0, local);

  vec3 shapePosition;
  vec3 shapeColor;
  if (segment < 0.5) {
    shapePosition = mix(aFace, aTooth, eased);
    shapeColor = mix(uColorFace, uColorTooth, eased);
  } else if (segment < 1.5) {
    shapePosition = mix(aTooth, aLeaf, eased);
    shapeColor = mix(uColorTooth, uColorLeaf, eased);
  } else {
    shapePosition = mix(aLeaf, aGraph, eased);
    shapeColor = mix(uColorLeaf, uColorGraph, eased);
  }

  // MID-TRANSITION SCATTER: sin(local * PI) is 0 at local=0 and local=1 (this particle's own true
  // rest and true arrival, guaranteed by the clamp above) and peaks at local=0.5 (the middle of ITS
  // OWN window), so particles scatter away from a straight line mid-morph and re-form on arrival,
  // instead of sliding shape-to-shape. Deliberately uses the UNEASED local, so the scatter's peak
  // lines up with the real midpoint of this particle's transition, not the eased one. Each particle
  // scatters in its OWN fixed direction (from aRandom via hash()), so the cloud looks like it is
  // scattering organically, not bursting outward from one shared point.
  float scatterAmount = sin(local * 3.14159265) * SCATTER;
  vec3 scatterDir = vec3(hash(aRandom) - 0.5, hash(aRandom + 1.7) - 0.5, hash(aRandom + 3.1) - 0.5);
  shapePosition += scatterDir * scatterAmount;

  // CURSOR REPEL: particles within REPEL_RADIUS of the cursor are pushed directly away from it.
  // smoothstep gives a soft falloff (full push at the centre, none at the rim) instead of a hard
  // cutoff, which is what makes a particle "ease back" as the cursor moves away, without needing to
  // remember where it used to be — this is a pure function of the CURRENT distance, recomputed fresh
  // every frame. uRepelStrength (damped over TIME in scene.js) additionally fades the whole effect in
  // on hover and out when the cursor leaves, on top of this spatial falloff.
  vec3 toParticle = shapePosition - uMouse;
  float mouseDist = length(toParticle);
  float repelFalloff = 1.0 - smoothstep(0.0, REPEL_RADIUS, mouseDist);
  // Weaker on the face (CLAUDE.md: "cursor repel is weaker on this stage so it doesn't distort the
  // face"): FACE_REPEL holds it down through segment 0, ramping back up to full strength as `eased`
  // carries the particle away from the face and into the tooth. Segments 1 and 2 are always full.
  const float FACE_REPEL = 0.2;
  float repelScale = segment < 0.5 ? mix(FACE_REPEL, 1.0, eased) : 1.0;
  // + 1e-5: normalize(0) is undefined; guards the (rare) case of a particle sitting exactly on uMouse.
  vec3 repelDir = normalize(toParticle + 1e-5);
  shapePosition += repelDir * repelFalloff * uRepelStrength * repelScale * REPEL_RADIUS;

  // Object space -> camera space. In camera space the camera sits at the origin looking down -z,
  // so an object 5 units in front of the camera has mvPosition.z = -5.
  vec4 mvPosition = modelViewMatrix * vec4(shapePosition, 1.0);

  // Camera space -> clip space: the perspective divide (far things shrink toward the centre)
  // happens after this, automatically.
  gl_Position = projectionMatrix * mvPosition;

  // SIZE ATTENUATION. Perspective makes anything appear 1/distance as big, and WebGL does NOT
  // do this for point sprites: gl_PointSize is in raw pixels. So do it by hand: world size,
  // times pixels-per-world-unit, divided by distance (-z, which is positive in front of the camera).
  // Because uSize is in world units, the cloud looks identical on a phone and a monitor:
  // a smaller canvas simply scales everything down together.
  float jitter = mix(0.6, 1.4, aRandom); // each particle 60-140% of the base size, so it looks stippled
  gl_PointSize = uSize * jitter * uScale / -mvPosition.z;

  vRandom = aRandom;
  vColor = shapeColor;
}
