// FRAGMENT SHADER: runs once per PIXEL covered by each particle's square sprite.
// The vertex shader only produced a square; this is what turns it into a soft round dot.

uniform float uOpacity; // overall brightness of one particle

varying float vRandom;
varying vec3 vColor; // this particle's colour, already mixed for the current uProgress (see the vertex shader)

void main() {
  // gl_PointCoord runs (0,0) to (1,1) across the sprite. Subtract 0.5 to get the offset from the
  // centre, and its length is the distance from the centre: 0 in the middle, 0.5 at the middle of
  // an edge, ~0.71 in a corner.
  float dist = length(gl_PointCoord - 0.5);

  // Anything past 0.5 is outside the inscribed circle: skip the pixel entirely (saves blending work).
  if (dist > 0.5) discard;

  // Soft falloff: 1 in the centre easing to 0 at the rim. Squaring it makes the glow tighter, a
  // bright core with a faint halo. (smoothstep needs edge0 < edge1, hence "1.0 - smoothstep(0, 0.5, d)"
  // and not smoothstep(0.5, 0.0, d), which is undefined by the GLSL spec and breaks on some GPUs.)
  float soft = 1.0 - smoothstep(0.0, 0.5, dist);
  float alpha = soft * soft * uOpacity * mix(0.6, 1.0, vRandom); // some particles a little dimmer

  // With AdditiveBlending the GPU computes: framebuffer += rgb * alpha. Overlapping particles
  // therefore add up and glow, and (unlike normal alpha blending) drawing order does not matter.
  gl_FragColor = vec4(vColor, alpha);

  // Each uColor* arrives in linear light (three converts every THREE.Color to it), but the canvas
  // expects sRGB. This built-in chunk converts, so the on-screen tint matches the CSS hex.
  // Leave it out and every tint comes out darker and more saturated than its hex (this leaf's
  // pale mint turns a vivid green).
  #include <colorspace_fragment>
}
