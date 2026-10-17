import { describe, expect, it } from "vitest";
import {
  AUDIO_OFF,
  audioConstraints,
  baseName,
  captureScore,
  devicesOf,
  pickAudio,
  pickVideo,
  qualityById,
  videoConstraints,
  type Device,
} from "./devices";

const info = (kind: MediaDeviceKind, deviceId: string, label: string, groupId = "") =>
  ({ kind, deviceId, label, groupId, toJSON: () => ({}) }) as MediaDeviceInfo;

const dev = (deviceId: string, label: string, groupId = ""): Device => ({
  deviceId,
  label,
  groupId,
});

describe("captureScore", () => {
  it("knows capture cards", () => {
    for (const name of [
      "USB3 Video",
      "USB Video (345f:2130)",
      "HDMI Capture",
      "Video Capture Device",
      "Cam Link 4K",
      "Digital Audio Interface (USB3 Video)",
      "MS2130",
    ]) {
      expect(captureScore(name), name).toBeGreaterThan(0);
    }
  });

  it("knows webcams, virtual cameras and microphones", () => {
    for (const name of [
      "Integrated Webcam",
      "HD Pro Webcam C920",
      "OBS Virtual Camera",
      "Microphone Array (Realtek(R) Audio)",
      "Headset Microphone (Arctis 7)",
      "Integrated Camera",
    ]) {
      expect(captureScore(name), name).toBeLessThan(0);
    }
  });
});

describe("devicesOf", () => {
  it("drops Windows' default/communications duplicates and other kinds", () => {
    const list = [
      info("audioinput", "default", "Default - Microphone (USB3 Video)"),
      info("audioinput", "communications", "Communications - Mic"),
      info("audioinput", "a1", "Microphone (USB3 Video)", "g1"),
      info("audioinput", "a1", "Microphone (USB3 Video)", "g1"),
      info("videoinput", "v1", "USB3 Video", "g1"),
      info("audioinput", "", ""),
    ];
    expect(devicesOf(list, "audioinput")).toEqual([dev("a1", "Microphone (USB3 Video)", "g1")]);
    expect(devicesOf(list, "videoinput")).toEqual([dev("v1", "USB3 Video", "g1")]);
  });
});

describe("pickVideo", () => {
  const webcam = dev("cam", "Integrated Webcam");
  const card = dev("card", "USB3 Video");
  it("prefers the capture card over a webcam", () => {
    expect(pickVideo([webcam, card], "")).toBe(card);
  });
  it("keeps the saved choice while it is connected", () => {
    expect(pickVideo([webcam, card], "cam")).toBe(webcam);
    expect(pickVideo([webcam, card], "gone")).toBe(card);
  });
  it("falls back to the first camera, or nothing", () => {
    const a = dev("a", "Camera A");
    expect(pickVideo([a, dev("b", "Camera B")], "")).toBe(a);
    expect(pickVideo([], "")).toBeNull();
  });
});

describe("pickAudio", () => {
  const card = dev("card", "USB3 Video (345f:2130)", "g-card");
  const mic = dev("mic", "Microphone Array (Realtek(R) Audio)", "g-laptop");
  const cardSound = dev("snd", "Digital Audio Interface (USB3 Video)", "g-card");

  it("pairs the sound of the same USB device", () => {
    expect(pickAudio([mic, cardSound], card, "")).toBe(cardSound);
  });
  it("pairs by name when there is no groupId", () => {
    const noGroup = dev("card", "USB3 Video (345f:2130)");
    const sound = dev("snd", "Microphone (USB3 Video)");
    expect(pickAudio([mic, sound], noGroup, "")).toBe(sound);
  });
  it("falls back to an input that looks like a capture card", () => {
    const other = dev("snd", "USB Digital Audio");
    expect(pickAudio([mic, other], dev("x", "Camera"), "")).toBe(other);
  });
  it("never picks an ordinary microphone on its own", () => {
    expect(pickAudio([mic], card, "")).toBeNull();
  });
  it("never pairs a webcam's own microphone", () => {
    const webcam = dev("w", "Integrated Webcam", "g-w");
    const webcamMic = dev("wm", "Microphone (Webcam Audio)", "g-w");
    expect(pickAudio([webcamMic], webcam, "")).toBeNull();
  });
  it("honours a saved choice and 'no sound'", () => {
    expect(pickAudio([mic, cardSound], card, "mic")).toBe(mic);
    expect(pickAudio([mic, cardSound], card, AUDIO_OFF)).toBeNull();
    expect(pickAudio([mic, cardSound], card, "gone")).toBe(cardSound);
  });
});

describe("constraints", () => {
  it("asks for the quality as ideal and the device exactly", () => {
    const c = videoConstraints("v1", qualityById("1080p60")) as Record<string, unknown>;
    expect(c.deviceId).toEqual({ exact: "v1" });
    expect(c.width).toEqual({ ideal: 1920 });
    expect(c.height).toEqual({ ideal: 1080 });
    expect(c.frameRate).toEqual({ ideal: 60 });
    expect(c.resizeMode).toBe("none");
  });
  it("switches off all voice processing for the sound", () => {
    const c = audioConstraints("a1");
    expect(c.echoCancellation).toBe(false);
    expect(c.noiseSuppression).toBe(false);
    expect(c.autoGainControl).toBe(false);
    expect(c.channelCount).toEqual({ ideal: 2 });
  });
  it("unknown quality ids fall back to the first", () => {
    expect(qualityById("8k").id).toBe("1080p60");
  });
  it("strips USB ids from names", () => {
    expect(baseName("USB3 Video (345f:2130)")).toBe("usb3 video");
  });
});
