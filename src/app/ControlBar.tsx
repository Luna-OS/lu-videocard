import type { CSSProperties } from "react";
import type { AudioEngine } from "../lib/audio";
import { FIT_LABELS, type Fit } from "../lib/settings";
import {
  CameraIcon,
  ExitFullscreenIcon,
  FillIcon,
  FitIcon,
  FullscreenIcon,
  MutedIcon,
  SettingsIcon,
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
  onVolume,
  onMute,
  onFit,
  onScreenshot,
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
  onVolume: (v: number) => void;
  onMute: () => void;
  onFit: () => void;
  onScreenshot: () => void;
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
          aria-label="Screenshot (Ctrl+S)"
          title="Screenshot (Ctrl+S)"
        >
          <CameraIcon />
        </button>
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
