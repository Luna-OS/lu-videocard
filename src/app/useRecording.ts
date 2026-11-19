import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getBridge } from "../lib/bridge";
import type { RecordingSettings } from "../lib/enhance";
import { Recorder, ReplayBuffer, type RecordingSink } from "../lib/recording";

/** In a plain browser (no app) a recording is downloaded when it stops. */
function memorySink(): RecordingSink {
  const files = new Map<number, { ext: string; chunks: Uint8Array[]; kind: string }>();
  let next = 1;
  return {
    start: (ext, kind) => {
      const id = next++;
      files.set(id, { ext, chunks: [], kind });
      return Promise.resolve({ id, file: `Lu Videocard ${kind}.${ext}` });
    },
    write: (id, chunk) => {
      files.get(id)?.chunks.push(chunk);
      return Promise.resolve(chunk.length);
    },
    finish: (id) => {
      const f = files.get(id);
      files.delete(id);
      if (!f) return Promise.reject(new Error("Unknown recording."));
      const blob = new Blob(f.chunks as BlobPart[], { type: `video/${f.ext}` });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Lu Videocard ${f.kind}.${f.ext}`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      return Promise.resolve({ file: a.download, bytes: blob.size });
    },
    cancel: (id) => {
      files.delete(id);
      return Promise.resolve();
    },
  };
}

export interface RecordingState {
  recording: boolean;
  /** When the running recording started (ms since epoch), 0 otherwise. */
  startedAt: number;
  /** Seconds the replay buffer holds, 0 when it is off. */
  replaySeconds: number;
  busy: boolean;
}

/**
 * Recording and the replay buffer, on the stream the renderer provides. The replay buffer runs
 * whenever the picture is live and the setting asks for it.
 */
export function useRecording({
  live,
  settings,
  getStream,
  notify,
}: {
  live: boolean;
  settings: RecordingSettings;
  getStream: (withAudio: boolean) => MediaStream | null;
  notify: (text: string, tone: "info" | "error", file?: string) => void;
}) {
  const bridge = getBridge();
  const sink = useMemo<RecordingSink>(
    () =>
      bridge
        ? {
            start: (ext, kind) => bridge.recordingStart(ext, kind),
            write: (id, chunk) => bridge.recordingWrite(id, chunk),
            finish: (id) => bridge.recordingFinish(id),
            cancel: (id) => bridge.recordingCancel(id),
          }
        : memorySink(),
    [bridge],
  );
  const recorder = useRef<Recorder | null>(null);
  const replay = useRef<ReplayBuffer | null>(null);
  const [state, setState] = useState<RecordingState>({
    recording: false,
    startedAt: 0,
    replaySeconds: 0,
    busy: false,
  });

  const start = useCallback(async () => {
    if (recorder.current) return;
    const stream = getStream(settings.withAudio);
    if (!stream) {
      notify("There is no picture to record.", "error");
      return;
    }
    const r = new Recorder({ format: settings.format, bitrateMbps: settings.bitrateMbps, sink });
    try {
      await r.start(stream);
    } catch (err) {
      notify(err instanceof Error ? err.message : "Recording didn't start.", "error");
      return;
    }
    recorder.current = r;
    setState((s) => ({ ...s, recording: true, startedAt: Date.now() }));
  }, [getStream, settings, sink, notify]);

  const stop = useCallback(async () => {
    const r = recorder.current;
    if (!r) return;
    recorder.current = null;
    setState((s) => ({ ...s, recording: false, startedAt: 0, busy: true }));
    try {
      const done = await r.stop();
      const mb = (done.bytes / 1e6).toFixed(1);
      notify(`Recording saved (${mb} MB).`, "info", done.file);
    } catch (err) {
      notify(err instanceof Error ? err.message : "The recording couldn't be saved.", "error");
    } finally {
      setState((s) => ({ ...s, busy: false }));
    }
  }, [notify]);

  const toggle = useCallback(() => {
    if (recorder.current) void stop();
    else void start();
  }, [start, stop]);

  // The replay buffer follows the picture and the setting.
  const { replaySeconds, format, bitrateMbps, withAudio } = settings;
  useEffect(() => {
    if (!live || replaySeconds <= 0) return;
    const stream = getStream(withAudio);
    if (!stream) return;
    const b = new ReplayBuffer({ format, bitrateMbps, seconds: replaySeconds, sink });
    try {
      b.start(stream);
    } catch (err) {
      notify(err instanceof Error ? err.message : "The replay buffer didn't start.", "error");
      return;
    }
    replay.current = b;
    const tick = setInterval(
      () => setState((s) => ({ ...s, replaySeconds: Math.round(b.seconds) })),
      1000,
    );
    return () => {
      clearInterval(tick);
      b.stop();
      if (replay.current === b) replay.current = null;
      setState((s) => (s.replaySeconds ? { ...s, replaySeconds: 0 } : s));
    };
  }, [live, replaySeconds, format, bitrateMbps, withAudio, getStream, sink, notify]);

  const saveReplay = useCallback(async () => {
    const b = replay.current;
    if (!b) {
      notify("The replay buffer is off (Settings › Recording).", "error");
      return;
    }
    setState((s) => ({ ...s, busy: true }));
    try {
      const done = await b.save();
      notify(`Replay of the last ${Math.round(done.seconds)} s saved.`, "info", done.file);
    } catch (err) {
      notify(err instanceof Error ? err.message : "The replay couldn't be saved.", "error");
    } finally {
      setState((s) => ({ ...s, busy: false }));
    }
  }, [notify]);

  // A recording that runs when the picture goes away is closed, so the file stays playable.
  useEffect(() => {
    if (!live && recorder.current) void stop();
  }, [live, stop]);

  return { ...state, start, stop, toggle, saveReplay };
}
