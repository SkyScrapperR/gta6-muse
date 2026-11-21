// Post chain (Tier 2): HDR render target, bloom, ACES tone mapping,
// vignette + warm grade, and a slow auto-exposure that reads the scene
// luminance back from a 4x4 target every few frames.
//
// Needs EXT_color_buffer_float to render into a half-float target; without
// it the chain reports disabled and the renderer falls back to rendering
// straight to the canvas with the shader's built-in shoulder.
//
// Pipeline per frame:
//   HDR (full res, RGBA16F) -> bright-pass + 2x downsample (half res)
//   -> blur H (quarter res) -> blur V (quarter res) -> composite to canvas
//   -> luminance (4x4, log-encoded) read back every 15 frames.
import { makeProgram, createColorTexture, createDepthRenderbuffer } from './gl.js';

const FULL_VERT = `#version 300 es
layout(location = 0) in vec2 aPos;
out vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 1.0, 1.0);
}`;

const BRIGHT_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uTex;
uniform vec2 uTexel;
uniform float uThreshold;
out vec4 fragColor;
void main() {
  vec3 c = texture(uTex, vUv).rgb;
  c += texture(uTex, vUv + vec2(uTexel.x, 0.0)).rgb;
  c += texture(uTex, vUv + vec2(0.0, uTexel.y)).rgb;
  c += texture(uTex, vUv + uTexel).rgb;
  c *= 0.25;
  vec3 b = max(c - uThreshold, 0.0);
  fragColor = vec4(b, 1.0);
}`;

const BLUR_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uTex;
uniform vec2 uDir;
out vec4 fragColor;
void main() {
  vec3 c = texture(uTex, vUv).rgb * 0.227027;
  vec2 o1 = uDir * 1.3846153;
  vec2 o2 = uDir * 3.2307692;
  c += texture(uTex, vUv + o1).rgb * 0.3162162;
  c += texture(uTex, vUv - o1).rgb * 0.3162162;
  c += texture(uTex, vUv + o2).rgb * 0.0702703;
  c += texture(uTex, vUv - o2).rgb * 0.0702703;
  fragColor = vec4(c, 1.0);
}`;

const LUM_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uTex;
uniform vec2 uTexel;
out vec4 fragColor;
void main() {
  vec3 c = vec3(0.0);
  for (int x = -1; x <= 1; x++) {
    for (int y = -1; y <= 1; y++) {
      c += texture(uTex, vUv + vec2(float(x), float(y)) * uTexel).rgb;
    }
  }
  c /= 9.0;
  float lum = dot(c, vec3(0.2126, 0.7152, 0.0722));
  float enc = clamp(log2(lum + 1.0) * 0.5, 0.0, 1.0);
  fragColor = vec4(enc, enc, enc, 1.0);
}`;

const COMPOSITE_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uHdr;
uniform sampler2D uBloom;
uniform float uExposure;
uniform float uBloomStrength;
out vec4 fragColor;
vec3 aces(vec3 x) {
  return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
}
void main() {
  vec3 c = texture(uHdr, vUv).rgb;
  c += texture(uBloom, vUv).rgb * uBloomStrength;
  c *= uExposure;
  c = aces(c);
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(vec3(l), c, 1.06);
  c = c * vec3(1.02, 1.0, 0.98);
  vec2 d = vUv - 0.5;
  c *= 1.0 - 0.28 * dot(d, d) * 2.0;
  fragColor = vec4(c, 1.0);
}`;

export class PostChain {
  constructor(gl) {
    this.gl = gl;
    this.enabled = !!gl.getExtension('EXT_color_buffer_float');
    this.exposure = 1.0;
    this.bloomStrength = 0.55;
    this.threshold = 0.9;
    this.frame = 0;
    this.w = 0;
    this.h = 0;
    this.hdrFbo = null;
    this.hdrTex = null;
    this.hdrDepth = null;
    this.brightFbo = null;
    this.brightTex = null;
    this.blurAFbo = null;
    this.blurATex = null;
    this.blurBFbo = null;
    this.blurBTex = null;
    this.lumFbo = null;
    this.lumTex = null;
    this.lumPixels = new Uint8Array(4 * 4 * 4);
    if (!this.enabled) return;
    this.brightProg = makeProgram(gl, FULL_VERT, BRIGHT_FRAG);
    this.blurProg = makeProgram(gl, FULL_VERT, BLUR_FRAG);
    this.lumProg = makeProgram(gl, FULL_VERT, LUM_FRAG);
    this.compProg = makeProgram(gl, FULL_VERT, COMPOSITE_FRAG);
    // Fullscreen triangle.
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    this.quadVao = gl.createVertexArray();
    gl.bindVertexArray(this.quadVao);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
  }

  _fbo(tex) {
    const gl = this.gl;
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return fbo;
  }

