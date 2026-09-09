// The team channel: which events reach it, what it sends, and which URLs it refuses.
import assert from "node:assert/strict";
import { test } from "node:test";
import { announce, channelBody, line, webhookAllowed } from "../src/notify.ts";

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
function harness(webhook, { ok = true } = {}) {
  const posts = [];
  const env = {
    DB: {
      prepare: () => ({ bind: () => ({ first: async () => ({ webhook_url: webhook }) }) }),
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
