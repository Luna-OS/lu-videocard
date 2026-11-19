import type { CSSProperties } from "react";
import type { AudioEngine } from "../lib/audio";
import { FIT_LABELS, type Fit } from "../lib/settings";
import {
  CameraIcon,
  ExitFullscreenIcon,
  FillIcon,
  FitIcon,
  FramesIcon,
  FullscreenIcon,
  MutedIcon,
  RecordIcon,
  ReplayIcon,
  SettingsIcon,
  SparkleIcon,
  StopIcon,
  StreamIcon,
  StretchIcon,
  VolumeIcon,
  VolumeLowIcon,
} from "./icons";
import { LevelMeter } from "./LevelMeter";

const FitGlyph = ({ fit }: { fit: Fit }) =>
  fit === "contain" ? <FitIcon /> : fit === "cover" ? <FillIcon /> : <StretchIcon />;

/** The floating bar over the picture: sound, picture fit, screenshot, stream mode, fullscreen. */
export function ControlBar({
  hidden,
  panelOpen,
  engine,
  hasAudio,
  volume,
  muted,
  fit,
  fullscreen,
  streamMode,
  info,
  enhanceOn,
  fgOn,
  recording,
  recordBusy,
  replaySeconds,
  onVolume,
  onMute,
  onFit,
  onScreenshot,
  onEnhance,
  onFg,
  onRecord,
  onReplay,
  onStreamMode,
  onFullscreen,
  onSettings,
  onHover,
}: {
  hidden: boolean;
  /** The settings panel covers the right side; the bar moves out of its way. */
  panelOpen: boolean;
  engine: AudioEngine | null;
  hasAudio: boolean;
  volume: number;
  muted: boolean;
  fit: Fit;
  fullscreen: boolean;
  streamMode: boolean;
  info: string;
  enhanceOn: boolean;
  fgOn: boolean;
  recording: boolean;
  recordBusy: boolean;
  /** Seconds in the replay buffer; 0 when it is off. */
  replaySeconds: number;
  onVolume: (v: number) => void;
  onMute: () => void;
  onFit: () => void;
  onScreenshot: () => void;
  onEnhance: () => void;
  onFg: () => void;
  onRecord: () => void;
  onReplay: () => void;
  onStreamMode: () => void;
  onFullscreen: () => void;
  onSettings: () => void;
  onHover: (hovering: boolean) => void;
}) {
  const silent = muted || volume === 0;
  const pct = Math.round(volume * 100);
  return (
    <div
      className="lv-overlay lv-overlay-bottom absolute inset-x-0 bottom-0 z-20 flex justify-center p-4"
      data-hidden={hidden}
      aria-hidden={hidden}
      inert={hidden}
      style={panelOpen ? { paddingRight: "min(396px, 100%)" } : undefined}
    >
      <div
        role="toolbar"
        aria-label="Controls"
        className="lv-controls flex max-w-full items-center gap-1.5 px-2 py-1.5"
        onMouseEnter={() => onHover(true)}
        onMouseLeave={() => onHover(false)}
      >
        <button
          type="button"
          className="lv-icon-btn"
          onClick={onMute}
          disabled={!hasAudio}
          aria-pressed={muted}
          aria-label={muted ? "Unmute (M)" : "Mute (M)"}
          title={muted ? "Unmute (M)" : "Mute (M)"}
        >
          {silent ? <MutedIcon /> : volume < 0.5 ? <VolumeLowIcon /> : <VolumeIcon />}
        </button>
        <div className="flex w-28 flex-col justify-center gap-0.5">
          <input
            type="range"
            className="lv-range w-full"
            min={0}
            max={100}
            step={1}
            value={pct}
            disabled={!hasAudio}
            onChange={(e) => onVolume(Number(e.target.value) / 100)}
            aria-label="Volume"
            aria-valuetext={`${pct} %`}
            title={`Volume ${pct} %`}
            style={{ "--lv-fill": `${pct}%` } as CSSProperties}
          />
          <LevelMeter engine={engine} active={hasAudio && !hidden} />
        </div>

        {info && (
          <span className="mx-2 hidden font-mono text-xs whitespace-nowrap text-[var(--lv-text-muted)] sm:inline">
            {info}
          </span>
        )}

        <span className="mx-1 h-5 w-px bg-[var(--lv-border)]" aria-hidden="true" />

        <button
          type="button"
          className="lv-icon-btn"
          onClick={onFit}
          aria-label={`Picture: ${FIT_LABELS[fit]}`}
          title={`${FIT_LABELS[fit]} – click to change`}
        >
          <FitGlyph fit={fit} />
        </button>
        <button
          type="button"
          className="lv-icon-btn"
          onClick={onScreenshot}
          aria-label="Screenshot (F7)"
          title="Screenshot (F7)"
        >
          <CameraIcon />
        </button>
        <button
          type="button"
          className={`lv-icon-btn ${recording ? "lv-rec-on" : ""}`}
          onClick={onRecord}
          disabled={recordBusy}
          aria-pressed={recording}
          aria-label={recording ? "Stop recording (F8)" : "Record (F8)"}
          title={recording ? "Stop recording (F8)" : "Record (F8)"}
        >
          {recording ? <StopIcon /> : <RecordIcon />}
        </button>
        {replaySeconds > 0 && (
          <button
            type="button"
            className="lv-icon-btn"
            onClick={onReplay}
            disabled={recordBusy}
            aria-label={`Save the last ${replaySeconds} s (F9)`}
            title={`Save the last ${replaySeconds} s (F9)`}
          >
            <ReplayIcon />
          </button>
        )}

        <span className="mx-1 h-5 w-px bg-[var(--lv-border)]" aria-hidden="true" />

        <button
          type="button"
          className="lv-icon-btn"
          onClick={onEnhance}
          aria-pressed={enhanceOn}
          aria-label={enhanceOn ? "Enhancement on (E)" : "Enhancement off (E)"}
          title={enhanceOn ? "Enhancement on (E)" : "Enhancement off (E)"}
        >
          <SparkleIcon />
        </button>
        <button
          type="button"
          className="lv-icon-btn"
          onClick={onFg}
          aria-pressed={fgOn}
          aria-label={fgOn ? "Frame generation on (G)" : "Frame generation off (G)"}
          title={fgOn ? "Frame generation on (G)" : "Frame generation off (G)"}
        >
          <FramesIcon />
        </button>

        <span className="mx-1 h-5 w-px bg-[var(--lv-border)]" aria-hidden="true" />
        {!fullscreen && (
          <button
            type="button"
            className="lv-icon-btn"
            onClick={onStreamMode}
            aria-pressed={streamMode}
            aria-label="Stream mode – only the picture in the window (C)"
            title="Stream mode – only the picture in the window (C)"
          >
            <StreamIcon />
          </button>
        )}
        <button
          type="button"
          className="lv-icon-btn"
          onClick={onFullscreen}
          aria-label={fullscreen ? "Leave fullscreen (Esc)" : "Fullscreen (F)"}
          title={fullscreen ? "Leave fullscreen (Esc)" : "Fullscreen (F)"}
        >
          {fullscreen ? <ExitFullscreenIcon /> : <FullscreenIcon />}
        </button>
        <button
          type="button"
          className="lv-icon-btn"
          onClick={onSettings}
          aria-label="Settings"
          title="Settings (Ctrl+,)"
        >
          <SettingsIcon />
        </button>
      </div>
    </div>
  );
}
