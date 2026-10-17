/**
 * Plays the capture card's sound: MediaStream → gain (volume) → speakers, with an analyser on the
 * input for the level meter (so it shows that sound arrives even while muted). Web Audio instead
 * of a <video>/<audio> element keeps the delay low (no media buffering) and lets the sound go to a
 * chosen speaker (setSinkId).
 */

type SinkContext = AudioContext & { setSinkId?: (id: string) => Promise<void> };

export class AudioEngine {
  private ctx: SinkContext | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private gain: GainNode | null = null;
  private analyser: AnalyserNode | null = null;
  private samples: Float32Array<ArrayBuffer> | null = null;
  private volume = 0.8;
  private muted = false;
  private sinkId = "";

  /** True when the browser can play on a chosen speaker. */
  static get canPickOutput(): boolean {
    return typeof AudioContext !== "undefined" && "setSinkId" in AudioContext.prototype;
  }

  private ensureContext(): SinkContext | null {
    if (this.ctx) return this.ctx;
    if (typeof AudioContext === "undefined") return null;
    const ctx = new AudioContext({ latencyHint: "interactive" }) as SinkContext;
    const gain = ctx.createGain();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0;
    gain.connect(ctx.destination);
    this.ctx = ctx;
    this.gain = gain;
    this.analyser = analyser;
    this.samples = new Float32Array(analyser.fftSize);
    this.applyGain();
    if (this.sinkId) void this.setOutput(this.sinkId);
    return ctx;
  }

  /** Plays `stream` (replacing whatever played before). */
  attach(stream: MediaStream): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.gain) return;
    this.detach();
    this.source = ctx.createMediaStreamSource(stream);
    this.source.connect(this.gain);
    if (this.analyser) this.source.connect(this.analyser);
    if (ctx.state === "suspended") void ctx.resume();
  }

  detach(): void {
    if (this.source) {
      this.source.disconnect();
      this.source = null;
    }
  }

  get attached(): boolean {
    return this.source !== null;
  }

  setVolume(volume: number, muted: boolean): void {
    this.volume = Math.min(1, Math.max(0, volume));
    this.muted = muted;
    this.applyGain();
  }

  private applyGain(): void {
    if (!this.gain || !this.ctx) return;
    // Volume feels linear on a squared curve; a short ramp avoids clicks.
    const target = this.muted ? 0 : this.volume * this.volume;
    this.gain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.015);
  }

  /** Plays on the speaker `deviceId` ("" = system default). Resolves false when it can't. */
  async setOutput(deviceId: string): Promise<boolean> {
    this.sinkId = deviceId;
    if (!this.ctx?.setSinkId) return deviceId === "";
    try {
      await this.ctx.setSinkId(deviceId);
      return true;
    } catch {
      if (deviceId) {
        this.sinkId = "";
        await this.ctx.setSinkId("").catch(() => undefined);
      }
      return false;
    }
  }

  /** The current peak level, 0..1, on a dB scale from -60 dBFS (0) to 0 dBFS (1). */
  level(): number {
    if (!this.analyser || !this.samples || !this.source) return 0;
    this.analyser.getFloatTimeDomainData(this.samples);
    let peak = 0;
    for (const v of this.samples) {
      const a = Math.abs(v);
      if (a > peak) peak = a;
    }
    if (peak <= 0.001) return 0;
    const db = 20 * Math.log10(peak);
    return Math.min(1, Math.max(0, (db + 60) / 60));
  }

  /** The browser wants a click before sound may start in some cases; this resumes it. */
  resume(): void {
    if (this.ctx?.state === "suspended") void this.ctx.resume();
  }

  close(): void {
    this.detach();
    void this.ctx?.close();
    this.ctx = null;
    this.gain = null;
    this.analyser = null;
  }
}
