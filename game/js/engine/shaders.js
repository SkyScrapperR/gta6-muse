// All GLSL sources for the custom WebGL2 renderer (GLSL ES 3.00).
//
// One lit program shades almost everything in the city: buildings, props,
// characters, vehicles. The sky, the water and the particles each have their
// own small program. Post-processing (bloom, tone mapping) lives in
// post.js and is wired in Tier 2; Tier 1 renders the lit pass straight to
// the canvas with the same fog and tonemap math baked in.

// The workhorse: sun + hemisphere ambient, per-vertex colour, emissive
// windows and neon, distance fog. aInstance carries one model matrix per
// instance; aInstanceColor multiplies the colour (rgb) and scales the
// emissive term (a), so one draw call can paint a whole street of varied
// cars, people, trees and lamps.
export const LIT_VERT = `#version 300 es
layout(location = 0) in vec3 aPos;
layout(location = 1) in vec3 aNormal;
layout(location = 2) in vec3 aColor;
layout(location = 3) in vec3 aEmissive;
layout(location = 4) in mat4 aInstance;
layout(location = 8) in vec4 aInstanceColor;
uniform mat4 uProj;
uniform mat4 uView;
uniform mat4 uLightVP;
out vec3 vNormal;
out vec3 vColor;
out vec3 vEmissive;
out vec3 vWorld;
out float vFogDepth;
out vec4 vLightPos;
void main() {
  vec4 world = aInstance * vec4(aPos, 1.0);
  vWorld = world.xyz;
  vec3 n = mat3(aInstance) * aNormal;
  float nl = length(n);
  vNormal = nl > 0.0001 ? n / nl : vec3(0.0, 1.0, 0.0);
  vColor = aColor * aInstanceColor.rgb;
  vEmissive = aEmissive * aInstanceColor.a;
  vec4 view = uView * world;
  vFogDepth = -view.z;
  vLightPos = uLightVP * world;
  gl_Position = uProj * view;
}`;

