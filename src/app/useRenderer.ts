import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AudioEngine } from "../lib/audio";
import { getBridge } from "../lib/bridge";
import { fitRect, type Rect } from "../lib/fit";
import { GpuEngine, type Shown } from "../lib/gl/engine";
import { ShaderError } from "../lib/gl/program";
import { lutName, parseCube } from "../lib/lut";
import { FramePacer } from "../lib/pacer";
import type { Settings } from "../lib/settings";
import { FrameStats } from "../lib/stats";

export interface RenderStats {
  /** Frames shown per second (generated ones included). */
  fps: number;
  low1: number;
  frameTime: number;
  /** Real frames taken from the capture card per second. */
  captureFps: number;
  /** Generated frames per second. */
  generatedFps: number;
  /** Frames the capture card repeated and that were dropped, per second. */
  duplicatesFps: number;
  gpuMs: number;
  /** The pipeline's output resolution. */
  width: number;
  height: number;
  /** Frame generation is on but the screen can't show twice the capture rate. */
  fgLimited: boolean;
}

const EMPTY_STATS: RenderStats = {
  fps: 0,
  low1: 0,
  frameTime: 0,
  captureFps: 0,
  generatedFps: 0,
  duplicatesFps: 0,
  gpuMs: 0,
  width: 0,
  height: 0,
  fgLimited: false,
};

/**
 * Draws the capture card's picture through the GPU engine onto the canvas: every new video
 * frame runs the enhancement pipeline, the pacer decides what each screen refresh shows, and
 * frame generation fills the gaps. Also hands out screenshots and the stream recordings use.
 */
