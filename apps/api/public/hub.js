// The hub: your guides and your teams' in one place. Talks to /v1/* with the account token,
// which lives only in this browser's localStorage. No framework, no build step; everything the
// page can do, the CLI and MCP server can do too.
(() => {
  const KEY = "passalong.token";
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

  // `passalong hub` opens /hub#token=… so the token never hits the server or a log line; the
  // page moves it into storage and scrubs the URL before anything else happens.
  const fromHash = new URLSearchParams(location.hash.slice(1)).get("token");
  if (fromHash) {
    store.set(fromHash);
    history.replaceState(null, "", location.pathname);
  }

  const state = {
    token: store.get(),
    me: null,
    guides: [],
    inbox: [],
    team: null, // full team detail when a team chip is selected
    q: "",
    status: "all",
    scope: "all",
    error: null,
    invite: null,
  };

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
      const [me, list, inbox] = await Promise.all([
        api("/v1/me"),
        api(`/v1/guides?scope=${encodeURIComponent(state.scope)}`),
        api("/v1/inbox"),
      ]);
      state.me = me;
      state.guides = list.guides;
      state.inbox = inbox.guides;
      state.team =
        state.scope !== "all" && state.scope !== "mine"
          ? await api(`/v1/teams/${encodeURIComponent(state.scope)}`)
          : null;
    } catch (e) {
      state.error = e.message;
    }
    render();
  }

  const rel = (iso) => {
    if (!iso) return "";
    const d = (Date.now() - new Date(iso).getTime()) / 864e5;
    if (d < 1 / 24) return "just now";
    if (d < 1) return `${Math.floor(d * 24)}h ago`;
    if (d < 30) return `${Math.floor(d)}d ago`;
    return iso.slice(0, 10);
  };

  function visible() {
    const q = state.q.trim().toLowerCase();
    const terms = q ? q.split(/\s+/) : [];
    return state.guides.filter((g) => {
      if (state.status !== "all" && g.status !== state.status) return false;
      if (!terms.length) return true;
      const hay = [
        g.title,
        g.source_context,
        g.from,
        g.to,
        ...(g.tags || []),
        ...(g.stack_assumptions || []),
      ]
        .join("\n")
        .toLowerCase();
      return terms.every((t) => hay.includes(t));
    });
  }

  async function act(fn) {
    try {
      await fn();
    } catch (e) {
      state.error = e.message;
    }
    render();
  }

  const setStatus = (g, status) =>
    act(async () => {
      await api(`/v1/guides/${g.id}/status`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status }),
      });
      g.status = status;
      state.inbox = state.inbox.filter((x) => x.id !== g.id || status !== "consumed");
    });

  const remove = (g) => {
    if (!confirm(`Remove "${g.title}" from sync? Local copies are untouched.`)) return;
    act(async () => {
      await api(`/v1/guides/${g.id}`, { method: "DELETE" });
      state.guides = state.guides.filter((x) => x.id !== g.id);
      if (state.me) state.me.guides -= 1;
    });
  };

  const makeInvite = (slug) =>
    act(async () => {
      state.invite = await api(`/v1/teams/${encodeURIComponent(slug)}/invites`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
    });

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
        el("code", {}, "passalong login"),
        ", or open the hub straight from the terminal with ",
        el("code", {}, "passalong hub"),
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
          placeholder: "pa_…",
          autocomplete: "off",
          spellcheck: "false",
        }),
        el("button", { type: "submit" }, "Connect"),
      ),
      state.error ? el("p", { class: "error" }, state.error) : "",
    );
  }

  function pulledBy(g) {
    if (!g.mine || !g.pulled_by?.length) return "";
    const parts = g.pulled_by.map((p) => `${p.handle ? `@${p.handle}` : "link"} ${rel(p.at)}`);
    return el("span", { class: "pulled" }, "pulled by ", el("b", {}, parts.join(", ")));
  }

  function row(g, { inbox = false } = {}) {
    const pull = `passalong pull ${g.id}`;
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
    if (g.mine && g.status !== "promoted")
      actions.push(
        el(
          "button",
          {
            class: `btn${g.status === "published" && g.pulls >= 3 ? " nudge" : ""}`,
            onclick: () => setStatus(g, "promoted"),
          },
          g.status === "published" && g.pulls >= 3 ? "★ promote — keeps getting pulled" : "promote",
        ),
      );
    if (g.mine && (g.status === "consumed" || g.status === "promoted"))
      actions.push(
        el("button", { class: "btn", onclick: () => setStatus(g, "published") }, "reopen"),
      );
    if (g.mine)
      actions.push(el("button", { class: "btn danger", onclick: () => remove(g) }, "remove"));

    const who = g.team
      ? el(
          "span",
          {},
          g.mine ? "to " : "from ",
          el(
            "b",
            {},
            g.mine ? `${g.team}${g.to ? ` / @${g.to}` : ""}` : `@${g.from || "?"} in ${g.team}`,
          ),
        )
      : "";

    return el(
      "li",
      { class: `guide ${g.status}${inbox ? " inbox" : ""}` },
      el(
        "div",
        { class: "head" },
        el(
          "a",
          { class: "title", href: g.url, target: "_blank", rel: "noopener" },
          g.title || g.id,
        ),
        el("span", { class: `status ${g.status}` }, g.for_me && inbox ? "for you" : g.status),
      ),
      el(
        "div",
        { class: "meta" },
        el("span", {}, "id ", el("b", {}, g.id)),
        who,
        g.source_context ? el("span", {}, "repo ", el("b", {}, g.source_context)) : "",
        el("span", {}, rel(g.created)),
        el("span", {}, `${g.pulls} pull${g.pulls === 1 ? "" : "s"}`),
        pulledBy(g),
        g.stack_assumptions?.length
          ? el("span", {}, "assumes ", el("b", {}, g.stack_assumptions.join(", ")))
          : "",
        (g.tags || []).map((t) => el("span", { class: "tag" }, `#${t}`)),
      ),
      el("div", { class: "actions" }, actions),
    );
  }

  function teamPanel() {
    const t = state.team;
    if (!t) return "";
    return el(
      "section",
      { class: "team" },
      el(
        "div",
        { class: "head" },
        el("h2", {}, t.name),
        el(
          "span",
          { class: "meta" },
          el("span", {}, `${t.members.length} member${t.members.length === 1 ? "" : "s"}`),
          el("span", {}, `${t.guides} guide${t.guides === 1 ? "" : "s"}`),
          el("span", {}, `you are ${t.role}`),
        ),
      ),
      el(
        "ul",
        { class: "members" },
        t.members.map((m) =>
          el(
            "li",
            {},
            el("b", {}, m.handle ? `@${m.handle}` : "(no handle yet)"),
            m.name ? ` ${m.name}` : "",
            el("span", { class: "muted" }, ` · ${m.role} · joined ${rel(m.joined)}`),
          ),
        ),
      ),
      el(
        "div",
        { class: "actions" },
        el("button", { class: "btn", onclick: () => makeInvite(t.slug) }, "new invite link"),
        state.invite
          ? el(
              "span",
              { class: "invite" },
              el("code", {}, state.invite.url),
              el(
                "button",
                { class: "btn", onclick: (e) => copy(state.invite.url, e.target) },
                "copy",
              ),
            )
          : el(
              "span",
              { class: "muted" },
              "hand a teammate a link; they run ",
              el("code", {}, "passalong team join <link>"),
            ),
      ),
    );
  }

  function hub() {
    const list = visible();
    const counts = {};
    for (const g of state.guides) counts[g.status] = (counts[g.status] || 0) + 1;
    const chip = (on, label, onclick) =>
      el("button", { class: `chip${on ? " on" : ""}`, onclick }, label);
    const statusChip = (value, label) =>
      chip(
        state.status === value,
        `${label}${value === "all" ? ` ${state.guides.length}` : counts[value] ? ` ${counts[value]}` : ""}`,
        () => {
          state.status = value;
          render();
        },
      );
    const scopeChip = (value, label) =>
      chip(state.scope === value, label, () => {
        state.scope = value;
        state.invite = null;
        load();
      });
    const teams = state.me?.teams || [];

    return el(
      "section",
      { class: "hub" },
      state.inbox.length
        ? el(
            "section",
            { class: "inboxbox" },
            el("h2", {}, `Handed to you · ${state.inbox.length}`),
            el(
              "ul",
              { class: "guides" },
              state.inbox.map((g) => row(g, { inbox: true })),
            ),
          )
        : "",
      teams.length
        ? el(
            "div",
            { class: "chips scopes" },
            scopeChip("all", "everything"),
            scopeChip("mine", "mine"),
            teams.map((t) => scopeChip(t.slug, t.name)),
          )
        : "",
      teamPanel(),
      el(
        "div",
        { class: "toolbar" },
        el("input", {
          type: "search",
          placeholder: "search title, tags, stack, source, people…",
          value: state.q,
          oninput: (e) => {
            state.q = e.target.value;
            render();
          },
        }),
        el(
          "div",
          { class: "chips" },
          statusChip("all", "all"),
          statusChip("published", "published"),
          statusChip("consumed", "consumed"),
          statusChip("promoted", "promoted"),
        ),
      ),
      state.error ? el("p", { class: "error" }, state.error) : "",
      state.guides.length === 0
        ? el(
            "div",
            { class: "empty" },
            el("p", {}, "Nothing synced yet. After your next finished piece of work:"),
            el("pre", {}, el("code", {}, "passalong share")),
            el("p", {}, "or say ", el("em", {}, "“pass this along”"), " to Claude Code."),
          )
        : list.length === 0
          ? el("p", { class: "empty" }, "No guides match.")
          : el(
              "ul",
              { class: "guides" },
              list.map((g) => row(g)),
            ),
      el(
        "footer",
        {},
        state.me
          ? `${state.me.handle ? `@${state.me.handle}` : `account ${state.me.account}`} · ${state.me.guides} synced (${state.me.limit} active on the free tier)${teams.length ? "" : " · start a team: passalong team create <name>"} · `
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
              state.inbox = [];
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
