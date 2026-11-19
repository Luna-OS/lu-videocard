import type { Fit } from "./settings";

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Where the picture goes on the canvas: inside it with bars (contain), covering it with the
 * edges cut off (cover), or stretched over it (fill). Sizes are whole pixels.
 */
export function fitRect(
  srcW: number,
  srcH: number,
  canvasW: number,
  canvasH: number,
  fit: Fit,
): Rect {
  if (srcW <= 0 || srcH <= 0 || canvasW <= 0 || canvasH <= 0) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }
  if (fit === "fill") return { x: 0, y: 0, width: canvasW, height: canvasH };
  const scale =
    fit === "cover"
      ? Math.max(canvasW / srcW, canvasH / srcH)
      : Math.min(canvasW / srcW, canvasH / srcH);
  const width = Math.round(srcW * scale);
  const height = Math.round(srcH * scale);
  return {
    x: Math.round((canvasW - width) / 2),
    y: Math.round((canvasH - height) / 2),
    width,
    height,
  };
}

/** The most pixels the pipeline works with (8K); above that the output is scaled down. */
export const MAX_OUTPUT_PIXELS = 7680 * 4320;

/**
 * The resolution the enhancement pipeline renders at: the picture's size on screen when it is
 * upscaled (at most 4× the source per axis), otherwise the source's own size.
 */
export function outputSize(
  srcW: number,
  srcH: number,
  rect: Rect,
  upscale: boolean,
): { width: number; height: number } {
  if (!upscale || rect.width <= srcW || rect.height <= srcH) {
    return { width: srcW, height: srcH };
  }
  let width = Math.min(rect.width, srcW * 4);
  let height = Math.min(rect.height, srcH * 4);
  if (width * height > MAX_OUTPUT_PIXELS) {
    const s = Math.sqrt(MAX_OUTPUT_PIXELS / (width * height));
    width = Math.floor(width * s);
    height = Math.floor(height * s);
  }
  return { width: Math.max(1, width), height: Math.max(1, height) };
}
