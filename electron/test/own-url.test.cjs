"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { makeIsOwnUrl } = require("../own-url.cjs");

test("Windows: the installed page, however Chromium spells its URL", () => {
  const isOwn = makeIsOwnUrl({
    indexPath:
      "C:\\Users\\Luna\\AppData\\Local\\Programs\\Lu Videocard\\resources\\app.asar\\dist\\index.html",
    platform: "win32",
  });
  const base =
    "/Users/Luna/AppData/Local/Programs/Lu%20Videocard/resources/app.asar/dist/index.html";
  assert.equal(isOwn(`file:///C:${base}`), true);
  assert.equal(isOwn(`file:///c:${base}#settings`), true);
  assert.equal(isOwn(`file:///C:${base}?x=1`), true);
  assert.equal(isOwn(`file:///C:${base.replace("index.html", "other.html")}`), false);
  assert.equal(isOwn("https://example.com/index.html"), false);
  assert.equal(isOwn(""), false);
  assert.equal(isOwn(undefined), false);
});

test("Linux paths", () => {
  const isOwn = makeIsOwnUrl({ indexPath: "/opt/Lu Videocard/dist/index.html", platform: "linux" });
  assert.equal(isOwn("file:///opt/Lu%20Videocard/dist/index.html"), true);
  assert.equal(isOwn("file:///opt/lu%20videocard/dist/index.html"), false);
});

test("development: pages of the dev server only", () => {
  const isOwn = makeIsOwnUrl({ indexPath: "/x/index.html", devUrl: "http://localhost:1420" });
  assert.equal(isOwn("http://localhost:1420"), true);
  assert.equal(isOwn("http://localhost:1420/"), true);
  assert.equal(isOwn("http://localhost:14200/"), false);
  assert.equal(isOwn("file:///x/index.html"), false);
});
