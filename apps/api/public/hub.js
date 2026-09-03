// The hub: your synced guides in one place. Talks to /v1/* with the account token, which lives
// only in this browser's localStorage. No framework, no build step; everything the page can do,
// the CLI and MCP server can do too.
(() => {
  const KEY = "relay.token";
  const $ = (sel, root = document) => root.querySelector(sel);
  const el = (tag, attrs = {}, ...children) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === "class") n.className = v;
      else if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
      else if (v !== null && v !== undefined) n.setAttribute(k, v);
    }
    for (const c of children.flat())
      n.append(c instanceof Node ? c : document.createTextNode(String(c)));
    return n;
  };

  const store = {
    get: () => {
      try {
        return localStorage.getItem(KEY);
      } catch {
        return null;
      }
    },
    set: (t) => {
      try {
        t ? localStorage.setItem(KEY, t) : localStorage.removeItem(KEY);
      } catch {}
    },
  };

  // `relay hub` opens /hub#token=… so the token never hits the server or a log line; the page
  // moves it into storage and scrubs the URL before anything else happens.
  const fromHash = new URLSearchParams(location.hash.slice(1)).get("token");
  if (fromHash) {
    store.set(fromHash);
    history.replaceState(null, "", location.pathname);
  }

  const state = { token: store.get(), me: null, guides: [], q: "", status: "all", error: null };

  async function api(path, init = {}) {
    const res = await fetch(path, {
      ...init,
      headers: { authorization: `Bearer ${state.token}`, ...(init.headers || {}) },
    });
    if (res.status === 401) {
      store.set(null);
      state.token = null;
      throw new Error("token rejected");
    }
    if (!res.ok) {
      let message = res.statusText;
      try {
        message = (await res.json()).message || message;
      } catch {}
      throw new Error(message);
    }
    return res.status === 204 ? null : res.json();
  }

  async function load() {
    state.error = null;
    try {
      [state.me, { guides: state.guides }] = await Promise.all([api("/v1/me"), api("/v1/guides")]);
    } catch (e) {
      state.error = e.message;
    }
    render();
  }

  const rel = (iso) => {
    if (!iso) return "";
    const d = (Date.now() - new Date(iso).getTime()) / 864e5;
    if (d < 1) return "today";
    if (d < 30) return `${Math.floor(d)}d ago`;
    return iso.slice(0, 10);
  };

  function visible() {
    const q = state.q.trim().toLowerCase();
    const terms = q ? q.split(/\s+/) : [];
    return state.guides.filter((g) => {
      if (state.status !== "all" && g.status !== state.status) return false;
      if (!terms.length) return true;
      const hay = [g.title, g.source_context, ...(g.tags || []), ...(g.stack_assumptions || [])]
        .join("\n")
        .toLowerCase();
      return terms.every((t) => hay.includes(t));
    });
  }

  async function setStatus(g, status) {
    try {
      await api(`/v1/guides/${g.id}/status`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status }),
      });
      g.status = status;
      render();
    } catch (e) {
      state.error = e.message;
      render();
    }
  }

  async function remove(g) {
    if (!confirm(`Remove "${g.title}" from sync? Local copies are untouched.`)) return;
    try {
      await api(`/v1/guides/${g.id}`, { method: "DELETE" });
      state.guides = state.guides.filter((x) => x.id !== g.id);
      if (state.me) state.me.guides -= 1;
      render();
    } catch (e) {
      state.error = e.message;
      render();
    }
  }

  function copy(text, btn) {
    navigator.clipboard?.writeText(text).then(() => {
      const was = btn.textContent;
      btn.textContent = "copied";
      setTimeout(() => {
        btn.textContent = was;
      }, 1200);
    });
  }

  function signIn() {
    return el(
      "section",
      { class: "signin" },
      el("h2", {}, "Connect this browser"),
      el(
        "p",
        {},
        "Paste your account token. It stays in this browser and is only ever sent to this host. ",
        "The CLI prints it with ",
        el("code", {}, "relay login"),
        ", or open the hub straight from the terminal with ",
        el("code", {}, "relay hub"),
        ".",
      ),
      el(
        "form",
        {
          onsubmit: (e) => {
            e.preventDefault();
            const t = $("input", e.target).value.trim();
            if (!t) return;
            state.token = t;
            store.set(t);
            load();
          },
        },
        el("input", {
          type: "password",
          placeholder: "rl_…",
          autocomplete: "off",
          spellcheck: "false",
        }),
        el("button", { type: "submit" }, "Connect"),
      ),
      state.error ? el("p", { class: "error" }, state.error) : "",
    );
  }

  function row(g) {
    const pull = `relay pull ${g.id}`;
    const actions = [
      el("a", { class: "btn", href: g.url, target: "_blank", rel: "noopener" }, "open"),
      el(
        "button",
        { class: "btn", onclick: (e) => copy(pull, e.target), title: pull },
        "copy pull",
      ),
      el("button", { class: "btn", onclick: (e) => copy(g.url, e.target) }, "copy link"),
    ];
    if (g.status !== "consumed")
      actions.push(el("button", { class: "btn", onclick: () => setStatus(g, "consumed") }, "done"));
    if (g.status !== "promoted")
      actions.push(
        el("button", { class: "btn", onclick: () => setStatus(g, "promoted") }, "promote"),
      );
    if (g.status === "consumed" || g.status === "promoted")
      actions.push(
        el("button", { class: "btn", onclick: () => setStatus(g, "published") }, "reopen"),
      );
    actions.push(el("button", { class: "btn danger", onclick: () => remove(g) }, "remove"));

    return el(
      "li",
      { class: `guide ${g.status}` },
      el(
        "div",
        { class: "head" },
        el(
          "a",
          { class: "title", href: g.url, target: "_blank", rel: "noopener" },
          g.title || g.id,
        ),
        el("span", { class: `status ${g.status}` }, g.status),
      ),
      el(
        "div",
        { class: "meta" },
        el("span", {}, "id ", el("b", {}, g.id)),
        g.source_context ? el("span", {}, "from ", el("b", {}, g.source_context)) : "",
        el("span", {}, rel(g.created)),
        el("span", {}, `${g.pulls} pull${g.pulls === 1 ? "" : "s"}`),
        g.stack_assumptions?.length
          ? el("span", {}, "assumes ", el("b", {}, g.stack_assumptions.join(", ")))
          : "",
        (g.tags || []).map((t) => el("span", { class: "tag" }, `#${t}`)),
      ),
      el("div", { class: "actions" }, actions),
    );
  }

  function hub() {
    const list = visible();
    const counts = {};
    for (const g of state.guides) counts[g.status] = (counts[g.status] || 0) + 1;
    const filter = (value, label) =>
      el(
        "button",
        {
          class: `chip${state.status === value ? " on" : ""}`,
          onclick: () => {
            state.status = value;
            render();
          },
        },
        label,
        value === "all" ? ` ${state.guides.length}` : counts[value] ? ` ${counts[value]}` : "",
      );

    return el(
      "section",
      { class: "hub" },
      el(
        "div",
        { class: "toolbar" },
        el("input", {
          type: "search",
          placeholder: "search title, tags, stack, source…",
          value: state.q,
          oninput: (e) => {
            state.q = e.target.value;
            render();
          },
        }),
        el(
          "div",
          { class: "chips" },
          filter("all", "all"),
          filter("published", "published"),
          filter("consumed", "consumed"),
          filter("promoted", "promoted"),
        ),
      ),
      state.error ? el("p", { class: "error" }, state.error) : "",
      state.guides.length === 0
        ? el(
            "div",
            { class: "empty" },
            el("p", {}, "Nothing synced yet. After your next finished piece of work:"),
            el("pre", {}, el("code", {}, "relay share")),
            el("p", {}, "or say ", el("em", {}, "“relay this”"), " to Claude Code."),
          )
        : list.length === 0
          ? el("p", { class: "empty" }, "No guides match.")
          : el("ul", { class: "guides" }, list.map(row)),
      el(
        "footer",
        {},
        state.me
          ? `account ${state.me.account} · ${state.me.guides} synced (${state.me.limit} active on the free tier) · `
          : "",
        el(
          "a",
          {
            href: "#",
            onclick: (e) => {
              e.preventDefault();
              store.set(null);
              state.token = null;
              state.guides = [];
              state.me = null;
              render();
            },
          },
          "disconnect this browser",
        ),
      ),
    );
  }

  function render() {
    const root = $("#app");
    root.replaceChildren(state.token ? hub() : signIn());
    const q = $(".toolbar input", root);
    if (q && document.activeElement !== q && state.q) {
      q.focus();
      q.setSelectionRange(q.value.length, q.value.length);
    }
  }

  render();
  if (state.token) load();
})();
