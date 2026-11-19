import { describe, expect, it } from "vitest";
import {
  DEFAULT_ENHANCE,
  DEFAULT_FG,
  DEFAULT_RECORDING,
  applyPreset,
  enhanceActive,
  parseEnhance,
  parseFg,
  parseRecording,
  presetById,
} from "./enhance";

describe("enhance settings", () => {
  it("defaults for junk, clamps numbers, keeps valid values", () => {
    expect(parseEnhance(null)).toEqual(DEFAULT_ENHANCE);
    const e = parseEnhance({
      enabled: false,
      sharpness: 5,
      denoise: -1,
      upscaler: "dlss",
      antiAliasing: "fxaa",
      colour: { contrast: 1.5, gamma: "x" },
      lutPath: "C:\\x.cube",
    });
    expect(e.enabled).toBe(false);
    expect(e.sharpness).toBe(1);
    expect(e.denoise).toBe(0);
    expect(e.upscaler).toBe("fsr");
    expect(e.antiAliasing).toBe("fxaa");
    expect(e.colour.contrast).toBe(1.5);
    expect(e.colour.gamma).toBe(1);
    expect(e.lutPath).toBe("C:\\x.cube");
  });

  it("frame generation and recording settings", () => {
    expect(parseFg(undefined)).toEqual(DEFAULT_FG);
    expect(parseFg({ enabled: true, quality: "ultra", protection: 2 })).toEqual({
      ...DEFAULT_FG,
      enabled: true,
      protection: 1,
    });
    expect(parseRecording({})).toEqual(DEFAULT_RECORDING);
    expect(parseRecording({ bitrateMbps: 1000, replaySeconds: 10.6, format: "mp4" })).toEqual({
      ...DEFAULT_RECORDING,
      bitrateMbps: 80,
      replaySeconds: 11,
      format: "mp4",
    });
  });

  it("presets replace the look but keep the LUT and the switch", () => {
    const sharp = presetById("sharp")!;
    const e = applyPreset({ ...DEFAULT_ENHANCE, enabled: false, lutPath: "a.cube" }, sharp);
    expect(e.enabled).toBe(false);
    expect(e.lutPath).toBe("a.cube");
    expect(e.preset).toBe("sharp");
    expect(e.sharpness).toBe(0.7);
    expect(e.colour).not.toBe(sharp.values.colour);
  });

  it("knows when the pipeline changes nothing", () => {
    const off = parseEnhance({
      upscaler: "off",
      sharpness: 0,
      denoise: 0,
      temporalDenoise: 0,
      antiAliasing: "off",
      hdrLook: 0,
    });
    expect(enhanceActive(off, false)).toBe(false);
    expect(enhanceActive(off, true)).toBe(true);
    expect(enhanceActive({ ...off, colour: { ...off.colour, gamma: 1.2 } }, false)).toBe(true);
    expect(enhanceActive({ ...DEFAULT_ENHANCE, enabled: false }, true)).toBe(false);
  });
});