export const LIT_FRAG = `#version 300 es
precision highp float;
in vec3 vNormal;
in vec3 vColor;
in vec3 vEmissive;
in vec3 vWorld;
in float vFogDepth;
in vec4 vLightPos;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uHemiSky;
uniform vec3 uHemiGround;
uniform vec3 uFogColor;
uniform float uFogDensity;
uniform float uNight;
uniform vec3 uCamPos;
uniform float uWet;
uniform float uTonemap;
// Directional shadow map (Tier 2).
uniform sampler2D uShadowMap;
uniform float uShadowOn;
uniform vec2 uShadowTexel;
// Night point lights (Tier 2): street lamps, headlights, neon, muzzle
// flashes. The registry caps the count per quality preset.
uniform int uLightCount;
uniform vec4 uLightPos[48];
uniform vec4 uLightCol[48];
out vec4 fragColor;
float hash13(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.zyx + 31.32);
  return fract((p.x + p.y) * p.z);
}
float shadowFactor(vec3 n) {
  if (uShadowOn < 0.5) return 1.0;
  vec3 lp = vLightPos.xyz / vLightPos.w;
  lp = lp * 0.5 + 0.5;
  if (lp.x < 0.0 || lp.x > 1.0 || lp.y < 0.0 || lp.y > 1.0 || lp.z > 1.0) return 1.0;
  float bias = 0.0006 + 0.0012 * (1.0 - max(dot(n, uSunDir), 0.0));
  float s = 0.0;
  for (int x = -1; x <= 1; x++) {
    for (int y = -1; y <= 1; y++) {
      float d = texture(uShadowMap, lp.xy + vec2(float(x), float(y)) * uShadowTexel).r;
      s += (lp.z - bias) <= d ? 1.0 : 0.0;
    }
  }
  return s / 9.0;
}
void main() {
  vec3 n = normalize(vNormal);
  float sunAmount = max(dot(n, uSunDir), 0.0);
  float shadow = shadowFactor(n);
  vec3 hemi = mix(uHemiGround, uHemiSky, n.y * 0.5 + 0.5);
  // Hemisphere ambient is not shadowed; only the sun is.
  vec3 light = hemi + uSunColor * sunAmount * shadow;
  vec3 col = vColor * light;
  // Night point lights: inverse-square falloff, each clamped so one
  // lamp cannot blow out the street.
  for (int i = 0; i < 48; i++) {
    if (i >= uLightCount) break;
    vec3 toL = uLightPos[i].xyz - vWorld;
    float d2 = dot(toL, toL);
    float r = uLightPos[i].w;
    float att = clamp(1.0 - d2 / (r * r), 0.0, 1.0);
    att *= att;
    float nd = max(dot(n, toL * inversesqrt(max(d2, 0.0001))), 0.0);
    col += vColor * uLightCol[i].rgb * (uLightCol[i].a * att * nd);
  }
  // Windows, neon and lamps glow: a little by day, fully at night.
  col += vEmissive * (0.25 + 0.95 * uNight);
  // Surface detail: a faint world-space grime, stronger on up-facing
  // surfaces (asphalt, concrete), so flat colours stop looking plastic.
  float g1 = hash13(floor(vWorld * 2.0));
  float g2 = hash13(floor(vWorld * 6.0 + 17.0));
  float grime = mix(1.0, 0.93 + 0.14 * g1 * g2, step(0.6, n.y));
  col *= grime;
  // Wet roads (Tier 2): when it rains, up-facing surfaces darken and
  // pick up a sky sheen plus a sun glint.
  if (uWet > 0.01 && n.y > 0.7) {
    vec3 viewDir = normalize(uCamPos - vWorld);
    float fres = pow(1.0 - max(dot(viewDir, n), 0.0), 3.0);
    col = col * (1.0 - 0.32 * uWet) + uHemiSky * fres * 0.55 * uWet;
    float glint = pow(max(dot(reflect(-uSunDir, n), viewDir), 0.0), 60.0);
    col += uSunColor * glint * 0.6 * uWet;
  }
  float fog = 1.0 - exp(-uFogDensity * uFogDensity * vFogDepth * vFogDepth);
  col = mix(col, uFogColor, clamp(fog, 0.0, 1.0));
  // When the post chain is active the HDR value goes to the chain and
  // ACES runs there; without it, the shoulder runs here so the noon sun
  // does not clip to flat white.
  if (uTonemap > 0.5) {
    col = col / (col + vec3(0.85));
  }
  fragColor = vec4(col, 1.0);
}`;

// Sky: a fullscreen triangle. The fragment shader rebuilds the view ray
// from the camera basis (right/up/forward) and paints the time-of-day sky:
// dawn, day, golden hour, purple dusk, night with stars and a moon disc.
export const SKY_VERT = `#version 300 es
layout(location = 0) in vec2 aPos;
out vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 1.0, 1.0);
}`;

