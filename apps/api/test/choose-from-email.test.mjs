// Picking an agent's option from the email that asked (2026-11-06): a button per option, each a
// single-use link for that question, its token in the URL fragment so no log holds it, and a page
// that asks once more before it picks, since mail scanners open every link.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { askedCopy } from "../src/mail-copy.ts";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const index = read("../src/index.ts");
const email = read("../src/email.ts");
const page = read("../../web/app/pages/choose.vue");

test("the mail lists each option with the link that picks it", () => {
  const copy = askedCopy({
    byName: "Ada",
    title: "Pick a layout",
    url: "https://passalong.dev/w/x/k",
    question: "Which layout?",
    hub: "https://passalong.dev/hub",
    choices: [
      { label: "Two columns", url: "https://passalong.dev/choose#t=abc&n=1" },
      { label: "One column", url: "https://passalong.dev/choose#t=abc&n=2" },
    ],
  });
  const text = copy.text.join("\n");
  assert.match(text, /Pick one:\n {2}1\. Two columns: https:\/\/passalong\.dev\/choose#t=abc&n=1/);
  assert.match(text, /Or answer it in the hub: https:\/\/passalong\.dev\/hub/);
  assert.match(
    email,
    /\.\.\.o\.choices\.map\(\(c, n\) => button\(`\$\{n \+ 1\}\. \$\{c\.label\}`, c\.url\)\)/,
  );
});

test("a link is for one question, kept as a hash, and its token never in a URL path", () => {
  assert.match(index, /url: `\$\{origin\(c\)\}\/choose#t=\$\{token\}&n=\$\{n \+ 1\}`/);
  assert.match(
    index,
    /INSERT INTO choice_link \(hash, work_id, event_id, account_id, created, expires\)/,
  );
  assert.match(index, /"POST \/v1\/choose\/read",\s*"POST \/v1\/choose\/pick",/);
  assert.doesNotMatch(index, /\/v1\/choose\/:token/);
});

test("it picks once, only while the question waits, as a reply from whoever was asked", () => {
  const pick = index.slice(index.indexOf('app.post("/v1/choose/pick"'));
  const body = pick.slice(0, pick.indexOf("\n});"));
  assert.match(body, /got\.why === "used" \|\| got\.why === "answered"/);
  assert.match(body, /UPDATE choice_link SET used = \?, picked = \? WHERE hash = \? AND used = ''/);
  assert.match(body, /\/v1\/work\/\$\{encodeURIComponent\(got\.link\.work_id\)\}\/reply/);
  assert.match(body, /got\.link\.account_id,\s*"hub",/);
  assert.match(
    body,
    /UPDATE choice_link SET used = '', picked = 0 WHERE hash = \?/,
    "undone if refused",
  );
});

test("the page reads the fragment, scrubs it, and asks before it picks", () => {
  assert.match(page, /new URLSearchParams\(location\.hash\.slice\(1\)\)/);
  assert.match(page, /history\.replaceState\(null, "", location\.pathname\)/);
  assert.match(page, /tapped === n \+ 1 \? `Confirm: \$\{c\.label\}` : "Choose this"/);
  assert.match(page, /noindex: true/);
});

test("a pick after the agent stopped is kept for whoever is next, and the page says so", () => {
  // Found testing live (2026-11-06): the pick became a note, as the reply route does when nobody
  // holds the work, but the page said "Your agent carries on with it".
  assert.match(index, /SELECT 1 FROM claim WHERE work_id = \? LIMIT 1/);
  assert.match(index, /return c\.json\(\{ picked: k, label: pick\.label, held: got\.held \}\);/);
  assert.match(
    page,
    /The agent that asked had stopped, so it is saved on the work for whoever takes it next\./,
  );
});

test("a second link opened in the same tab is read, not the first one kept", () => {
  // Also found live: only the fragment changes, so the page was not loaded again.
  assert.match(page, /window\.addEventListener\("hashchange", open\);/);
  assert.match(
    page,
    /onBeforeUnmount\(\(\) => window\.removeEventListener\("hashchange", open\)\);/,
  );
});
