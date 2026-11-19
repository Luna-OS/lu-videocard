/**
 * Recording the enhanced picture (what the canvas shows) with the capture card's sound:
 * MediaRecorder encodes it, and the chunks go to the main process, which appends them to a file
 * in Videos › Lu Videocard. The replay buffer keeps the last seconds the same way, in memory,
 * until a hotkey saves them.
 *
 * MediaRecorder is injected so the tests can use a fake.
 */

import type { RecordingFormat } from "./enhance";

export interface RecordingSink {
  start(ext: string, kind: "recording" | "replay"): Promise<{ id: number; file: string }>;
  write(id: number, chunk: Uint8Array): Promise<number>;
  finish(id: number): Promise<{ file: string; bytes: number }>;
  cancel(id: number): Promise<void>;
}

export interface MediaRecorderLike {
  state: "inactive" | "recording" | "paused";
  ondataavailable: ((e: { data: Blob }) => void) | null;
  onstop: (() => void) | null;
  onerror: ((e: unknown) => void) | null;
  start(timeslice?: number): void;
  stop(): void;
}

export type RecorderFactory = (
  stream: MediaStream,
  options: { mimeType: string; videoBitsPerSecond: number },
) => MediaRecorderLike;

/** The formats tried in order for "auto": MP4 (H.264) where Chromium can, otherwise WebM. */
const MP4_TYPES = [
  'video/mp4;codecs="avc1.640028,mp4a.40.2"',
  'video/mp4;codecs="avc1"',
  "video/mp4",
];
const WEBM_TYPES = ['video/webm;codecs="vp9,opus"', 'video/webm;codecs="vp8,opus"', "video/webm"];

/** Picks the MIME type for a format (null when nothing is supported). */
export function pickMimeType(
  format: RecordingFormat,
  isSupported: (type: string) => boolean,
): { mimeType: string; ext: "mp4" | "webm" } | null {
  const order = format === "webm" ? [WEBM_TYPES, MP4_TYPES] : [MP4_TYPES, WEBM_TYPES];
  if (format === "mp4" || format === "webm") {
    const own = format === "mp4" ? MP4_TYPES : WEBM_TYPES;
    const hit = own.find(isSupported);
    if (hit) return { mimeType: hit, ext: format };
  }
  for (const list of order) {
    const hit = list.find(isSupported);
    if (hit) return { mimeType: hit, ext: list === MP4_TYPES ? "mp4" : "webm" };
  }
  return null;
}

const defaultFactory: RecorderFactory = (stream, options) =>
  new MediaRecorder(stream, options) as unknown as MediaRecorderLike;

const toBytes = async (blob: Blob) => new Uint8Array(await blob.arrayBuffer());

export interface RecorderOptions {
  format: RecordingFormat;
  bitrateMbps: number;
  sink: RecordingSink;
  factory?: RecorderFactory;
  isSupported?: (type: string) => boolean;
}

/** One recording to a file, from start to stop. */
export class Recorder {
  private rec: MediaRecorderLike | null = null;
  private id = 0;
  private file = "";
  private queue: Promise<unknown> = Promise.resolve();
  private failed: Error | null = null;
  readonly startedAt = Date.now();

  constructor(private readonly o: RecorderOptions) {}

  get isRecording(): boolean {
    return this.rec !== null;
  }

  get path(): string {
    return this.file;
  }

  async start(stream: MediaStream): Promise<void> {
    const picked = pickMimeType(
      this.o.format,
      this.o.isSupported ?? ((t) => MediaRecorder.isTypeSupported(t)),
    );
    if (!picked) throw new Error("This system can't encode video.");
    const { id, file } = await this.o.sink.start(picked.ext, "recording");
    this.id = id;
    this.file = file;
    const rec = (this.o.factory ?? defaultFactory)(stream, {
      mimeType: picked.mimeType,
      videoBitsPerSecond: this.o.bitrateMbps * 1_000_000,
    });
    rec.ondataavailable = (e) => {
      if (!e.data || e.data.size === 0) return;
      this.queue = this.queue
        .then(() => toBytes(e.data))
        .then((bytes) => this.o.sink.write(id, bytes))
        .catch((err: unknown) => {
          this.failed = err instanceof Error ? err : new Error(String(err));
        });
    };
    rec.onerror = (err) => {
      this.failed = err instanceof Error ? err : new Error("The recorder failed.");
    };
    this.rec = rec;
    rec.start(1000);
  }

