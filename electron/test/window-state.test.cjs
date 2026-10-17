"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  restoreBounds,
  isVisible,
  readState,
  writeState,
  DEFAULTS,
  MIN,
} = require("../window-state.cjs");

const screen = [{ x: 0, y: 0, width: 1920, height: 1040 }];

test("nothing saved: the default size, centered by Electron", () => {
  assert.deepEqual(restoreBounds(null, screen), { ...DEFAULTS, maximized: false });
  assert.deepEqual(restoreBounds("junk", screen), { ...DEFAULTS, maximized: false });
});

test("a saved place on the screen comes back", () => {
  const saved = { x: 100, y: 80, width: 1000, height: 600, maximized: true };
  assert.deepEqual(restoreBounds(saved, screen), saved);
});

test("a place on a monitor that is gone is dropped, the size stays", () => {
  const b = restoreBounds({ x: 2500, y: 100, width: 900, height: 500 }, screen);
  assert.equal(b.x, undefined);
  assert.equal(b.y, undefined);
  assert.equal(b.width, 900);
});

test("too small or broken sizes are fixed", () => {
  const b = restoreBounds({ width: 10, height: Number.NaN }, screen);
  assert.equal(b.width, DEFAULTS.width);
  const c = restoreBounds({ width: 10, height: 10 }, screen);
  assert.deepEqual([c.width, c.height], [MIN.width, MIN.height]);
});

test("visibility needs a real corner on a screen", () => {
  assert.equal(isVisible({ x: 1900, y: 0, width: 800, height: 600 }, screen), false);
  assert.equal(isVisible({ x: 1800, y: 0, width: 800, height: 600 }, screen), true);
});

test("state round-trips through the file, a broken file reads as nothing", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "luv-"));
  const file = path.join(dir, "window-state.json");
  assert.equal(readState(file), null);
  writeState(file, { width: 800, height: 500 });
  assert.deepEqual(readState(file), { width: 800, height: 500 });
  fs.writeFileSync(file, "{");
  assert.equal(readState(file), null);
  fs.rmSync(dir, { recursive: true, force: true });
});
