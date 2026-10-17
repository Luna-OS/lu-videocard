import { useEffect, useState, type RefObject } from "react";
import type { CaptureState } from "../lib/capture";
import { formatAudio } from "./format";

/**
 * Picture and sound info in the top left corner: what the card delivers and the frames per second
 * that really arrive on screen (counted with requestVideoFrameCallback).
 */
export function StatsOverlay({
  video,
  capture,
}: {
  video: RefObject<HTMLVideoElement | null>;
  capture: CaptureState;
}) {
  const [fps, setFps] = useState<number | null>(null);
  const [size, setSize] = useState("");

  useEffect(() => {
    const el = video.current;
    if (!el?.requestVideoFrameCallback) return;
    let frames = 0;
    let since = performance.now();
    let id = el.requestVideoFrameCallback(function onFrame() {
      frames++;
      const now = performance.now();
      if (now - since >= 1000) {
        setFps(Math.round((frames * 1000) / (now - since)));
        setSize(`${el.videoWidth}×${el.videoHeight}`);
        frames = 0;
        since = now;
      }
      id = el.requestVideoFrameCallback(onFrame);
    });
    return () => el.cancelVideoFrameCallback?.(id);
  }, [video, capture.stream]);

  const rows: [string, string][] = [];
  if (capture.video) rows.push(["Card", capture.video.label || "Camera"]);
  if (size) rows.push(["Picture", size]);
  if (capture.videoInfo) rows.push(["Mode", `${capture.videoInfo.frameRate} fps`]);
  if (fps !== null) rows.push(["Shown", `${fps} fps`]);
  rows.push(["Sound", capture.audioInfo ? formatAudio(capture.audioInfo) || "on" : "off"]);

  return (
    <div className="lv-popover pointer-events-none absolute top-3 left-3 z-10 px-3 py-2 font-mono text-[0.6875rem] leading-5">
      {rows.map(([k, v]) => (
        <div key={k} className="flex gap-3">
          <span className="w-14 text-[var(--lv-text-faint)]">{k}</span>
          <span className="max-w-64 truncate">{v}</span>
        </div>
      ))}
    </div>
  );
}
