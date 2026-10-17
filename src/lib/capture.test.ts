import { afterEach, describe, expect, it, vi } from "vitest";
import { CaptureController, describeError } from "./capture";

class FakeTrack extends EventTarget {
  stopped = false;
  constructor(
    readonly kind: "video" | "audio",
    private readonly settings: MediaTrackSettings,
  ) {
    super();
  }
  stop() {
    this.stopped = true;
  }
  getSettings() {
    return this.settings;
  }
  end() {
    this.dispatchEvent(new Event("ended"));
  }
}

class FakeStream {
  constructor(readonly tracks: FakeTrack[]) {}
  getTracks() {
    return this.tracks;
  }
  getVideoTracks() {
    return this.tracks.filter((t) => t.kind === "video");
  }
  getAudioTracks() {
    return this.tracks.filter((t) => t.kind === "audio");
  }
}

const info = (kind: MediaDeviceKind, deviceId: string, label: string, groupId = "") =>
  ({ kind, deviceId, label, groupId, toJSON: () => ({}) }) as MediaDeviceInfo;

const CARD = [
  info("videoinput", "cam", "Integrated Webcam", "g-laptop"),
  info("videoinput", "card", "USB3 Video", "g-card"),
  info("audioinput", "default", "Default - Microphone Array (Realtek(R) Audio)"),
  info("audioinput", "mic", "Microphone Array (Realtek(R) Audio)", "g-laptop"),
  info("audioinput", "snd", "Digital Audio Interface (USB3 Video)", "g-card"),
  info("audiooutput", "spk", "Speakers (Realtek(R) Audio)"),
];

function fakeMedia(devices: MediaDeviceInfo[]) {
  const target = new EventTarget();
  const tracks: FakeTrack[] = [];
  const media = {
    devices,
    failVideo: null as null | Error,
    failAudio: null as null | Error,
    calls: [] as MediaStreamConstraints[],
    tracks,
    enumerateDevices: vi.fn(() => Promise.resolve(media.devices)),
    getUserMedia: vi.fn((c: MediaStreamConstraints) => {
      media.calls.push(c);
      if (c.video && media.failVideo) return Promise.reject(media.failVideo);
      if (c.audio && !c.video && media.failAudio) return Promise.reject(media.failAudio);
      const t = c.video
        ? new FakeTrack("video", { width: 1920, height: 1080, frameRate: 59.94 })
        : new FakeTrack("audio", { sampleRate: 48000, channelCount: 2 });
      tracks.push(t);
      return Promise.resolve(new FakeStream([t]) as unknown as MediaStream);
    }),
    addEventListener: target.addEventListener.bind(target),
    removeEventListener: target.removeEventListener.bind(target),
    change(next: MediaDeviceInfo[]) {
      media.devices = next;
      target.dispatchEvent(new Event("devicechange"));
    },
  };
  return media;
}

/** An error like the ones getUserMedia rejects with (a DOMException with a name). */
const domError = (name: string) => Object.assign(new Error(name), { name });

const sink = () => ({ attach: vi.fn(), detach: vi.fn() });
const prefs = { videoDeviceId: "", audioDeviceId: "", quality: "1080p60" };

const exactId = (c: MediaStreamConstraints, kind: "video" | "audio") =>
  ((c[kind] as MediaTrackConstraints).deviceId as { exact: string }).exact;

afterEach(() => {
  vi.useRealTimers();
});

