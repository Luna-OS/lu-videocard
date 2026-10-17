/**
 * Opens the capture card: picks the camera and its sound, starts both with the best constraints,
 * and keeps going when things change – a card that is unplugged and plugged back in starts again
 * by itself, a busy card (opened in OBS, Discord, …) says so instead of showing a black picture.
 *
 * It knows nothing about React; useCapture() wraps it. The picture and the sound are separate
 * streams, so a sound input that fails never takes the picture with it.
 */

import {
  AUDIO_OFF,
  audioConstraints,
  captureScore,
  devicesOf,
  pickAudio,
  pickVideo,
  qualityById,
  videoConstraints,
  type Device,
} from "./devices";

export type CaptureStatus =
  "idle" | "starting" | "live" | "no-device" | "denied" | "busy" | "lost" | "error";

export interface VideoInfo {
  width: number;
  height: number;
  frameRate: number;
}

export interface AudioInfo {
  sampleRate: number;
  channels: number;
}

export interface CaptureState {
  status: CaptureStatus;
  /** What went wrong, for the user (status denied/busy/error, or a sound problem). */
  error: string;
  audioError: string;
  videos: Device[];
  inputs: Device[];
  outputs: Device[];
  /** The devices in use. */
  video: Device | null;
  audio: Device | null;
  stream: MediaStream | null;
  videoInfo: VideoInfo | null;
  audioInfo: AudioInfo | null;
}

export interface CapturePrefs {
  videoDeviceId: string;
  audioDeviceId: string;
  quality: string;
}

/** The part of navigator.mediaDevices the controller uses (a fake in the tests). */
export type MediaLike = Pick<
  MediaDevices,
  "getUserMedia" | "enumerateDevices" | "addEventListener" | "removeEventListener"
>;

/** Where the sound goes (AudioEngine). */
export interface AudioSink {
  attach(stream: MediaStream): void;
  detach(): void;
}

export const INITIAL_STATE: CaptureState = {
  status: "idle",
  error: "",
  audioError: "",
  videos: [],
  inputs: [],
  outputs: [],
  video: null,
  audio: null,
  stream: null,
  videoInfo: null,
  audioInfo: null,
};

const errorName = (err: unknown) =>
  err && typeof err === "object" && "name" in err ? String(err.name) : "";

/** A failed getUserMedia as a status and a sentence for the user. */
export function describeError(
  err: unknown,
  what: "card" | "sound",
): {
  status: CaptureStatus;
  message: string;
} {
  const name = errorName(err);
  const thing = what === "card" ? "The capture card" : "The sound input";
  switch (name) {
    case "NotAllowedError":
    case "SecurityError":
      return {
        status: "denied",
        message: `${thing} may not be used. Allow camera and microphone access for Lu Videocard in the Windows privacy settings.`,
      };
    case "NotReadableError":
    case "TrackStartError":
    case "AbortError":
      return {
        status: "busy",
        message: `${thing} is in use by another program (OBS, Discord's camera, the Camera app, …). Close it there and try again.`,
      };
    case "NotFoundError":
    case "OverconstrainedError":
      return { status: "no-device", message: `${thing} wasn't found. Is it plugged in?` };
    default: {
      const detail = err instanceof Error && err.message ? ` (${err.message})` : "";
      return { status: "error", message: `${thing} couldn't be started${detail}.` };
    }
  }
}

function stopStream(stream: MediaStream | null | undefined) {
  stream?.getTracks().forEach((t) => t.stop());
}

export class CaptureController {
  private state: CaptureState = INITIAL_STATE;
  private listeners = new Set<(s: CaptureState) => void>();
  private audioStream: MediaStream | null = null;
  /** Bumped by every start/stop, so the results of an older, slower start are thrown away. */
  private gen = 0;
  private audioGen = 0;
  private prefs: CapturePrefs | null = null;
  private disposed = false;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  /** How many times in a row a busy card was tried again. */
  private busyRetries = 0;
  /** The camera that was unplugged; the picture restarts when exactly this one is back. */
  private lostDeviceId = "";

  constructor(
    private readonly media: MediaLike,
    private readonly sink: AudioSink,
  ) {
    this.media.addEventListener("devicechange", this.onDeviceChange);
  }

