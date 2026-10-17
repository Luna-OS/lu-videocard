"use strict";
// Screenshots of the capture picture: PNG files in <Pictures>/Lu Videocard, named after the time
// they were taken. A name that is already taken (two shots in one second) gets " (2)", " (3)", ….

const fs = require("fs");
const path = require("path");

const pad = (n) => String(n).padStart(2, "0");

/** "Lu Videocard 2026-10-17 14-03-59" for a local Date. */
function screenshotBaseName(date) {
  const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const time = `${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`;
  return `Lu Videocard ${day} ${time}`;
}

/** PNG files start with these eight bytes; anything else from the UI is refused. */
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function isPng(buf) {
  return Buffer.isBuffer(buf) && buf.length > 8 && buf.subarray(0, 8).equals(PNG_SIGNATURE);
}

/** Writes the PNG into `folder` (created when missing) and returns its path. */
async function saveScreenshot(folder, bytes, date = new Date()) {
  const buf = Buffer.from(bytes);
  if (!isPng(buf)) throw new Error("The screenshot is not a PNG picture.");
  await fs.promises.mkdir(folder, { recursive: true });
  const base = screenshotBaseName(date);
  for (let i = 1; i < 1000; i++) {
    const file = path.join(folder, `${base}${i > 1 ? ` (${i})` : ""}.png`);
    try {
      // "wx" fails when the file exists, so nothing is ever overwritten.
      await fs.promises.writeFile(file, buf, { flag: "wx" });
      return file;
    } catch (err) {
      if (err.code !== "EEXIST") throw err;
    }
  }
  throw new Error("Too many screenshots with the same name.");
}

module.exports = { screenshotBaseName, isPng, saveScreenshot };
