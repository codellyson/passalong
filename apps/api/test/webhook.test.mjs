// The team channel: which events reach it, what it sends, and which URLs it refuses.
import assert from "node:assert/strict";
import { test } from "node:test";
import { announce, channelBody, line, post, webhookAllowed } from "../src/notify.ts";

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
  // Long, with the credential in the query string rather than the path — the shape that a
  // length cap or a "no query parameters" rule would quietly have refused.
  const url =
    "https://chat.googleapis.com/v1/spaces/AAQAtBk_zVI/messages" +
    "?key=AIzaSyDdI0hCZtE6vySjMm-WEfRq3CPzqKqqsHI&token=8Kx2yQ-1mS3nR7pV0wZbC4dE6fG9hJkLmN";
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
