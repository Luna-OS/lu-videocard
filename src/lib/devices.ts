/**
 * Finding the capture card among the cameras and microphones, and the constraints that get the
 * best picture and an untouched sound out of it.
 *
 * HDMI capture cards (like the BENFEI 4K HDMI → USB-C/A card) are plain UVC/UAC devices: Windows
 * shows them as a camera ("USB Video", "USB3 Video", "HDMI Capture", …) plus a microphone that
 * belongs to the same USB device ("Digital Audio Interface (USB3 Video)", …). Chromium gives both
 * the same groupId, which is how the sound is paired with the picture.
 */

export interface Device {
  deviceId: string;
  label: string;
  groupId: string;
}

/** Windows lists the default devices a second time under these ids; they are not real devices. */
const PSEUDO_IDS = new Set(["default", "communications"]);

/** Words that capture cards (and their sound) carry in their names. */
const CAPTURE_HINTS: RegExp[] = [
  /capture/i,
  /\bhdmi\b/i,
  /usb\s*3?(\.0)?\s*video/i,
  /\bms21\d\d\b/i,
  /\buvc\b/i,
  /cam\s*link/i,
  /benfei/i,
  /grabber/i,
  /\bav\s*to\s*usb\b/i,
  /digital audio interface/i,
  /usb digital audio/i,
  /elgato|avermedia|live gamer|hagibis|ugreen|guermok|genki|ripsaw|magewell/i,
];

/** Words of webcams, virtual cameras and ordinary microphones – never the capture card. */
const OTHER_HINTS: RegExp[] = [
  /webcam/i,
  /integrated/i,
  /facetime/i,
  /\bir\b/i,
  /front|rear|user facing/i,
  /virtual|obs|snap camera|broadcast|droidcam|iriun|epoccam|xsplit|vcam/i,
  /\bbrio\b|\bc9\d\d\b|\bc270\b|kiyo/i,
  /headset|headphone|microphone array|mic array|realtek|steam streaming|voicemeeter|cable output/i,
];

/** How much a device name looks like a capture card (> 0: probably one). */
export function captureScore(label: string): number {
  let score = 0;
  for (const re of CAPTURE_HINTS) if (re.test(label)) score += 2;
  for (const re of OTHER_HINTS) if (re.test(label)) score -= 3;
  return score;
}

/** The real devices of one kind, without Windows' "default"/"communications" duplicates. */
export function devicesOf(list: readonly MediaDeviceInfo[], kind: MediaDeviceKind): Device[] {
  const out: Device[] = [];
  const seen = new Set<string>();
  for (const d of list) {
    if (d.kind !== kind || !d.deviceId || PSEUDO_IDS.has(d.deviceId) || seen.has(d.deviceId)) {
      continue;
    }
    seen.add(d.deviceId);
    out.push({ deviceId: d.deviceId, label: d.label, groupId: d.groupId });
  }
  return out;
}

/** "USB3 Video (345f:2130)" → "usb3 video": the name without the USB ids Chromium adds. */
export function baseName(label: string): string {
  return label
    .replace(/\s*\([0-9a-f]{4}:[0-9a-f]{4}\)\s*$/i, "")
    .trim()
    .toLowerCase();
}

/**
 * The camera to show: the saved one when it is still there, otherwise the one that looks most
 * like a capture card, otherwise the first camera.
 */
export function pickVideo(videos: readonly Device[], savedId: string): Device | null {
  if (videos.length === 0) return null;
  const saved = savedId ? videos.find((d) => d.deviceId === savedId) : undefined;
  if (saved) return saved;
  let best = videos[0];
  let bestScore = captureScore(best.label);
  for (const d of videos.slice(1)) {
    const s = captureScore(d.label);
    if (s > bestScore) {
      best = d;
      bestScore = s;
    }
  }
  return best;
}

/** What the audio setting holds: "" picks the card's own sound, "none" switches sound off. */
export const AUDIO_AUTO = "";
export const AUDIO_OFF = "none";

/**
 * The sound input that belongs to `video`. A saved choice wins; otherwise the input on the same
 * USB device (same groupId, or the camera's name inside the input's name), otherwise an input that
 * looks like a capture card. Never an ordinary microphone: playing that back would only make
 * feedback, so then the answer is null (no sound) and the user can pick one by hand.
 */
export function pickAudio(
  inputs: readonly Device[],
  video: Device | null,
  savedId: string,
): Device | null {
  if (savedId === AUDIO_OFF) return null;
  if (savedId) {
    const saved = inputs.find((d) => d.deviceId === savedId);
    if (saved) return saved;
  }
  // A webcam's own microphone is no capture sound (and would only make feedback).
  if (video && captureScore(video.label) >= 0) {
    if (video.groupId) {
      const sameGroup = inputs.find((d) => d.groupId && d.groupId === video.groupId);
      if (sameGroup) return sameGroup;
    }
    const name = baseName(video.label);
    if (name.length >= 4) {
      const sameName = inputs.find((d) => d.label.toLowerCase().includes(name));
      if (sameName) return sameName;
    }
  }
  let best: Device | null = null;
  let bestScore = 0;
  for (const d of inputs) {
    const s = captureScore(d.label);
    if (s > bestScore) {
      best = d;
      bestScore = s;
    }
  }
  return best;
}

// ---------------------------------------------------------------- quality

export interface Quality {
  id: string;
  label: string;
  width: number;
  height: number;
  fps: number;
}

/** What the picture is asked for; the card delivers the closest mode it has. */
export const QUALITIES: readonly Quality[] = [
  { id: "1080p60", label: "1080p · 60 fps", width: 1920, height: 1080, fps: 60 },
  { id: "1080p30", label: "1080p · 30 fps", width: 1920, height: 1080, fps: 30 },
  { id: "1440p30", label: "1440p · 30 fps", width: 2560, height: 1440, fps: 30 },
  { id: "2160p30", label: "4K · 30 fps", width: 3840, height: 2160, fps: 30 },
  { id: "720p60", label: "720p · 60 fps", width: 1280, height: 720, fps: 60 },
];

export const DEFAULT_QUALITY = "1080p60";

export function qualityById(id: string): Quality {
  return QUALITIES.find((q) => q.id === id) ?? QUALITIES[0];
}

/**
 * The camera constraints: the exact device, and the quality as "ideal" so a card without that
 * mode still starts with the nearest one. resizeMode "none" keeps the card's own pixels instead of
 * letting Chromium scale them.
 */
export function videoConstraints(deviceId: string, quality: Quality): MediaTrackConstraints {
  return {
    deviceId: { exact: deviceId },
    width: { ideal: quality.width },
    height: { ideal: quality.height },
    frameRate: { ideal: quality.fps },
    resizeMode: "none",
  } as MediaTrackConstraints;
}

/**
 * The sound constraints: the exact input, in stereo at 48 kHz, and none of the voice-call
 * processing (echo cancellation, noise suppression, automatic gain) that would make game sound
 * and music thin, pumping or muffled.
 */
export function audioConstraints(deviceId: string): MediaTrackConstraints {
  return {
    deviceId: { exact: deviceId },
    echoCancellation: false,
    noiseSuppression: false,
    autoGainControl: false,
    channelCount: { ideal: 2 },
    sampleRate: { ideal: 48000 },
    sampleSize: { ideal: 16 },
    latency: { ideal: 0.01 },
  } as MediaTrackConstraints;
}

/** A device's name for the UI; unnamed devices get a numbered fallback. */
export function deviceLabel(d: Device, index: number, kind: "Camera" | "Input" | "Output"): string {
  return d.label || `${kind} ${index + 1}`;
}
