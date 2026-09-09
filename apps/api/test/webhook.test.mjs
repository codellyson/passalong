// The team channel: which events reach it, what it sends, and which URLs it refuses.
import assert from "node:assert/strict";
import { test } from "node:test";
import { announce, channelBody, chatCard, line, post, webhookAllowed } from "../src/notify.ts";

test("only URLs worth posting a secret to are accepted", () => {
  assert.equal(webhookAllowed("https://hooks.slack.com/services/T0/B0/xxxx"), true);
  assert.equal(webhookAllowed("https://discord.com/api/webhooks/123/abc"), true);
  assert.equal(webhookAllowed("https://example.test/hook"), true);

  // http would put the channel's secret address on the wire in clear — and the URL *is* the
  // credential, so that is the whole secret, not a detail of one.
  assert.equal(webhookAllowed("http://hooks.slack.com/services/T0/B0/xxxx"), false);
  // A userinfo section is a way to smuggle a credential somewhere it will be logged.
  assert.equal(webhookAllowed("https://user:pass@example.test/hook"), false);
  assert.equal(webhookAllowed("ftp://example.test/hook"), false);
  assert.equal(webhookAllowed("not a url"), false);
  assert.equal(webhookAllowed(""), false);
  assert.equal(webhookAllowed(`https://example.test/${"x".repeat(600)}`), false);
});

/** A database and a fetch, both just enough to watch what announce() does. */
function harness(urls, { ok = true } = {}) {
  const list = (Array.isArray(urls) ? urls : urls ? [urls] : []).map((url, i) => ({
    id: `c${i}`,
    url,
    failures: 0,
  }));
  const posts = [];
  const writes = [];
  const env = {
    DB: {
      prepare: (sql) => ({
        bind: (...args) => ({
          all: async () => ({ results: list }),
          first: async () => ({ n: list.length }),
          run: async () => {
            writes.push({ sql, args });
            return {};
          },
        }),
      }),
    },
  };
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    posts.push({ url, init, body: JSON.parse(init.body) });
    return { ok, status: ok ? 200 : 404 };
  };
  return {
    env,
    posts,
    writes,
    restore: () => {
      globalThis.fetch = original;
    },
  };
}

test("a failed verdict reaches the channel, with the sentence every surface shows", async () => {
  const h = harness("https://hooks.slack.com/services/T0/B0/xxxx");
  try {
    const text = line({
      kind: "failed",
      actor: "hybee1",
      title: "Add Paystack webhook verification",
      team: "",
      times: 1,
      note: "the signature check rejects valid payloads",
    });
    await announce(h.env, {
      kind: "failed",
      team_id: "t1",
      text,
      url: "https://passalong.dev/g/abc12345/key",
    });
    assert.equal(h.posts.length, 1);
    const { body } = h.posts[0];
    assert.match(body.text, /@hybee1 says "Add Paystack webhook verification" does not work/);
    assert.match(body.text, /the signature check rejects valid payloads/);
    assert.match(body.text, /https:\/\/passalong\.dev\/g\/abc12345\/key/);
    assert.equal(
      h.posts[0].init.redirect,
      "manual",
      "a redirect is not where this was meant to go",
    );
  } finally {
    h.restore();
  }
});

test("a channel hears about the team's work, not one person's progress", async () => {
  const h = harness("https://example.test/hook");
  try {
    for (const kind of ["shared", "handoff", "verified", "failed"]) {
      await announce(h.env, { kind, team_id: "t1", text: `${kind} happened` });
    }
    assert.equal(h.posts.length, 4);

    h.posts.length = 0;
    // A room told about every pull learns to ignore the room.
    for (const kind of ["pulled", "consumed", "joined"]) {
      await announce(h.env, { kind, team_id: "t1", text: `${kind} happened` });
    }
    assert.equal(h.posts.length, 0);
  } finally {
    h.restore();
  }
});

test("no channel, no team, and a channel that refuses are all survivable", async () => {
  const none = harness("");
  try {
    await announce(none.env, { kind: "failed", team_id: "t1", text: "x" });
    assert.equal(none.posts.length, 0, "nothing to post to");
    await announce(none.env, { kind: "failed", team_id: "", text: "x" });
    assert.equal(none.posts.length, 0, "no team at all");
  } finally {
    none.restore();
  }

  // A deleted channel answers 404. The write that triggered this must still have succeeded.
  const gone = harness("https://example.test/hook", { ok: false });
  try {
    await assert.doesNotReject(() =>
      announce(gone.env, { kind: "failed", team_id: "t1", text: "x" }),
    );
  } finally {
    gone.restore();
  }
});

