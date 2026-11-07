// Answering an agent from the work page. The conversation was in a side panel that only a Reply
// button under Progress opened, so a person reading the page saw the agent's notes and none of the
// conversation (2026-11-07). It is the page's main column now, with its box open.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const page = readFileSync(new URL("../app/pages/hub/w/[id].vue", import.meta.url), "utf8");
const thread = readFileSync(new URL("../app/components/hub/Thread.vue", import.meta.url), "utf8");

test("the conversation is on the page, with the box the server says this reader may use", () => {
  const talk = page.slice(page.indexOf('<section v-if="ctx.reply || threadStamp"'));
  const block = talk.slice(0, talk.indexOf("</section>"));
  assert.match(block, /<HubThread/);
  assert.match(block, /:reply="Boolean\(ctx\.reply\)"/);
  assert.match(block, /:noting="ctx\.reply === 'note'"/);
  assert.match(block, /:talking="ctx\.reply === 'talk'"/, "a teammate's box is for the team");
  assert.match(block, /\blive\b/, "it keeps itself up to date");
  assert.doesNotMatch(page, /@click="respond"/, "no button to open it somewhere else");
});

test("on the page it reads itself again while it is on screen, as the panel does", () => {
  assert.match(
    thread,
    /if \(props\.fill \|\| props\.live\) poll = setInterval\(\(\) => !document\.hidden && load\(\), 15000\);/,
  );
});

test("the full request is a click away, and open on a draft", () => {
  assert.match(page, /\{\{ docOpen \? "Hide the full request" : "Show the full request" \}\}/);
  assert.match(page, /if \(status === "draft"\) docOpen\.value = true;/);
  assert.match(page, /v-if="frame && docOpen"/, "not loaded until it is opened");
});

test("the summary is said only when it says more than the title", () => {
  assert.match(page, /return s && !words\(s\)\.startsWith\(t\) \? s : "";/);
  assert.match(page, /<p v-if="summary"/);
});
