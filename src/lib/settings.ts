import { DEFAULT_QUALITY, QUALITIES, AUDIO_AUTO } from "./devices";
import type { ThemeChoice } from "../theme/useTheme";

/** How the picture fills the window: whole picture (bars if needed), cropped, or stretched. */
export type Fit = "contain" | "cover" | "fill";

export const FIT_LABELS: Record<Fit, string> = {
  contain: "Fit – whole picture",
  cover: "Fill – no bars, edges cropped",
  fill: "Stretch – no bars, distorted",
};

const NEXT_FIT: Record<Fit, Fit> = { contain: "cover", cover: "fill", fill: "contain" };

/** The fit the picture-fit button switches to. */
export function nextFit(fit: Fit): Fit {
  return NEXT_FIT[fit];
}

export interface Settings {
  /** The camera (capture card); "" picks it automatically. */
  videoDeviceId: string;
  /** The sound input; "" = the card's own sound, "none" = no sound. */
  audioDeviceId: string;
  /** The speaker the sound plays on; "" = the system's default. */
  outputDeviceId: string;
  quality: string;
  fit: Fit;
  /** 0..1 */
  volume: number;
  muted: boolean;
  theme: ThemeChoice;
  /** Look for a new version a few seconds after the start. */
  autoUpdate: boolean;
  /** Keep the screen from going dark while the picture runs. */
  keepAwake: boolean;
  alwaysOnTop: boolean;
  /** Resolution, frame rate and sound format in a corner of the picture. */
  showStats: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  videoDeviceId: "",
  audioDeviceId: AUDIO_AUTO,
  outputDeviceId: "",
  quality: DEFAULT_QUALITY,
  fit: "contain",
  volume: 0.8,
  muted: false,
  theme: "dark",
  autoUpdate: true,
  keepAwake: true,
  alwaysOnTop: false,
  showStats: false,
};

export const STORAGE_KEY = "lu-videocard.settings.v1";

const FITS: readonly Fit[] = ["contain", "cover", "fill"];
const THEMES: readonly ThemeChoice[] = ["dark", "light", "system"];

/** Whatever was stored, turned into valid settings: unknown or broken values get the default. */
export function parseSettings(raw: unknown): Settings {
  const out: Settings = { ...DEFAULT_SETTINGS };
  if (!raw || typeof raw !== "object") return out;
  const r = raw as Record<string, unknown>;
  const str = (v: unknown) => typeof v === "string" && v.length < 512;
  const bool = (v: unknown) => typeof v === "boolean";

  if (str(r.videoDeviceId)) out.videoDeviceId = r.videoDeviceId as string;
  if (str(r.audioDeviceId)) out.audioDeviceId = r.audioDeviceId as string;
  if (str(r.outputDeviceId)) out.outputDeviceId = r.outputDeviceId as string;
  if (QUALITIES.some((q) => q.id === r.quality)) out.quality = r.quality as string;
  if (FITS.includes(r.fit as Fit)) out.fit = r.fit as Fit;
  if (typeof r.volume === "number" && Number.isFinite(r.volume)) {
    out.volume = Math.min(1, Math.max(0, r.volume));
  }
  if (THEMES.includes(r.theme as ThemeChoice)) out.theme = r.theme as ThemeChoice;
  for (const key of ["muted", "autoUpdate", "keepAwake", "alwaysOnTop", "showStats"] as const) {
    if (bool(r[key])) out[key] = r[key];
  }
  return out;
}

export function loadSettings(storage: Pick<Storage, "getItem"> | undefined): Settings {
  try {
    const text = storage?.getItem(STORAGE_KEY);
    return parseSettings(text ? JSON.parse(text) : null);
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(storage: Pick<Storage, "setItem"> | undefined, s: Settings): void {
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    // Full or blocked storage: the settings just aren't remembered.
  }
}