test("a channel that hangs does not hang the request that triggered it", async () => {
  const h = harness("https://example.test/hook");
  try {
    await announce(h.env, { kind: "failed", team_id: "t1", text: "x" });
    assert.ok(h.posts[0].init.signal, "the post must carry a timeout");
  } finally {
    h.restore();
  }
});

test("each channel is sent the field it accepts, not every field", () => {
  const text = "@hybee1 says it does not work";

  // Google Chat's webhook is a Google API endpoint, and those reject unknown field names outright
  // rather than ignoring them. Sending `content` alongside `text` would fail the whole request
  // with "Unknown name" — so the one field it knows is the only field it gets.
  const chat = channelBody(
    "https://chat.googleapis.com/v1/spaces/AAQA/messages?key=k&token=t",
    text,
  );
  assert.deepEqual(chat, { text });
  assert.ok(!("content" in chat));

  assert.deepEqual(channelBody("https://hooks.slack.com/services/T0/B0/x", text), { text });
  assert.deepEqual(channelBody("https://discord.com/api/webhooks/1/a", text), { content: text });
  assert.deepEqual(channelBody("https://discordapp.com/api/webhooks/1/a", text), { content: text });

  // Somewhere we do not recognise gets both spellings: the same gamble as before, but only where
  // there is nothing better to go on.
  assert.deepEqual(channelBody("https://example.test/hook", text), { text, content: text });
  assert.deepEqual(channelBody("not a url", text), { text, content: text });
});

test("a Google Chat webhook URL is accepted as it actually comes", () => {
  // Long, with the credential in the query string rather than the path — the shape a length cap or
  // a "no query parameters" rule would quietly have refused.
  //
  // The stand-in values are deliberately not key-shaped. A realistic one here was fake and still
  // tripped GitHub's secret scanner, because `AIzaSy` followed by 33 characters *is* the format —
  // a scanner cannot tell an invented key from a leaked one, and neither can a reviewer. What this
  // test needs is the length and the two query parameters, not plausible contents.
  const url =
    "https://chat.googleapis.com/v1/spaces/EXAMPLE_SPACE/messages" +
    `?key=${"k".repeat(39)}&token=${"t".repeat(43)}`;
  assert.ok(url.length > 150, "the shape under test is a long URL");
  assert.equal(webhookAllowed(url), true);
});

test("every channel a team has gets the line", async () => {
  const h = harness([
    "https://chat.googleapis.com/v1/spaces/A/messages?key=k&token=t",
    "https://hooks.slack.com/services/T0/B0/x",
    "https://discord.com/api/webhooks/1/a",
  ]);
  try {
    await announce(h.env, { kind: "failed", team_id: "t1", text: "it does not work" });
    assert.equal(h.posts.length, 3, "one post per channel");
    // Each in its own dialect, decided per destination rather than sent to all three alike.
    assert.deepEqual(h.posts[0].body, { text: "it does not work" });
    assert.deepEqual(h.posts[1].body, { text: "it does not work" });
    assert.deepEqual(h.posts[2].body, { content: "it does not work" });
  } finally {
    h.restore();
  }
});

test("one dead channel does not withhold the line from the others", async () => {
  const seen = [];
  const list = [
    { id: "dead", url: "https://dead.test/hook", failures: 0 },
    { id: "live", url: "https://live.test/hook", failures: 0 },
  ];
  const env = {
    DB: {
      prepare: () => ({
        bind: () => ({ all: async () => ({ results: list }), run: async () => ({}) }),
      }),
    },
  };
  const original = globalThis.fetch;
  globalThis.fetch = async (url) => {
    seen.push(String(url));
    if (String(url).includes("dead")) throw new Error("connection refused");
    return { ok: true, status: 200 };
  };
  try {
    await assert.doesNotReject(() => announce(env, { kind: "failed", team_id: "t1", text: "x" }));
    assert.ok(
      seen.some((u) => u.includes("live")),
      "the live channel still heard it",
    );
  } finally {
    globalThis.fetch = original;
  }
});

