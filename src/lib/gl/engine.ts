/**
 * The GPU engine: takes each frame of the capture card, runs the enhancement pipeline on it
 * (denoise → temporal denoise → FSR upscale → sharpen → anti-aliasing → colour/HDR look/LUT),
 * keeps the last two results for frame generation, and draws whichever frame the pacer asks
 * for onto the canvas. WebGL2, so it runs on every GPU (and on software rendering).
 *
 * Texture row 0 is the top of the picture in every pass; only present() flips for the canvas.
 */

import { enhanceActive, type EnhanceSettings, type FgQuality, type FgSettings } from "../enhance";
import { fitRect, outputSize, type Rect } from "../fit";
import type { Lut } from "../lut";
import type { Fit } from "../settings";
import {
  Program,
  ShaderError,
  createTarget,
  createTexture,
  deleteTarget,
  draw,
  type Target,
} from "./program";
import * as S from "./shaders";

export interface FrameOptions {
  enhance: EnhanceSettings;
  fg: FgSettings;
  fit: Fit;
  canvasWidth: number;
  canvasHeight: number;
}

export interface FrameResult {
  /** The frame is the same as the last one (the capture card repeated it). */
  duplicate: boolean;
  /** The pipeline's output resolution. */
  width: number;
  height: number;
  /** Where the picture sits on the canvas. */
  rect: Rect;
  /** Whether a generated frame between this and the last frame can be made now. */
  canGenerate: boolean;
}

export type Shown = "current" | "previous" | "generated";

interface MotionLevel {
  level: number;
  block: number;
  radius: number;
}

/** What each frame generation quality searches: coarse to fine, ± pixels at each level. */
const FG_LEVELS: Record<FgQuality, MotionLevel[]> = {
  fast: [
    { level: 2, block: 8, radius: 6 },
    { level: 1, block: 8, radius: 2 },
  ],
  balanced: [
    { level: 2, block: 8, radius: 6 },
    { level: 1, block: 8, radius: 2 },
    { level: 0, block: 8, radius: 1 },
  ],
  quality: [
    { level: 2, block: 8, radius: 7 },
    { level: 1, block: 8, radius: 3 },
    { level: 0, block: 8, radius: 2 },
  ],
};

/** Vector length penalty (in mean-difference units per pixel), so still areas stay still. */
const MOTION_PENALTY = 0.0012;

interface TimerExt {
  TIME_ELAPSED_EXT: number;
  GPU_DISJOINT_EXT: number;
}

export class GpuEngine {
  readonly gl: WebGL2RenderingContext;
  private programs = new Map<string, Program>();
  private targets = new Map<string, Target>();
  private srcTex: WebGLTexture | null = null;
  private srcSize = { width: 0, height: 0 };
  private lutTex: WebGLTexture | null = null;
  private lut: Lut | null = null;
  /** A 1×1×1 3D texture bound while there is no LUT (a sampler3D must not share a 2D unit). */
  private noLutTex: WebGLTexture | null = null;
  /** Which of the two final/luma/history slots holds the accepted current frame. */
  private cur = 0;
  /** How many accepted frames exist at the current output size (0, 1 or 2). */
  private valid = 0;
  private histValid = false;
  private outSize = { width: 0, height: 0 };
  private lost = false;
  private readonly timer: TimerExt | null;
  private queries: { q: WebGLQuery; done: boolean }[] = [];
  private gpuMs = 0;
  private readonly diffPixel = new Uint8Array(4);

  constructor(readonly canvas: HTMLCanvasElement) {
    const gl = canvas.getContext("webgl2", {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      preserveDrawingBuffer: false,
      powerPreference: "high-performance",
      desynchronized: true,
    });
    if (!gl) throw new ShaderError("WebGL2 isn't available.");
    this.gl = gl;
    gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    this.timer = gl.getExtension("EXT_disjoint_timer_query_webgl2") as TimerExt | null;
    canvas.addEventListener("webglcontextlost", this.onLost);
    canvas.addEventListener("webglcontextrestored", this.onRestored);
  }

  private onLost = (e: Event) => {
    e.preventDefault();
    this.lost = true;
  };

