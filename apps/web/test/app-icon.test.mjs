// The home screen icon. iOS and Android cut an app's icon to their own shape; ours came with its
// own rounded corners drawn in and transparent around them, so it was cut twice and sat in a dark
// frame among the other icons on an iPhone (2026-11-06). Now it is a full, opaque square.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const pub = (f) => readFileSync(new URL(`../public/${f}`, import.meta.url));

/** A PNG's width, and whether it can be transparent: colour types 4 and 6 carry alpha. */
function png(buf) {
  assert.equal(buf.subarray(1, 4).toString(), "PNG");
  return { width: buf.readUInt32BE(16), alpha: [4, 6].includes(buf[25]) };
}

test("the iPhone's icon is a full, opaque square for iOS to round itself", () => {
  const icon = png(pub("apple-touch-icon.png"));
  assert.equal(icon.width, 180);
  assert.equal(icon.alpha, false, "no transparent corners for iOS to fill");
});

test("Android gets a maskable icon, opaque, listed for that purpose", () => {
  const icon = png(pub("icon-maskable-512.png"));
  assert.equal(icon.width, 512);
  assert.equal(icon.alpha, false);
  const manifest = JSON.parse(pub("site.webmanifest").toString());
  assert.ok(
    manifest.icons.some((i) => i.src === "/icon-maskable-512.png" && i.purpose === "maskable"),
  );
});
