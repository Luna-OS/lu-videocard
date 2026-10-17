import type { AudioInfo, VideoInfo } from "../lib/capture";

/** "1920×1080 · 60 fps" (59.94 stays 59.94). */
export function formatVideo(v: VideoInfo): string {
  const fps = Number.isInteger(v.frameRate) ? v.frameRate : v.frameRate.toFixed(2);
  return `${v.width}×${v.height} · ${fps} fps`;
}

/** "48 kHz · stereo". */
export function formatAudio(a: AudioInfo): string {
  const khz = a.sampleRate ? `${Math.round(a.sampleRate / 100) / 10} kHz` : "";
  const ch =
    a.channels === 1 ? "mono" : a.channels === 2 ? "stereo" : a.channels ? `${a.channels} ch` : "";
  return [khz, ch].filter(Boolean).join(" · ");
}
