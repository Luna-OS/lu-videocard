"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { screenshotBaseName, isPng, saveScreenshot } = require("../screenshots.cjs");

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);

test("names carry the local date and time", () => {
  assert.equal(
    screenshotBaseName(new Date(2026, 9, 7, 4, 3, 9)),
    "Lu Videocard 2026-10-07 04-03-09",
  );
});

test("only PNG bytes are accepted", () => {
  assert.equal(isPng(PNG), true);
  assert.equal(isPng(Buffer.from("hello world")), false);
  assert.equal(isPng("not a buffer"), false);
});

test("saving never overwrites: a second shot in the same second gets (2)", async () => {
  const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "luv-")), "Shots");
  const when = new Date(2026, 0, 2, 3, 4, 5);
  const a = await saveScreenshot(dir, PNG, when);
  const b = await saveScreenshot(dir, new Uint8Array(PNG), when);
  assert.equal(path.basename(a), "Lu Videocard 2026-01-02 03-04-05.png");
  assert.equal(path.basename(b), "Lu Videocard 2026-01-02 03-04-05 (2).png");
  assert.deepEqual(fs.readFileSync(b), PNG);
  await assert.rejects(saveScreenshot(dir, Buffer.from("nope nope nope")), /not a PNG/);
  fs.rmSync(path.dirname(dir), { recursive: true, force: true });
});
