import type { ResolvedTheme } from "./useTheme";

/** The window's background while the page loads; matches BACKGROUND in electron/main.cjs. */
export const FRAME_COLORS: Record<ResolvedTheme, string> = {
  dark: "#0b0920",
  light: "#ece7f7",
};

/** Height of the custom title bar in CSS pixels. */
export const TITLE_BAR_HEIGHT = 40;