test("a refusal is recorded, and recovery clears it", async () => {
  const failing = harness("https://example.test/hook", { ok: false });
  try {
    const result = await post(
      failing.env,
      { id: "c0", url: "https://example.test/hook", failures: 0 },
      "x",
    );
    assert.equal(result.ok, false);
    // A webhook revoked on the other end fails silently forever unless the refusal is written down.
    assert.match(failing.writes[0].sql, /failures = failures \+ 1/);
  } finally {
    failing.restore();
  }

  const healthy = harness("https://example.test/hook");
  try {
    await post(healthy.env, { id: "c0", url: "https://example.test/hook", failures: 3 }, "x");
    assert.match(healthy.writes[0].sql, /failures = 0/);
    healthy.writes.length = 0;
    await post(healthy.env, { id: "c0", url: "https://example.test/hook", failures: 0 }, "x");
    assert.equal(healthy.writes.length, 0, "a healthy channel costs no writes");
  } finally {
    healthy.restore();
  }
});

// ---- the card a Google Chat room gets ----------------------------------------------------

const GCHAT = "https://chat.googleapis.com/v1/spaces/AAA/messages?key=k&token=t";
const facts = (over = {}) => ({
  kind: "handoff",
  text: '@lukman handed you "Invoice creation fails" in khaime / @hybee1',
  title: "Invoice creation fails: integer overflow in invoice_number sequence allocator",
  url: "https://passalong.dev/g/jvj2vckm/r9pfeum5h9kgwbwkh2wju8",
  ...over,
});

test("Chat gets a card, because Chat is the one room that cannot make its own", () => {
  const body = channelBody(GCHAT, "the sentence", facts());
  assert.equal(body.text, "the sentence", "the line stays: it is the phone's notification");
  assert.ok(Array.isArray(body.cardsV2));
  const card = body.cardsV2[0].card;
  assert.match(card.header.title, /Invoice creation fails/);
  assert.match(card.header.subtitle, /@lukman handed you/);
  const buttons = card.sections[0].widgets.at(-1).buttonList.buttons;
  assert.equal(buttons[0].onClick.openLink.url, facts().url);
  assert.equal(buttons[0].text, "Open the guide");
});

test("everywhere else is left alone — they unfurl, or they do not take cards", () => {
  assert.deepEqual(channelBody("https://hooks.slack.com/services/x", "hi", facts()), {
    text: "hi",
  });
  assert.deepEqual(channelBody("https://discord.com/api/webhooks/1/x", "hi", facts()), {
    content: "hi",
  });
  // Google refuses a payload carrying a field it does not know, and a refused post is a silent
  // one — so nothing but Chat may ever be handed a cardsV2.
  for (const url of ["https://hooks.slack.com/x", "https://example.com/hook"]) {
    assert.ok(!("cardsV2" in channelBody(url, "hi", facts())));
  }
});

test("the reason gets its own paragraph, and the tone gets the button", () => {
  const card = chatCard(
    facts({ kind: "failed", note: "the flag it tells you to set does not exist on this version" }),
  )[0].card;
  const [first, second] = card.sections[0].widgets;
  assert.match(first.textParagraph.text, /<i>the flag it tells you/);
  // #ab2f21. A failed verdict is the one thing in the room that should not look like everything
  // else in it. The names are google.type.Color's, spelled out: `r`/`g`/`b` is refused whole with
  // a 400, which is silent, which is a room that stops hearing anything at all.
  assert.deepEqual(second.buttonList.buttons[0].color, {
    red: 0.671,
    green: 0.184,
    blue: 0.129,
    alpha: 1,
  });
  const ok = chatCard(facts({ kind: "verified" }))[0].card.sections[0].widgets[0];
  assert.equal(ok.buttonList.buttons[0].color.green, 0.42, "a verdict that holds up is green");
});

test("a title somebody typed cannot become markup", () => {
  const card = chatCard(facts({ title: "Fix <b>bold</b> & the <script> tag" }))[0].card;
  assert.ok(!card.header.title.includes("<b>"), "Chat renders a subset of HTML in card text");
  assert.match(card.header.title, /&lt;b&gt;bold&lt;\/b&gt; &amp; the &lt;script&gt;/);
});

