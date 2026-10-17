"use strict";
// Which URLs are the app's own page – the only page that may use the capture card and talk to the
// main process. The installed app lives in a folder with a space in its name
// ("…\Programs\Lu Videocard\…"), so URLs are compared as file paths, not as strings: %20, slashes
// and the case of the drive letter must not matter.

const path = require("path");
const { fileURLToPath } = require("url");

/** A function that tells whether a URL is `indexPath` (or a page of `devUrl` in development). */
function makeIsOwnUrl({ indexPath, devUrl = "", platform = process.platform }) {
  const windows = platform === "win32";
  const p = windows ? path.win32 : path.posix;
  const norm = (file) => {
    const resolved = p.resolve(file);
    return windows ? resolved.toLowerCase() : resolved;
  };
  const index = norm(indexPath);

  return function isOwnUrl(url) {
    if (typeof url !== "string" || !url) return false;
    if (devUrl) return url === devUrl || url.startsWith(devUrl.replace(/\/?$/, "/"));
    if (!url.startsWith("file:")) return false;
    try {
      return norm(fileURLToPath(url.split(/[?#]/)[0], { windows })) === index;
    } catch {
      return false;
    }
  };
}

module.exports = { makeIsOwnUrl };
