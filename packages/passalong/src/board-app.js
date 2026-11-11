/**
 * The work board as an MCP App: one self-contained page the host draws in a sandboxed frame.
 *
 * It speaks the MCP Apps protocol (2026-01-26) over postMessage: `ui/initialize` to start, then it
 * draws whatever `ui/notifications/tool-result` carries. Refresh calls `find_work` again; every
 * link goes through `ui/open-link`, because a sandboxed frame cannot navigate on its own. Take
 * on a Ready row sends the agent a message (`ui/message`) to take it, rather than calling `take`
 * from the frame: the agent then gets the work, its context and the rules, which the frame cannot
 * pass on. Nothing is
 * loaded from anywhere, so it needs no CSP domains. Colours follow the host's theme when it says
 * one, and the system's when it does not.
 *
 * Served by both MCP servers: the stdio one (mcp.js) and the hosted one (apps/api/src/mcp-http.ts,
 * which imports this file), so the page is written once.
 */
export const WORK_APP_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Your work</title>
<style>
  :root { --bg:#fbfaf7; --fg:#1c1b19; --muted:#6b675f; --line:#e7e3da; --raised:#ffffff; --accent:#b5451b; --ok:#3f6b45; --warn:#9a6a12; color-scheme: light; }
  @media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --bg:#141310; --fg:#ece8df; --muted:#a39e93; --line:#2e2b25; --raised:#1c1a16; --accent:#e5825a; --ok:#86c493; --warn:#e0b25c; color-scheme: dark; } }
  :root[data-theme="dark"] { --bg:#141310; --fg:#ece8df; --muted:#a39e93; --line:#2e2b25; --raised:#1c1a16; --accent:#e5825a; --ok:#86c493; --warn:#e0b25c; color-scheme: dark; }
  * { box-sizing: border-box; }
  body { margin: 0; padding: 16px; background: var(--bg); color: var(--fg); font: 14px/1.5 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; -webkit-font-smoothing: antialiased; }
  h1 { margin: 0; font-size: 16px; font-weight: 600; }
  .top { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
  .counts { margin: 2px 0 0; color: var(--muted); font-size: 13px; }
  .counts b { color: var(--fg); font-weight: 600; font-variant-numeric: tabular-nums; }
  h2 { margin: 16px 0 6px; font-size: 11px; font-weight: 600; letter-spacing: .12em; text-transform: uppercase; color: var(--muted); }
  ul { margin: 0; padding: 0; list-style: none; border-radius: 12px; background: var(--raised); box-shadow: 0 0 0 1px var(--line); overflow: hidden; }
  li { display: flex; gap: 10px; align-items: flex-start; padding: 10px 12px; }
  li + li { border-top: 1px solid var(--line); }
  .dot { flex: none; width: 8px; height: 8px; margin-top: 6px; border-radius: 99px; background: var(--accent); }
  .dot.ok { background: var(--ok); } .dot.warn { background: var(--warn); } .dot.idle { background: var(--muted); opacity: .45; }
  .grow { min-width: 0; flex: 1; }
  .title { font-weight: 600; overflow-wrap: anywhere; }
  .sub { color: var(--muted); font-size: 13px; overflow-wrap: anywhere; }
  .id { font: 12px ui-monospace, SFMono-Regular, Menlo, monospace; color: var(--muted); }
  .clear { padding: 10px 12px; border-radius: 12px; background: var(--raised); box-shadow: 0 0 0 1px var(--line); color: var(--muted); }
  .clear b { color: var(--fg); }
  button { font: inherit; font-size: 13px; cursor: pointer; border-radius: 8px; padding: 6px 10px; border: 0; box-shadow: 0 0 0 1px var(--line); background: var(--raised); color: var(--fg); transition: scale .15s; }
  button:active { scale: .96; }
  button.primary { background: var(--accent); color: #fff; box-shadow: none; }
  .actions { display: flex; gap: 8px; margin-top: 16px; flex-wrap: wrap; }
  .link { flex: none; padding: 4px 8px; }
  .empty { color: var(--muted); padding: 24px 0; text-align: center; }
  .choices { display: flex; flex-direction: column; gap: 2px; margin-top: 8px; padding: 6px; border-radius: 10px; background: var(--bg); box-shadow: 0 0 0 1px var(--line); }
  .choice { display: flex; justify-content: space-between; gap: 8px; text-align: left; box-shadow: none; background: transparent; }
  .choice:hover { background: var(--raised); }
  .choice.on { font-weight: 600; }
  .note { margin: 4px 6px 2px; color: var(--muted); font-size: 12px; }
  .summary { margin: 6px 0 0; }
  .doc { margin-top: 12px; padding: 4px 14px; border-radius: 12px; background: var(--raised); box-shadow: 0 0 0 1px var(--line); overflow-wrap: anywhere; }
  .doc h3 { margin: 14px 0 6px; font-size: 14px; }
  .doc p, .doc ul, .doc pre { margin: 8px 0; }
  .doc ul { padding-left: 20px; list-style: disc; border-radius: 0; background: none; box-shadow: none; }
  .doc li { display: list-item; padding: 0; border: 0; }
  .doc pre { padding: 8px 10px; border-radius: 8px; background: var(--bg); overflow-x: auto; font: 12px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace; }
  .doc code { font: 12px ui-monospace, SFMono-Regular, Menlo, monospace; }
  .doc .linkish { padding: 0; box-shadow: none; background: none; color: var(--accent); text-decoration: underline; }
</style>
</head>
<body>
<div id="app"><p class="empty">Loading your work…</p></div>
<script>
(() => {
  let seq = 0;
  const pending = new Map();
  const post = (msg) => window.parent.postMessage(msg, "*");
  const request = (method, params) => new Promise((resolve) => {
    const id = ++seq;
    pending.set(id, resolve);
    post({ jsonrpc: "2.0", id, method, params });
  });
  const notify = (method, params) => post({ jsonrpc: "2.0", method, params: params || {} });
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const app = document.getElementById("app");
  let board = null;

  function theme(ctx) {
    const t = ctx && (ctx.theme || (ctx.hostContext && ctx.hostContext.theme));
    if (t === "dark" || t === "light") document.documentElement.dataset.theme = t;
  }

  function size() {
    notify("ui/notifications/size-changed", { height: document.documentElement.scrollHeight });
  }

  function open(url) {
    if (url) request("ui/open-link", { url });
  }

  function row(dot, title, sub, id, url, label, assign, take) {
    return '<li><span class="dot ' + dot + '"></span><div class="grow"><div class="title">' + esc(title) +
      '</div><div class="sub">' + sub + (id ? ' <span class="id">' + esc(id) + '</span>' : "") + '</div>' +
      (assign ? picker(assign) : "") + '</div>' +
      (take ? '<button class="link primary" data-take="' + esc(id) + '" data-title="' + esc(title) + '">Take</button>' : "") +
      (assign ? '<button class="link" data-give="' + esc(id) + '">Give to…</button>' : "") +
      (url ? '<button class="link" data-url="' + esc(url) + '">' + esc(label || "Open") + '</button>' : "") + '</li>';
  }

  // "Give to…" opens the choices under the row. The app may call update_work itself for this; the
  // server still refuses anyone who may not move the work.
  let giving = null;
  function picker(a) {
    if (giving !== a.id) return "";
    const choices = (board.teams && board.teams[a.team]) || [];
    return '<div class="choices">' + choices.map((c) =>
      '<button class="choice' + (c.to === a.to ? " on" : "") + '" data-assign="' + esc(a.id) + '" data-to="' + esc(c.to) + '">' +
      esc(c.label) + ' <span class="id">' + esc(c.hint) + '</span></button>').join("") +
      '<p class="note">Whoever has it now and is left out gets it taken back, and is told.</p></div>';
  }

  // One piece of work: frontmatter (one line per field, quoted values as JSON) and a markdown body.
  function split(md) {
    const meta = {};
    let body = md || "";
    if (body.startsWith("---\\n")) {
      const end = body.indexOf("\\n---", 4);
      if (end > 0) {
        body.slice(4, end).split("\\n").forEach((l) => {
          const i = l.indexOf(":");
          if (i < 1 || l[0] === " ") return;
          let v = l.slice(i + 1).trim();
          if (v[0] === '"') try { v = JSON.parse(v); } catch (_) {}
          meta[l.slice(0, i)] = v;
        });
        body = body.slice(end + 4).replace(/^\\n+/, "");
      }
    }
    return { meta, body };
  }

  // Only what is escaped first is drawn: links become buttons through ui/open-link, and pictures
  // are named, not loaded (they sit behind a credential the frame does not have).
  function inline(s) {
    return esc(s)
      .replace(/!\\[([^\\]]*)\\]\\(([^)\\s]+)\\)/g, (_, n, u) => '<button class="linkish" data-url="' + u + '">picture: ' + (n || "image") + '</button>')
      .replace(/\\[([^\\]]+)\\]\\((https?:[^)\\s]+)\\)/g, (_, t, u) => '<button class="linkish" data-url="' + u + '">' + t + '</button>')
      .replace(/\`([^\`]+)\`/g, "<code>$1</code>")
      .replace(/\\*\\*([^*]+)\\*\\*/g, "<b>$1</b>");
  }

  function markdown(body) {
    const out = [];
    let list = false, code = null, para = [];
    const flush = () => {
      if (para.length) out.push("<p>" + inline(para.join(" ")) + "</p>");
      para = [];
      if (list) out.push("</ul>");
      list = false;
    };
    body.split("\\n").forEach((l) => {
      if (code !== null) {
        if (l.startsWith("\`\`\`")) { out.push("<pre>" + esc(code.join("\\n")) + "</pre>"); code = null; }
        else code.push(l);
        return;
      }
      if (l.startsWith("\`\`\`")) { flush(); code = []; return; }
      const h = /^#{1,6}\\s+(.*)/.exec(l);
      const li = /^\\s*(?:[-*]|\\d+\\.)\\s+(.*)/.exec(l);
      if (h) { flush(); out.push("<h3>" + inline(h[1]) + "</h3>"); }
      else if (li) { if (para.length) flush(); if (!list) out.push("<ul>"); list = true; out.push("<li>" + inline(li[1]) + "</li>"); }
      else if (!l.trim()) flush();
      else { if (list) flush(); para.push(l.trim()); }
    });
    if (code !== null) out.push("<pre>" + esc(code.join("\\n")) + "</pre>");
    flush();
    return out.join("");
  }

  function renderWork(id, md, held) {
    const { meta, body } = split(md);
    const facts = [meta.status, meta.to ? "for " + meta.to : "", held ? "you are on it" : ""].filter(Boolean).join(" · ");
    let html = '<div class="top"><div><h1>' + esc(meta.title || id) + '</h1><p class="counts">' + esc(facts) +
      ' <span class="id">' + esc(id) + '</span></p></div></div>';
    if (meta.summary) html += '<p class="summary">' + esc(meta.summary) + '</p>';
    if (body.trim()) html += '<div class="doc">' + markdown(body) + '</div>';
    html += '<div class="actions">' +
      (held ? "" : '<button class="primary" data-take="' + esc(id) + '" data-title="' + esc(meta.title || id) + '">Take</button>') +
      (meta.url ? '<button data-url="' + esc(meta.url) + '">Open</button>' : "") + '</div>';
    app.innerHTML = html;
    size();
  }

  function render(b) {
    // take and find_work with an id answer with one piece of work; a search with a list.
    const one = b && !b.counts;
    if (one && b.work && typeof b.work.markdown === "string") return renderWork(b.work.id, b.work.markdown, true);
    if (one && typeof b.markdown === "string" && b.id) return renderWork(b.id, b.markdown, false);
    if (one && Array.isArray(b.work)) {
      app.innerHTML = b.work.length
        ? '<ul>' + b.work.map((w) => row("idle", w.title || w.id, esc(w.status || ""), w.id, w.url, "Open", null, w.status === "ready")).join("") + '</ul>'
        : '<p class="empty">Nothing matched.</p>';
      size();
      return;
    }
    if (!b || !b.counts) {
      app.innerHTML = "";
      size();
      return;
    }
    board = b;
    const c = b.counts;
    let html = '<div class="top"><div><h1>Your work</h1><p class="counts"><b>' + c.needs + '</b> need you · <b>' +
      c.working + '</b> being worked on · <b>' + c.open + '</b> open · <b>' + c.done + '</b> done</p></div></div>';
    html += '<h2>Needs you</h2>';
    html += b.needs && b.needs.length
      ? '<ul>' + b.needs.map((n) => row("", n.title, esc(n.why), n.id, n.url, "Open")).join("") + '</ul>'
      : '<div class="clear"><b>Nothing needs you.</b> Drafts to read and agents waiting on you land here.</div>';
    if (b.working && b.working.length) {
      html += '<h2>Working now</h2><ul>' + b.working.map((w) => row(w.stalled ? "warn" : "ok", w.title,
        esc(w.who) + (w.stalled ? " · went quiet" : "") + (w.note ? " · “" + esc(w.note) + "”" : ""), w.id, w.url, "Open")).join("") + '</ul>';
    }
    if (b.ready && b.ready.length) {
      html += '<h2>Ready for an agent</h2><ul>' + b.ready.map((t) => row("idle", t.title,
        t.to ? "for " + esc(t.to) : "waiting for whoever takes it next", t.id, t.url, "Open",
        t.team ? { id: t.id, team: t.team, to: t.to || "" } : null, true)).join("") + '</ul>';
    }
    html += '<div class="actions"><button class="primary" data-url="' + esc(b.hub) + '">Open the hub</button><button id="refresh">Refresh</button></div>';
    app.innerHTML = html;
    size();
  }

  app.addEventListener("click", (e) => {
    const t = e.target.closest("button");
    if (!t) return;
    if (t.dataset.take) {
      const id = t.dataset.take;
      t.disabled = true;
      request("ui/message", {
        role: "user",
        content: [{ type: "text", text: "Take " + id + " (" + t.dataset.title + ") from Passalong and do it." }],
      }).then((r) => {
        // A host that does not take messages from the frame answers with an error: say what to type.
        t.textContent = r ? "Added to your chat" : "Tell your agent: take " + id;
      });
      return;
    }
    if (t.dataset.give) {
      giving = giving === t.dataset.give ? null : t.dataset.give;
      render(board);
      return;
    }
    if (t.dataset.assign) {
      t.disabled = true;
      request("tools/call", { name: "update_work", arguments: { id: t.dataset.assign, to: t.dataset.to } }).then(() => {
        giving = null;
        return request("tools/call", { name: "find_work", arguments: {} });
      }).then((r) => render(r && r.structuredContent));
      return;
    }
    if (t.id === "refresh") {
      t.disabled = true;
      request("tools/call", { name: "find_work", arguments: {} }).then((r) => {
        t.disabled = false;
        render(r && r.structuredContent);
      });
    } else open(t.dataset.url);
  });

  window.addEventListener("message", (e) => {
    const m = e.data;
    if (!m || m.jsonrpc !== "2.0") return;
    if (m.id != null && pending.has(m.id) && ("result" in m || "error" in m)) {
      const done = pending.get(m.id);
      pending.delete(m.id);
      done(m.result || null);
      return;
    }
    if (m.method === "ui/notifications/tool-result") render(m.params && m.params.structuredContent);
    if (m.method === "ui/notifications/host-context-changed") theme(m.params);
  });

  new ResizeObserver(size).observe(document.body);
  request("ui/initialize", {
    protocolVersion: "2026-01-26",
    clientInfo: { name: "passalong-work", version: "1.0.0" },
    appCapabilities: {},
  }).then((r) => {
    theme(r);
    notify("ui/notifications/initialized");
  });
})();
</script>
</body>
</html>`;
