"use strict";
// Lu Videocard – Electron main process: the one frameless window, camera/microphone permission
// for the capture card, real fullscreen (no frame, no title bar, no borders – for sharing on
// Discord), screenshots, keeping the screen awake while the picture runs, and updates.

const {
  app,
  BrowserWindow,
  ipcMain,
  shell,
  screen,
  session,
  powerSaveBlocker,
  Menu,
} = require("electron");
const path = require("path");
const { createUpdater } = require("./updater.cjs");
const windowState = require("./window-state.cjs");
const { saveScreenshot } = require("./screenshots.cjs");
const { makeIsOwnUrl } = require("./own-url.cjs");

const ROOT = path.join(__dirname, "..");
const INDEX = path.join(ROOT, "dist", "index.html");
const DEV_URL = process.env.LUV_DEV_URL || "";
// Matches FRAME_COLORS in src/theme/frame-colors.ts.
const BACKGROUND = { dark: "#0b0920", light: "#ece7f7" };
const REPO_URL = "https://github.com/Luna-OS/lu-videocard";
// The permissions the page may have: the capture card (media), picking the speaker it plays on
// and fullscreen. Everything else (location, notifications, …) is refused.
const ALLOWED_PERMISSIONS = new Set(["media", "speaker-selection", "fullscreen"]);

app.setName("Lu Videocard");
if (process.platform === "win32") app.setAppUserModelId("os.luna.lu-videocard");

/** @type {BrowserWindow | null} */
let win = null;
let keepAwakeId = null;

// A capture card can only be opened by one program at a time, so a second start just brings the
// running window to the front.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
  });
}

const send = (channel, payload) => {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
};

// electron-updater only loads in the packaged app; in development there is nothing to update.
const updater = createUpdater({
  autoUpdater: app.isPackaged ? require("electron-updater").autoUpdater : null,
  currentVersion: app.getVersion(),
  packaged: app.isPackaged,
  send: (status) => send("update:status", status),
});

/** True for the app's own page (the built index.html, or the Vite dev server). */
const isOwnUrl = makeIsOwnUrl({ indexPath: INDEX, devUrl: DEV_URL });

// ---------------------------------------------------------------- window

const stateFile = () => path.join(app.getPath("userData"), "window-state.json");

function windowStatus() {
  if (!win || win.isDestroyed()) return { fullscreen: false, maximized: false };
  return { fullscreen: win.isFullScreen(), maximized: win.isMaximized() };
}

function saveWindowState() {
  if (!win || win.isDestroyed() || win.isFullScreen() || win.isMinimized()) return;
  const maximized = win.isMaximized();
  const b = maximized ? win.getNormalBounds() : win.getBounds();
  windowState.writeState(stateFile(), { ...b, maximized });
}

function createWindow() {
  const areas = screen.getAllDisplays().map((d) => d.workArea);
  const bounds = windowState.restoreBounds(windowState.readState(stateFile()), areas);

  win = new BrowserWindow({
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    minWidth: windowState.MIN.width,
    minHeight: windowState.MIN.height,
    show: false,
    // Frameless: the title bar is drawn by the page and disappears completely in fullscreen and
    // in stream mode, so nothing but the picture is left to share.
    frame: false,
    backgroundColor: BACKGROUND.dark,
    icon: path.join(ROOT, "build", "icon.png"),
    title: "Lu Videocard",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
      // The picture and the sound must keep running while the window is covered or minimized
      // (Discord shares it from the background).
      backgroundThrottling: false,
      // The sound of the capture card starts without a click first.
      autoplayPolicy: "no-user-gesture-required",
    },
  });
  if (bounds.maximized) win.maximize();

  if (DEV_URL) win.loadURL(DEV_URL);
  else win.loadFile(INDEX);

  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  win.webContents.on("will-navigate", (e, url) => {
    if (!isOwnUrl(url)) e.preventDefault();
  });
  win.once("ready-to-show", () => win.show());

  const pushState = () => send("win:state", windowStatus());
  for (const ev of ["enter-full-screen", "leave-full-screen", "maximize", "unmaximize"]) {
    win.on(ev, pushState);
  }
  let saveTimer = null;
  const saveSoon = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveWindowState, 400);
  };
  win.on("resize", saveSoon);
  win.on("move", saveSoon);
  win.on("close", () => {
    clearTimeout(saveTimer);
    saveWindowState();
  });
  win.on("closed", () => {
    win = null;
    setKeepAwake(false);
  });
}

