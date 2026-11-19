/**
 * The picture enhancement settings: what the GPU pipeline (src/lib/gl) does to every frame, and
 * the frame generation and recording settings next to it. Everything here is plain data that is
 * stored with the other settings; the shaders read it every frame.
 */

export type Upscaler = "off" | "fsr";
export type AntiAliasing = "off" | "fxaa";
export type FgQuality = "fast" | "balanced" | "quality";
export type RecordingFormat = "auto" | "mp4" | "webm";

export interface ColourSettings {
  /** -1..1, 0 = unchanged */
  brightness: number;
  /** 0..2, 1 = unchanged */
  contrast: number;
  /** 0..2, 1 = unchanged */
  saturation: number;
  /** 0..2, 1 = unchanged; only boosts dull colours */
  vibrance: number;
  /** 0.5..2, 1 = unchanged */
  gamma: number;
  /** -1..1 (cold .. warm), 0 = unchanged */
  temperature: number;
  /** -1..1 (green .. magenta), 0 = unchanged */
  tint: number;
}

export interface EnhanceSettings {
  /** Master switch: off shows the capture card's picture untouched. */
  enabled: boolean;
  /** The preset that was picked last, "" after a manual change. */
  preset: string;
  upscaler: Upscaler;
  /** 0..1 (RCAS): 0 = off. */
  sharpness: number;
  /** 0..1 spatial (bilateral) denoise strength. */
  denoise: number;
  /** 0..1 temporal denoise strength (blends with the last frame where nothing moves). */
  temporalDenoise: number;
  antiAliasing: AntiAliasing;
  /** 0..1: local contrast, deeper shadows and recovered highlights ("HDR look"). */
  hdrLook: number;
  colour: ColourSettings;
  /** Path of a .cube LUT file, "" for none. */
  lutPath: string;
  /** 0..1 how much of the LUT is applied. */
  lutStrength: number;
}

export interface FgSettings {
  enabled: boolean;
  quality: FgQuality;
  /** Drop frames the capture card repeats, so a 30 fps source is paced as 30 and doubled by FG. */
  dedup: boolean;
  /** 0..1 how strongly uncertain motion falls back to a plain blend (less artefacts, more blur). */
  protection: number;
}

export interface RecordingSettings {
  format: RecordingFormat;
  /** Megabits per second. */
  bitrateMbps: number;
  /** Seconds the replay buffer keeps; 0 switches the buffer off. */
  replaySeconds: number;
  /** Record the capture card's sound along with the picture. */
  withAudio: boolean;
}

export const DEFAULT_COLOUR: ColourSettings = {
  brightness: 0,
  contrast: 1,
  saturation: 1,
  vibrance: 1,
  gamma: 1,
  temperature: 0,
  tint: 0,
};

export const DEFAULT_ENHANCE: EnhanceSettings = {
  enabled: true,
  preset: "clean",
  upscaler: "fsr",
  sharpness: 0.35,
  denoise: 0.15,
  temporalDenoise: 0.25,
  antiAliasing: "off",
  hdrLook: 0,
  colour: { ...DEFAULT_COLOUR },
  lutPath: "",
  lutStrength: 1,
};

export const DEFAULT_FG: FgSettings = {
  enabled: false,
  quality: "balanced",
  dedup: true,
  protection: 0.5,
};

export const DEFAULT_RECORDING: RecordingSettings = {
  format: "auto",
  bitrateMbps: 16,
  replaySeconds: 30,
  withAudio: true,
};

export interface Preset {
  id: string;
  label: string;
  hint: string;
  values: Omit<EnhanceSettings, "enabled" | "preset" | "lutPath" | "lutStrength">;
}

/** The presets of Settings → Enhance; "custom" is what the user changed by hand. */
export const PRESETS: readonly Preset[] = [
  {
    id: "clean",
    label: "Clean",
    hint: "Light sharpening and a touch of denoise – the all-round default.",
    values: {
      upscaler: "fsr",
      sharpness: 0.35,
      denoise: 0.15,
      temporalDenoise: 0.25,
      antiAliasing: "off",
      hdrLook: 0,
      colour: { ...DEFAULT_COLOUR },
    },
  },
  {
    id: "sharp",
    label: "Sharp",
    hint: "Crisp upscaling for games: strong sharpening, anti-aliasing, no blur.",
    values: {
      upscaler: "fsr",
      sharpness: 0.7,
      denoise: 0,
      temporalDenoise: 0,
      antiAliasing: "fxaa",
      hdrLook: 0.15,
      colour: { ...DEFAULT_COLOUR, vibrance: 1.15 },
    },
  },
  {
    id: "cinema",
    label: "Cinema",
    hint: "Smooth and filmic: denoise, soft sharpening, richer contrast.",
    values: {
      upscaler: "fsr",
      sharpness: 0.2,
      denoise: 0.4,
      temporalDenoise: 0.5,
      antiAliasing: "fxaa",
      hdrLook: 0.35,
      colour: { ...DEFAULT_COLOUR, contrast: 1.08, saturation: 1.05 },
    },
  },
  {
    id: "retro",
    label: "Retro",
    hint: "For old consoles: heavy denoise, anti-aliasing and gentle sharpening.",
    values: {
      upscaler: "fsr",
      sharpness: 0.25,
      denoise: 0.6,
      temporalDenoise: 0.6,
      antiAliasing: "fxaa",
      hdrLook: 0.1,
      colour: { ...DEFAULT_COLOUR, saturation: 1.1 },
    },
  },
  {
    id: "max",
    label: "Max",
    hint: "Everything on: for a fast GPU.",
    values: {
      upscaler: "fsr",
      sharpness: 0.6,
      denoise: 0.35,
      temporalDenoise: 0.4,
      antiAliasing: "fxaa",
      hdrLook: 0.4,
      colour: { ...DEFAULT_COLOUR, vibrance: 1.2, contrast: 1.05 },
    },
  },
];

