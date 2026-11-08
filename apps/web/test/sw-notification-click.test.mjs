// A notification click goes to the window already open. It used to `navigate()` that window, a full
// page load that blanked it and started the hub over, which looked like a new copy of the app
// opening on every click (2026-11-04). This runs public/sw.js's own handler against fake windows.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";

const src = readFileSync(new URL("../public/sw.js", import.meta.url), "utf8");
const shell = readFileSync(new URL("../app/components/hub/Shell.vue", import.meta.url), "utf8");
const ORIGIN = "https://passalong.dev";

function windowAt(path, focused = false) {
  const w = { url: `${ORIGIN}${path}`, focused, did: [] };
  w.focus = async () => w.did.push("focus");
  // Made inside the worker's sandbox: copied out, so it compares as a plain object.
  w.postMessage = (m) => w.did.push(["message", JSON.parse(JSON.stringify(m))]);
  w.navigate = async (u) => w.did.push(["navigate", u]);
  return w;
}

async function click(windows, url = "/hub/w/abc12345") {
  const on = {};
  const opened = [];
  const self = {
    location: { origin: ORIGIN },
    addEventListener: (type, fn) => (on[type] = fn),
    skipWaiting() {},
    clients: {
      matchAll: async () => windows,
      openWindow: async (u) => opened.push(u),
      claim() {},
    },
  };
  vm.runInNewContext(src, { self, URL, caches: {}, Response });
  let done;
  on.notificationclick({
    notification: { close() {}, data: { url } },
    waitUntil: (p) => (done = p),
  });
  await done;
  return opened;
}

test("an open hub is told where to go, the one in front first, and nothing new opens", async () => {
  const back = windowAt("/hub/work");
  const front = windowAt("/hub", true);
  const opened = await click([back, front]);
  assert.deepEqual(front.did, [
    "focus",
    ["message", { type: "open", url: `${ORIGIN}/hub/w/abc12345` }],
  ]);
  assert.deepEqual(back.did, [], "the other is left alone");
  assert.deepEqual(opened, [], "no new window");
});

test("the hub is preferred to a public page, which runs no script to listen", async () => {
  const page = windowAt("/pricing", true);
  const hub = windowAt("/hub/work");
  await click([page, hub]);
  assert.equal(hub.did.length, 2);
  assert.deepEqual(page.did, []);
});

test("with only a public page open it is moved there; with nothing open, one window opens", async () => {
  const page = windowAt("/pricing");
  assert.deepEqual(await click([page]), []);
  assert.deepEqual(page.did, ["focus", ["navigate", `${ORIGIN}/hub/w/abc12345`]]);
  assert.deepEqual(await click([]), [`${ORIGIN}/hub/w/abc12345`]);
});

test("the hub moves itself to the page, only on this site, and lets go when it unmounts", () => {
  assert.match(shell, /navigator\.serviceWorker\?\.addEventListener\("message", onWorker\)/);
  assert.match(shell, /if \(to\.origin === location\.origin\) navigateTo\(/);
  assert.match(
    shell,
    /onBeforeUnmount\(\(\) => navigator\.serviceWorker\?\.removeEventListener\("message", onWorker\)\)/,
  );
});
