import { useCallback, useEffect, useRef, useState } from "react";
import { ControlBar } from "./app/ControlBar";
import { formatVideo } from "./app/format";
import { useCapture, useIdle, useSettings, useUpdates, useWindowStatus } from "./app/hooks";
import { DownloadIcon } from "./app/icons";
import { SettingsPanel } from "./app/SettingsPanel";
import { StatsOverlay } from "./app/StatsOverlay";
import { StatusScreen } from "./app/StatusScreen";
import { TitleBar } from "./app/TitleBar";
import { Toasts } from "./app/Toasts";
import { useToasts } from "./app/useToasts";
import { getBridge } from "./lib/bridge";
import { nextFit } from "./lib/settings";
import { Sky } from "./theme/Sky";
import { useDocumentTheme } from "./theme/useTheme";

/** How long the mouse must rest before the controls and the cursor disappear. */
const IDLE_MS = 2500;

/** Grabs the current frame of the picture as PNG bytes, at the card's full resolution. */
async function grabFrame(video: HTMLVideoElement): Promise<Uint8Array | null> {
  if (!video.videoWidth || !video.videoHeight) return null;
  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(video, 0, 0);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  return blob ? new Uint8Array(await blob.arrayBuffer()) : null;
}

const isTyping = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  (target.isContentEditable || ["INPUT", "SELECT", "TEXTAREA"].includes(target.tagName));

