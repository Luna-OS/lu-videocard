import { describe, expect, it } from "vitest";
import {
  DEFAULT_SETTINGS,
  STORAGE_KEY,
  loadSettings,
  parseSettings,
  saveSettings,
} from "./settings";

describe("settings", () => {
  it("defaults for nothing or junk", () => {
    expect(parseSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings("x")).toEqual(DEFAULT_SETTINGS);
  });

  it("keeps valid values and repairs broken ones", () => {
    const s = parseSettings({
      videoDeviceId: "v1",
      audioDeviceId: "none",
      quality: "2160p30",
      fit: "cover",
      volume: 7,
      muted: true,
      theme: "light",
      autoUpdate: "yes",
      showStats: true,
    });
    expect(s.videoDeviceId).toBe("v1");
    expect(s.audioDeviceId).toBe("none");
    expect(s.quality).toBe("2160p30");
    expect(s.fit).toBe("cover");
    expect(s.volume).toBe(1);
    expect(s.muted).toBe(true);
    expect(s.theme).toBe("light");
    expect(s.autoUpdate).toBe(true);
    expect(s.showStats).toBe(true);

    const bad = parseSettings({ quality: "8k", fit: "zoom", volume: Number.NaN, theme: 3 });
    expect(bad.quality).toBe(DEFAULT_SETTINGS.quality);
    expect(bad.fit).toBe("contain");
    expect(bad.volume).toBe(DEFAULT_SETTINGS.volume);
    expect(bad.theme).toBe("dark");
  });

  it("round-trips through storage and survives broken JSON", () => {
    const store = new Map<string, string>();
    const storage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    };
    saveSettings(storage, { ...DEFAULT_SETTINGS, volume: 0.25 });
    expect(loadSettings(storage).volume).toBe(0.25);
    store.set(STORAGE_KEY, "{");
    expect(loadSettings(storage)).toEqual(DEFAULT_SETTINGS);
    expect(loadSettings(undefined)).toEqual(DEFAULT_SETTINGS);
  });
});