export function presetById(id: string): Preset | undefined {
  return PRESETS.find((p) => p.id === id);
}

/** The enhance settings with a preset's values, keeping the LUT and the master switch. */
export function applyPreset(current: EnhanceSettings, preset: Preset): EnhanceSettings {
  return {
    ...current,
    ...preset.values,
    colour: { ...preset.values.colour },
    preset: preset.id,
  };
}

const num = (v: unknown, lo: number, hi: number, fallback: number) =>
  typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback;
const bool = (v: unknown, fallback: boolean) => (typeof v === "boolean" ? v : fallback);
const oneOf = <T extends string>(v: unknown, options: readonly T[], fallback: T): T =>
  options.includes(v as T) ? (v as T) : fallback;
const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" ? (v as Record<string, unknown>) : {};

export function parseColour(raw: unknown): ColourSettings {
  const r = obj(raw);
  return {
    brightness: num(r.brightness, -1, 1, 0),
    contrast: num(r.contrast, 0, 2, 1),
    saturation: num(r.saturation, 0, 2, 1),
    vibrance: num(r.vibrance, 0, 2, 1),
    gamma: num(r.gamma, 0.5, 2, 1),
    temperature: num(r.temperature, -1, 1, 0),
    tint: num(r.tint, -1, 1, 0),
  };
}

export function parseEnhance(raw: unknown): EnhanceSettings {
  const r = obj(raw);
  const d = DEFAULT_ENHANCE;
  return {
    enabled: bool(r.enabled, d.enabled),
    preset: typeof r.preset === "string" && r.preset.length < 64 ? r.preset : d.preset,
    upscaler: oneOf(r.upscaler, ["off", "fsr"], d.upscaler),
    sharpness: num(r.sharpness, 0, 1, d.sharpness),
    denoise: num(r.denoise, 0, 1, d.denoise),
    temporalDenoise: num(r.temporalDenoise, 0, 1, d.temporalDenoise),
    antiAliasing: oneOf(r.antiAliasing, ["off", "fxaa"], d.antiAliasing),
    hdrLook: num(r.hdrLook, 0, 1, d.hdrLook),
    colour: parseColour(r.colour),
    lutPath: typeof r.lutPath === "string" && r.lutPath.length < 2048 ? r.lutPath : "",
    lutStrength: num(r.lutStrength, 0, 1, d.lutStrength),
  };
}

export function parseFg(raw: unknown): FgSettings {
  const r = obj(raw);
  const d = DEFAULT_FG;
  return {
    enabled: bool(r.enabled, d.enabled),
    quality: oneOf(r.quality, ["fast", "balanced", "quality"], d.quality),
    dedup: bool(r.dedup, d.dedup),
    protection: num(r.protection, 0, 1, d.protection),
  };
}

export function parseRecording(raw: unknown): RecordingSettings {
  const r = obj(raw);
  const d = DEFAULT_RECORDING;
  return {
    format: oneOf(r.format, ["auto", "mp4", "webm"], d.format),
    bitrateMbps: Math.round(num(r.bitrateMbps, 2, 80, d.bitrateMbps)),
    replaySeconds: Math.round(num(r.replaySeconds, 0, 120, d.replaySeconds)),
    withAudio: bool(r.withAudio, d.withAudio),
  };
}

/** True when the pipeline changes the picture at all (otherwise the frames are shown as they are). */
export function enhanceActive(e: EnhanceSettings, hasLut: boolean): boolean {
  if (!e.enabled) return false;
  const c = e.colour;
  const colourChanged =
    c.brightness !== 0 ||
    c.contrast !== 1 ||
    c.saturation !== 1 ||
    c.vibrance !== 1 ||
    c.gamma !== 1 ||
    c.temperature !== 0 ||
    c.tint !== 0;
  return (
    e.upscaler !== "off" ||
    e.sharpness > 0 ||
    e.denoise > 0 ||
    e.temporalDenoise > 0 ||
    e.antiAliasing !== "off" ||
    e.hdrLook > 0 ||
    colourChanged ||
    (hasLut && e.lutStrength > 0)
  );
}
