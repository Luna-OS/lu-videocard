import type { CaptureState } from "../lib/capture";
import type { Settings } from "../lib/settings";
import { formatAudio } from "./format";
import type { RenderStats } from "./useRenderer";

const fps = (v: number) => (v > 0 ? `${Math.round(v)} fps` : "–");

/**
 * Picture and performance info in the top left corner: what the card delivers, what the
 * pipeline makes of it, and how smoothly it is shown (frames per second, 1 % low, GPU time).
 */
export function StatsOverlay({
  capture,
  stats,
  settings,
}: {
  capture: CaptureState;
  stats: RenderStats;
  settings: Settings;
}) {
  const rows: [string, string][] = [];
  if (capture.video) rows.push(["Card", capture.video.label || "Camera"]);
  if (capture.videoInfo) {
    rows.push([
      "Source",
      `${capture.videoInfo.width}×${capture.videoInfo.height} · ${fps(stats.captureFps || capture.videoInfo.frameRate)}`,
    ]);
  }
  if (stats.width && settings.enhance.enabled) {
    const parts = [`${stats.width}×${stats.height}`];
    if (
      settings.enhance.upscaler === "fsr" &&
      capture.videoInfo &&
      stats.width > capture.videoInfo.width
    ) {
      parts.push("FSR");
    }
    if (settings.enhance.sharpness > 0) parts.push("RCAS");
    if (settings.enhance.denoise > 0 || settings.enhance.temporalDenoise > 0) parts.push("NR");
    if (settings.enhance.antiAliasing === "fxaa") parts.push("FXAA");
    if (settings.enhance.hdrLook > 0) parts.push("HDR look");
    if (settings.enhance.lutPath) parts.push("LUT");
    rows.push(["Output", parts.join(" · ")]);
  }
  rows.push(["Shown", `${fps(stats.fps)} · 1 % low ${fps(stats.low1)}`]);
  if (stats.frameTime > 0) {
    rows.push([
      "Frame",
      `${stats.frameTime.toFixed(1)} ms${stats.gpuMs > 0 ? ` · GPU ${stats.gpuMs.toFixed(1)} ms` : ""}`,
    ]);
  }
  if (settings.fg.enabled) {
    const gen = stats.fgLimited
      ? "paused: the screen is too slow for twice the frame rate"
      : stats.generatedFps > 0
        ? `${Math.round(stats.generatedFps)} generated/s`
        : "warming up";
    const dup =
      stats.duplicatesFps > 0 ? ` · ${Math.round(stats.duplicatesFps)} repeats dropped/s` : "";
    rows.push(["Frame gen", `${gen}${dup}`]);
  }
  rows.push(["Sound", capture.audioInfo ? formatAudio(capture.audioInfo) || "on" : "off"]);

  return (
    <div className="lv-popover pointer-events-none absolute top-3 left-3 z-10 px-3 py-2 font-mono text-[0.6875rem] leading-5">
      {rows.map(([k, v]) => (
        <div key={k} className="flex gap-3">
          <span className="w-16 shrink-0 text-[var(--lv-text-faint)]">{k}</span>
          <span className="max-w-80 truncate">{v}</span>
        </div>
      ))}
    </div>
  );
}
