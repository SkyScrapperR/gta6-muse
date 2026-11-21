// WebGL2 plumbing: context creation, shader programs, buffers, VAOs.
//
// Everything the renderer draws goes through the small helpers here, so the
// rest of the engine never touches raw WebGL calls. All shaders are compiled
// once at startup; a compile or link failure throws with the info log, which
// surfaces as a console error the playtest fails on.

export function createContext(canvas) {
  const gl = canvas.getContext('webgl2', {
    antialias: true,
    alpha: false,
    depth: true,
    stencil: false,
    powerPreference: 'high-performance',
    preserveDrawingBuffer: false,
  });
  if (!gl) throw new Error('WebGL2 is not available on this browser');
  gl.enable(gl.DEPTH_TEST);
  gl.enable(gl.CULL_FACE);
  gl.cullFace(gl.BACK);
  gl.clearDepth(1);
  return gl;
}

function compileShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`shader compile failed: ${log}\n${source.slice(0, 400)}`);
  }
  return shader;
}

// Link a vertex/fragment pair and collect every uniform and attribute
// location into plain objects, so callers write prog.u.uProj instead of
// looking locations up every frame.
export function makeProgram(gl, vertSource, fragSource) {
  const vert = compileShader(gl, gl.VERTEX_SHADER, vertSource);
  const frag = compileShader(gl, gl.FRAGMENT_SHADER, fragSource);
  const program = gl.createProgram();
  gl.attachShader(program, vert);
  gl.attachShader(program, frag);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    throw new Error(`program link failed: ${log}`);
  }
  gl.deleteShader(vert);
  gl.deleteShader(frag);

  const u = {};
  const uniformCount = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < uniformCount; i++) {
    const info = gl.getActiveUniform(program, i);
    if (!info) continue;
    // Arrays come back as "name[0]": keep the bare name too.
    const name = info.name.replace(/\[0\]$/, '');
    u[name] = gl.getUniformLocation(program, info.name);
  }
  const a = {};
  const attribCount = gl.getProgramParameter(program, gl.ACTIVE_ATTRIBUTES);
  for (let i = 0; i < attribCount; i++) {
    const info = gl.getActiveAttrib(program, i);
    if (!info) continue;
    a[info.name] = gl.getAttribLocation(program, info.name);
  }
  return { program, u, a };
}

export function makeBuffer(gl, data, usage = 0x88e4) {
  // usage defaults to STATIC_DRAW.
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, data, usage);
  return buffer;
}

export function makeIndexBuffer(gl, data) {
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, data, gl.STATIC_DRAW);
  return buffer;
}

export function makeVao(gl) {
  return gl.createVertexArray();
}

// Bind one float attribute of a VAO. divisor 1 marks it per-instance.
export function bindAttrib(gl, vao, program, name, buffer, size, divisor = 0, stride = 0, offset = 0) {
  const loc = program.a[name];
  if (loc === undefined || loc < 0) return;
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, size, gl.FLOAT, false, stride, offset);
  if (divisor) gl.vertexAttribDivisor(loc, divisor);
}

// A mat4 attribute occupies four consecutive vec4 slots.
export function bindMat4Attrib(gl, vao, program, name, buffer, divisor = 1) {
  const loc = program.a[name];
  if (loc === undefined || loc < 0) return;
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  for (let i = 0; i < 4; i++) {
    gl.enableVertexAttribArray(loc + i);
    gl.vertexAttribPointer(loc + i, 4, gl.FLOAT, false, 64, i * 16);
    if (divisor) gl.vertexAttribDivisor(loc + i, divisor);
  }
}

// A renderable mesh: one VAO, one index buffer, one index count, plus a
// bounding sphere used for frustum culling.
export function makeMesh(gl, program, geometry, instanceBuffer = null, instanceColorBuffer = null) {
  const vao = makeVao(gl);
  gl.bindVertexArray(vao);
  const pos = makeBuffer(gl, new Float32Array(geometry.positions));
  bindAttrib(gl, vao, program, 'aPos', pos, 3);
  const nor = makeBuffer(gl, new Float32Array(geometry.normals));
  bindAttrib(gl, vao, program, 'aNormal', nor, 3);
  const col = makeBuffer(gl, new Float32Array(geometry.colors));
  bindAttrib(gl, vao, program, 'aColor', col, 3);
  const emi = makeBuffer(gl, new Float32Array(geometry.emissives));
  bindAttrib(gl, vao, program, 'aEmissive', emi, 3);
  const index = makeIndexBuffer(gl, new Uint32Array(geometry.indices));
  if (instanceBuffer) bindMat4Attrib(gl, vao, program, 'aInstance', instanceBuffer, 1);
  if (instanceColorBuffer) bindAttrib(gl, vao, program, 'aInstanceColor', instanceColorBuffer, 4, 1);
  gl.bindVertexArray(null);
  return { vao, index, count: geometry.indices.length, bounds: geometry.bounds };
}

export function makeDynamicBuffer(gl, byteSize) {
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, byteSize, gl.DYNAMIC_DRAW);
  return buffer;
}

export function uploadDynamic(gl, buffer, data) {
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferSubData(gl.ARRAY_BUFFER, 0, data);
}

// --- Framebuffer helpers (Tier 2: shadow map + post chain). ---

// A depth texture for a shadow map: 24-bit depth, nearest filtering (the
// shader does its own PCF), clamp to edge so out-of-range samples read
// the far plane (lit, not shadowed).
export function createDepthTexture(gl, size) {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT24, size, size, 0, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return tex;
}

// A colour texture: half-float when `floatTex` (HDR target — needs
// EXT_color_buffer_float to render into), plain RGBA8 otherwise.
export function createColorTexture(gl, w, h, floatTex = false) {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  if (floatTex) {
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
  } else {
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  }
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return tex;
}

// A depth renderbuffer for an HDR target.
export function createDepthRenderbuffer(gl, w, h) {
  const rb = gl.createRenderbuffer();
  gl.bindRenderbuffer(gl.RENDERBUFFER, rb);
  gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, w, h);
  return rb;
}

// A 2D RGBA8 texture from raw pixels (used for the pre-rendered minimap).
export function makeTexture2D(gl, width, height, pixels) {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return tex;
}
