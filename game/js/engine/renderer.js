// The renderer: owns the WebGL2 context, the four shader programs, and the
// frame graph. Each frame:
//
//   sky (fullscreen triangle, no depth) -> opaque lit batches (instanced)
//   -> water (transparent) -> particles (transparent, billboarded)
//
// Everything the game draws is an instanced batch: one geometry, one set of
// per-instance matrices and colours. A city chunk is a batch with one
// instance; a street of cars is a batch with thirty. Draw calls stay low no
// matter how busy the scene gets.
//
// Tier 1 renders straight to the canvas. Tier 2 adds the post chain (bloom,
// auto-exposure, ACES) behind the same begin/end calls.

import {
  createContext, makeProgram, makeMesh, makeBuffer, makeDynamicBuffer,
  uploadDynamic, makeVao, bindAttrib,
} from './gl.js';
import {
  LIT_VERT, LIT_FRAG, SKY_VERT, SKY_FRAG,
  WATER_VERT, WATER_FRAG, PARTICLE_VERT, PARTICLE_FRAG,
  CONE_VERT, CONE_FRAG,
} from './shaders.js';
import { ShadowMap } from './shadows.js';
import { PostChain } from './post.js';
import {
  mat4Perspective, mat4LookAt, mat4Multiply, mat4Identity,
  v3Norm, v3Sub, v3Cross,
} from '../core/math.js';
import { planesFromMatrix, sphereVisible } from './frustum.js';
import { unitQuad } from './mesh.js';

