import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { AudioEngine } from "../lib/audio";
import { getBridge, type UpdateStatus, type WindowStatus } from "../lib/bridge";
import { CaptureController, INITIAL_STATE, type CaptureState } from "../lib/capture";
import { loadSettings, saveSettings, type Settings } from "../lib/settings";

const storage = () => {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
};

/** The settings, remembered in localStorage. */
export function useSettings() {
  const [settings, setSettings] = useState<Settings>(() => loadSettings(storage()));
  const update = useCallback((patch: Partial<Settings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      saveSettings(storage(), next);
      return next;
    });
  }, []);
  return [settings, update] as const;
}

const noopSubscribe = () => () => undefined;

/** navigator.mediaDevices – missing outside secure pages and in some test setups. */
function mediaDevices(): MediaDevices | null {
  const media = (navigator as Partial<Navigator>).mediaDevices;
  return media && typeof media.getUserMedia === "function" ? media : null;
}

/**
 * The capture card: a CaptureController and the AudioEngine it plays into, (re)started whenever
 * the camera, the quality or the sound input changes.
 */
export function useCapture(settings: Settings) {
  // Made once; StrictMode's extra unmount/mount only stops and restarts them (the engine makes a
  // new AudioContext when it plays again).
  const [parts] = useState(() => {
    const media = mediaDevices();
    if (!media) return null;
    const engine = new AudioEngine();
    return { controller: new CaptureController(media, engine), engine };
  });

  useEffect(() => {
    if (!parts) return;
    return () => {
      parts.controller.stop();
      parts.engine.close();
    };
  }, [parts]);

  const controller = parts?.controller ?? null;
  const engine = parts?.engine ?? null;
  const subscribe = useCallback(
    (fn: () => void) => (controller ? controller.subscribe(fn) : noopSubscribe()),
    [controller],
  );
  const state: CaptureState = useSyncExternalStore(
    subscribe,
    () => controller?.current ?? INITIAL_STATE,
  );

  const { videoDeviceId, quality, audioDeviceId } = settings;
  // The sound input in use when the last full start ran; a later change switches the sound alone.
  const startedAudio = useRef<string | null>(null);
  // The latest sound setting, for the starts below that don't re-run when it changes.
  const audioDeviceIdRef = useRef(audioDeviceId);
  useEffect(() => {
    audioDeviceIdRef.current = audioDeviceId;
  }, [audioDeviceId]);

  useEffect(() => {
    if (!controller) return;
    startedAudio.current = audioDeviceIdRef.current;
    void controller.start({ videoDeviceId, quality, audioDeviceId: audioDeviceIdRef.current });
  }, [controller, videoDeviceId, quality]);

  useEffect(() => {
    if (!controller || startedAudio.current === null || startedAudio.current === audioDeviceId) {
      return;
    }
    startedAudio.current = audioDeviceId;
    void controller.setAudioDevice(audioDeviceId);
  }, [controller, audioDeviceId]);

  useEffect(() => {
    engine?.setVolume(settings.volume, settings.muted);
  }, [engine, settings.volume, settings.muted]);

  const [outputFailed, setOutputFailed] = useState(false);
  useEffect(() => {
    if (!engine) return;
    let alive = true;
    void engine.setOutput(settings.outputDeviceId).then((ok) => {
      if (alive) setOutputFailed(!ok);
    });
    return () => {
      alive = false;
    };
  }, [engine, settings.outputDeviceId]);

  const restart = useCallback(() => {
    if (!controller) return;
    startedAudio.current = audioDeviceIdRef.current;
    void controller.start({ videoDeviceId, quality, audioDeviceId: audioDeviceIdRef.current });
  }, [controller, videoDeviceId, quality]);

  return {
    state,
    engine,
    restart,
    outputFailed,
    supported: parts !== null,
  };
}

/** Fullscreen of the whole window (Electron), or of the page in a plain browser. */
export function useWindowStatus() {
  const bridge = getBridge();
  const [status, setStatus] = useState<WindowStatus>({ fullscreen: false, maximized: false });

  useEffect(() => {
    if (bridge) {
      void bridge.windowState().then(setStatus);
      return bridge.on("win:state", setStatus);
    }
    const onChange = () =>
      setStatus((s) => ({ ...s, fullscreen: document.fullscreenElement !== null }));
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, [bridge]);

  const setFullscreen = useCallback(
    (on: boolean) => {
      if (bridge) {
        void bridge.setFullScreen(on).then(setStatus);
      } else if (on && !document.fullscreenElement) {
        void document.documentElement.requestFullscreen?.().catch(() => undefined);
      } else if (!on && document.fullscreenElement) {
        void document.exitFullscreen?.().catch(() => undefined);
      }
    },
    [bridge],
  );

  return { ...status, setFullscreen };
}

/**
 * True once the mouse and keyboard have rested for `ms` while `active`; any movement makes it
 * false again.
 */
export function useIdle(ms: number, active: boolean) {
  const [idle, setIdle] = useState(false);
  useEffect(() => {
    if (!active) return;
    let timer = setTimeout(() => setIdle(true), ms);
    const wake = () => {
      setIdle(false);
      clearTimeout(timer);
      timer = setTimeout(() => setIdle(true), ms);
    };
    const events = ["mousemove", "mousedown", "keydown", "wheel", "touchstart"] as const;
    for (const e of events) window.addEventListener(e, wake, { passive: true });
    return () => {
      clearTimeout(timer);
      for (const e of events) window.removeEventListener(e, wake);
      setIdle(false);
    };
  }, [ms, active]);
  return active && idle;
}

/** The updater's state; looks for a new version a few seconds after the start when `auto`. */
export function useUpdates(auto: boolean) {
  const bridge = getBridge();
  const [status, setStatus] = useState<UpdateStatus | null>(null);

  useEffect(() => {
    if (!bridge) return;
    void bridge.updateState().then(setStatus);
    return bridge.on("update:status", setStatus);
  }, [bridge]);

  const autoChecked = useRef(false);
  useEffect(() => {
    if (!bridge || !auto || autoChecked.current) return;
    const t = setTimeout(() => {
      autoChecked.current = true;
      void bridge.updateCheck().then(setStatus);
    }, 6000);
    return () => clearTimeout(t);
  }, [bridge, auto]);

  return {
    status,
    check: () => bridge && void bridge.updateCheck().then(setStatus),
    download: () => bridge && void bridge.updateDownload().then(setStatus),
    install: () => bridge && void bridge.updateInstall(),
  };
}
