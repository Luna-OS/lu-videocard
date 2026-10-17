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