  private onRestored = () => {
    this.programs.clear();
    this.targets.clear();
    this.srcTex = null;
    this.srcSize = { width: 0, height: 0 };
    this.lutTex = null;
    this.noLutTex = null;
    this.valid = 0;
    this.histValid = false;
    this.queries = [];
    this.lost = false;
    if (this.lut) this.setLut(this.lut);
  };

  get isLost(): boolean {
    return this.lost;
  }

  /** The last measured GPU time of the pipeline, in ms (0 when the GPU can't say). */
  get gpuTimeMs(): number {
    return this.gpuMs;
  }

  /** Whether frames are being upscaled (output bigger than the source). */
  get outputSize(): { width: number; height: number } {
    return this.outSize;
  }

  // ---------------------------------------------------------------- resources

  private program(key: string, source: string): Program {
    let p = this.programs.get(key);
    if (!p) {
      p = new Program(this.gl, source);
      this.programs.set(key, p);
    }
    return p;
  }

  private target(key: string, width: number, height: number, linear = true): Target {
    const t = this.targets.get(key);
    if (t && t.width === width && t.height === height) return t;
    if (t) deleteTarget(this.gl, t);
    const n = createTarget(this.gl, width, height, linear);
    this.targets.set(key, n);
    return n;
  }

  private texture3d(size: number, data: Float32Array): WebGLTexture | null {
    const gl = this.gl;
    const tex = gl.createTexture();
    if (!tex) return null;
    gl.bindTexture(gl.TEXTURE_3D, tex);
    gl.texImage3D(gl.TEXTURE_3D, 0, gl.RGB16F, size, size, size, 0, gl.RGB, gl.FLOAT, data);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);
    gl.bindTexture(gl.TEXTURE_3D, null);
    return tex;
  }

  /** Loads a .cube LUT as a 3D texture, or removes it. */
  setLut(lut: Lut | null): void {
    const gl = this.gl;
    this.lut = lut;
    if (this.lutTex) {
      gl.deleteTexture(this.lutTex);
      this.lutTex = null;
    }
    if (!lut || this.lost) return;
    this.lutTex = this.texture3d(lut.size, lut.data);
  }

  /** The canvas's drawing buffer follows its CSS size × device pixel ratio. */
  resize(width: number, height: number): void {
    if (this.canvas.width !== width) this.canvas.width = width;
    if (this.canvas.height !== height) this.canvas.height = height;
  }

  // ---------------------------------------------------------------- the pipeline

  private uploadSource(video: HTMLVideoElement): boolean {
    const gl = this.gl;
    const w = video.videoWidth;
    const h = video.videoHeight;
    if (!w || !h) return false;
    if (!this.srcTex || this.srcSize.width !== w || this.srcSize.height !== h) {
      if (this.srcTex) gl.deleteTexture(this.srcTex);
      this.srcTex = createTexture(gl, w, h, true);
      this.srcSize = { width: w, height: h };
      this.histValid = false;
    }
    gl.bindTexture(gl.TEXTURE_2D, this.srcTex);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, video);
    return true;
  }

  private beginTimer(): void {
    const gl = this.gl;
    if (!this.timer) return;
    // Collect finished queries first (oldest first).
    while (this.queries.length > 0) {
      const { q } = this.queries[0];
      const available = gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE) as boolean;
      const disjoint = gl.getParameter(this.timer.GPU_DISJOINT_EXT) as boolean;
      if (!available) break;
      if (!disjoint) {
        const ns = gl.getQueryParameter(q, gl.QUERY_RESULT) as number;
        this.gpuMs = this.gpuMs * 0.8 + (ns / 1e6) * 0.2;
      }
      gl.deleteQuery(q);
      this.queries.shift();
    }
    if (this.queries.length >= 4) return;
    const q = gl.createQuery();
    if (!q) return;
    gl.beginQuery(this.timer.TIME_ELAPSED_EXT, q);
    this.queries.push({ q, done: false });
  }

  private endTimer(): void {
    if (!this.timer) return;
    const last = this.queries[this.queries.length - 1];
    if (last && !last.done) {
      this.gl.endQuery(this.timer.TIME_ELAPSED_EXT);
      last.done = true;
    }
  }

  /**
   * Runs the pipeline on the video's current frame. Returns null when there is no frame (or the
   * context is lost); `duplicate` when the frame equals the last accepted one (then it was not
   * accepted and nothing changed on screen).
   */
  processFrame(video: HTMLVideoElement, o: FrameOptions): FrameResult | null {
    if (this.lost) return null;
    const gl = this.gl;
    if (!this.uploadSource(video)) return null;
    const src = this.srcSize;
    const e = o.enhance;
    const hasLut = this.lutTex !== null && e.lutPath !== "";
    const active = enhanceActive(e, hasLut);
    const rect = fitRect(src.width, src.height, o.canvasWidth, o.canvasHeight, o.fit);
    const out = outputSize(src.width, src.height, rect, active && e.upscaler === "fsr");
    if (out.width !== this.outSize.width || out.height !== this.outSize.height) {
      this.outSize = out;
      this.valid = 0;
    }
    const next = 1 - this.cur;
    const final = this.target(`final${next}`, out.width, out.height);
    this.beginTimer();

    if (!active) {
      const p = this.program("copy", S.COPY);
      p.use();
      p.tex("u_tex", this.srcTex!, 0);
      p.i("u_flip", 0);
      draw(gl, final);
      this.histValid = false;
    } else {
      let stage: WebGLTexture = this.srcTex!;
      let stageW = src.width;
      let stageH = src.height;

      if (e.denoise > 0) {
        const t = this.target("denoise", stageW, stageH);
        const p = this.program("denoise", S.DENOISE);
        p.use();
        p.tex("u_tex", stage, 0);
        p.v2("u_texel", 1 / stageW, 1 / stageH);
        p.f("u_strength", e.denoise);
        draw(gl, t);
        stage = t.tex;
      }

      if (e.temporalDenoise > 0) {
        const histIn = this.target(`hist${this.cur}`, stageW, stageH);
        const histOut = this.target(`hist${next}`, stageW, stageH);
        const p = this.program("temporal", S.TEMPORAL);
        p.use();
        p.tex("u_cur", stage, 0);
        p.tex("u_hist", histIn.tex, 1);
        p.v2("u_texel", 1 / stageW, 1 / stageH);
        p.f("u_strength", e.temporalDenoise);
        p.i("u_hasHist", this.histValid ? 1 : 0);
        draw(gl, histOut);
        stage = histOut.tex;
      } else {
        this.histValid = false;
      }

      if (out.width !== stageW || out.height !== stageH) {
        const t = this.target("upscale", out.width, out.height);
        const p = this.program("easu", S.EASU);
        p.use();
        p.tex("u_tex", stage, 0);
        p.v2("u_inSize", stageW, stageH);
        p.v2("u_outSize", out.width, out.height);
        draw(gl, t);
        stage = t.tex;
        stageW = out.width;
        stageH = out.height;
      }

      if (e.sharpness > 0) {
        const t = this.target("sharpen", stageW, stageH);
        const p = this.program("rcas", S.RCAS);
        p.use();
        p.tex("u_tex", stage, 0);
        p.v2("u_size", stageW, stageH);
        p.f("u_sharp", Math.pow(2, -2 * (1 - e.sharpness)));
        draw(gl, t);
        stage = t.tex;
      }

      if (e.antiAliasing === "fxaa") {
        const t = this.target("fxaa", stageW, stageH);
        const p = this.program("fxaa", S.FXAA);
        p.use();
        p.tex("u_tex", stage, 0);
        p.v2("u_texel", 1 / stageW, 1 / stageH);
        draw(gl, t);
        stage = t.tex;
      }

      let low: WebGLTexture = stage;
      if (e.hdrLook > 0) {
        const w4 = Math.max(1, Math.round(stageW / 4));
        const h4 = Math.max(1, Math.round(stageH / 4));
        const w8 = Math.max(1, Math.round(stageW / 8));
        const h8 = Math.max(1, Math.round(stageH / 8));
        const q = this.target("low4", w4, h4);
        const r = this.target("low8", w8, h8);
        const p = this.program("down", S.DOWNSAMPLE);
        p.use();
        p.tex("u_tex", stage, 0);
        p.v2("u_texel", 1 / stageW, 1 / stageH);
        draw(gl, q);
        p.tex("u_tex", q.tex, 0);
        p.v2("u_texel", 1 / w4, 1 / h4);
        draw(gl, r);
        low = r.tex;
      }

      const p = this.program("colour", S.COLOUR);
      p.use();
      p.tex("u_tex", stage, 0);
      p.tex("u_low", low, 1);
      if (hasLut && this.lutTex && this.lut) {
        p.tex("u_lut", this.lutTex, 2, gl.TEXTURE_3D);
        p.i("u_hasLut", 1);
        p.f("u_lutStrength", e.lutStrength);
        p.f("u_lutSize", this.lut.size);
        p.v3("u_lutMin", ...this.lut.domainMin);
        p.v3("u_lutMax", ...this.lut.domainMax);
      } else {
        if (!this.noLutTex) this.noLutTex = this.texture3d(1, new Float32Array(3));
        if (this.noLutTex) p.tex("u_lut", this.noLutTex, 2, gl.TEXTURE_3D);
        p.i("u_hasLut", 0);
      }
      const c = e.colour;
      p.f("u_hdr", e.hdrLook);
      p.f("u_brightness", c.brightness);
      p.f("u_contrast", c.contrast);
      p.f("u_saturation", c.saturation);
      p.f("u_vibrance", c.vibrance);
      p.f("u_gamma", c.gamma);
      p.f("u_temperature", c.temperature);
      p.f("u_tint", c.tint);
      draw(gl, final);
    }

    // Luma pyramid of this frame, for motion estimation and the duplicate check.
    let duplicate = false;
    if (o.fg.enabled) {
      this.lumaPyramid(next, final);
      if (o.fg.dedup && this.valid >= 1) {
        duplicate = this.isDuplicate(this.cur, next);
      }
    }
    this.endTimer();

    if (duplicate) {
      return {
        duplicate: true,
        width: out.width,
        height: out.height,
        rect,
        canGenerate: this.valid >= 2,
      };
    }
    this.cur = next;
    if (e.temporalDenoise > 0 && active) this.histValid = true;
    this.valid = Math.min(2, this.valid + 1);
    return {
      duplicate: false,
      width: out.width,
      height: out.height,
      rect,
      canGenerate: o.fg.enabled && this.valid >= 2,
    };
  }

  private lumaPyramid(slot: number, final: Target): void {
    const gl = this.gl;
    const p = this.program("luma", S.LUMA_DOWN);
    p.use();
    let src = final.tex;
    let w = final.width;
    let h = final.height;
    for (let level = 0; level <= 2; level++) {
      const t = this.target(`luma${slot}_${level}`, w, h);
      p.tex("u_tex", src, 0);
      draw(gl, t);
      src = t.tex;
      w = Math.max(1, Math.round(w / 2));
      h = Math.max(1, Math.round(h / 2));
    }
  }

  /** True when the frames in `a` and `b` (luma level 2) are the same picture. */
  private isDuplicate(a: number, b: number): boolean {
    const gl = this.gl;
    const la = this.targets.get(`luma${a}_2`);
    const lb = this.targets.get(`luma${b}_2`);
    if (!la || !lb || la.width !== lb.width || la.height !== lb.height) return false;
    const t = this.target("diff", 1, 1, false);
    const p = this.program("diff", S.DIFF);
    p.use();
    p.tex("u_prev", la.tex, 0);
    p.tex("u_cur", lb.tex, 1);
    draw(gl, t);
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, this.diffPixel);
    // r = mean difference × 32 in 0..255: 1 means a mean difference below 1/8 of a grey step.
    return this.diffPixel[0] <= 1;
  }

  /** Makes the frame between the previous and the current one (after a frame was accepted). */
  generate(fg: FgSettings): boolean {
    if (this.lost || this.valid < 2) return false;
    const gl = this.gl;
    const prev = 1 - this.cur;
    const cur = this.cur;
    const levels = FG_LEVELS[fg.quality];
    let coarse: Target | null = null;
    let lastLevel = levels[levels.length - 1];
    for (const lv of levels) {
      const lp = this.targets.get(`luma${prev}_${lv.level}`);
      const lc = this.targets.get(`luma${cur}_${lv.level}`);
      if (!lp || !lc) return false;
      const bw = Math.ceil(lp.width / lv.block);
      const bh = Math.ceil(lp.height / lv.block);
      const t = this.target(`vec${lv.level}`, bw, bh);
      const p = this.program(
        `motion_${lv.block}_${lv.radius}`,
        S.motionShader(lv.block, lv.radius),
      );
      p.use();
      p.tex("u_prev", lp.tex, 0);
      p.tex("u_cur", lc.tex, 1);
      p.tex("u_coarse", coarse ? coarse.tex : lp.tex, 2);
      p.i("u_hasCoarse", coarse ? 1 : 0);
      p.v2("u_size", lp.width, lp.height);
      p.f("u_penalty", MOTION_PENALTY);
      draw(gl, t);
      coarse = t;
      lastLevel = lv;
    }
    if (!coarse) return false;

    // Smooth the vector field: each block may take a neighbour's vector when it fits better.
    const lp = this.targets.get(`luma${prev}_${lastLevel.level}`)!;
    const lc = this.targets.get(`luma${cur}_${lastLevel.level}`)!;
    const refined = this.target("vecRefined", coarse.width, coarse.height);
    const rp = this.program(`refine_${lastLevel.block}`, S.refineShader(lastLevel.block));
    rp.use();
    rp.tex("u_prev", lp.tex, 0);
    rp.tex("u_cur", lc.tex, 1);
    rp.tex("u_vec", coarse.tex, 2);
    rp.v2("u_size", lp.width, lp.height);
    gl.uniform2i(gl.getUniformLocation(rp.program, "u_vecSize"), coarse.width, coarse.height);
    draw(gl, refined);

    const fp = this.targets.get(`final${prev}`)!;
    const fc = this.targets.get(`final${cur}`)!;
    const gen = this.target("generated", fc.width, fc.height);
    const scale = Math.pow(2, lastLevel.level);
    const ip = this.program("interpolate", S.INTERPOLATE);
    ip.use();
    ip.tex("u_prev", fp.tex, 0);
    ip.tex("u_cur", fc.tex, 1);
    ip.tex("u_vec", refined.tex, 2);
    ip.v2("u_size", fc.width, fc.height);
    ip.v2(
      "u_vecScale",
      fc.width / (lastLevel.block * scale) / refined.width,
      fc.height / (lastLevel.block * scale) / refined.height,
    );
    ip.f("u_level", scale);
    ip.f("u_protect", fg.protection);
    draw(gl, gen);
    return true;
  }

  /** Draws a frame onto the canvas, into `rect` (the rest stays black). */
  present(which: Shown, rect: Rect): boolean {
    if (this.lost) return false;
    const gl = this.gl;
    const key =
      which === "generated"
        ? "generated"
        : which === "current"
          ? `final${this.cur}`
          : `final${1 - this.cur}`;
    const t = this.targets.get(key);
    if (!t) return false;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    const p = this.program("copy", S.COPY);
    p.use();
    p.tex("u_tex", t.tex, 0);
    p.i("u_flip", 1);
    // GL's viewport origin is the bottom-left corner; rect.y is from the top.
    const y = gl.drawingBufferHeight - rect.y - rect.height;
    draw(gl, null, [rect.x, y, rect.width, rect.height]);
    return true;
  }

  /** The current frame's pixels (RGBA, top row first) at the pipeline's output resolution. */
  readCurrent(): { width: number; height: number; data: Uint8Array } | null {
    if (this.lost || this.valid < 1) return null;
    const gl = this.gl;
    const t = this.targets.get(`final${this.cur}`);
    if (!t) return null;
    const data = new Uint8Array(t.width * t.height * 4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, t.fbo);
    gl.readPixels(0, 0, t.width, t.height, gl.RGBA, gl.UNSIGNED_BYTE, data);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { width: t.width, height: t.height, data };
  }

  /** Forgets the frames (the capture restarted). */
  reset(): void {
    this.valid = 0;
    this.histValid = false;
  }

  dispose(): void {
    const gl = this.gl;
    this.canvas.removeEventListener("webglcontextlost", this.onLost);
    this.canvas.removeEventListener("webglcontextrestored", this.onRestored);
    for (const p of this.programs.values()) p.dispose();
    for (const t of this.targets.values()) deleteTarget(gl, t);
    this.programs.clear();
    this.targets.clear();
    if (this.srcTex) gl.deleteTexture(this.srcTex);
    if (this.lutTex) gl.deleteTexture(this.lutTex);
    for (const { q } of this.queries) gl.deleteQuery(q);
    gl.getExtension("WEBGL_lose_context")?.loseContext();
  }
}
