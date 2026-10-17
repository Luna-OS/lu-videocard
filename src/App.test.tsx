import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";

class FakeTrack extends EventTarget {
  constructor(readonly kind: "video" | "audio") {
    super();
  }
  stop() {}
  getSettings(): MediaTrackSettings {
    return this.kind === "video"
      ? { width: 1920, height: 1080, frameRate: 60 }
      : { sampleRate: 48000, channelCount: 2 };
  }
}

const fakeStream = (kind: "video" | "audio") => {
  const track = new FakeTrack(kind);
  return {
    getTracks: () => [track],
    getVideoTracks: () => (kind === "video" ? [track] : []),
    getAudioTracks: () => (kind === "audio" ? [track] : []),
  } as unknown as MediaStream;
};

const device = (kind: MediaDeviceKind, deviceId: string, label: string, groupId: string) =>
  ({ kind, deviceId, label, groupId, toJSON: () => ({}) }) as MediaDeviceInfo;

function installMedia(devices: MediaDeviceInfo[]) {
  const target = new EventTarget();
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: {
      enumerateDevices: () => Promise.resolve(devices),
      getUserMedia: (c: MediaStreamConstraints) =>
        Promise.resolve(fakeStream(c.video ? "video" : "audio")),
      addEventListener: target.addEventListener.bind(target),
      removeEventListener: target.removeEventListener.bind(target),
    },
  });
}

beforeEach(() => {
  localStorage.clear();
  // jsdom has no media playback.
  vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(() => Promise.resolve());
});

afterEach(() => {
  vi.restoreAllMocks();
  Reflect.deleteProperty(navigator, "mediaDevices");
});

describe("App", () => {
  it("says so where cameras can't be used", async () => {
    Reflect.deleteProperty(navigator, "mediaDevices");
    render(<App />);
    expect(await screen.findByText("Cameras aren't available here")).toBeInTheDocument();
  });

  it("shows the capture card live, with its sound, and opens the settings", async () => {
    installMedia([
      device("videoinput", "cam", "Integrated Webcam", "g1"),
      device("videoinput", "card", "USB3 Video", "g2"),
      device("audioinput", "snd", "Digital Audio Interface (USB3 Video)", "g2"),
    ]);
    render(<App />);
    expect(await screen.findByText(/Live · 1920×1080 · 60 fps/)).toBeInTheDocument();
    expect(screen.queryByText("No sound")).not.toBeInTheDocument();

    act(() => {
      fireEvent.keyDown(window, { key: ",", ctrlKey: true });
    });
    const panel = screen.getByRole("complementary", { name: "Settings" });
    expect(panel).toBeInTheDocument();
    expect(screen.getByLabelText("Capture card")).toHaveDisplayValue(
      "Automatic (finds the capture card)",
    );

    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("complementary", { name: "Settings" })).not.toBeInTheDocument();
  });

  it("remembers mute and volume", async () => {
    installMedia([
      device("videoinput", "card", "USB3 Video", "g2"),
      device("audioinput", "snd", "Digital Audio Interface (USB3 Video)", "g2"),
    ]);
    render(<App />);
    await screen.findByText(/Live/);
    fireEvent.keyDown(window, { key: "m" });
    fireEvent.keyDown(window, { key: "ArrowDown" });
    const saved = JSON.parse(localStorage.getItem("lu-videocard.settings.v1") ?? "{}") as {
      muted: boolean;
      volume: number;
    };
    // ArrowDown changes the volume and unmutes, like any volume change.
    expect(saved.volume).toBe(0.75);
    expect(saved.muted).toBe(false);
  });

  it("no capture card: explains and offers to try again", async () => {
    installMedia([]);
    render(<App />);
    expect(await screen.findByText("No capture card found")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Try again/ })).toBeInTheDocument();
  });
});
