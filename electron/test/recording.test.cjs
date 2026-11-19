"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { Recordings, recordingBaseName } = require("../recording.cjs");

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "luv-rec-"));

test("names carry the date, the time and the kind", () => {
  const d = new Date(2026, 10, 19, 9, 5, 7);
  assert.equal(recordingBaseName(d), "Lu Videocard 2026-11-19 09-05-07");
  assert.equal(recordingBaseName(d, " replay"), "Lu Videocard 2026-11-19 09-05-07 replay");
});

test("chunks are appended in order and the file is closed", async () => {
  const folder = path.join(tmp(), "Lu Videocard");
  const r = new Recordings(folder);
  const { id, file } = await r.start("webm", "recording", new Date(2026, 0, 1, 1, 1, 1));
  assert.equal(path.basename(file), "Lu Videocard 2026-01-01 01-01-01.webm");
  await r.write(id, new Uint8Array([1, 2, 3]));
  await r.write(id, new Uint8Array([4, 5]));
  const done = await r.finish(id);
  assert.equal(done.bytes, 5);
  assert.deepEqual([...fs.readFileSync(file)], [1, 2, 3, 4, 5]);
  assert.equal(r.owns(file), true);
  assert.equal(r.owns(path.join(folder, "..", "x.webm")), false);
  await assert.rejects(r.write(id, new Uint8Array([1])), /Unknown/);
});

test("a second recording in the same second gets (2); replays are named so", async () => {
  const folder = path.join(tmp(), "Lu Videocard");
  const r = new Recordings(folder);
  const when = new Date(2026, 0, 1, 1, 1, 1);
  const a = await r.start("mp4", "recording", when);
  const b = await r.start("mp4", "recording", when);
  const c = await r.start("mp4", "replay", when);
  assert.equal(path.basename(b.file), "Lu Videocard 2026-01-01 01-01-01 (2).mp4");
  assert.equal(path.basename(c.file), "Lu Videocard 2026-01-01 01-01-01 replay.mp4");
  await r.closeAll();
  assert.equal(fs.existsSync(a.file), true);
});

test("cancel removes the file; unknown formats are refused", async () => {
  const folder = path.join(tmp(), "Lu Videocard");
  const r = new Recordings(folder);
  const { id, file } = await r.start("webm");
  await r.write(id, new Uint8Array([9]));
  await r.cancel(id);
  assert.equal(fs.existsSync(file), false);
  await assert.rejects(r.start("exe"), /Unsupported/);
});