describe("CaptureController", () => {
  it("opens the capture card with its own sound, not the webcam or the microphone", async () => {
    const media = fakeMedia(CARD);
    const out = sink();
    const c = new CaptureController(media, out);
    await c.start(prefs);

    const s = c.current;
    expect(s.status).toBe("live");
    expect(s.video?.deviceId).toBe("card");
    expect(s.audio?.deviceId).toBe("snd");
    expect(s.videoInfo).toEqual({ width: 1920, height: 1080, frameRate: 59.94 });
    expect(s.audioInfo).toEqual({ sampleRate: 48000, channels: 2 });
    expect(s.videos.map((d) => d.deviceId)).toEqual(["cam", "card"]);
    expect(s.inputs.map((d) => d.deviceId)).toEqual(["mic", "snd"]);
    expect(out.attach).toHaveBeenCalledTimes(1);

    expect(exactId(media.calls[0], "video")).toBe("card");
    const audio = media.calls[1].audio as MediaTrackConstraints;
    expect(audio.echoCancellation).toBe(false);
    expect(exactId(media.calls[1], "audio")).toBe("snd");
    c.dispose();
  });

  it("restarting stops the old streams", async () => {
    const media = fakeMedia(CARD);
    const c = new CaptureController(media, sink());
    await c.start(prefs);
    await c.start({ ...prefs, quality: "720p60" });
    expect(media.tracks.slice(0, 2).every((t) => t.stopped)).toBe(true);
    expect(media.tracks.slice(2).some((t) => t.stopped)).toBe(false);
    c.dispose();
    expect(media.tracks.every((t) => t.stopped)).toBe(true);
  });

  it("a slower, older start never wins over a newer one", async () => {
    const media = fakeMedia(CARD);
    const c = new CaptureController(media, sink());
    const first = c.start(prefs);
    const second = c.start({ ...prefs, videoDeviceId: "cam", audioDeviceId: "none" });
    await Promise.all([first, second]);
    expect(c.current.video?.deviceId).toBe("cam");
    expect(c.current.audio).toBeNull();
    expect(c.current.audioError).toBe("");
    const live = media.tracks.filter((t) => !t.stopped);
    expect(live).toHaveLength(1);
    c.dispose();
  });

  it("no camera at all: waits and starts when the card is plugged in", async () => {
    vi.useFakeTimers();
    const media = fakeMedia([]);
    const c = new CaptureController(media, sink());
    await c.start(prefs);
    expect(c.current.status).toBe("no-device");

    media.change(CARD);
    await vi.advanceTimersByTimeAsync(1000);
    expect(c.current.status).toBe("live");
    expect(c.current.video?.deviceId).toBe("card");
    c.dispose();
  });

  it("unplugged: says so, does not jump to the webcam, and comes back with the card", async () => {
    vi.useFakeTimers();
    const media = fakeMedia(CARD);
    const c = new CaptureController(media, sink());
    await c.start(prefs);
    media.tracks[0].end();
    expect(c.current.status).toBe("lost");
    expect(c.current.stream).toBeNull();

    const withoutCard = CARD.filter((d) => d.groupId !== "g-card");
    media.change(withoutCard);
    await vi.advanceTimersByTimeAsync(2000);
    expect(c.current.status).toBe("lost");

    media.change(CARD);
    await vi.advanceTimersByTimeAsync(1000);
    expect(c.current.status).toBe("live");
    expect(c.current.video?.deviceId).toBe("card");
    c.dispose();
  });

  it("a card in use by another program: busy, retried a few times, then left alone", async () => {
    vi.useFakeTimers();
    const media = fakeMedia(CARD);
    media.failVideo = domError("NotReadableError");
    const c = new CaptureController(media, sink());
    await c.start(prefs);
    expect(c.current.status).toBe("busy");
    expect(c.current.error).toMatch(/in use by another program/);

    await vi.advanceTimersByTimeAsync(60_000);
    const videoCalls = media.calls.filter((x) => x.video && typeof x.video === "object");
    expect(videoCalls).toHaveLength(6);

    media.failVideo = null;
    await c.start(prefs);
    expect(c.current.status).toBe("live");
    c.dispose();
  });

  it("a failing sound input keeps the picture", async () => {
    const media = fakeMedia(CARD);
    media.failAudio = domError("NotReadableError");
    const c = new CaptureController(media, sink());
    await c.start(prefs);
    expect(c.current.status).toBe("live");
    expect(c.current.audio).toBeNull();
    expect(c.current.audioError).toMatch(/sound input is in use/i);
    c.dispose();
  });

  it("switches the sound alone, and to no sound", async () => {
    const media = fakeMedia(CARD);
    const out = sink();
    const c = new CaptureController(media, out);
    await c.start(prefs);
    const stream = c.current.stream;
    await c.setAudioDevice("mic");
    expect(c.current.audio?.deviceId).toBe("mic");
    expect(c.current.stream).toBe(stream);
    await c.setAudioDevice("none");
    expect(c.current.audio).toBeNull();
    expect(c.current.audioError).toBe("");
    c.dispose();
  });

  it("auto mode: a capture card plugged in later replaces the webcam", async () => {
    vi.useFakeTimers();
    const webcamOnly = CARD.filter((d) => d.groupId !== "g-card");
    const media = fakeMedia(webcamOnly);
    const c = new CaptureController(media, sink());
    await c.start(prefs);
    expect(c.current.video?.deviceId).toBe("cam");
    expect(c.current.audio).toBeNull();

    media.change(CARD);
    await vi.advanceTimersByTimeAsync(1000);
    expect(c.current.video?.deviceId).toBe("card");
    expect(c.current.audio?.deviceId).toBe("snd");
    c.dispose();
  });

  it("permission refused", async () => {
    const media = fakeMedia(CARD);
    media.failVideo = domError("NotAllowedError");
    const c = new CaptureController(media, sink());
    await c.start(prefs);
    expect(c.current.status).toBe("denied");
    c.dispose();
  });
});

describe("describeError", () => {
  it("maps browser errors to a status", () => {
    expect(describeError({ name: "NotFoundError" }, "card").status).toBe("no-device");
    expect(describeError(new Error("boom"), "card")).toEqual({
      status: "error",
      message: "The capture card couldn't be started (boom).",
    });
  });
});
