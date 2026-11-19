"use strict";
// The bridge between the page and the main process. Its shape is the LuVideocardBridge type in
// src/lib/bridge.ts; in a plain browser (npm run dev without Electron) it is missing and the page
// falls back to the browser's own fullscreen.
const { contextBridge, ipcRenderer } = require("electron");

const EVENTS = new Set(["win:state", "update:status"]);

contextBridge.exposeInMainWorld("luVideocard", {
  info: () => ipcRenderer.invoke("app:info"),

  windowState: () => ipcRenderer.invoke("win:state"),
  minimize: () => ipcRenderer.invoke("win:minimize"),
  toggleMaximize: () => ipcRenderer.invoke("win:toggleMaximize"),
  close: () => ipcRenderer.invoke("win:close"),
  setFullScreen: (on) => ipcRenderer.invoke("win:setFullScreen", on),
  setTheme: (theme) => ipcRenderer.invoke("win:setTheme", theme),
  lockAspect: (ratio) => ipcRenderer.invoke("win:lockAspect", ratio),
  setAlwaysOnTop: (on) => ipcRenderer.invoke("win:setAlwaysOnTop", on),

  keepAwake: (on) => ipcRenderer.invoke("power:keepAwake", on),

  saveScreenshot: (bytes) => ipcRenderer.invoke("screenshot:save", bytes),
  showScreenshot: (file) => ipcRenderer.invoke("screenshot:show", file),
  recordingStart: (ext, kind) => ipcRenderer.invoke("rec:start", ext, kind),
  recordingWrite: (id, chunk) => ipcRenderer.invoke("rec:write", id, chunk),
  recordingFinish: (id) => ipcRenderer.invoke("rec:finish", id),
  recordingCancel: (id) => ipcRenderer.invoke("rec:cancel", id),
  showRecording: (file) => ipcRenderer.invoke("rec:show", file),
  openRecordings: () => ipcRenderer.invoke("rec:openFolder"),
  pickLut: () => ipcRenderer.invoke("lut:pick"),
  readLut: (file) => ipcRenderer.invoke("lut:read", file),
  openRepo: (page) => ipcRenderer.invoke("shell:openRepo", page),

  updateState: () => ipcRenderer.invoke("update:state"),
  updateCheck: () => ipcRenderer.invoke("update:check"),
  updateDownload: () => ipcRenderer.invoke("update:download"),
  updateInstall: () => ipcRenderer.invoke("update:install"),

  /** Subscribes to a main-process event; returns the unsubscribe function. */
  on: (channel, fn) => {
    if (!EVENTS.has(channel)) throw new Error(`Unknown event ${channel}`);
    const listener = (_e, payload) => fn(payload);
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
  },
});
