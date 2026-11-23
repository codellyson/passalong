// Runs on Node 22.18+ with built-in type stripping (`node --test`). mail-html.ts imports nothing,
// which is what makes the markup itself testable — email.ts, which composes it, does not.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { BRAND, button, choice, command, esc, mono, quote, rows, shell } from "../src/mail-html.ts";

const page = (over = {}) => shell({ preview: "p", heading: "h", body: [], ...over });

test("a piece of work title is somebody's typing, and it is going into markup", () => {
  const html = shell({
    preview: "x",
    heading: `Fix <script>alert(1)</script> & "quotes"`,
    body: [quote(`5 < 6 & "so on"`), command("run", "echo <hi>")],
  });
  assert.ok(!html.includes("<script>"), "a title must never reach the reader as a tag");
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /&amp;/);
  assert.match(html, /&quot;quotes&quot;/);
  assert.equal(esc(null), "", "nothing renders as nothing, not as the word null");
});

test("a link is escaped in the attribute it lands in", () => {
  const html = button("Read it", 'https://x/"onmouseover=alert(1)');
  assert.ok(!html.includes('"onmouseover'), "the href must not be able to close its own quote");
  assert.match(html, /&quot;onmouseover/);
});

test("every mail carries a preview line, hidden from the body", () => {
  const html = page({ preview: "From @mark. Pull it with passalong pull abc." });
  assert.match(html, /From @mark\. Pull it with passalong pull abc\./);
  assert.match(html, /display:none;max-height:0/, "it belongs to the inbox list, not the page");
});

test("the masthead survives an inbox that blocks images", () => {
  const html = page({ origin: "https://passalong.dev" });
  assert.match(html, /src="https:\/\/passalong\.dev\/icon-192\.png"/, "absolute, always");
  assert.match(html, /alt="Passalong"/, "blocked images leave the alt text standing in for it");
  assert.match(
    html,
    />Passalong<\/td>/,
    "and the wordmark is text beside it, not part of the image",
  );
  assert.match(page(), /https:\/\/passalong\.dev\/icon-192\.png/, "with a default host");
  assert.match(page({ origin: "https://x.dev/" }), /https:\/\/x\.dev\/icon-192/, "no double slash");
});

test("the layout states its colours rather than inheriting them", () => {
  const html = page();
  // Gmail on Android inverts a mail it decides is light instead of reading prefers-color-scheme,
  // so a palette resting on defaults arrives as something else.
  assert.match(html, /<meta name="color-scheme" content="light">/);
  assert.match(html, /background:#fbfaf7/, "the page paints its own ground");
  assert.ok(!/<td width="4"/.test(html), "the card wears no stripe down its edge");
});

test("a list of work is rows of ink links, never a wall of accent links", () => {
  const html = rows([
    { title: "Fix <it>", href: "https://x/1", note: "Finished by Jed" },
    { title: "Two", href: "https://x/2" },
  ]);
  assert.equal(html.match(/<tr>/g)?.length, 2);
  assert.match(html, /Fix &lt;it&gt;/);
  assert.match(html, /color:#1c1b19;text-decoration:none;">Fix/, "the title is ink, not accent");
  assert.match(html, /Finished by Jed/);
  assert.ok(!html.includes("<br>"));
});

test("a choice is an outlined link, and a quote is a grey well", () => {
  assert.match(choice("Share <it>", "https://x"), /border:1px solid #e4e0d8.*Share &lt;it&gt;/);
  assert.match(quote("hi"), /background:#f4f2ec/);
});

test("a command is set to be copied, not admired", () => {
  assert.match(command("pull it", "passalong pull abc"), /passalong pull abc/);
  assert.match(command("pull it", "x"), /word-break:break-all/, "an id must not widen the mail");
  assert.match(mono("passalong works abc"), /white-space:nowrap/);
});

test("no layout tool an email client cannot do", () => {
  const html = shell({ preview: "p", heading: "h", body: [button("go", "https://x")] });
  for (const banned of ["display:flex", "display:grid", "<svg", "@media"]) {
    assert.ok(!html.includes(banned), `${banned} does not survive the trip`);
  }
});

test("every mail sends both halves, and the mail for sent work no longer names a retired verb", async () => {
  // email.ts imports ./mail-html.js, which Node's type stripping cannot resolve — so what is
  // checked here is its source. See the same approach in work.test.mjs.
  const { readFile } = await import("node:fs/promises");
  const src = await readFile(new URL("../src/email.ts", import.meta.url), "utf8");
  const sends = (src.match(/export function send[A-Z]\w+/g) ?? []).filter(
    (n) => n !== "export function sendMail",
  );
  assert.ok(sends.length >= 6, `expected the mails, found ${sends.length}`);
  assert.equal(
    src.match(/shell\(\{/g)?.length,
    sends.length,
    "every mail composes an HTML half; a plain-text-only one would arrive looking unfinished",
  );
  // `passalong done` archives a piece of work now. What the sender is owed is whether it worked, so the
  // mail must not send its reader to the wrong verb. Sliced from the signature, because the
  // note explaining the change names the old instruction and would match.
  const at = src.indexOf("export function sendSentToYou");
  const sent = src.slice(at, src.indexOf("export function", at + 10));
  assert.ok(!sent.includes("passalong done"), "the mail used to end on the wrong instruction");
  assert.match(sent, /passalong take \$\{o\.id\}/);
});

test("the hub's brand is the mail's own mark and accent", () => {
  assert.match(BRAND.color, /^#[0-9a-f]{6}$/);
  assert.match(BRAND.logo, /^https:\/\/passalong\.dev\//);
  const html = page({ origin: "https://passalong.dev" });
  assert.ok(html.includes(`src="${BRAND.logo}"`), "the masthead mark is the hub's logo");
  assert.ok(button("go", "https://x").includes(BRAND.color), "the button is the hub's colour");
  const src = readFileSync(new URL("../src/index.ts", import.meta.url), "utf8");
  const route = src.slice(src.indexOf('app.get("/v1/admin-hub", '));
  assert.match(route.slice(0, 600), /\{ \.\.\.MANIFEST, brand: BRAND \}/);
});
