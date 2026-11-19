import { describe, expect, it } from "vitest";
import { FrameStats } from "./stats";

describe("FrameStats", () => {
  it("fps and frame time over the window", () => {
    const s = new FrameStats(1000);
    for (let i = 0; i <= 60; i++) s.frame(i * 16.666);
    expect(s.fps).toBeCloseTo(60, 0);
    expect(s.frameTime).toBeCloseTo(16.666, 1);
    expect(s.samples).toBeLessThanOrEqual(61);
  });

  it("the 1 % low shows the slowest frames", () => {
    const s = new FrameStats(5000);
    let t = 0;
    for (let i = 0; i < 200; i++) {
      t += i === 100 ? 100 : 16.666;
      s.frame(t);
    }
    expect(s.fps).toBeGreaterThan(55);
    expect(s.low1).toBeLessThan(20);
  });

  it("old frames fall out of the window", () => {
    const s = new FrameStats(500);
    for (let i = 0; i < 100; i++) s.frame(i * 16.666);
    expect(s.samples).toBeLessThanOrEqual(31);
  });

  it("reset and huge gaps", () => {
    const s = new FrameStats(1000);
    s.frame(0);
    s.frame(10000);
    expect(s.samples).toBe(0);
    s.frame(10016);
    expect(s.samples).toBe(1);
    s.reset();
    expect(s.fps).toBe(0);
  });
});
