"use strict";
// Remembers where the window was (position, size, maximized) between starts, in
// <userData>/window-state.json. A saved place that is no longer on any screen (a monitor was
// unplugged) is dropped, so the window never opens out of sight.

const fs = require("fs");

const DEFAULTS = { width: 1280, height: 760 };
const MIN = { width: 640, height: 400 };

/** True when at least a 100×60 px corner of `b` lies on one of the `areas` (screen work areas). */
function isVisible(b, areas) {
  return areas.some((a) => {
    const w = Math.min(b.x + b.width, a.x + a.width) - Math.max(b.x, a.x);
    const h = Math.min(b.y + b.height, a.y + a.height) - Math.max(b.y, a.y);
    return w >= 100 && h >= 60;
  });
}

/**
 * Turns whatever was saved into window options: a size of at least MIN, a position only when it
 * is still on a screen, and `maximized`.
 */
function restoreBounds(saved, areas) {
  const out = { ...DEFAULTS, maximized: false };
  if (!saved || typeof saved !== "object") return out;
  const num = (v) => typeof v === "number" && Number.isFinite(v);
  if (num(saved.width) && num(saved.height)) {
    out.width = Math.max(MIN.width, Math.round(saved.width));
    out.height = Math.max(MIN.height, Math.round(saved.height));
  }
  if (num(saved.x) && num(saved.y)) {
    const b = {
      x: Math.round(saved.x),
      y: Math.round(saved.y),
      width: out.width,
      height: out.height,
    };
    if (isVisible(b, areas)) {
      out.x = b.x;
      out.y = b.y;
    }
  }
  out.maximized = saved.maximized === true;
  return out;
}

function readState(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function writeState(file, state) {
  try {
    fs.writeFileSync(file, JSON.stringify(state));
  } catch {
    // Not being able to remember the window is no reason to bother anyone.
  }
}

module.exports = { DEFAULTS, MIN, isVisible, restoreBounds, readState, writeState };
