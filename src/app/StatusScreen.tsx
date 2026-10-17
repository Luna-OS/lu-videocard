import type { CaptureState } from "../lib/capture";
import { PlugIcon, RefreshIcon, SettingsIcon } from "./icons";

const TITLES: Record<string, string> = {
  idle: "Getting ready…",
  starting: "Starting the capture card…",
  "no-device": "No capture card found",
  denied: "No access to the capture card",
  busy: "The capture card is busy",
  lost: "The capture card was disconnected",
  error: "Something went wrong",
};

/** What the stage shows while there is no picture: starting, no card, busy, … */
export function StatusScreen({
  capture,
  supported,
  onRetry,
  onSettings,
}: {
  capture: CaptureState;
  supported: boolean;
  onRetry: () => void;
  onSettings: () => void;
}) {
  const waiting = capture.status === "idle" || capture.status === "starting";
  const title = supported ? TITLES[capture.status] : "Cameras aren't available here";
  const text = supported
    ? capture.error
    : "This browser can't open cameras. Use the Lu Videocard app.";

  return (
    <div className="relative z-10 flex h-full items-center justify-center p-6">
      <div className="lv-glass flex w-[min(460px,100%)] flex-col items-center gap-4 px-8 py-9 text-center">
        <img
          src="./lu-videocard-logo.svg"
          alt=""
          width={88}
          height={88}
          draggable={false}
          className={waiting ? "opacity-90" : ""}
        />
        <div role="status" aria-live="polite" className="flex flex-col gap-2">
          <h1 className="lv-title m-0 text-xl font-semibold tracking-tight">{title}</h1>
          {text && (
            <p className="m-0 text-[0.8125rem] leading-relaxed text-[var(--lv-text-muted)]">
              {text}
            </p>
          )}
          {waiting && (
            <div className="mt-1 flex justify-center">
              <span className="lv-spin inline-block h-5 w-5 rounded-full border-2 border-[var(--lv-border-strong)] border-t-[var(--lv-accent)]" />
            </div>
          )}
        </div>
        {(capture.status === "no-device" || capture.status === "lost") && (
          <p className="m-0 flex items-center gap-2 text-xs text-[var(--lv-text-faint)]">
            <PlugIcon size={14} /> Use a USB 3 port (blue) for 1080p · 60 fps.
          </p>
        )}
        {!waiting && supported && (
          <div className="mt-1 flex flex-wrap justify-center gap-2">
            <button type="button" className="lv-btn lv-btn-primary" onClick={onRetry}>
              <RefreshIcon size={16} /> Try again
            </button>
            <button type="button" className="lv-btn lv-btn-ghost" onClick={onSettings}>
              <SettingsIcon size={16} /> Settings
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