export default function App() {
  const bridge = getBridge();
  const [settings, update] = useSettings();
  const theme = useDocumentTheme(settings.theme);
  const capture = useCapture(settings);
  const win = useWindowStatus();
  const updates = useUpdates(settings.autoUpdate);
  const { toasts, show: toast, dismiss } = useToasts();

  const [streamMode, setStreamMode] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [hoverControls, setHoverControls] = useState(false);
  const [version, setVersion] = useState("");
  const videoRef = useRef<HTMLVideoElement>(null);

  const { state } = capture;
  const live = state.status === "live" && state.stream !== null;
  const hasAudio = state.audio !== null;
  const idle = useIdle(IDLE_MS, live && !settingsOpen && !hoverControls);
  const immersive = win.fullscreen || streamMode;

  useEffect(() => {
    void bridge?.info().then((i) => setVersion(i.version));
  }, [bridge]);

  useEffect(() => {
    void bridge?.setTheme(theme);
  }, [bridge, theme]);

  useEffect(() => {
    void bridge?.keepAwake(live && settings.keepAwake);
  }, [bridge, live, settings.keepAwake]);

  // Stream mode: the window takes the picture's shape, so nothing but the picture is shared.
  const aspect =
    streamMode && live && state.videoInfo?.width && state.videoInfo.height
      ? state.videoInfo.width / state.videoInfo.height
      : 0;
  useEffect(() => {
    void bridge?.lockAspect(aspect);
  }, [bridge, aspect]);

  useEffect(() => {
    void bridge?.setAlwaysOnTop(settings.alwaysOnTop);
  }, [bridge, settings.alwaysOnTop]);

  // The picture goes into the <video> element (muted: the sound plays through Web Audio).
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    if (el.srcObject !== state.stream) el.srcObject = state.stream;
    if (state.stream) void el.play().catch(() => undefined);
  }, [state.stream]);

  const toggleFullscreen = useCallback(() => win.setFullscreen(!win.fullscreen), [win]);

  const screenshot = useCallback(async () => {
    const el = videoRef.current;
    const png = el && live ? await grabFrame(el) : null;
    if (!png) {
      toast({ text: "There is no picture to take a screenshot of.", tone: "error" });
      return;
    }
    if (bridge) {
      try {
        const file = await bridge.saveScreenshot(png);
        toast({
          text: "Screenshot saved in Pictures › Lu Videocard.",
          action: { label: "Show", run: () => void bridge.showScreenshot(file) },
        });
      } catch {
        toast({ text: "The screenshot couldn't be saved.", tone: "error" });
      }
    } else {
      const url = URL.createObjectURL(new Blob([png as BlobPart], { type: "image/png" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = "Lu Videocard.png";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  }, [bridge, live, toast]);

  const setVolume = useCallback(
    (v: number) =>
      update({ volume: Math.round(Math.min(1, Math.max(0, v)) * 100) / 100, muted: false }),
    [update],
  );

  // Keyboard shortcuts (listed in Settings → Keyboard).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (settingsOpen) setSettingsOpen(false);
        else if (win.fullscreen) win.setFullscreen(false);
        else if (streamMode) setStreamMode(false);
        return;
      }
      if (e.ctrlKey && e.key === ",") {
        e.preventDefault();
        setSettingsOpen((o) => !o);
        return;
      }
      if (e.ctrlKey && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void screenshot();
        return;
      }
      if (e.key === "F11") {
        e.preventDefault();
        toggleFullscreen();
        return;
      }
      if (isTyping(e.target) || e.ctrlKey || e.altKey || e.metaKey) return;
      switch (e.key.toLowerCase()) {
        case "f":
          toggleFullscreen();
          break;
        case "c":
          if (!win.fullscreen) setStreamMode((m) => !m);
          break;
        case "m":
          update({ muted: !settings.muted });
          break;
        case "i":
          update({ showStats: !settings.showStats });
          break;
        case "r":
          capture.restart();
          break;
        case "arrowup":
          e.preventDefault();
          setVolume(settings.volume + 0.05);
          break;
        case "arrowdown":
          e.preventDefault();
          setVolume(settings.volume - 0.05);
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    settingsOpen,
    streamMode,
    win,
    toggleFullscreen,
    screenshot,
    update,
    settings,
    setVolume,
    capture,
  ]);

  const u = updates.status;
  const updatePill =
    u?.state === "ready" ? (
      <button
        type="button"
        className="lv-chip lv-chip-mint cursor-pointer"
        onClick={updates.install}
      >
        Restart to update
      </button>
    ) : u?.state === "available" || u?.state === "downloading" ? (
      <button
        type="button"
        className="lv-chip cursor-pointer"
        onClick={() => setSettingsOpen(true)}
        title="Open the updates in Settings"
      >
        <DownloadIcon size={12} />
        {u.state === "downloading" ? `Update ${u.percent ?? 0} %` : `Update ${u.version}`}
      </button>
    ) : null;

  const statusChip = live ? (
    <span className="lv-chip lv-chip-mint">
      <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
      Live{state.videoInfo ? ` · ${formatVideo(state.videoInfo)}` : ""}
    </span>
  ) : state.status === "starting" || state.status === "idle" ? (
    <span className="lv-chip lv-chip-muted">Starting…</span>
  ) : (
    <span className="lv-chip lv-chip-warning">No picture</span>
  );

  const titleContent = (
    <>
      {statusChip}
      {live && !hasAudio && <span className="lv-chip lv-chip-muted">No sound</span>}
      {updatePill}
    </>
  );

  return (
    <div className="relative flex h-full flex-col" onPointerDown={() => capture.engine?.resume()}>
      {!immersive && <TitleBar maximized={win.maximized}>{titleContent}</TitleBar>}

      <main
        className="lv-stage"
        data-live={live}
        data-idle={idle}
        onDoubleClick={(e) => {
          if (live && (e.target === e.currentTarget || e.target === videoRef.current)) {
            toggleFullscreen();
          }
        }}
      >
        {!live && <Sky />}
        <video
          ref={videoRef}
          className="lv-video"
          data-fit={settings.fit}
          hidden={!live}
          muted
          playsInline
          disablePictureInPicture
          aria-label="Capture card picture"
        />
        {live && settings.showStats && <StatsOverlay video={videoRef} capture={state} />}
        {!live && (
          <StatusScreen
            capture={state}
            supported={capture.supported}
            onRetry={capture.restart}
            onSettings={() => setSettingsOpen(true)}
          />
        )}

        {streamMode && !win.fullscreen && (
          <div
            className="lv-overlay absolute inset-x-0 top-0 z-20"
            data-hidden={live && idle}
            inert={live && idle}
          >
            <TitleBar maximized={win.maximized} floating>
              {titleContent}
            </TitleBar>
          </div>
        )}

        <ControlBar
          hidden={!live || idle}
          panelOpen={settingsOpen}
          engine={capture.engine}
          hasAudio={hasAudio}
          volume={settings.volume}
          muted={settings.muted}
          fit={settings.fit}
          fullscreen={win.fullscreen}
          streamMode={streamMode}
          info={state.videoInfo ? formatVideo(state.videoInfo) : ""}
          onVolume={setVolume}
          onMute={() => update({ muted: !settings.muted })}
          onFit={() => update({ fit: nextFit(settings.fit) })}
          onScreenshot={() => void screenshot()}
          onStreamMode={() => setStreamMode((m) => !m)}
          onFullscreen={toggleFullscreen}
          onSettings={() => setSettingsOpen((o) => !o)}
          onHover={setHoverControls}
        />

        {settingsOpen && (
          <SettingsPanel
            settings={settings}
            update={update}
            capture={state}
            outputFailed={capture.outputFailed}
            updates={updates}
            version={version}
            onRestart={capture.restart}
            onClose={() => setSettingsOpen(false)}
          />
        )}

        <Toasts toasts={toasts} dismiss={dismiss} />
      </main>
    </div>
  );
}
