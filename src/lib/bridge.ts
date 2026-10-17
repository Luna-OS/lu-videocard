/** What electron/preload.cjs exposes as `window.luVideocard`. */

export type UpdateState =
  "idle" | "checking" | "available" | "none" | "downloading" | "ready" | "error" | "unsupported";

export interface UpdateStatus {
  state: UpdateState;
  current: string;
  version?: string;
  notes?: string;
  percent?: number;
  error?: string;
  checkedAt?: number;
}

export interface WindowStatus {
  fullscreen: boolean;
  maximized: boolean;
}

export interface AppInfo {
  version: string;
  platform: string;
  packaged: boolean;
}

export interface LuVideocardBridge {
  info(): Promise<AppInfo>;
  windowState(): Promise<WindowStatus>;
  minimize(): Promise<void>;
  toggleMaximize(): Promise<void>;
  close(): Promise<void>;
  setFullScreen(on: boolean): Promise<WindowStatus>;
  setTheme(theme: "dark" | "light"): Promise<void>;
  /** Keeps the window at this width/height ratio; 0 frees it. */
  lockAspect(ratio: number): Promise<void>;
  setAlwaysOnTop(on: boolean): Promise<void>;
  keepAwake(on: boolean): Promise<void>;
  saveScreenshot(bytes: Uint8Array): Promise<string>;
  showScreenshot(file: string): Promise<void>;
  openRepo(page: "home" | "releases"): Promise<void>;
  updateState(): Promise<UpdateStatus>;
  updateCheck(): Promise<UpdateStatus>;
  updateDownload(): Promise<UpdateStatus>;
  updateInstall(): Promise<boolean>;
  on(channel: "win:state", fn: (s: WindowStatus) => void): () => void;
  on(channel: "update:status", fn: (s: UpdateStatus) => void): () => void;
}

declare global {
  interface Window {
    luVideocard?: LuVideocardBridge;
  }
}

/** The bridge, or null in a plain browser (npm run dev) and in tests. */
export function getBridge(): LuVideocardBridge | null {
  return typeof window !== "undefined" ? (window.luVideocard ?? null) : null;
}