export const SKY_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
uniform vec3 uCamRight;
uniform vec3 uCamUp;
uniform vec3 uCamFwd;
uniform float uTanFov;
uniform float uAspect;
uniform vec3 uSunDir;
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uSunTint;
uniform float uNight;
uniform float uStars;
out vec4 fragColor;
float hash13(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.zyx + 31.32);
  return fract((p.x + p.y) * p.z);
}
float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
void main() {
  vec2 ndc = vUv * 2.0 - 1.0;
  vec3 ray = normalize(uCamFwd
    + uCamRight * (ndc.x * uTanFov * uAspect)
    + uCamUp * (ndc.y * uTanFov));
  float h = clamp(ray.y, -0.08, 1.0);
  vec3 col = mix(uHorizon, uZenith, pow(max(h, 0.0), 0.55));
  float sunDot = max(dot(ray, uSunDir), 0.0);
  col += uSunTint * (pow(sunDot, 220.0) * 1.4 + pow(sunDot, 10.0) * 0.30);
  // Procedural clouds (Tier 2): two octaves of value noise projected on
  // the sky dome, drifting slowly with time, lit warm near the sun and
  // fading out at night.
  if (ray.y > 0.02) {
    vec2 cuv = ray.xz / max(ray.y, 0.08);
    float t = uStars * 0.004;
    float cl = vnoise(cuv * 1.4 + vec2(t, t * 0.6)) * 0.65
      + vnoise(cuv * 3.1 - vec2(t * 1.7, t)) * 0.35;
    float cmask = smoothstep(0.56, 0.78, cl) * smoothstep(0.02, 0.18, ray.y);
    vec3 cloudCol = mix(vec3(0.85, 0.86, 0.9), uSunTint * 1.2 + vec3(0.35), clamp(sunDot * 1.4, 0.0, 1.0));
    col = mix(col, cloudCol, cmask * 0.38 * (1.0 - uNight * 0.85));
  }
  if (uNight > 0.02 && ray.y > 0.02) {
    vec3 cell = floor(ray * 220.0);
    float star = hash13(cell);
    float twinkle = 0.55 + 0.45 * sin(uStars * 2.0 + star * 40.0);
    float m = step(0.9975, star) * twinkle;
    col += vec3(0.9, 0.95, 1.0) * m * uNight;
    // Moon: a small bright disc opposite the sun's path.
    vec3 moonDir = normalize(vec3(-0.45, 0.62, -0.35));
    float moon = smoothstep(0.9993, 0.9997, dot(ray, moonDir));
    col += vec3(0.9, 0.93, 1.0) * moon * uNight * 0.9;
  }
  col = mix(col, uHorizon, smoothstep(0.0, -0.08, ray.y));
  fragColor = vec4(col, 1.0);
}`;

// Water: one big plane around the city. Vertex waves, fresnel reflection of
// the sky, sun glints, and foam near the shoreline. uCoast holds the city's
// half-extent on x/z; foam appears where the water meets the beach ring.
export const WATER_VERT = `#version 300 es
layout(location = 0) in vec3 aPos;
uniform mat4 uProj;
uniform mat4 uView;
uniform float uTime;
out vec3 vWorld;
out vec3 vNormal;
void main() {
  vec3 p = aPos;
  float w1 = sin(p.x * 0.08 + uTime * 1.1) * 0.22;
  float w2 = sin(p.z * 0.11 - uTime * 0.8) * 0.18;
  float w3 = sin((p.x + p.z) * 0.05 + uTime * 0.5) * 0.15;
  p.y += w1 + w2 + w3;
  vWorld = p;
  float dx = 0.08 * 0.22 * cos(p.x * 0.08 + uTime * 1.1);
  float dz = 0.11 * 0.18 * cos(p.z * 0.11 - uTime * 0.8);
  vNormal = normalize(vec3(-dx, 1.0, -dz));
  gl_Position = uProj * uView * vec4(p, 1.0);
}`;

export const WATER_FRAG = `#version 300 es
precision highp float;
in vec3 vWorld;
in vec3 vNormal;
uniform vec3 uCamPos;
uniform vec3 uSunDir;
uniform vec3 uDeepColor;
uniform vec3 uShallowColor;
uniform vec3 uSkyColor;
uniform vec3 uFogColor;
uniform float uFogDensity;
uniform float uCoast;
uniform float uTime;
out vec4 fragColor;
void main() {
  vec3 n = normalize(vNormal);
  vec3 viewDir = normalize(uCamPos - vWorld);
  float fres = pow(1.0 - max(dot(viewDir, n), 0.0), 3.0);
  vec3 col = mix(uDeepColor, uShallowColor, 0.35 + 0.25 * sin(vWorld.x * 0.05 + uTime * 0.7));
  col = mix(col, uSkyColor, 0.25 + 0.55 * fres);
  float glint = pow(max(dot(reflect(-uSunDir, n), viewDir), 0.0), 90.0);
  col += vec3(1.0, 0.9, 0.7) * glint * 0.8;
  // Foam: a soft band where the water reaches the beach ring.
  float edge = max(abs(vWorld.x), abs(vWorld.z));
  float foamBand = smoothstep(uCoast + 26.0, uCoast + 2.0, edge)
    * smoothstep(uCoast - 14.0, uCoast + 2.0, edge);
  float foamNoise = 0.5 + 0.5 * sin(vWorld.x * 0.6 + vWorld.z * 0.45 + uTime * 1.4);
  col = mix(col, vec3(0.9, 0.95, 0.95), foamBand * foamNoise * 0.55);
  float dist = length(uCamPos - vWorld);
  float fog = 1.0 - exp(-uFogDensity * uFogDensity * dist * dist);
  col = mix(col, uFogColor, clamp(fog, 0.0, 1.0));
  fragColor = vec4(col, 0.92);
}`;

// Particles: instanced camera-facing quads. Each instance carries its centre
// (aInstance translation), a uniform scale, a colour and an alpha in
// aInstanceColor. The vertex shader billboards the quad from the view
// matrix; the fragment shader draws a soft round sprite.
export const PARTICLE_VERT = `#version 300 es
layout(location = 0) in vec2 aPos;
layout(location = 4) in mat4 aInstance;
layout(location = 8) in vec4 aInstanceColor;
uniform mat4 uProj;
uniform mat4 uView;
out vec2 vUv;
out vec4 vColor;
out float vTall;
void main() {
  vUv = aPos * 0.5 + 0.5;
  vColor = aInstanceColor;
  vec3 centre = vec3(aInstance[3][0], aInstance[3][1], aInstance[3][2]);
  float size = aInstance[0][0];
  float height = aInstance[1][1];
  vec3 right = vec3(uView[0][0], uView[1][0], uView[2][0]);
  vec3 up = vec3(uView[0][1], uView[1][1], uView[2][1]);
  vec3 world;
  if (height > size * 3.0) {
    // Rain streak (Tier 2): the width faces the camera, the height is
    // world-vertical, so the drop reads as a falling line.
    vTall = 1.0;
    world = centre + right * aPos.x * size + vec3(0.0, 1.0, 0.0) * aPos.y * height;
  } else {
    vTall = 0.0;
    world = centre + right * aPos.x * size + up * aPos.y * size;
  }
  gl_Position = uProj * uView * vec4(world, 1.0);
}`;

export const PARTICLE_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
in vec4 vColor;
in float vTall;
out vec4 fragColor;
void main() {
  vec2 d = vUv - 0.5;
  float alpha;
  if (vTall > 0.5) {
    // A thin vertical streak, soft at both ends.
    float across = 1.0 - smoothstep(0.15, 0.5, abs(d.x));
    float along = smoothstep(0.0, 0.25, 1.0 - abs(d.y) * 2.0);
    alpha = across * along * vColor.a;
  } else {
    float r = length(d) * 2.0;
    alpha = smoothstep(1.0, 0.15, r) * vColor.a;
  }
  if (alpha < 0.01) discard;
  fragColor = vec4(vColor.rgb, alpha);
}`;