test("a long title is cut on a word, not mid-way through one", () => {
  const long = `${"word ".repeat(40)}end`;
  const title = chatCard(facts({ title: long }))[0].card.header.title;
  assert.ok(title.length <= 121, `header was ${title.length}`);
  assert.match(title, /word…$/, "the ellipsis lands after a whole word");
});

test("no card where a card would be worse than a sentence", () => {
  assert.equal(chatCard(facts({ title: "" })), null, "an event with no guide behind it");
  assert.equal(
    chatCard(facts({ url: "", note: "" })),
    null,
    "a header with nothing under it is a heading pretending to be a card",
  );
  // And the body still goes out, so the room hears about it either way.
  assert.deepEqual(channelBody(GCHAT, "@bo joined khaime", facts({ title: "" })), {
    text: "@bo joined khaime",
  });
});

test("a room with a card is not also sent the naked URL it replaced", async () => {
  const h = harness(GCHAT);
  try {
    await announce(h.env, {
      kind: "failed",
      team_id: "t1",
      text: '@ada says "Fix the payment link" does not work',
      title: "Fix the payment link",
      note: "every B2B invoice email fell through to app.khaime.com",
      url: "https://passalong.dev/g/abc12345/key",
    });
    const { body } = h.posts[0];
    assert.ok(!body.text.includes("https://"), "the button is the link now");
    assert.equal(
      body.cardsV2[0].card.sections[0].widgets.at(-1).buttonList.buttons[0].onClick.openLink.url,
      "https://passalong.dev/g/abc12345/key",
    );
  } finally {
    h.restore();
  }
});

test("a room without a card still gets the link spelled out", async () => {
  const h = harness("https://hooks.slack.com/services/T0/B0/xxxx");
  try {
    await announce(h.env, {
      kind: "failed",
      team_id: "t1",
      text: "@ada says it does not work",
      title: "Fix the payment link",
      url: "https://passalong.dev/g/abc12345/key",
    });
    assert.match(h.posts[0].body.text, /https:\/\/passalong\.dev\/g\/abc12345\/key/);
  } finally {
    h.restore();
  }
});

test("nothing in the card carries a field name Chat does not know", () => {
  // Google refuses a payload whole for one unrecognised key, and the refusal is silent. So the
  // shape is pinned by name against the Chat API's own vocabulary, top to bottom.
  const card = chatCard(facts({ kind: "failed", note: "why" }))[0];
  assert.deepEqual(Object.keys(card).sort(), ["card", "cardId"]);
  assert.deepEqual(Object.keys(card.card).sort(), ["header", "sections"]);
  assert.deepEqual(Object.keys(card.card.header).sort(), ["subtitle", "title"]);
  assert.deepEqual(Object.keys(card.card.sections[0]).sort(), ["widgets"]);

  const [para, buttons] = card.card.sections[0].widgets;
  assert.deepEqual(Object.keys(para), ["textParagraph"]);
  assert.deepEqual(Object.keys(para.textParagraph), ["text"]);
  assert.deepEqual(Object.keys(buttons), ["buttonList"]);

  const button = buttons.buttonList.buttons[0];
  assert.deepEqual(Object.keys(button).sort(), ["color", "onClick", "text"]);
  assert.deepEqual(Object.keys(button.onClick), ["openLink"]);
  assert.deepEqual(Object.keys(button.onClick.openLink), ["url"]);
  assert.deepEqual(Object.keys(button.color).sort(), ["alpha", "blue", "green", "red"]);
});

test("a refusal records what was refused, not just that it was", async () => {
  const seen = [];
  const env = {
    DB: {
      prepare(sql) {
        return { bind: (...a) => ({ run: async () => seen.push({ sql, a }) }) };
      },
    },
  };
  const real = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response('{ "error": { "message": "Cannot find field: r" } }', { status: 400 });
  try {
    const r = await post(env, { id: "c1", url: GCHAT, failures: 0 }, "hi", facts());
    assert.equal(r.ok, false);
    assert.match(r.error, /refused with 400: .*Cannot find field: r/);
    assert.ok(r.error.length <= 200, "it is read back into the hub, so it is capped");
    assert.match(seen[0].sql, /last_error = \?/);
  } finally {
    globalThis.fetch = real;
  }
});
