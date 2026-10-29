// A stand-in for the API, for tests of operations that now need one: nothing is kept on the
// machine, so work sent has to land somewhere. It holds work by id and answers the few routes those
// operations call. Call before importing the modules, so they read the token.
import { parse, serialize } from "../src/guide.js";

export function fakeServer() {
  process.env.PASSALONG_API = "http://fake.test";
  process.env.PASSALONG_TOKEN = "t";
  const guides = new Map();
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
      const page = [...guides.keys()]
        .sort()
        .filter((id) => id > after)
        .slice(0, 2);
      return json({
        guides: page.map((id) => ({ id, markdown: guides.get(id) })),
        next: page.length === 2 ? page[1] : "",
      });
    }
    if (u.pathname === "/v1/take" && method === "POST") {
      const id = JSON.parse(init.body).id;
      if (!guides.has(id)) return json({ message: "no such work" }, 404);
      return json({ guide: { id, markdown: guides.get(id), fence: 1 }, next: [] });
    }
    const [, id, sub] = u.pathname.match(/^\/v1\/guides\/(\w+)(?:\/(\w+))?$/) || [];
    if (id && method === "PUT" && !sub) {
      guides.set(id, init.body);
      return json({ url: `http://fake.test/g/${id}/k` });
    }
    if (id && method === "PATCH" && sub === "status") {
      const g = parse(guides.get(id));
      g.meta.status = JSON.parse(init.body).status;
      guides.set(id, serialize(g));
      return json({ ok: true });
    }
    if (id && method === "GET" && !sub && guides.has(id)) return new Response(guides.get(id));
    return json({ message: "no such work" }, 404);
  };
  return { guides, asked };
}
