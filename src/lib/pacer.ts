/**
 * The frame pacer: decides which frame the screen shows now. Without frame generation every
 * captured frame is shown as soon as it arrives. With it, each new real frame N first shows the
 * frame generated between the previous one (C) and N, and N itself half a capture interval later –
 * so the picture runs at twice the capture rate with about half a frame of extra delay (what
 * DLSS/FSR frame generation costs too).
 *
 * It only works with times and ids, so it is tested without a GPU.
 */

export type Shown = { kind: "real"; id: number } | { kind: "generated"; from: number; to: number };

export interface PacerOptions {
  /** Generated frames are made at all. */
  generate: boolean;
}

export class FramePacer {
  /** Arrival times of recent real frames, for the capture interval. */
  private arrivals: number[] = [];
  private interval = 1000 / 60;
  private current: number | null = null;
  private previous: number | null = null;
  /** The real frame that waits to be shown, and when. */
  private pending: { id: number; at: number } | null = null;
  /** What the next present() hands out. */
  private toDraw: Shown | null = null;
  private nextId = 1;

  /** The measured time between two captured frames, in ms. */
  get captureInterval(): number {
    return this.interval;
  }

  /** The real frame that arrived last (its id). */
  get latest(): number | null {
    return this.current;
  }

  /** A new real frame arrived at `now`; returns its id. */
  arrive(now: number, options: PacerOptions): number {
    const id = this.nextId++;
    this.arrivals.push(now);
    if (this.arrivals.length > 8) this.arrivals.shift();
    if (this.arrivals.length >= 2) {
      // The median of the last gaps resists one late frame.
      const gaps: number[] = [];
      for (let i = 1; i < this.arrivals.length; i++) {
        gaps.push(this.arrivals[i] - this.arrivals[i - 1]);
      }
      gaps.sort((a, b) => a - b);
      const median = gaps[Math.floor(gaps.length / 2)];
      if (median > 2 && median < 250) this.interval = median;
    }
    this.previous = this.current;
    this.current = id;
    if (options.generate && this.previous !== null) {
      // The generated frame now, the real one half an interval later.
      this.toDraw = { kind: "generated", from: this.previous, to: id };
      this.pending = { id, at: now + this.interval / 2 };
    } else {
      this.toDraw = { kind: "real", id };
      this.pending = null;
    }
    return id;
  }

  /**
   * What the screen should show at `now`, or null when nothing changed since the last call
   * (nothing to draw).
   */
  present(now: number): Shown | null {
    if (this.pending && now >= this.pending.at && !this.toDraw) {
      this.toDraw = { kind: "real", id: this.pending.id };
      this.pending = null;
    }
    const out = this.toDraw;
    this.toDraw = null;
    return out;
  }

  /** Forget everything (the capture restarted). */
  reset(): void {
    this.arrivals = [];
    this.current = null;
    this.previous = null;
    this.pending = null;
    this.toDraw = null;
  }
}
