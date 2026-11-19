"use strict";
// Recordings: the UI encodes the picture (MediaRecorder) and streams the file's chunks here,
// where they are appended to <Videos>/Lu Videocard/Lu Videocard <date> <time>.<ext>. Each open
// recording has a numeric id; nothing is ever overwritten.

const fs = require("fs");
const path = require("path");

const EXTENSIONS = new Set(["mp4", "webm", "mkv"]);
const pad = (n) => String(n).padStart(2, "0");

function recordingBaseName(date, suffix = "") {
  const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const time = `${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`;
  return `Lu Videocard ${day} ${time}${suffix}`;
}

/** Opens a new file for writing, never over an existing one; returns the path and the stream. */
function openUnique(folder, base, ext) {
  for (let i = 1; i < 1000; i++) {
    const file = path.join(folder, `${base}${i > 1 ? ` (${i})` : ""}.${ext}`);
    try {
      const fd = fs.openSync(file, "wx");
      return { file, stream: fs.createWriteStream(file, { fd }) };
    } catch (err) {
      if (err.code !== "EEXIST") throw err;
    }
  }
  throw new Error("Too many recordings with the same name.");
}

/** Keeps the open recordings of one app run. */
class Recordings {
  constructor(folder) {
    this.folder = folder;
    this.open = new Map();
    this.nextId = 1;
  }

  /** Starts a recording file; `kind` "replay" names it "… replay". Returns { id, file }. */
  async start(ext, kind = "recording", date = new Date()) {
    if (!EXTENSIONS.has(ext)) throw new Error(`Unsupported recording format .${ext}`);
    await fs.promises.mkdir(this.folder, { recursive: true });
    const base = recordingBaseName(date, kind === "replay" ? " replay" : "");
    const { file, stream } = openUnique(this.folder, base, ext);
    const id = this.nextId++;
    this.open.set(id, { file, stream, bytes: 0, failed: null });
    stream.on("error", (err) => {
      const rec = this.open.get(id);
      if (rec) rec.failed = err;
    });
    return { id, file };
  }

  /** Appends a chunk; resolves once it is handed to the file. */
  async write(id, chunk) {
    const rec = this.open.get(id);
    if (!rec) throw new Error("Unknown recording.");
    if (rec.failed) throw rec.failed;
    const buf = Buffer.from(
      chunk.buffer ? chunk.buffer : chunk,
      chunk.byteOffset,
      chunk.byteLength,
    );
    rec.bytes += buf.length;
    return new Promise((resolve, reject) => {
      rec.stream.write(buf, (err) => (err ? reject(err) : resolve(rec.bytes)));
    });
  }

  /** Closes the file; returns { file, bytes }. */
  async finish(id) {
    const rec = this.open.get(id);
    if (!rec) throw new Error("Unknown recording.");
    this.open.delete(id);
    return new Promise((resolve, reject) => {
      rec.stream.end(() => {
        if (rec.failed) reject(rec.failed);
        else resolve({ file: rec.file, bytes: rec.bytes });
      });
    });
  }

  /** Closes and deletes the file (a recording that went wrong). */
  async cancel(id) {
    const rec = this.open.get(id);
    if (!rec) return;
    this.open.delete(id);
    await new Promise((resolve) => rec.stream.end(resolve));
    await fs.promises.unlink(rec.file).catch(() => undefined);
  }

  /** True for a file in the recordings folder (the only files the UI may ask to show). */
  owns(file) {
    return typeof file === "string" && path.dirname(path.resolve(file)) === this.folder;
  }

  async closeAll() {
    for (const id of [...this.open.keys()]) await this.finish(id).catch(() => undefined);
  }
}

module.exports = { Recordings, recordingBaseName, EXTENSIONS };
