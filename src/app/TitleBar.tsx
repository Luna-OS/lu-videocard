import type { ReactNode } from "react";
import { getBridge } from "../lib/bridge";
import { TITLE_BAR_HEIGHT } from "../theme/frame-colors";
import { WinCloseIcon, WinMaximizeIcon, WinMinimizeIcon, WinRestoreIcon } from "./icons";

/**
 * The 40px title bar of the frameless window: the axolotl, the app name, what the app puts in the
 * middle, and the three window buttons. The bar is the handle to move the window by (a double-click
 * maximizes, as on any Windows title bar).
 */
export function TitleBar({
  children,
  maximized,
  floating = false,
}: {
  children?: ReactNode;
  maximized: boolean;
  /** Stream mode: the bar floats over the picture instead of sitting above it. */
  floating?: boolean;
}) {
  const bridge = getBridge();
  return (
    <header
      className={`lv-titlebar relative z-20 flex shrink-0 items-center gap-3 pl-3 ${floating ? "w-full" : ""}`}
      style={{ height: TITLE_BAR_HEIGHT }}
    >
      <img src="./lu-videocard-logo.svg" alt="" width={22} height={22} draggable={false} />
      <span className="lv-title text-[0.9375rem] font-semibold tracking-tight">Lu Videocard</span>
      <div className="flex min-w-0 flex-1 items-center gap-2">{children}</div>
      {bridge && (
        <div className="flex h-full items-stretch">
          <button
            type="button"
            className="lv-winbtn"
            aria-label="Minimize"
            title="Minimize"
            onClick={() => void bridge.minimize()}
          >
            <WinMinimizeIcon />
          </button>
          <button
            type="button"
            className="lv-winbtn"
            aria-label={maximized ? "Restore" : "Maximize"}
            title={maximized ? "Restore" : "Maximize"}
            onClick={() => void bridge.toggleMaximize()}
          >
            {maximized ? <WinRestoreIcon /> : <WinMaximizeIcon />}
          </button>
          <button
            type="button"
            className="lv-winbtn lv-winbtn-close"
            aria-label="Close"
            title="Close"
            onClick={() => void bridge.close()}
          >
            <WinCloseIcon />
          </button>
        </div>
      )}
    </header>
  );
}
