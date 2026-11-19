import { useId, type ReactNode } from "react";
import { getBridge } from "../lib/bridge";
import {
  PRESETS,
  applyPreset,
  type ColourSettings,
  type EnhanceSettings,
  type FgQuality,
  type FgSettings,
  type RecordingSettings,
} from "../lib/enhance";
import { FolderIcon } from "./icons";

/** A labelled slider with its value next to it. */
export function Slider({
  label,
  value,
  min,
  max,
  step,
  format,
  hint,
  onChange,
  disabled,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format?: (v: number) => string;
  hint?: string;
  onChange: (v: number) => void;
  disabled?: boolean;
}) {
  const id = useId();
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-[0.8125rem] font-medium">
          {label}
        </label>
        <output htmlFor={id} className="font-mono text-xs text-[var(--lv-text-muted)]">
          {format ? format(value) : value}
        </output>
      </div>
      <input
        id={id}
        type="range"
        className="lv-range w-full"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        onDoubleClick={() => onChange(min + (max - min) / 2)}
        style={{ "--lv-fill": `${pct}%` } as React.CSSProperties}
      />
      {hint && <p className="mt-1 mb-0 text-xs text-[var(--lv-text-muted)]">{hint}</p>}
    </div>
  );
}

export function Toggle({
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

export function Options<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { id: T; label: string; hint?: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-col gap-1.5">
      <span className="lv-label mb-0">{label}</span>
      <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${options.length}, 1fr)` }}>
        {options.map((o) => (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={value === o.id}
            className="lv-option"
            onClick={() => onChange(o.id)}
          >
            <span className="lv-option-title">{o.label}</span>
            {o.hint && <span className="lv-option-hint">{o.hint}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}

const pct = (v: number) => `${Math.round(v * 100)} %`;
const times = (v: number) => `${v.toFixed(2)}×`;
const signed = (v: number) => (v > 0 ? `+${Math.round(v * 100)}` : `${Math.round(v * 100)}`);

export function EnhanceSection({
  enhance,
  lut,
  onChange,
  children,
}: {
  enhance: EnhanceSettings;
  lut: { name: string; error: string };
  onChange: (next: EnhanceSettings) => void;
  children?: ReactNode;
}) {
  const bridge = getBridge();
  const set = (patch: Partial<EnhanceSettings>) => onChange({ ...enhance, ...patch, preset: "" });
  const setColour = (patch: Partial<ColourSettings>) =>
    set({ colour: { ...enhance.colour, ...patch } });

  const pickLut = async () => {
    if (!bridge) return;
    const file = await bridge.pickLut();
    if (file) onChange({ ...enhance, lutPath: file });
  };

  return (
    <>
      <Toggle
        label="Enhance the picture"
        hint="Off shows the capture card's picture exactly as it comes (E)."
        checked={enhance.enabled}
        onChange={(enabled) => onChange({ ...enhance, enabled })}
      />
      {children}
      <div role="radiogroup" aria-label="Preset" className="grid grid-cols-5 gap-1.5">
        {PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            role="radio"
            aria-checked={enhance.preset === p.id}
            className="lv-option items-center px-1"
            title={p.hint}
            onClick={() => onChange(applyPreset(enhance, p))}
          >
            <span className="lv-option-title">{p.label}</span>
          </button>
        ))}
      </div>
      {enhance.preset === "" && (
        <p className="m-0 -mt-1 text-xs text-[var(--lv-text-muted)]">Custom settings.</p>
      )}
      <Options
        label="Upscaling"
        value={enhance.upscaler}
        options={[
          { id: "off", label: "Off", hint: "plain scaling" },
          { id: "fsr", label: "FSR", hint: "AMD FidelityFX edge-adaptive" },
        ]}
        onChange={(upscaler) => set({ upscaler })}
      />
      <Slider
        label="Sharpness"
        value={enhance.sharpness}
        min={0}
        max={1}
        step={0.05}
        format={pct}
        onChange={(sharpness) => set({ sharpness })}
      />
      <Slider
        label="Denoise"
        value={enhance.denoise}
        min={0}
        max={1}
        step={0.05}
        format={pct}
        onChange={(denoise) => set({ denoise })}
      />
      <Slider
        label="Temporal denoise"
        value={enhance.temporalDenoise}
        min={0}
        max={1}
        step={0.05}
        format={pct}
        hint="Steadies still areas over time; high values can smear fast motion."
        onChange={(temporalDenoise) => set({ temporalDenoise })}
      />
      <Options
        label="Anti-aliasing"
        value={enhance.antiAliasing}
        options={[
          { id: "off", label: "Off" },
          { id: "fxaa", label: "FXAA", hint: "smooths jagged edges" },
        ]}
        onChange={(antiAliasing) => set({ antiAliasing })}
      />
      <Slider
        label="HDR look"
        value={enhance.hdrLook}
        min={0}
        max={1}
        step={0.05}
        format={pct}
        hint="Local contrast, deeper shadows and brighter lights."
        onChange={(hdrLook) => set({ hdrLook })}
      />

      <h4 className="lv-eyebrow m-0 mt-1">Colour</h4>
      <Slider
        label="Brightness"
        value={enhance.colour.brightness}
        min={-1}
        max={1}
        step={0.02}
        format={signed}
        onChange={(brightness) => setColour({ brightness })}
      />
      <Slider
        label="Contrast"
        value={enhance.colour.contrast}
        min={0}
        max={2}
        step={0.02}
        format={times}
        onChange={(contrast) => setColour({ contrast })}
      />
      <Slider
        label="Saturation"
        value={enhance.colour.saturation}
        min={0}
        max={2}
        step={0.02}
        format={times}
        onChange={(saturation) => setColour({ saturation })}
      />
      <Slider
        label="Vibrance"
        value={enhance.colour.vibrance}
        min={0}
        max={2}
        step={0.02}
        format={times}
        hint="Boosts dull colours more than strong ones."
        onChange={(vibrance) => setColour({ vibrance })}
      />
      <Slider
        label="Gamma"
        value={enhance.colour.gamma}
        min={0.5}
        max={2}
        step={0.02}
        format={(v) => v.toFixed(2)}
        onChange={(gamma) => setColour({ gamma })}
      />
      <Slider
        label="Temperature"
        value={enhance.colour.temperature}
        min={-1}
        max={1}
        step={0.02}
        format={(v) => (v === 0 ? "neutral" : v > 0 ? `warm ${signed(v)}` : `cool ${signed(v)}`)}
        onChange={(temperature) => setColour({ temperature })}
      />
      <Slider
        label="Tint"
        value={enhance.colour.tint}
        min={-1}
        max={1}
        step={0.02}
        format={(v) =>
          v === 0 ? "neutral" : v > 0 ? `magenta ${signed(v)}` : `green ${signed(v)}`
        }
        onChange={(tint) => setColour({ tint })}
      />

      <h4 className="lv-eyebrow m-0 mt-1">LUT</h4>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="lv-btn lv-btn-ghost" onClick={() => void pickLut()}>
          <FolderIcon size={16} /> {enhance.lutPath ? "Change LUT…" : "Load a .cube LUT…"}
        </button>
        {enhance.lutPath && (
          <button
            type="button"
            className="lv-btn lv-btn-ghost"
            onClick={() => onChange({ ...enhance, lutPath: "" })}
          >
            Remove
          </button>
        )}
      </div>
      {enhance.lutPath && (
        <p className="m-0 text-xs text-[var(--lv-text-muted)]">
          {lut.error ? (
            <span className="text-[var(--lv-danger)]">{lut.error}</span>
          ) : (
            <>Using {lut.name || enhance.lutPath}</>
          )}
        </p>
      )}
      {enhance.lutPath && !lut.error && (
        <Slider
          label="LUT strength"
          value={enhance.lutStrength}
          min={0}
          max={1}
          step={0.05}
          format={pct}
          onChange={(lutStrength) => onChange({ ...enhance, lutStrength })}
        />
      )}
    </>
  );
}

export function FgSection({
  fg,
  onChange,
}: {
  fg: FgSettings;
  onChange: (next: FgSettings) => void;
}) {
  return (
    <>
      <Toggle
        label="Frame generation"
        hint="Doubles the frame rate with a generated frame between every two real ones (G). Adds about half a frame of delay; needs a screen with twice the capture rate (120 Hz for 60 fps)."
        checked={fg.enabled}
        onChange={(enabled) => onChange({ ...fg, enabled })}
      />
      <Options<FgQuality>
        label="Quality"
        value={fg.quality}
        options={[
          { id: "fast", label: "Fast", hint: "coarse motion" },
          { id: "balanced", label: "Balanced", hint: "8 px motion" },
          { id: "quality", label: "Quality", hint: "wider search" },
        ]}
        onChange={(quality) => onChange({ ...fg, quality })}
      />
      <Slider
        label="Protection"
        value={fg.protection}
        min={0}
        max={1}
        step={0.05}
        format={pct}
        hint="Where the motion is uncertain, higher protection blends the two frames instead (fewer artefacts, a little more blur)."
        onChange={(protection) => onChange({ ...fg, protection })}
      />
      <Toggle
        label="Drop repeated frames"
        hint="A 30 fps game on a 60 fps capture card arrives as pairs of equal frames; dropping the repeats lets frame generation make real in-between frames."
        checked={fg.dedup}
        onChange={(dedup) => onChange({ ...fg, dedup })}
      />
    </>
  );
}

export function RecordingSection({
  recording,
  onChange,
}: {
  recording: RecordingSettings;
  onChange: (next: RecordingSettings) => void;
}) {
  const bridge = getBridge();
  return (
    <>
      <p className="m-0 text-[0.8125rem] leading-relaxed text-[var(--lv-text-muted)]">
        Recordings capture the picture as shown – enhanced, and with generated frames when frame
        generation is on – and go to Videos › Lu Videocard. <kbd className="lv-kbd">F8</kbd> starts
        and stops, <kbd className="lv-kbd">F9</kbd> saves the replay buffer.
      </p>
      <Options
        label="Format"
        value={recording.format}
        options={[
          { id: "auto", label: "Auto", hint: "MP4 where it can" },
          { id: "mp4", label: "MP4", hint: "H.264" },
          { id: "webm", label: "WebM", hint: "VP9" },
        ]}
        onChange={(format) => onChange({ ...recording, format })}
      />
      <Slider
        label="Bitrate"
        value={recording.bitrateMbps}
        min={2}
        max={80}
        step={1}
        format={(v) => `${v} Mbit/s`}
        hint="16 for 1080p, 40 or more for 4K."
        onChange={(bitrateMbps) => onChange({ ...recording, bitrateMbps })}
      />
      <Toggle
        label="Record the sound"
        hint="The capture card's sound, unaffected by the volume and mute."
        checked={recording.withAudio}
        onChange={(withAudio) => onChange({ ...recording, withAudio })}
      />
      <Options
        label="Replay buffer"
        value={String(recording.replaySeconds) as "0" | "15" | "30" | "60" | "120"}
        options={[
          { id: "0", label: "Off" },
          { id: "15", label: "15 s" },
          { id: "30", label: "30 s" },
          { id: "60", label: "60 s" },
          { id: "120", label: "2 min" },
        ]}
        onChange={(v) => onChange({ ...recording, replaySeconds: Number(v) })}
      />
      {bridge && (
        <button
          type="button"
          className="lv-btn lv-btn-ghost self-start"
          onClick={() => void bridge.openRecordings()}
        >
          <FolderIcon size={16} /> Open the recordings folder
        </button>
      )}
    </>
  );
}
