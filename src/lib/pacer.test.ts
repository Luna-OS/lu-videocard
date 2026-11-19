import { describe, expect, it } from "vitest";
import { FramePacer } from "./pacer";

describe("FramePacer", () => {
  it("without frame generation every real frame shows at once", () => {
    const p = new FramePacer();
    const a = p.arrive(0, { generate: false });
    expect(p.present(0)).toEqual({ kind: "real", id: a });
    expect(p.present(5)).toBeNull();
    const b = p.arrive(16.7, { generate: false });
    expect(p.present(17)).toEqual({ kind: "real", id: b });
  });

  it("measures the capture interval from the arrivals", () => {
    const p = new FramePacer();
    for (let i = 0; i < 6; i++) p.arrive(i * 33.3, { generate: false });
    expect(p.captureInterval).toBeCloseTo(33.3, 1);
    // One late frame doesn't change it.
    p.arrive(6 * 33.3 + 20, { generate: false });
    expect(p.captureInterval).toBeCloseTo(33.3, 1);
  });

  it("with frame generation: generated frame first, the real one half an interval later", () => {
    const p = new FramePacer();
    const a = p.arrive(0, { generate: true });
    // The first frame has no partner: shown as it is.
    expect(p.present(0)).toEqual({ kind: "real", id: a });
    const b = p.arrive(16, { generate: true });
    expect(p.present(16)).toEqual({ kind: "generated", from: a, to: b });
    expect(p.present(20)).toBeNull();
    expect(p.present(24.5)).toEqual({ kind: "real", id: b });
    expect(p.present(30)).toBeNull();
  });

  it("a frame that arrives before the pending one was shown replaces it", () => {
    const p = new FramePacer();
    const a = p.arrive(0, { generate: true });
    p.present(0);
    const b = p.arrive(16, { generate: true });
    expect(p.present(16)).toEqual({ kind: "generated", from: a, to: b });
    const c = p.arrive(18, { generate: true });
    expect(p.present(18)).toEqual({ kind: "generated", from: b, to: c });
    expect(p.present(40)).toEqual({ kind: "real", id: c });
  });

  it("reset forgets the history", () => {
    const p = new FramePacer();
    p.arrive(0, { generate: true });
    p.arrive(16, { generate: true });
    p.reset();
    expect(p.latest).toBeNull();
    const d = p.arrive(100, { generate: true });
    expect(p.present(100)).toEqual({ kind: "real", id: d });
  });
});
