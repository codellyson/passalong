import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

// A copy of work since deleted on the server is stale, not the only copy of something: tidy
// removes it when its url is on our host and the server says 404. On any doubt it stays.
test("tidy removes held and deleted copies, keeps localhost and anything the server stumbled on", async () => {
  process.env.PASSALONG_HOME = mkdtempSync(join(tmpdir(), "passalong-tidy-"));
  process.env.PASSALONG_API = "http://fake.test";
  process.env.PASSALONG_TOKEN = "t";
  const asked = [];
  const real = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const u = new URL(url);
    asked.push(`${u.pathname}${u.search}`);
    const json = (body, status = 200) => new Response(JSON.stringify(body), { status });
    if (u.pathname === "/v1/export")
      return json({ work: [{ id: "held1111", markdown: "" }], next: "" });
    if (u.pathname === "/v1/work/flaky333") return json({ message: "down" }, 503);
    return json({ message: "no such work" }, 404);
  };
  try {
    const store = await import("../src/store.js");
    const passalong = await import("../src/passalong.js");
    const { parse } = await import("../src/work.js");
    const copy = (id, url) =>
      store.save(
        parse(
          `---\nid: ${id}\ntitle: ${id}\nsummary: A note.\n${url ? `url: ${url}\n` : ""}---\n\nbody\n`,
        ),
      );
    copy("held1111");
    copy("gone2222", "http://fake.test/w/gone2222/k");
    copy("flaky333", "http://fake.test/w/flaky333/k");
    copy("local444", "http://localhost:3000/w/local444/k");
    copy("none5555");
    store.writeConfig({ tidied: true }); // tidied by an older CLI: it runs once more

    assert.equal(await passalong.tidy(), 2);
    assert.deepEqual(
      store
        .list()
        .map((g) => g.meta.id)
        .sort(),
      ["flaky333", "local444", "none5555"],
    );
    assert.ok(asked.includes("/v1/work/gone2222?peek=1"), "asks with peek, so no pull is recorded");
    assert.ok(!asked.some((a) => a.includes("local444") || a.includes("none5555")));

    const before = asked.length;
    assert.equal(await passalong.tidy(), 0);
    assert.equal(asked.length, before, "the second run asks nothing");
  } finally {
    globalThis.fetch = real;
  }
});