export function useRenderer({
  stream,
  live,
  settings,
  audio,
}: {
  stream: MediaStream | null;
  live: boolean;
  settings: Settings;
  audio: AudioEngine | null;
}) {
  const bridge = getBridge();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const engineRef = useRef<GpuEngine | null>(null);
  const settingsRef = useRef(settings);
  const liveRef = useRef(live);
  const rectRef = useRef<Rect>({ x: 0, y: 0, width: 0, height: 0 });
  const pacer = useMemo(() => new FramePacer(), []);
  const frameStats = useMemo(() => new FrameStats(2000), []);
  const counters = useRef({ captured: 0, generated: 0, duplicates: 0, since: 0 });
  /** Recent screen refresh intervals (ms), to know whether the screen can take generated frames. */
  const refresh = useRef<{ last: number; gaps: number[]; interval: number }>({
    last: -1,
    gaps: [],
    interval: 1000 / 60,
  });
  const fgLimitedRef = useRef(false);
  const [gpuError, setGpuError] = useState<string | null>(null);
  const [stats, setStats] = useState<RenderStats>(EMPTY_STATS);
  const [lutState, setLutState] = useState<{ name: string; error: string }>({
    name: "",
    error: "",
  });

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);
  useEffect(() => {
    liveRef.current = live;
  }, [live]);

  // The engine lives as long as the canvas.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let engine: GpuEngine;
    try {
      engine = new GpuEngine(canvas);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // Reported after the effect, so the first render isn't cascaded.
      const t = setTimeout(() => setGpuError(message), 0);
      return () => clearTimeout(t);
    }
    engineRef.current = engine;
    const parent = canvas.parentElement;
    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const w = Math.max(1, Math.round((parent?.clientWidth ?? canvas.clientWidth) * dpr));
      const h = Math.max(1, Math.round((parent?.clientHeight ?? canvas.clientHeight) * dpr));
      engine.resize(w, h);
    };
    resize();
    const ro = new ResizeObserver(resize);
    if (parent) ro.observe(parent);
    return () => {
      ro.disconnect();
      engine.dispose();
      engineRef.current = null;
    };
  }, []);

  // The LUT file follows the setting.
  const lutPath = settings.enhance.lutPath;
  useEffect(() => {
    const engine = engineRef.current;
    if (!lutPath || !engine) {
      engine?.setLut(null);
      setLutState({ name: "", error: "" });
      return;
    }
    let alive = true;
    const load = async () => {
      if (!bridge) throw new Error("LUT files open in the app.");
      const text = await bridge.readLut(lutPath);
      return parseCube(text);
    };
    load()
      .then((lut) => {
        if (!alive) return;
        engineRef.current?.setLut(lut);
        setLutState({ name: lut.title || lutName(lutPath), error: "" });
      })
      .catch((err: unknown) => {
        if (!alive) return;
        engineRef.current?.setLut(null);
        setLutState({ name: lutName(lutPath), error: err instanceof Error ? err.message : "" });
      });
    return () => {
      alive = false;
    };
  }, [bridge, lutPath]);

  // The video element decodes the stream; the engine reads its frames.
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    if (el.srcObject !== stream) el.srcObject = stream;
    if (stream) void el.play().catch(() => undefined);
    pacer.reset();
    frameStats.reset();
    engineRef.current?.reset();
  }, [stream, pacer, frameStats]);

  // One new video frame: run the pipeline, let the pacer know, make the generated frame.
  const onFrame = useCallback(
    (now: number) => {
      const engine = engineRef.current;
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!engine || !video || !canvas || !liveRef.current) return;
      const s = settingsRef.current;
      let result;
      try {
        result = engine.processFrame(video, {
          enhance: s.enhance,
          fg: s.fg,
          fit: s.fit,
          canvasWidth: canvas.width,
          canvasHeight: canvas.height,
        });
      } catch (err) {
        if (err instanceof ShaderError) setGpuError(err.message);
        return;
      }
      if (!result) return;
      rectRef.current = result.rect;
      if (result.duplicate) {
        counters.current.duplicates++;
        return;
      }
      counters.current.captured++;
      let generate = false;
      if (s.fg.enabled && result.canGenerate) {
        // Generated frames only help when the screen refreshes at least about twice as often as
        // frames arrive; on a 60 Hz screen with 60 fps they would only add delay.
        const limited = refresh.current.interval > pacer.captureInterval * 0.6;
        fgLimitedRef.current = limited;
        if (!limited) generate = engine.generate(s.fg);
      } else {
        fgLimitedRef.current = false;
      }
      pacer.arrive(now, { generate });
    },
    [pacer],
  );

  // The frame callback (requestVideoFrameCallback) and the draw loop (requestAnimationFrame).
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !live || gpuError) return;
    let raf = 0;
    let vfc = 0;
    let stopped = false;
    let lastTime = -1;

    const schedule = () => {
      if (stopped) return;
      vfc = video.requestVideoFrameCallback((now) => {
        onFrame(now);
        schedule();
      });
    };
    const hasVfc = typeof video.requestVideoFrameCallback === "function";
    if (hasVfc) schedule();

    const loop = (now: number) => {
      if (stopped) return;
      raf = requestAnimationFrame(loop);
      const r = refresh.current;
      if (r.last >= 0) {
        const gap = now - r.last;
        if (gap > 1 && gap < 200) {
          r.gaps.push(gap);
          if (r.gaps.length > 12) r.gaps.shift();
          const sorted = [...r.gaps].sort((a, b) => a - b);
          r.interval = sorted[Math.floor(sorted.length / 2)];
        }
      }
      r.last = now;
      if (!hasVfc && video.currentTime !== lastTime) {
        lastTime = video.currentTime;
        onFrame(now);
      }
      const shown = pacer.present(now);
      if (shown) {
        const engine = engineRef.current;
        const which: Shown = shown.kind === "generated" ? "generated" : "current";
        if (shown.kind === "generated") counters.current.generated++;
        engine?.present(which, rectRef.current);
        frameStats.frame(now);
      }
    };
    raf = requestAnimationFrame(loop);

    const interval = setInterval(() => {
      const c = counters.current;
      const now = performance.now();
      const dt = c.since ? (now - c.since) / 1000 : 0;
      const engine = engineRef.current;
      setStats({
        fps: frameStats.fps,
        low1: frameStats.low1,
        frameTime: frameStats.frameTime,
        captureFps: dt > 0 ? c.captured / dt : 0,
        generatedFps: dt > 0 ? c.generated / dt : 0,
        duplicatesFps: dt > 0 ? c.duplicates / dt : 0,
        gpuMs: engine?.gpuTimeMs ?? 0,
        width: engine?.outputSize.width ?? 0,
        height: engine?.outputSize.height ?? 0,
        fgLimited: fgLimitedRef.current,
      });
      counters.current = { captured: 0, generated: 0, duplicates: 0, since: now };
    }, 1000);

    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      if (hasVfc && vfc) video.cancelVideoFrameCallback?.(vfc);
      clearInterval(interval);
      setStats(EMPTY_STATS);
    };
  }, [live, gpuError, onFrame, pacer, frameStats]);

  /** The current enhanced frame as PNG bytes. */
  const screenshot = useCallback(async (): Promise<Uint8Array | null> => {
    const engine = engineRef.current;
    const video = videoRef.current;
    let width = 0;
    let height = 0;
    let draw: ((ctx: CanvasRenderingContext2D) => void) | null = null;
    const frame = engine?.readCurrent();
    if (frame) {
      width = frame.width;
      height = frame.height;
      draw = (ctx) => {
        const img = ctx.createImageData(width, height);
        img.data.set(frame.data);
        ctx.putImageData(img, 0, 0);
      };
    } else if (video && video.videoWidth) {
      width = video.videoWidth;
      height = video.videoHeight;
      draw = (ctx) => ctx.drawImage(video, 0, 0);
    }
    if (!draw) return null;
    const c = document.createElement("canvas");
    c.width = width;
    c.height = height;
    const ctx = c.getContext("2d");
    if (!ctx) return null;
    draw(ctx);
    const blob = await new Promise<Blob | null>((resolve) => c.toBlob(resolve, "image/png"));
    return blob ? new Uint8Array(await blob.arrayBuffer()) : null;
  }, []);

  /** The picture as shown (with the sound of the card when asked), for recordings. */
  const recordingStream = useCallback(
    (withAudio: boolean): MediaStream | null => {
      const canvas = canvasRef.current;
      if (!canvas || gpuError || typeof canvas.captureStream !== "function") return null;
      const out = canvas.captureStream();
      if (withAudio && audio) {
        const a = audio.recordingStream();
        a?.getAudioTracks().forEach((t) => out.addTrack(t));
      }
      return out;
    },
    [audio, gpuError],
  );

  return {
    canvasRef: canvasRef,
    videoRef: videoRef,
    gpuError,
    stats,
    lut: lutState,
    screenshot,
    recordingStream,
    /** Where the picture sits on the canvas (CSS pixels), e.g. for overlays. */
    rect: () => {
      const dpr = window.devicePixelRatio || 1;
      const r = rectRef.current;
      return { x: r.x / dpr, y: r.y / dpr, width: r.width / dpr, height: r.height / dpr };
    },
    fitRect,
  };
}
