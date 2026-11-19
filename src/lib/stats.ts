/**
 * Frame statistics the way game overlays show them: frames per second, the 1 % low (the frame
 * rate of the slowest 1 % of frames) and the average frame time, over a sliding window.
 */
export class FrameStats {
  private times: number[] = [];
  private last = -1;

  constructor(private readonly windowMs = 2000) {}

  /** A frame was shown at `now` (ms). */
  frame(now: number): void {
    if (this.last >= 0) {
      const dt = now - this.last;
      if (dt > 0 && dt < 5000) this.times.push(dt);
    }
    this.last = now;
    // Keep only the window's worth of frame times.
    let total = 0;
    let keep = this.times.length;
    for (let i = this.times.length - 1; i >= 0; i--) {
      total += this.times[i];
      if (total > this.windowMs) {
        keep = this.times.length - 1 - i;
        break;
      }
    }
    if (keep < this.times.length) this.times.splice(0, this.times.length - keep);
  }

  /** Nothing was shown for a while (the picture stopped); forget the window. */
  reset(): void {
    this.times = [];
    this.last = -1;
  }

  get fps(): number {
    if (this.times.length === 0) return 0;
    const avg = this.times.reduce((a, b) => a + b, 0) / this.times.length;
    return avg > 0 ? 1000 / avg : 0;
  }

  /** Average frame time in ms. */
  get frameTime(): number {
    if (this.times.length === 0) return 0;
    return this.times.reduce((a, b) => a + b, 0) / this.times.length;
  }

  /** The 1 % low: the frame rate of the slowest 1 % of frames in the window. */
  get low1(): number {
    if (this.times.length < 10) return this.fps;
    const sorted = [...this.times].sort((a, b) => b - a);
    const n = Math.max(1, Math.ceil(sorted.length * 0.01));
    const avg = sorted.slice(0, n).reduce((a, b) => a + b, 0) / n;
    return avg > 0 ? 1000 / avg : 0;
  }

  get samples(): number {
    return this.times.length;
  }
}