function setVec3(gl, loc, v) { if (loc) gl.uniform3f(loc, v[0], v[1], v[2]); }
function setVec2(gl, loc, x, y) { if (loc) gl.uniform2f(loc, x, y); }
function setFloat(gl, loc, v) { if (loc) gl.uniform1f(loc, v); }
function setInt(gl, loc, v) { if (loc) gl.uniform1i(loc, v); }
function setMat4(gl, loc, m) { if (loc) gl.uniformMatrix4fv(loc, false, m); }

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.gl = createContext(canvas);
    const gl = this.gl;
    this.lit = makeProgram(gl, LIT_VERT, LIT_FRAG);
    this.skyProg = makeProgram(gl, SKY_VERT, SKY_FRAG);
    this.waterProg = makeProgram(gl, WATER_VERT, WATER_FRAG);
    this.particleProg = makeProgram(gl, PARTICLE_VERT, PARTICLE_FRAG);
    this.coneProg = makeProgram(gl, CONE_VERT, CONE_FRAG);
    // Tier 2: directional shadow map + HDR post chain. Both are driven
    // by the quality preset (see applyQuality in main.js): Low disables
    // both, Medium uses a 1024 shadow map + bloom, High a 2048 map.
    this.shadowMap = new ShadowMap(gl);
    this.post = new PostChain(gl);
    this.shadowSize = 0; // 0 = shadows off
    this.postWanted = false; // true on Medium/High (bloom + ACES)
    this.postActive = false; // true this frame when HDR is really on
    // Checkpoint 2 perf: shader detail switches, driven by the quality
    // preset (see applyQuality in main.js). detail 0 skips the grime
    // hash in the lit shader; clouds 0/1/2 picks the sky's noise octaves.
    this.detail = 1;
    this.clouds = 2;
    this.wet = 0; // rain wetness 0..1, from the RainSystem
    this.lights = null; // LightRegistry, set by main.js
    // Checkpoint 2 perf: on Low the 12-light forward loop is skipped
    // entirely (lightsOn false) — on this software rasteriser the loop
    // costs more than the rest of the fragment shader combined, and
    // the lamps still read via their emissive glow. Med/High keep it.
    this.lightsOn = true;
    this.coneHeight = 60; // heli spotlight cone height, set by the heli
    this.batches = new Map();
    this.width = 0;
    this.height = 0;
    this.quality = 'medium';
    this.pixelRatio = 1;

    // Fullscreen triangle for the sky.
    this.skyVao = makeVao(gl);
    gl.bindVertexArray(this.skyVao);
    const tri = makeBuffer(gl, new Float32Array([-1, -1, 3, -1, -1, 3]));
    bindAttrib(gl, this.skyVao, this.skyProg, 'aPos', tri, 2);
    gl.bindVertexArray(null);

    // Water mesh slot (filled by the world module) and particle batch.
    this.waterMesh = null;
    this.particleBatch = this.createBatch('__particles', unitQuad(), 2048);
    this.particleCount = 0;
    this.drawCalls = 0;
    this.triangles = 0;
  }

  resize(cssWidth, cssHeight, pixelRatio = 1) {
    this.pixelRatio = pixelRatio;
    this.width = Math.max(1, Math.round(cssWidth * pixelRatio));
    this.height = Math.max(1, Math.round(cssHeight * pixelRatio));
    if (this.canvas.width !== this.width || this.canvas.height !== this.height) {
      this.canvas.width = this.width;
      this.canvas.height = this.height;
    }
    this.gl.viewport(0, 0, this.width, this.height);
    this.aspect = this.width / this.height;
    if (this.post) this.post.resize(this.width, this.height);
  }

  // Register a geometry as an instanced batch. matrices/colors are uploaded
  // per frame with setInstances; the buffers are allocated once.
  createBatch(name, geometry, maxInstances) {
    const gl = this.gl;
    const matrixBuffer = makeDynamicBuffer(gl, maxInstances * 64);
    const colorBuffer = makeDynamicBuffer(gl, maxInstances * 16);
    const mesh = makeMesh(gl, this.lit, geometry, matrixBuffer, colorBuffer);
    const batch = { mesh, matrixBuffer, colorBuffer, maxInstances, count: 0 };
    this.batches.set(name, batch);
    return batch;
  }

  // For the particle program the same geometry is drawn with a different
  // shader, so particles get their own VAO bound to the particle program.
  createParticleMesh() {
    const gl = this.gl;
    const batch = this.batches.get('__particles');
    const vao = makeVao(gl);
    gl.bindVertexArray(vao);
    // Reuse the unit quad's position buffer through a fresh mesh build.
    const geo = unitQuad();
    const pos = makeBuffer(gl, new Float32Array(geo.positions));
    bindAttrib(gl, vao, this.particleProg, 'aPos', pos, 3);
    const idx = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, idx);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint32Array(geo.indices), gl.STATIC_DRAW);
    const ib = batch.matrixBuffer;
    const cb = batch.colorBuffer;
    const locM = this.particleProg.a.aInstance;
    if (locM !== undefined && locM >= 0) {
      gl.bindBuffer(gl.ARRAY_BUFFER, ib);
      for (let i = 0; i < 4; i++) {
        gl.enableVertexAttribArray(locM + i);
        gl.vertexAttribPointer(locM + i, 4, gl.FLOAT, false, 64, i * 16);
        gl.vertexAttribDivisor(locM + i, 1);
      }
    }
    const locC = this.particleProg.a.aInstanceColor;
    if (locC !== undefined && locC >= 0) {
      gl.bindBuffer(gl.ARRAY_BUFFER, cb);
      gl.enableVertexAttribArray(locC);
      gl.vertexAttribPointer(locC, 4, gl.FLOAT, false, 0, 0);
      gl.vertexAttribDivisor(locC, 1);
    }
    gl.bindVertexArray(null);
    batch.particleVao = vao;
    batch.particleIndex = idx;
    batch.particleCount = geo.indices.length;
  }

  setInstances(name, matrices, colors, count) {
    const batch = this.batches.get(name);
    if (!batch) return;
    const gl = this.gl;
    const n = Math.min(count, batch.maxInstances);
    uploadDynamic(gl, batch.matrixBuffer, matrices.subarray(0, n * 16));
    uploadDynamic(gl, batch.colorBuffer, colors.subarray(0, n * 4));
    batch.count = n;
  }

  setWaterMesh(geometry) {
    const gl = this.gl;
    const vao = makeVao(gl);
    gl.bindVertexArray(vao);
    const pos = makeBuffer(gl, new Float32Array(geometry.positions));
    bindAttrib(gl, vao, this.waterProg, 'aPos', pos, 3);
    const idx = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, idx);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint32Array(geometry.indices), gl.STATIC_DRAW);
    gl.bindVertexArray(null);
    this.waterMesh = { vao, index: idx, count: geometry.indices.length };
  }

  // Prepare the frame: compute the camera matrices, clear, and push the
  // shared lighting uniforms to the lit program. Returns the view-projection
  // matrix and the frustum planes for culling.
  beginFrame(camera, palette, time) {
    const gl = this.gl;
    this.drawCalls = 0;
    this.triangles = 0;
    const proj = mat4Perspective(camera.fov, this.aspect, camera.near, camera.far);
    const view = mat4LookAt(camera.pos, camera.target, [0, 1, 0]);
    this.proj = proj;
    this.view = view;
    this.projView = mat4Multiply(proj, view);
    this.frustum = planesFromMatrix(this.projView);
    // Camera basis for the sky shader.
    const fwd = v3Norm(v3Sub(camera.target, camera.pos));
    const right = v3Norm(v3Cross(fwd, [0, 1, 0]));
    const up = v3Cross(right, fwd);
    this.camBasis = { fwd, right, up };
    this.tanFov = Math.tan(camera.fov / 2);
    this.time = time;

    // Shadow pass first: the depth map from the sun, using the instance
    // buffers the systems uploaded in update() this frame. Then bind the
    // HDR target (post chain) or the canvas and clear it.
    if (this.shadowSize > 0) {
      this.shadowMap.setSize(this.shadowSize);
      this.shadowMap.render(palette.sunDir, this.cameraPos, () => {
        for (const [name, batch] of this.batches) {
          if (name === '__particles') continue;
          if (!ShadowMap.casts(name)) continue;
          if (!batch || batch.count === 0) continue;
          gl.bindVertexArray(batch.mesh.vao);
          gl.drawElementsInstanced(gl.TRIANGLES, batch.mesh.count, gl.UNSIGNED_INT, 0, batch.count);
          gl.bindVertexArray(null);
        }
      });
    } else {
      this.shadowMap.setSize(0);
    }
    this.postActive = this.post.enabled && this.postWanted;
    if (this.postActive) {
      this.post.begin();
    } else {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, this.width, this.height);
    }

    gl.clearColor(palette.fogColor[0], palette.fogColor[1], palette.fogColor[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    gl.useProgram(this.lit.program);
    setMat4(gl, this.lit.u.uProj, proj);
    setMat4(gl, this.lit.u.uView, view);
    setMat4(gl, this.lit.u.uLightVP, this.shadowMap.lightVP);
    setVec3(gl, this.lit.u.uSunDir, palette.sunDir);
    setVec3(gl, this.lit.u.uSunColor, palette.sunColor);
    setVec3(gl, this.lit.u.uHemiSky, palette.hemiSky);
    setVec3(gl, this.lit.u.uHemiGround, palette.hemiGround);
    setVec3(gl, this.lit.u.uFogColor, palette.fogColor);
    setFloat(gl, this.lit.u.uFogDensity, palette.fogDensity);
    setFloat(gl, this.lit.u.uNight, palette.night);
    setVec3(gl, this.lit.u.uCamPos, this.cameraPos);
    setFloat(gl, this.lit.u.uWet, this.wet);
    // With the post chain the HDR value goes to the chain (ACES there);
    // without it the shader applies its own shoulder.
    setFloat(gl, this.lit.u.uTonemap, this.postActive ? 0 : 1);
    setFloat(gl, this.lit.u.uDetail, this.detail);
    setFloat(gl, this.lit.u.uShadowOn, this.shadowSize > 0 ? 1 : 0);
    setVec2(gl, this.lit.u.uShadowTexel, this.shadowMap.texel, this.shadowMap.texel);
    if (this.shadowMap.depthTex) {
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, this.shadowMap.depthTex);
      setInt(gl, this.lit.u.uShadowMap, 1);
      gl.activeTexture(gl.TEXTURE0);
    }
    // Night point lights from the registry (0 by day — see lights.js).
    // On Low the loop is skipped (see lightsOn above): the uniform is
    // set to 0 so the fragment shader breaks out on the first iteration.
    if (this.lightsOn && this.lights && this.lights.count > 0) {
      setInt(gl, this.lit.u.uLightCount, this.lights.count);
      gl.uniform4fv(this.lit.u.uLightPos, this.lights.pos);
      gl.uniform4fv(this.lit.u.uLightCol, this.lights.col);
    } else {
      setInt(gl, this.lit.u.uLightCount, 0);
    }
  }

  drawSky(palette, time) {
    const gl = this.gl;
    gl.disable(gl.DEPTH_TEST);
    gl.depthMask(false);
    gl.useProgram(this.skyProg.program);
    const p = this.skyProg.u;
    setVec3(gl, p.uCamRight, this.camBasis.right);
    setVec3(gl, p.uCamUp, this.camBasis.up);
    setVec3(gl, p.uCamFwd, this.camBasis.fwd);
    setFloat(gl, p.uTanFov, this.tanFov);
    setFloat(gl, p.uAspect, this.aspect);
    setVec3(gl, p.uSunDir, palette.sunDir);
    setVec3(gl, p.uZenith, palette.zenith);
    setVec3(gl, p.uHorizon, palette.horizon);
    setVec3(gl, p.uSunTint, palette.sunTint);
    setFloat(gl, p.uNight, palette.night);
    setFloat(gl, p.uStars, time);
    setFloat(gl, p.uClouds, this.clouds);
    gl.bindVertexArray(this.skyVao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
    gl.enable(gl.DEPTH_TEST);
    gl.depthMask(true);
    this.drawCalls++;
  }

  drawBatch(name) {
    const batch = this.batches.get(name);
    if (!batch || batch.count === 0) return;
    const gl = this.gl;
    gl.useProgram(this.lit.program);
    gl.bindVertexArray(batch.mesh.vao);
    gl.drawElementsInstanced(gl.TRIANGLES, batch.mesh.count, gl.UNSIGNED_INT, 0, batch.count);
    gl.bindVertexArray(null);
    this.drawCalls++;
    this.triangles += (batch.mesh.count / 3) * batch.count;
  }

  // Draw a chunk batch only when its bounding sphere is inside the view.
  drawChunk(name, bounds) {
    if (bounds && !sphereVisible(this.frustum, bounds.center, bounds.radius)) return;
    this.drawBatch(name);
  }

  drawWater(palette, time, coast) {
    if (!this.waterMesh) return;
    const gl = this.gl;
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false);
    gl.useProgram(this.waterProg.program);
    const p = this.waterProg.u;
    setMat4(gl, p.uProj, this.proj);
    setMat4(gl, p.uView, this.view);
    setFloat(gl, p.uTime, time);
    setVec3(gl, p.uCamPos, this.cameraPos);
    setVec3(gl, p.uSunDir, palette.sunDir);
    setVec3(gl, p.uDeepColor, [0.015, 0.10, 0.16]);
    setVec3(gl, p.uShallowColor, [0.05, 0.30, 0.38]);
    setVec3(gl, p.uSkyColor, palette.horizon);
    setVec3(gl, p.uFogColor, palette.fogColor);
    setFloat(gl, p.uFogDensity, palette.fogDensity);
    setFloat(gl, p.uCoast, coast);
    gl.bindVertexArray(this.waterMesh.vao);
    gl.drawElements(gl.TRIANGLES, this.waterMesh.count, gl.UNSIGNED_INT, 0);
    gl.bindVertexArray(null);
    gl.depthMask(true);
    gl.disable(gl.BLEND);
    this.drawCalls++;
  }

  setParticles(matrices, colors, count) {
    const batch = this.batches.get('__particles');
    const n = Math.min(count, batch.maxInstances);
    uploadDynamic(this.gl, batch.matrixBuffer, matrices.subarray(0, n * 16));
    uploadDynamic(this.gl, batch.colorBuffer, colors.subarray(0, n * 4));
    this.particleCount = n;
  }

  drawParticles() {
    if (this.particleCount === 0) return;
    const gl = this.gl;
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false);
    gl.useProgram(this.particleProg.program);
    const p = this.particleProg.u;
    setMat4(gl, p.uProj, this.proj);
    setMat4(gl, p.uView, this.view);
    const batch = this.batches.get('__particles');
    gl.bindVertexArray(batch.particleVao);
    gl.drawElementsInstanced(gl.TRIANGLES, batch.particleCount, gl.UNSIGNED_INT, 0, this.particleCount);
    gl.bindVertexArray(null);
    gl.depthMask(true);
    gl.disable(gl.BLEND);
    this.drawCalls++;
  }

  // Heli spotlight cone (Tier 2): additive, no depth write, drawn after
  // the opaque world and before the water so the pool reads through it.
  drawCone() {
    const batch = this.batches.get('cone');
    if (!batch || batch.count === 0) return;
    const gl = this.gl;
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    gl.depthMask(false);
    gl.useProgram(this.coneProg.program);
    const p = this.coneProg.u;
    setMat4(gl, p.uProj, this.proj);
    setMat4(gl, p.uView, this.view);
    setFloat(gl, p.uHeight, this.coneHeight);
    gl.bindVertexArray(batch.mesh.vao);
    gl.drawElementsInstanced(gl.TRIANGLES, batch.mesh.count, gl.UNSIGNED_INT, 0, batch.count);
    gl.bindVertexArray(null);
    gl.depthMask(true);
    gl.disable(gl.BLEND);
    this.drawCalls++;
  }

  // The lit program is left bound after beginFrame; restore it after the
  // transparent passes so the next frame's batches draw correctly.
  endFrame() {
    if (this.postActive) this.post.render();
    this.gl.useProgram(this.lit.program);
  }
}
