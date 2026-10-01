// Runs on Node 22.18+ with built-in type stripping (`node --test`). mail-copy.ts imports nothing,
// which is what makes the words of every mail testable — email.ts, which pours them into markup,
// is not importable here.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import {
  askedCopy,
  doneCopy,
  FIX_AND_RESEND,
  handoffCopy,
  hubUrl,
  openedCopy,
  repliedCopy,
  verdictCopy,
} from "../src/mail-copy.ts";

const ID = "k3mq2xa7";
const URL_ = `https://passalong.dev/g/${ID}/dpmmerhnfh2faf9sceu58j`;
const HUB = hubUrl("https://passalong.dev");
const TITLE = "Add Paystack webhook verification";

const every = () => [
  handoffCopy({ fromName: "Hybee1", title: TITLE, id: ID, url: URL_, team: "Khaime" }),
  openedCopy({ byName: "Ada", title: TITLE, url: URL_, hub: HUB }),
  doneCopy({ byName: "Ada", title: TITLE, url: URL_, hub: HUB }),
  verdictCopy({ byName: "Ada", title: TITLE, url: URL_, ok: true, note: "", hub: HUB }),
  verdictCopy({ byName: "Ada", title: TITLE, url: URL_, ok: false, note: "401s", hub: HUB }),
];

test("every subject says who did what, by name", () => {
  assert.deepEqual(
    every().map((m) => m.subject),
    [
      `Hybee1 sent you "${TITLE}"`,
      `Ada opened "${TITLE}"`,
      `Ada is done with "${TITLE}"`,
      `Ada said "${TITLE}" worked`,
      `Ada said "${TITLE}" didn't work`,
    ],
  );
});

test("the preview starts with the person, and neither it nor the subject carries an id", () => {
  for (const m of every()) {
    assert.ok(m.preview.startsWith("Hybee1") || m.preview.startsWith("Ada"), m.preview);
    assert.ok(!m.subject.includes(ID), `an id in the subject: ${m.subject}`);
    assert.ok(!m.preview.includes(ID), `an id in the preview: ${m.preview}`);
    assert.doesNotMatch(`${m.subject}\n${m.preview}\n${m.eyebrow}`, /someone/i);
  }
  // On a failure the reason is what the reader needs, so it is in the preview.
  assert.equal(every()[4].preview, "Ada said it didn't work: 401s");
});

test("the text half leads with opening the guide, and a command is only a footnote", () => {
  const handoff = every()[0].text;
  assert.equal(handoff[0], `Hybee1 sent you "${TITLE}" in Khaime.`);
  assert.ok(handoff.includes(`Open the guide: ${URL_}`));
  assert.match(handoff.join("\n"), /answer there/);
  const commands = handoff.filter((l) => l.includes("passalong "));
  assert.deepEqual(commands, [`Using a terminal or an agent? passalong pull ${ID}`]);
  assert.equal(handoff.at(-1), commands[0], "the command is the last thing, not the first");
});

test("see everything points at the hub, never at a command", () => {
  assert.equal(HUB, "https://passalong.dev/hub");
  assert.equal(hubUrl("https://example.test/"), "https://example.test/hub");
  for (const m of every().slice(1)) {
    assert.ok(m.text.includes(`See everything in one place: ${HUB}`));
    assert.doesNotMatch(m.text.join("\n"), /passalong activity/);
  }
});

test("a failed verdict says how to fix it, and a good one does not", () => {
  assert.equal(
    FIX_AND_RESEND,
    "Update the guide and share it again; the link you sent keeps working.",
  );
  assert.ok(every()[4].text.includes(FIX_AND_RESEND));
  assert.ok(!every()[3].text.includes(FIX_AND_RESEND));
});

test("no mail mentions a retired verb or calls a real person someone", async () => {
  for (const file of ["../src/mail-copy.ts", "../src/email.ts"]) {
    const src = await readFile(new URL(file, import.meta.url), "utf8");
    assert.doesNotMatch(src, /passalong promote/, `${file} still sells promote`);
    assert.doesNotMatch(src, /passalong activity/, `${file} still points at activity`);
    assert.doesNotMatch(src, /"someone"|someone with the link/, `${file} names someone`);
    assert.doesNotMatch(src, /handed off|passed you/, `${file} uses the old words`);
  }
});

test("a question mail quotes the question and sends the reader to answer it, not to read a guide", () => {
  const c = askedCopy({
    byName: "Ada",
    title: TITLE,
    url: URL_,
    question: "Settings or the header?",
    hub: HUB,
  });
  assert.equal(c.subject, `Ada's agent has a question about "${TITLE}"`);
  assert.equal(
    c.preview,
    "Settings or the header?",
    "the inbox is where they decide whether to answer",
  );
  assert.match(c.text.join("\n"), /Answer it in the hub:/);
  assert.ok(!c.subject.includes(ID), "never an id");
});

test("a reply mail says it is waiting for the agent's next check-in, not for the reader", () => {
  const c = repliedCopy({ byName: "Bob", title: TITLE, url: URL_, body: "Settings.", hub: HUB });
  assert.equal(c.subject, `Bob replied to your agent on "${TITLE}"`);
  assert.match(c.text.join("\n"), /next time it checks in/);
});
