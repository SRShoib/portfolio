// VERTEX SHADER: runs once per particle, on the GPU, every frame.
// Its two jobs: decide where the particle lands on screen (gl_Position) and how big its square
// sprite is (gl_PointSize).
//
// three.js prepends the declarations for `position`, `modelViewMatrix` and `projectionMatrix`
// when you use ShaderMaterial, so they are not declared here.

uniform float uSize;  // particle diameter in WORLD units (the shape spans about 2 units)
uniform float uScale; // pixels per world unit at distance 1 from the camera (set in scene.js on resize)

attribute float aRandom; // a fixed random number 0..1 per particle, made once on the CPU

varying float vRandom; // handed on to the fragment shader, interpolated across the sprite

void main() {
  // Object space -> camera space. In camera space the camera sits at the origin looking down -z,
  // so an object 5 units in front of the camera has mvPosition.z = -5.
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);

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
}
