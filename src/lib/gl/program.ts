/** Small WebGL2 helpers the engine is built from: programs, textures, framebuffers, uniforms. */

export class ShaderError extends Error {}

/** The one vertex shader: a full-screen triangle; v_uv is 0..1 over the output. */
export const VERTEX_SHADER = `#version 300 es
precision highp float;
out vec2 v_uv;
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  v_uv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}
`;

export const FRAGMENT_HEADER = `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;
precision highp sampler3D;
in vec2 v_uv;
out vec4 o_color;
`;

function compile(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new ShaderError("Couldn't create a shader.");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS) && !gl.isContextLost()) {
    const log = gl.getShaderInfoLog(shader) ?? "";
    gl.deleteShader(shader);
    throw new ShaderError(`Shader didn't compile: ${log}`);
  }
  return shader;
}

export class Program {
  readonly program: WebGLProgram;
  private readonly uniforms = new Map<string, WebGLUniformLocation | null>();

  constructor(
    private readonly gl: WebGL2RenderingContext,
    fragmentBody: string,
  ) {
    const vs = compile(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT_HEADER + fragmentBody);
    const program = gl.createProgram();
    if (!program) throw new ShaderError("Couldn't create a program.");
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS) && !gl.isContextLost()) {
      const log = gl.getProgramInfoLog(program) ?? "";
      gl.deleteProgram(program);
      throw new ShaderError(`Program didn't link: ${log}`);
    }
    this.program = program;
  }

  use(): void {
    this.gl.useProgram(this.program);
  }

  private loc(name: string): WebGLUniformLocation | null {
    let l = this.uniforms.get(name);
    if (l === undefined) {
      l = this.gl.getUniformLocation(this.program, name);
      this.uniforms.set(name, l);
    }
    return l;
  }

  f(name: string, v: number): void {
    this.gl.uniform1f(this.loc(name), v);
  }
  i(name: string, v: number): void {
    this.gl.uniform1i(this.loc(name), v);
  }
  v2(name: string, x: number, y: number): void {
    this.gl.uniform2f(this.loc(name), x, y);
  }
  v3(name: string, x: number, y: number, z: number): void {
    this.gl.uniform3f(this.loc(name), x, y, z);
  }
  /** Binds `tex` to texture unit `unit` and points the sampler at it. */
  tex(name: string, tex: WebGLTexture, unit: number, target: number = this.gl.TEXTURE_2D): void {
    this.gl.activeTexture(this.gl.TEXTURE0 + unit);
    this.gl.bindTexture(target, tex);
    this.gl.uniform1i(this.loc(name), unit);
  }

  dispose(): void {
    this.gl.deleteProgram(this.program);
  }
}

/** A texture with the framebuffer that renders into it. */
export interface Target {
  tex: WebGLTexture;
  fbo: WebGLFramebuffer;
  width: number;
  height: number;
}

export function createTexture(
  gl: WebGL2RenderingContext,
  width: number,
  height: number,
  linear: boolean,
): WebGLTexture {
  const tex = gl.createTexture();
  if (!tex) throw new ShaderError("Couldn't create a texture.");
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, width, height);
  const filter = linear ? gl.LINEAR : gl.NEAREST;
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return tex;
}

export function createTarget(
  gl: WebGL2RenderingContext,
  width: number,
  height: number,
  linear: boolean,
): Target {
  const tex = createTexture(gl, width, height, linear);
  const fbo = gl.createFramebuffer();
  if (!fbo) throw new ShaderError("Couldn't create a framebuffer.");
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return { tex, fbo, width, height };
}

export function deleteTarget(gl: WebGL2RenderingContext, t: Target): void {
  gl.deleteFramebuffer(t.fbo);
  gl.deleteTexture(t.tex);
}

/** Draws the full-screen triangle into `target` (or the canvas when null) with `program` set up. */
export function draw(
  gl: WebGL2RenderingContext,
  target: Target | null,
  viewport?: [number, number, number, number],
): void {
  gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.fbo : null);
  if (viewport) gl.viewport(viewport[0], viewport[1], viewport[2], viewport[3]);
  else if (target) gl.viewport(0, 0, target.width, target.height);
  else gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
}