function setKeepAwake(on) {
  if (on && keepAwakeId === null) {
    keepAwakeId = powerSaveBlocker.start("prevent-display-sleep");
  } else if (!on && keepAwakeId !== null) {
    powerSaveBlocker.stop(keepAwakeId);
    keepAwakeId = null;
  }
}

// ---------------------------------------------------------------- ipc

/** ipcMain.handle that only answers the app's own page. */
function handle(channel, fn) {
  ipcMain.handle(channel, (e, ...args) => {
    if (!isOwnUrl(e.senderFrame?.url)) throw new Error("Not allowed.");
    return fn(...args);
  });
}

handle("app:info", () => ({
  version: app.getVersion(),
  platform: process.platform,
  packaged: app.isPackaged,
}));

handle("win:state", () => windowStatus());
handle("win:minimize", () => win?.minimize());
handle("win:toggleMaximize", () => {
  if (!win) return;
  if (win.isMaximized()) win.unmaximize();
  else win.maximize();
});
handle("win:close", () => win?.close());
handle("win:setFullScreen", (on) => {
  if (win) win.setFullScreen(Boolean(on));
  return windowStatus();
});
handle("win:setTheme", (theme) => {
  if (win) win.setBackgroundColor(theme === "light" ? BACKGROUND.light : BACKGROUND.dark);
});
// Stream mode: the window keeps the picture's aspect ratio, so there are no black bars around it
// (0 lets it be resized freely again).
handle("win:lockAspect", (ratio) => {
  if (!win || win.isDestroyed()) return;
  const r =
    typeof ratio === "number" && Number.isFinite(ratio) && ratio > 0.2 && ratio < 5 ? ratio : 0;
  win.setAspectRatio(r);
  if (r && !win.isMaximized() && !win.isFullScreen()) {
    const [w, h] = win.getContentSize();
    // Keep the area about the same and give it the picture's shape.
    const width = Math.max(windowState.MIN.width, Math.round(Math.sqrt(w * h * r)));
    win.setContentSize(width, Math.round(width / r));
  }
});
handle("win:setAlwaysOnTop", (on) => {
  if (win) win.setAlwaysOnTop(Boolean(on));
});

handle("power:keepAwake", (on) => setKeepAwake(Boolean(on)));

handle("screenshot:save", async (bytes) => {
  const folder = path.join(app.getPath("pictures"), "Lu Videocard");
  return saveScreenshot(folder, bytes);
});
handle("screenshot:show", (file) => {
  const folder = path.join(app.getPath("pictures"), "Lu Videocard");
  // Only files the app saved itself.
  if (typeof file === "string" && path.dirname(path.resolve(file)) === folder) {
    shell.showItemInFolder(file);
  }
});

handle("shell:openRepo", (page) => {
  const pages = { home: "", releases: "/releases" };
  if (Object.hasOwn(pages, page)) void shell.openExternal(REPO_URL + pages[page]);
});

handle("update:state", () => updater.get());
handle("update:check", () => updater.check());
handle("update:download", () => updater.download());
handle("update:install", () => updater.install());

// ---------------------------------------------------------------- app

Menu.setApplicationMenu(null);

app.whenReady().then(() => {
  const ses = session.defaultSession;
  ses.setPermissionRequestHandler((wc, permission, callback, details) => {
    callback(ALLOWED_PERMISSIONS.has(permission) && isOwnUrl(details.requestingUrl || wc.getURL()));
  });
  // Without this the page would see the devices without their names.
  ses.setPermissionCheckHandler((wc, permission, origin, details) => {
    if (!ALLOWED_PERMISSIONS.has(permission)) return false;
    return isOwnUrl(details?.requestingUrl || wc?.getURL() || "");
  });

  createWindow();
  // A quiet look for a new version a little after the start (Settings can switch it off; the
  // page asks for it with update:check when the setting is on).
});

app.on("window-all-closed", () => {
  setKeepAwake(false);
  app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