// Depth-only program for the shadow map: position + instance matrix
// (locations 0 and 4-7, the same layout as the lit shader, so the lit
// VAOs are valid for this program too).
export const DEPTH_VERT = `#version 300 es
layout(location = 0) in vec3 aPos;
layout(location = 4) in mat4 aInstance;
uniform mat4 uLightVP;
void main() {
  gl_Position = uLightVP * aInstance * vec4(aPos, 1.0);
}`;

export const DEPTH_FRAG = `#version 300 es
precision highp float;
void main() {}`;

// Heli spotlight cone (Tier 2): a translucent additive cone hanging
// from the helicopter. vY is 1 at the top (the heli) and 0 at the
// ground pool; alpha fades toward the ground.
export const CONE_VERT = `#version 300 es
layout(location = 0) in vec3 aPos;
layout(location = 4) in mat4 aInstance;
layout(location = 8) in vec4 aInstanceColor;
uniform mat4 uProj;
uniform mat4 uView;
uniform float uHeight;
out float vY;
out vec4 vColor;
void main() {
  vY = clamp(aPos.y / uHeight + 1.0, 0.0, 1.0);
  vColor = aInstanceColor;
  gl_Position = uProj * uView * aInstance * vec4(aPos, 1.0);
}`;

export const CONE_FRAG = `#version 300 es
precision highp float;
in float vY;
in vec4 vColor;
out vec4 fragColor;
void main() {
  float alpha = mix(0.03, 0.30, vY) * vColor.a;
  fragColor = vec4(vColor.rgb, alpha);
}`;
