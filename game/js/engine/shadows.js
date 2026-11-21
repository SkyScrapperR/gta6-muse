// Shadow map: a single directional shadow map for the sun (or moon at
// night). One 2048x2048 depth texture on High, 1024x1024 on Medium, off
// on Low. The light camera is an orthographic frustum fitted around the
// player camera and snapped to texel grid in light space, so shadows do
// not shimmer as the camera moves.
//
// The depth pass reuses the batches' own VAOs with a depth-only program
// (aPos at location 0, aInstance at 4-7 — the same layout as the lit
// shader, so the VAO is valid for both programs). The ground never casts
// (it is flat — casting would be invisible) and neither do particles,
// decals or beams.
import { makeProgram, createDepthTexture } from './gl.js';
import { mat4Ortho, mat4LookAt, mat4Multiply, mat4TransformPoint } from '../core/math.js';
import { DEPTH_VERT, DEPTH_FRAG } from './shaders.js';

// Batches that must not cast: the ground slab, anything transparent or
// additive, and markers that are not part of the world.
const NO_CAST = new Set([
  'ground', 'water', '__particles', 'decal', 'beam', 'mission-beam',
  'pickup-health', 'pickup-cash', 'pickup-ammo', 'pickup-weapon', 'cone',
]);

export class ShadowMap {
  constructor(gl) {
    this.gl = gl;
    this.program = makeProgram(gl, DEPTH_VERT, DEPTH_FRAG);
    this.size = 0;
    this.fbo = null;
    this.depthTex = null;
    // Light view-projection from the last render, for the lit shader.
    this.lightVP = new Float32Array(16);
    this.texel = 0;
    // Half-extent of the shadow frustum in metres around the player.
    this.extent = 130;
  }

  // (Re)create the depth texture at the given size; 0 disables shadows.
  setSize(size) {
    const gl = this.gl;
    if (size === this.size) return;
    this.size = size;
    if (this.fbo) { gl.deleteFramebuffer(this.fbo); gl.deleteTexture(this.depthTex); this.fbo = null; this.depthTex = null; }
    if (size <= 0) return;
    this.depthTex = createDepthTexture(gl, size);
    this.fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, this.depthTex, 0);
    gl.drawBuffers([gl.NONE]);
    gl.readBuffer(gl.NONE);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.texel = 1 / size;
  }

  // Render the depth pass. `sunDir` points from the sun toward the scene
  // (already normalised); `center` is the world point the shadow frustum
  // follows (the player). `drawBatch(name)` is the renderer's draw call.
  render(sunDir, center, drawBatch) {
    const gl = this.gl;
    if (this.size <= 0) return;
    const e = this.extent;
    // Light position far up the sun direction, looking at the centre.
    const eye = [center[0] - sunDir[0] * 260, center[1] - sunDir[1] * 260, center[2] - sunDir[2] * 260];
    const view = mat4LookAt(eye, [center[0], center[1], center[2]], [0, 1, 0]);
    // Snap the centre to the texel grid in light space so the map does
    // not crawl as the camera moves.
    const ls = mat4TransformPoint(view, [center[0], center[1], center[2]]);
    const texelWorld = (2 * e) / this.size;
    const sx = Math.round(ls[0] / texelWorld) * texelWorld - ls[0];
    const sy = Math.round(ls[1] / texelWorld) * texelWorld - ls[1];
    // Shift the centre by the light-space delta, projected back to
    // world with the view matrix's basis vectors (rows of the rotation
    // part), then recompute the view from the snapped centre.
    const bx = [view[0], view[4], view[8]];
    const by = [view[1], view[5], view[9]];
    const cx = center[0] + bx[0] * sx + by[0] * sy;
    const cy = center[1] + bx[1] * sx + by[1] * sy;
    const cz = center[2] + bx[2] * sx + by[2] * sy;
    const eye2 = [cx - sunDir[0] * 260, cy - sunDir[1] * 260, cz - sunDir[2] * 260];
    const view2 = mat4LookAt(eye2, [cx, cy, cz], [0, 1, 0]);
    const proj = mat4Ortho(-e, e, -e, e, 1, 520);
    this.lightVP = mat4Multiply(proj, view2);

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.viewport(0, 0, this.size, this.size);
    gl.clear(gl.DEPTH_BUFFER_BIT);
    gl.useProgram(this.program);
    gl.uniformMatrix4fv(this.program.u.uLightVP, false, this.lightVP);
    gl.enable(gl.DEPTH_TEST);
    gl.depthMask(true);
    gl.colorMask(false, false, false, false);
    gl.cullFace(gl.FRONT); // front-face culling reduces shadow acne
    drawBatch(this);
    gl.cullFace(gl.BACK);
    gl.colorMask(true, true, true, true);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  // True when `name` should cast into the shadow map.
  static casts(name) {
    if (NO_CAST.has(name)) return false;
    if (name.startsWith('chunk-')) return true;
    if (name.startsWith('pickup-')) return false;
    return true;
  }
}
