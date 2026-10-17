import { useEffect, useRef } from "react";
import type { AudioEngine } from "../lib/audio";

/**
 * The live sound level of the capture card. It reads the analyser every frame and writes the
 * level straight into a CSS variable, so the meter moves without re-rendering React.
 */
export function LevelMeter({
  engine,
  active,
  className = "",
}: {
  engine: AudioEngine | null;
  active: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!engine || !active) {
      el.style.setProperty("--lv-level", "0");
      return;
    }
    let shown = 0;
    let frame = requestAnimationFrame(function tick() {
      const level = engine.level();
      // Up at once, down slowly – like a real peak meter.
      shown = level > shown ? level : Math.max(level, shown - 0.025);
      el.style.setProperty("--lv-level", shown.toFixed(3));
      frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  }, [engine, active]);

  return (
    <div ref={ref} className={`lv-level ${className}`} aria-hidden="true">
      <span />
    </div>
  );
}