  get current(): CaptureState {
    return this.state;
  }

  subscribe(fn: (s: CaptureState) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private set(patch: Partial<CaptureState>) {
    this.state = { ...this.state, ...patch };
    for (const fn of this.listeners) fn(this.state);
  }

  /** Reads the device lists; returns them as well. */
  async refreshDevices() {
    const list = await this.media.enumerateDevices();
    const lists = {
      videos: devicesOf(list, "videoinput"),
      inputs: devicesOf(list, "audioinput"),
      outputs: devicesOf(list, "audiooutput"),
    };
    if (!this.disposed) this.set(lists);
    return lists;
  }

  /**
   * Device names are only visible once access was granted. Electron grants it up front; in a
   * plain browser a short look at the camera and the microphone asks for it.
   */
  private async ensureLabels() {
    let lists = await this.refreshDevices();
    const unnamed = (ds: Device[]) => ds.length > 0 && ds.every((d) => !d.label);
    if (!unnamed(lists.videos) && !unnamed(lists.inputs)) return lists;
    for (const kind of ["video", "audio"] as const) {
      if (!unnamed(kind === "video" ? lists.videos : lists.inputs)) continue;
      try {
        stopStream(await this.media.getUserMedia({ [kind]: true }));
      } catch (err) {
        if (kind === "video") throw err;
      }
    }
    lists = await this.refreshDevices();
    return lists;
  }

  /** (Re)starts picture and sound with `prefs`. */
  start(prefs: CapturePrefs): Promise<void> {
    this.busyRetries = 0;
    return this.run(prefs);
  }

  private async run(prefs: CapturePrefs): Promise<void> {
    this.prefs = prefs;
    this.lostDeviceId = "";
    this.clearRetry();
    const gen = ++this.gen;
    this.releaseVideo();
    this.releaseAudio();
    this.set({ status: "starting", error: "", audioError: "" });

    let videos: Device[];
    let inputs: Device[];
    try {
      ({ videos, inputs } = await this.ensureLabels());
    } catch (err) {
      if (gen !== this.gen) return;
      const { status, message } = describeError(err, "card");
      this.set({ status, error: message, video: null, audio: null });
      return;
    }
    if (gen !== this.gen) return;

    const video = pickVideo(videos, prefs.videoDeviceId);
    if (!video) {
      this.set({
        status: "no-device",
        error: "Plug it in – Lu Videocard starts as soon as it is there.",
        video: null,
        audio: null,
      });
      return;
    }

    let stream: MediaStream;
    try {
      stream = await this.media.getUserMedia({
        video: videoConstraints(video.deviceId, qualityById(prefs.quality)),
        audio: false,
      });
    } catch (err) {
      if (gen !== this.gen) return;
      const { status, message } = describeError(err, "card");
      this.set({ status, error: message, video, audio: null });
      // A busy card is often freed a moment later (another program closing it); try again a few
      // times, then wait for the user's "Try again".
      if (status === "busy" && this.busyRetries < 5) {
        this.busyRetries++;
        this.scheduleRetry(4000);
      }
      return;
    }
    if (gen !== this.gen || this.disposed) {
      stopStream(stream);
      return;
    }

    const track = stream.getVideoTracks()[0];
    const s = track?.getSettings() ?? {};
    track?.addEventListener("ended", () => {
      if (gen !== this.gen) return;
      this.releaseVideo();
      this.releaseAudio();
      this.lostDeviceId = video.deviceId;
      this.set({
        status: "lost",
        error: "Plug it back in – the picture comes back by itself.",
      });
    });

    this.busyRetries = 0;
    this.set({
      status: "live",
      error: "",
      video,
      stream,
      videoInfo: {
        width: s.width ?? 0,
        height: s.height ?? 0,
        frameRate: Math.round((s.frameRate ?? 0) * 100) / 100,
      },
    });

    await this.startAudio(pickAudio(inputs, video, prefs.audioDeviceId), gen);
  }

  /** Switches the sound input only (the picture keeps running). */
  async setAudioDevice(audioDeviceId: string): Promise<void> {
    if (this.prefs) this.prefs = { ...this.prefs, audioDeviceId };
    if (this.state.status !== "live") return;
    const { inputs } = await this.refreshDevices();
    await this.startAudio(pickAudio(inputs, this.state.video, audioDeviceId), this.gen);
  }

  private async startAudio(device: Device | null, gen: number) {
    const audioGen = ++this.audioGen;
    this.releaseAudio();
    if (!device) {
      const off = this.prefs?.audioDeviceId === AUDIO_OFF;
      this.set({
        audio: null,
        audioInfo: null,
        audioError: off
          ? ""
          : "No sound input of the capture card found. Pick one in Settings → Sound.",
      });
      return;
    }
    let stream: MediaStream;
    try {
      stream = await this.media.getUserMedia({
        audio: audioConstraints(device.deviceId),
        video: false,
      });
    } catch (err) {
      if (gen !== this.gen || audioGen !== this.audioGen) return;
      this.set({ audio: null, audioInfo: null, audioError: describeError(err, "sound").message });
      return;
    }
    if (gen !== this.gen || audioGen !== this.audioGen || this.disposed) {
      stopStream(stream);
      return;
    }
    this.audioStream = stream;
    const track = stream.getAudioTracks()[0];
    const s = track?.getSettings() ?? {};
    track?.addEventListener("ended", () => {
      if (audioGen !== this.audioGen) return;
      this.releaseAudio();
      this.set({ audio: null, audioInfo: null, audioError: "The sound input was disconnected." });
    });
    this.sink.attach(stream);
    this.set({
      audio: device,
      audioError: "",
      audioInfo: { sampleRate: s.sampleRate ?? 0, channels: s.channelCount ?? 0 },
    });
  }

  private releaseVideo() {
    stopStream(this.state.stream);
    if (this.state.stream) this.set({ stream: null, videoInfo: null });
  }

  private releaseAudio() {
    this.sink.detach();
    stopStream(this.audioStream);
    this.audioStream = null;
  }

  stop(): void {
    this.gen++;
    this.audioGen++;
    this.clearRetry();
    this.releaseVideo();
    this.releaseAudio();
    this.set({
      status: "idle",
      video: null,
      audio: null,
      audioInfo: null,
      error: "",
      audioError: "",
    });
  }

  dispose(): void {
    this.stop();
    this.disposed = true;
    this.listeners.clear();
    this.media.removeEventListener("devicechange", this.onDeviceChange);
  }

  /** Starts again after `ms` – if it is still needed then (or always, with `force`). */
  private scheduleRetry(ms: number, force = false) {
    this.clearRetry();
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      const { status } = this.state;
      const needed = force || ["busy", "lost", "no-device"].includes(status);
      if (this.prefs && !this.disposed && needed) {
        void this.run(this.prefs);
      }
    }, ms);
  }

  private clearRetry() {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
  }

  /** A device came or went: refresh the lists and start again when the card is back. */
  private onDeviceChange = () => {
    if (this.disposed) return;
    void this.refreshDevices()
      .then(({ videos, inputs }) => {
        const prefs = this.prefs;
        if (!prefs || this.disposed) return;
        const { status, video } = this.state;
        const has = (id: string) => videos.some((d) => d.deviceId === id);
        // Windows needs a moment to finish setting a new device up, hence the short delays.
        if (status === "lost") {
          if (this.lostDeviceId && has(this.lostDeviceId)) this.scheduleRetry(800);
        } else if (status === "no-device") {
          if (videos.length > 0) this.scheduleRetry(800);
        } else if (status === "live" && video) {
          // Picked automatically, but only a webcam was there: a capture card plugged in later
          // takes over.
          const better = pickVideo(videos, "");
          if (
            !prefs.videoDeviceId &&
            better &&
            better.deviceId !== video.deviceId &&
            captureScore(better.label) > Math.max(0, captureScore(video.label))
          ) {
            this.scheduleRetry(800, true);
          } else if (!this.state.audio && prefs.audioDeviceId !== AUDIO_OFF) {
            // The card's sound showed up after its picture.
            const device = pickAudio(inputs, video, prefs.audioDeviceId);
            if (device) void this.startAudio(device, this.gen);
          }
        }
      })
      .catch(() => undefined);
  };
}
