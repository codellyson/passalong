// Product news by email (2026-11-06): written in /admin, stopped from a mail's link or Settings.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (p) => readFileSync(new URL(`../app/${p}`, import.meta.url), "utf8");
const off = read("pages/news/off.vue");
const settings = read("pages/hub/settings/[[tab]].vue");
const toggle = read("components/hub/NewsMail.vue");
const admin = read("pages/admin.vue");
const send = read("components/hub/Announcements.vue");
const privacy = read("pages/privacy.vue");

test("a stop link asks before it acts, and keeps its token out of every URL sent", () => {
  assert.match(off, /new URLSearchParams\(location\.hash\.slice\(1\)\)/);
  assert.match(off, /history\.replaceState\(null, "", location\.pathname\)/);
  assert.match(off, /@click="stop"/, "a button, not the page load, turns it off");
  assert.doesNotMatch(off, /onMounted\([^)]*stop\(/);
  assert.match(off, /body: JSON\.stringify\(\{ token: token\.value \}\)/);
});

test("Settings has its own switch for product news, where the mail's footer points", () => {
  assert.match(settings, /id="news"\s+title="Product news"/);
  assert.match(toggle, /json\("PATCH", \{ news_mail: next \}\)/);
  assert.match(off, /href="\/hub\/settings#news"/);
});

test("only an admin sees the send, and it asks with the number of people first", () => {
  assert.match(admin, /<HubAnnouncements \/>/);
  assert.match(send, /Send it to \{\{ people\(reach\) \}\}\? This can't be undone\./);
  assert.match(send, /sandbox=""/, "the preview's markup cannot run");
});

test("the privacy policy says what product news is and how to stop it", () => {
  assert.match(privacy, /email you about new features in Passalong/);
  assert.match(privacy, /turn\s+them off in Settings/);
});
