import { describe, expect, it } from "vitest";
import { fitRect, outputSize } from "./fit";

describe("fitRect", () => {
  it("contain keeps the whole picture with bars", () => {
    expect(fitRect(1920, 1080, 1000, 1000, "contain")).toEqual({
      x: 0,
      y: 219,
      width: 1000,
      height: 563,
    });
  });
  it("cover fills the canvas and cuts the edges", () => {
    const r = fitRect(1920, 1080, 1000, 1000, "cover");
    expect(r.width).toBe(1778);
    expect(r.height).toBe(1000);
    expect(r.x).toBe(-389);
  });
  it("fill stretches", () => {
    expect(fitRect(1920, 1080, 500, 500, "fill")).toEqual({
      x: 0,
      y: 0,
      width: 500,
      height: 500,
    });
  });
  it("nothing for empty sizes", () => {
    expect(fitRect(0, 0, 100, 100, "contain").width).toBe(0);
  });
});

describe("outputSize", () => {
  it("upscales to the picture's size on screen, at most 4×", () => {
    expect(outputSize(1280, 720, { x: 0, y: 0, width: 2560, height: 1440 }, true)).toEqual({
      width: 2560,
      height: 1440,
    });
    expect(outputSize(640, 360, { x: 0, y: 0, width: 3840, height: 2160 }, true)).toEqual({
      width: 2560,
      height: 1440,
    });
  });
  it("stays at the source when not upscaling or when the window is smaller", () => {
    expect(outputSize(1920, 1080, { x: 0, y: 0, width: 960, height: 540 }, true)).toEqual({
      width: 1920,
      height: 1080,
    });
    expect(outputSize(1920, 1080, { x: 0, y: 0, width: 3840, height: 2160 }, false)).toEqual({
      width: 1920,
      height: 1080,
    });
  });
});