  _drop() {
    const gl = this.gl;
    for (const t of [this.hdrTex, this.brightTex, this.blurATex, this.blurBTex, this.lumTex]) {
      if (t) gl.deleteTexture(t);
    }
    for (const f of [this.hdrFbo, this.brightFbo, this.blurAFbo, this.blurBFbo, this.lumFbo]) {
      if (f) gl.deleteFramebuffer(f);
    }
    if (this.hdrDepth) gl.deleteRenderbuffer(this.hdrDepth);
    this.hdrFbo = this.brightFbo = this.blurAFbo = this.blurBFbo = this.lumFbo = null;
    this.hdrTex = this.brightTex = this.blurATex = this.blurBTex = this.lumTex = null;
    this.hdrDepth = null;
  }

  resize(w, h) {
    if (!this.enabled) return;
    w = Math.max(2, w | 0);
    h = Math.max(2, h | 0);
    if (w === this.w && h === this.h) return;
    this.w = w;
    this.h = h;
    this._drop();
    const gl = this.gl;
    const hw = Math.max(2, w >> 1);
    const hh = Math.max(2, h >> 1);
    const qw = Math.max(2, w >> 2);
    const qh = Math.max(2, h >> 2);
    this.hdrTex = createColorTexture(gl, w, h, true);
    this.hdrDepth = createDepthRenderbuffer(gl, w, h);
    this.hdrFbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.hdrFbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.hdrTex, 0);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, this.hdrDepth);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.brightTex = createColorTexture(gl, hw, hh);
    this.brightFbo = this._fbo(this.brightTex);
    this.blurATex = createColorTexture(gl, qw, qh);
    this.blurAFbo = this._fbo(this.blurATex);
    this.blurBTex = createColorTexture(gl, qw, qh);
    this.blurBFbo = this._fbo(this.blurBTex);
    this.lumTex = createColorTexture(gl, 4, 4);
    this.lumFbo = this._fbo(this.lumTex);
  }

  // Bind the HDR target for the scene pass.
  begin() {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.hdrFbo);
    gl.viewport(0, 0, this.w, this.h);
  }

  _drawQuad() {
    const gl = this.gl;
    gl.bindVertexArray(this.quadVao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
  }

  // Bloom + ACES composite to the canvas. Call after the scene pass.
  render() {
    const gl = this.gl;
    this.frame++;
    gl.disable(gl.DEPTH_TEST);
    gl.depthMask(false);
    // Bright-pass + 2x downsample: HDR -> half res.
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.brightFbo);
    gl.viewport(0, 0, Math.max(2, this.w >> 1), Math.max(2, this.h >> 1));
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.hdrTex);
    const bp = this.brightProg;
    gl.useProgram(bp.program);
    gl.uniform1i(bp.u.uTex, 0);
    gl.uniform2f(bp.u.uTexel, 1 / this.w, 1 / this.h);
    gl.uniform1f(bp.u.uThreshold, this.threshold);
    this._drawQuad();
    // Blur H: half -> quarter (A).
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.blurAFbo);
    gl.viewport(0, 0, Math.max(2, this.w >> 2), Math.max(2, this.h >> 2));
    gl.bindTexture(gl.TEXTURE_2D, this.brightTex);
    const bl = this.blurProg;
    gl.useProgram(bl.program);
    gl.uniform1i(bl.u.uTex, 0);
    gl.uniform2f(bl.u.uDir, 1 / Math.max(2, this.w >> 1), 0);
    this._drawQuad();
    // Blur V: A -> B.
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.blurBFbo);
    gl.bindTexture(gl.TEXTURE_2D, this.blurATex);
    gl.uniform2f(bl.u.uDir, 0, 1 / Math.max(2, this.h >> 1));
    this._drawQuad();
    // Luminance readback every 15 frames (cheap, and the exposure is
    // smoothed anyway). The 4x4 target samples the HDR buffer with a
    // quarter-screen tap step, so each output pixel averages a region.
    if (this.frame % 15 === 0) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.lumFbo);
      gl.viewport(0, 0, 4, 4);
      gl.bindTexture(gl.TEXTURE_2D, this.hdrTex);
      const lp = this.lumProg;
      gl.useProgram(lp.program);
      gl.uniform1i(lp.u.uTex, 0);
      gl.uniform2f(lp.u.uTexel, 0.25, 0.25);
      this._drawQuad();
      gl.readPixels(0, 0, 4, 4, gl.RGBA, gl.UNSIGNED_BYTE, this.lumPixels);
      let sum = 0;
      for (let i = 0; i < 16; i++) {
        sum += Math.pow(2, (this.lumPixels[i * 4] / 255) * 2) - 1;
      }
      const avg = sum / 16;
      const target = Math.min(2.2, Math.max(0.5, 0.55 / (avg + 0.08)));
      this.exposure += (target - this.exposure) * 0.08;
    }
    // Composite: HDR + bloom -> canvas, ACES + grade + vignette.
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.w, this.h);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.hdrTex);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.blurBTex);
    const cp = this.compProg;
    gl.useProgram(cp.program);
    gl.uniform1i(cp.u.uHdr, 0);
    gl.uniform1i(cp.u.uBloom, 1);
    gl.uniform1f(cp.u.uExposure, this.exposure);
    gl.uniform1f(cp.u.uBloomStrength, this.bloomStrength);
    this._drawQuad();
    gl.activeTexture(gl.TEXTURE0);
    gl.depthMask(true);
  }
}