  /** Stops and closes the file; resolves to its path and size. */
  async stop(): Promise<{ file: string; bytes: number }> {
    const rec = this.rec;
    if (!rec) throw new Error("Not recording.");
    this.rec = null;
    await new Promise<void>((resolve) => {
      rec.onstop = () => resolve();
      if (rec.state === "inactive") resolve();
      else rec.stop();
    });
    await this.queue;
    if (this.failed) {
      await this.o.sink.cancel(this.id);
      throw this.failed;
    }
    return this.o.sink.finish(this.id);
  }
}

export interface ReplayOptions extends RecorderOptions {
  /** How many seconds the buffer keeps at least. */
  seconds: number;
  now?: () => number;
}

/**
 * The replay buffer: two recorders take turns, a new one starting every `seconds`, so the older
 * one always holds between `seconds` and 2 × `seconds` of picture. Saving stops the older one
 * and writes its chunks to a file.
 */
export class ReplayBuffer {
  private generations: { rec: MediaRecorderLike; chunks: Blob[]; startedAt: number }[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  private mime: { mimeType: string; ext: "mp4" | "webm" } | null = null;
  private stream: MediaStream | null = null;

  constructor(private readonly o: ReplayOptions) {}

  get running(): boolean {
    return this.timer !== null;
  }

  /** Seconds of picture the buffer holds right now. */
  get seconds(): number {
    const oldest = this.generations[0];
    if (!oldest) return 0;
    return Math.min(this.o.seconds * 2, ((this.o.now ?? Date.now)() - oldest.startedAt) / 1000);
  }

  start(stream: MediaStream): void {
    this.stop();
    this.mime = pickMimeType(
      this.o.format,
      this.o.isSupported ?? ((t) => MediaRecorder.isTypeSupported(t)),
    );
    if (!this.mime) throw new Error("This system can't encode video.");
    this.stream = stream;
    this.startGeneration();
    this.timer = setInterval(() => this.startGeneration(), this.o.seconds * 1000);
  }

  private startGeneration(): void {
    if (!this.stream || !this.mime) return;
    const gen = {
      rec: (this.o.factory ?? defaultFactory)(this.stream, {
        mimeType: this.mime.mimeType,
        videoBitsPerSecond: this.o.bitrateMbps * 1_000_000,
      }),
      chunks: [] as Blob[],
      startedAt: (this.o.now ?? Date.now)(),
    };
    gen.rec.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) gen.chunks.push(e.data);
    };
    gen.rec.start(1000);
    this.generations.push(gen);
    // Two generations are enough: the oldest beyond that is older than 2 × seconds.
    while (this.generations.length > 2) {
      const old = this.generations.shift()!;
      old.rec.ondataavailable = null;
      if (old.rec.state !== "inactive") old.rec.stop();
    }
  }

  /** Writes the oldest generation (at least `seconds` of picture) to a file. */
  async save(): Promise<{ file: string; bytes: number; seconds: number }> {
    const gen = this.generations.shift();
    if (!gen || !this.mime) throw new Error("The replay buffer is empty.");
    const seconds = ((this.o.now ?? Date.now)() - gen.startedAt) / 1000;
    // The buffer keeps running with the newer generation (and a fresh one right away).
    this.startGeneration();
    await new Promise<void>((resolve) => {
      gen.rec.onstop = () => resolve();
      if (gen.rec.state === "inactive") resolve();
      else gen.rec.stop();
    });
    const { id } = await this.o.sink.start(this.mime.ext, "replay");
    try {
      for (const chunk of gen.chunks) await this.o.sink.write(id, await toBytes(chunk));
    } catch (err) {
      await this.o.sink.cancel(id);
      throw err;
    }
    const done = await this.o.sink.finish(id);
    return { ...done, seconds };
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    for (const gen of this.generations) {
      gen.rec.ondataavailable = null;
      if (gen.rec.state !== "inactive") gen.rec.stop();
    }
    this.generations = [];
    this.stream = null;
  }
}
