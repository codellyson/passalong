// A stand-in for the API, for tests of operations that now need one: nothing is kept on the
// machine, so work sent has to land somewhere. It holds work by id and answers the few routes those
// operations call. Call before importing the modules, so they read the token.
import { parse, serialize } from "../src/work.js";

export function fakeServer() {
  process.env.PASSALONG_API = "http://fake.test";
  process.env.PASSALONG_TOKEN = "t";
  const work = new Map();
  const asked = [];
  const json = (body, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });
  globalThis.fetch = async (url, init = {}) => {
    const u = new URL(url);
    const method = init.method || "GET";
    asked.push(`${method} ${u.pathname}${u.search}`);
    if (u.pathname === "/v1/export") {
      const after = u.searchParams.get("after") || "";
      const page = [...work.keys()]
        .sort()
        .filter((id) => id > after)
        .slice(0, 2);
      return json({
        work: page.map((id) => ({ id, markdown: work.get(id) })),
        next: page.length === 2 ? page[1] : "",
      });
    }
    if (u.pathname === "/v1/take" && method === "POST") {
      const id = JSON.parse(init.body).id;
      if (!work.has(id)) return json({ message: "no such work" }, 404);
      return json({ work: { id, markdown: work.get(id), fence: 1 }, next: [] });
    }
    const [, id, sub] = u.pathname.match(/^\/v1\/work\/(\w+)(?:\/(\w+))?$/) || [];
    if (id && method === "PUT" && !sub) {
      work.set(id, init.body);
      return json({ url: `http://fake.test/w/${id}/k` });
    }
    if (id && method === "PATCH" && sub === "status") {
      const g = parse(work.get(id));
      g.meta.status = JSON.parse(init.body).status;
      work.set(id, serialize(g));
      return json({ ok: true });
    }
    if (id && method === "GET" && !sub && work.has(id)) return new Response(work.get(id));
    return json({ message: "no such work" }, 404);
  };
  return { work, asked };
}
