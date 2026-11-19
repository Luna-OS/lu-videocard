import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Recorder, ReplayBuffer, pickMimeType, type MediaRecorderLike } from "./recording";

class FakeRecorder implements MediaRecorderLike {
  state: "inactive" | "recording" | "paused" = "inactive";
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  static all: FakeRecorder[] = [];
  constructor(readonly options: { mimeType: string; videoBitsPerSecond: number }) {
    FakeRecorder.all.push(this);
  }
  start() {
    this.state = "recording";
  }
  stop() {
    this.state = "inactive";
    this.ondataavailable?.({ data: new Blob([new Uint8Array([255])]) });
    this.onstop?.();
  }
  emit(bytes: number[]) {
    this.ondataavailable?.({ data: new Blob([new Uint8Array(bytes)]) });
  }
}

function fakeSink() {
  const files = new Map<number, { ext: string; kind: string; bytes: number[]; open: boolean }>();
  let next = 1;
  return {
    files,
    start: vi.fn((ext: string, kind: "recording" | "replay") => {
      const id = next++;
      files.set(id, { ext, kind, bytes: [], open: true });
      return Promise.resolve({ id, file: `/videos/${kind}-${id}.${ext}` });
    }),
    write: vi.fn((id: number, chunk: Uint8Array) => {
      const f = files.get(id)!;
      f.bytes.push(...chunk);
      return Promise.resolve(f.bytes.length);
    }),
    finish: vi.fn((id: number) => {
      const f = files.get(id)!;
      f.open = false;
      return Promise.resolve({ file: `/videos/${f.kind}-${id}.${f.ext}`, bytes: f.bytes.length });
    }),
    cancel: vi.fn((id: number) => {
      files.delete(id);
      return Promise.resolve();
    }),
  };
}

const stream = {} as MediaStream;
const supportsAll = () => true;

beforeEach(() => {
  FakeRecorder.all = [];
});
afterEach(() => {
  vi.useRealTimers();
});

describe("pickMimeType", () => {
  it("prefers MP4 for auto, falls back to WebM", () => {
    expect(pickMimeType("auto", supportsAll)?.ext).toBe("mp4");
    expect(pickMimeType("auto", (t) => t.startsWith("video/webm"))?.ext).toBe("webm");
    expect(pickMimeType("webm", supportsAll)?.ext).toBe("webm");
    expect(pickMimeType("mp4", (t) => t === "video/webm")?.ext).toBe("webm");
    expect(pickMimeType("auto", () => false)).toBeNull();
  });
});

describe("Recorder", () => {
  it("streams chunks to the file and closes it", async () => {
    const sink = fakeSink();
    const r = new Recorder({
      format: "auto",
      bitrateMbps: 12,
      sink,
      factory: (_s, o) => new FakeRecorder(o),
      isSupported: supportsAll,
    });
    await r.start(stream);
    expect(r.isRecording).toBe(true);
    expect(r.path).toBe("/videos/recording-1.mp4");
    const rec = FakeRecorder.all[0];
    expect(rec.options.videoBitsPerSecond).toBe(12_000_000);
    rec.emit([1, 2]);
    rec.emit([3]);
    const done = await r.stop();
    expect(done.bytes).toBe(4);
    expect(sink.files.get(1)!.bytes).toEqual([1, 2, 3, 255]);
    expect(r.isRecording).toBe(false);
  });

  it("a failed write cancels the file", async () => {
    const sink = fakeSink();
    sink.write.mockRejectedValueOnce(new Error("disk full"));
    const r = new Recorder({
      format: "webm",
      bitrateMbps: 8,
      sink,
      factory: (_s, o) => new FakeRecorder(o),
      isSupported: supportsAll,
    });
    await r.start(stream);
    FakeRecorder.all[0].emit([1]);
    await expect(r.stop()).rejects.toThrow(/disk full/);
    expect(sink.cancel).toHaveBeenCalledWith(1);
  });
});

describe("ReplayBuffer", () => {
  it("keeps two generations and saves the older one", async () => {
    vi.useFakeTimers();
    let now = 0;
    const sink = fakeSink();
    const b = new ReplayBuffer({
      format: "webm",
      bitrateMbps: 8,
      seconds: 10,
      sink,
      factory: (_s, o) => new FakeRecorder(o),
      isSupported: supportsAll,
      now: () => now,
    });
    b.start(stream);
    expect(FakeRecorder.all).toHaveLength(1);
    FakeRecorder.all[0].emit([1, 1]);
    now = 10_000;
    vi.advanceTimersByTime(10_000);
    expect(FakeRecorder.all).toHaveLength(2);
    FakeRecorder.all[0].emit([2]);
    FakeRecorder.all[1].emit([3]);
    now = 25_000;
    vi.advanceTimersByTime(15_000);
    // The first generation is older than 2 × seconds and was dropped.
    expect(FakeRecorder.all).toHaveLength(3);
    expect(FakeRecorder.all[0].state).toBe("inactive");
    expect(b.seconds).toBe(15);

    const saved = await b.save();
    expect(saved.seconds).toBe(15);
    expect(saved.file).toBe("/videos/replay-1.webm");
    expect(sink.files.get(1)!.bytes).toEqual([3, 255]);
    // The buffer keeps running: a new generation started at once.
    expect(b.running).toBe(true);
    expect(FakeRecorder.all).toHaveLength(4);

    b.stop();
    expect(b.running).toBe(false);
    expect(FakeRecorder.all.every((r) => r.state === "inactive")).toBe(true);
  });

  it("an empty buffer can't be saved", async () => {
    const b = new ReplayBuffer({
      format: "webm",
      bitrateMbps: 8,
      seconds: 10,
      sink: fakeSink(),
      factory: (_s, o) => new FakeRecorder(o),
      isSupported: supportsAll,
    });
    await expect(b.save()).rejects.toThrow(/empty/);
  });
});
