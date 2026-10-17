import { useEffect, useId, useRef, type ReactNode } from "react";
import { AudioEngine } from "../lib/audio";
import { getBridge, type UpdateStatus } from "../lib/bridge";
import type { CaptureState } from "../lib/capture";
import { AUDIO_AUTO, AUDIO_OFF, QUALITIES, deviceLabel } from "../lib/devices";
import { FIT_LABELS, type Fit, type Settings } from "../lib/settings";
import type { ThemeChoice } from "../theme/useTheme";
import { CloseIcon, DownloadIcon, RefreshIcon } from "./icons";
import { formatAudio, formatVideo } from "./format";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3 border-b border-[var(--lv-border)] px-5 py-4 last:border-b-0">
      <h3 className="lv-eyebrow m-0">{title}</h3>
      {children}
    </section>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: ReactNode;
  children: (id: string) => ReactNode;
}) {
  const id = useId();
  return (
    <div>
      <label className="lv-label" htmlFor={id}>
        {label}
      </label>
      {children(id)}
      {hint && <p className="mt-1.5 mb-0 text-xs text-[var(--lv-text-muted)]">{hint}</p>}
    </div>
  );
}

function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (on: boolean) => void;
}) {
  const id = useId();
  return (
    <div className="flex items-start justify-between gap-4">
      <label htmlFor={id} className="cursor-pointer">
        <span className="block text-[0.8125rem] font-medium">{label}</span>
        {hint && <span className="block text-xs text-[var(--lv-text-muted)]">{hint}</span>}
      </label>
      <input
        id={id}
        type="checkbox"
        role="switch"
        className="lv-switch mt-0.5"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
    </div>
  );
}

function updateLine(s: UpdateStatus | null): string {
  if (!s) return "";
  switch (s.state) {
    case "checking":
      return "Looking for a new version…";
    case "available":
      return `Version ${s.version} is available.`;
    case "none":
      return "You have the newest version.";
    case "downloading":
      return `Downloading version ${s.version ?? ""}… ${s.percent ?? 0} %`;
    case "ready":
      return `Version ${s.version} is ready – restart to install it.`;
    case "error":
      return `The update didn't work: ${s.error ?? "unknown error"}`;
    case "unsupported":
      return s.error ?? "Updates work in the installed app.";
    default:
      return "";
  }
}

const SHORTCUTS: [string, string][] = [
  ["F / F11 / double-click", "Fullscreen"],
  ["Esc", "Leave fullscreen or stream mode"],
  ["C", "Stream mode (only the picture)"],
  ["M", "Mute"],
  ["↑ / ↓", "Volume"],
  ["Ctrl+S", "Screenshot"],
  ["I", "Picture and sound info"],
  ["R", "Restart the capture card"],
  ["Ctrl+,", "Settings"],
];

export function SettingsPanel({
  settings,
  update,
  capture,
  outputFailed,
  updates,
  version,
  onRestart,
  onClose,
}: {
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
  capture: CaptureState;
  outputFailed: boolean;
  updates: {
    status: UpdateStatus | null;
    check: () => void;
    download: () => void;
    install: () => void;
  };
  version: string;
  onRestart: () => void;
  onClose: () => void;
}) {
  const bridge = getBridge();
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => closeRef.current?.focus(), []);

  const { videos, inputs, outputs } = capture;
  const u = updates.status;
  const busyUpdate = u?.state === "checking" || u?.state === "downloading";

  return (
    <aside
      className="lv-panel absolute top-0 right-0 bottom-0 z-30 flex w-[min(380px,100%)] flex-col"
      aria-label="Settings"
    >
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-[var(--lv-border)] pr-2 pl-5">
        <h2 className="m-0 text-[0.9375rem] font-semibold">Settings</h2>
        <button
          ref={closeRef}
          type="button"
          className="lv-icon-btn"
          onClick={onClose}
          aria-label="Close settings (Esc)"
          title="Close (Esc)"
        >
          <CloseIcon />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <Section title="Picture">
          <Field
            label="Capture card"
            hint={capture.videoInfo ? `Running at ${formatVideo(capture.videoInfo)}` : undefined}
          >
            {(id) => (
              <select
                id={id}
                className="lv-input w-full"
                value={settings.videoDeviceId}
                onChange={(e) => update({ videoDeviceId: e.target.value })}
              >
                <option value="">Automatic (finds the capture card)</option>
                {videos.map((d, i) => (
                  <option key={d.deviceId} value={d.deviceId}>
                    {deviceLabel(d, i, "Camera")}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field
            label="Quality"
            hint="The card delivers the closest mode it has. 1080p · 60 fps is best for games."
          >
            {(id) => (
              <select
                id={id}
                className="lv-input w-full"
                value={settings.quality}
                onChange={(e) => update({ quality: e.target.value })}
              >
                {QUALITIES.map((q) => (
                  <option key={q.id} value={q.id}>
                    {q.label}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <div role="radiogroup" aria-label="Picture fit" className="grid grid-cols-3 gap-2">
            {(Object.keys(FIT_LABELS) as Fit[]).map((fit) => {
              const [title, hint] = FIT_LABELS[fit].split(" – ");
              return (
                <button
                  key={fit}
                  type="button"
                  role="radio"
                  aria-checked={settings.fit === fit}
                  className="lv-option"
                  onClick={() => update({ fit })}
                >
                  <span className="lv-option-title">{title}</span>
                  <span className="lv-option-hint">{hint}</span>
                </button>
              );
            })}
          </div>
          <Toggle
            label="Show picture and sound info"
            hint="Resolution, frame rate and sound format in a corner (I)."
            checked={settings.showStats}
            onChange={(showStats) => update({ showStats })}
          />
          <button type="button" className="lv-btn lv-btn-ghost self-start" onClick={onRestart}>
            <RefreshIcon size={16} /> Restart the capture card
          </button>
        </Section>

        <Section title="Sound">
          <Field
            label="Sound input"
            hint={
              capture.audioError ||
              (capture.audioInfo ? `Running at ${formatAudio(capture.audioInfo)}` : undefined)
            }
          >
            {(id) => (
              <select
                id={id}
                className="lv-input w-full"
                value={settings.audioDeviceId}
                onChange={(e) => update({ audioDeviceId: e.target.value })}
              >
                <option value={AUDIO_AUTO}>Automatic (the capture card's own sound)</option>
                {inputs.map((d, i) => (
                  <option key={d.deviceId} value={d.deviceId}>
                    {deviceLabel(d, i, "Input")}
                  </option>
                ))}
                <option value={AUDIO_OFF}>No sound</option>
              </select>
            )}
          </Field>
          {AudioEngine.canPickOutput && (
            <Field
              label="Play on"
              hint={
                outputFailed ? "This speaker can't be used; playing on the default." : undefined
              }
            >
              {(id) => (
                <select
                  id={id}
                  className="lv-input w-full"
                  value={settings.outputDeviceId}
                  onChange={(e) => update({ outputDeviceId: e.target.value })}
                >
                  <option value="">System default</option>
                  {outputs.map((d, i) => (
                    <option key={d.deviceId} value={d.deviceId}>
                      {deviceLabel(d, i, "Output")}
                    </option>
                  ))}
                </select>
              )}
            </Field>
          )}
          <p className="m-0 text-xs text-[var(--lv-text-muted)]">
            The sound is played untouched: no echo cancellation, no noise suppression and no
            automatic volume, in stereo.
          </p>
        </Section>

        <Section title="Sharing on Discord">
          <p className="m-0 text-[0.8125rem] leading-relaxed text-[var(--lv-text-muted)]">
            Press <kbd className="lv-kbd">F</kbd> for fullscreen or <kbd className="lv-kbd">C</kbd>{" "}
            for stream mode: then the window is nothing but the picture – no title bar, no buttons,
            no borders. In Discord, share the window “Lu Videocard” (or your screen) and switch on
            sound. The controls only appear while you move the mouse.
          </p>
        </Section>

        <Section title="Window">
          <Toggle
            label="Keep the screen on"
            hint="The screen doesn't go dark while the picture runs."
            checked={settings.keepAwake}
            onChange={(keepAwake) => update({ keepAwake })}
          />
          {bridge && (
            <Toggle
              label="Always on top"
              checked={settings.alwaysOnTop}
              onChange={(alwaysOnTop) => update({ alwaysOnTop })}
            />
          )}
          <div role="radiogroup" aria-label="Theme" className="grid grid-cols-3 gap-2">
            {(
              [
                ["dark", "Night"],
                ["light", "Day"],
                ["system", "System"],
              ] as [ThemeChoice, string][]
            ).map(([theme, label]) => (
              <button
                key={theme}
                type="button"
                role="radio"
                aria-checked={settings.theme === theme}
                className="lv-option items-center"
                onClick={() => update({ theme })}
              >
                <span className="lv-option-title">{label}</span>
              </button>
            ))}
          </div>
        </Section>

        <Section title="Updates">
          <p className="m-0 text-[0.8125rem]">
            Lu Videocard {version || "…"}
            {u && updateLine(u) && (
              <span className="block text-xs text-[var(--lv-text-muted)]" aria-live="polite">
                {updateLine(u)}
              </span>
            )}
          </p>
          {bridge && (
            <div className="flex flex-wrap gap-2">
              {u?.state === "ready" ? (
                <button type="button" className="lv-btn lv-btn-primary" onClick={updates.install}>
                  Restart and update
                </button>
              ) : u?.state === "available" || (u?.state === "error" && u.version) ? (
                <button type="button" className="lv-btn lv-btn-primary" onClick={updates.download}>
                  <DownloadIcon size={16} /> Download {u.version}
                </button>
              ) : (
                <button
                  type="button"
                  className="lv-btn lv-btn-ghost"
                  onClick={updates.check}
                  disabled={busyUpdate || u?.state === "unsupported"}
                >
                  <RefreshIcon size={16} /> Check for updates
                </button>
              )}
              <button
                type="button"
                className="lv-btn lv-btn-ghost"
                onClick={() => void bridge.openRepo("releases")}
              >
                Release notes
              </button>
            </div>
          )}
          <Toggle
            label="Look for updates at start"
            checked={settings.autoUpdate}
            onChange={(autoUpdate) => update({ autoUpdate })}
          />
        </Section>

        <Section title="Keyboard">
          <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[0.8125rem]">
            {SHORTCUTS.map(([keys, what]) => (
              <div key={keys} className="contents">
                <dt className="font-mono text-xs text-[var(--lv-accent)]">{keys}</dt>
                <dd className="m-0 text-[var(--lv-text-muted)]">{what}</dd>
              </div>
            ))}
          </dl>
        </Section>
      </div>
    </aside>
  );
}
