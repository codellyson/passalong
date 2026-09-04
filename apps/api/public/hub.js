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
    signedIn: false, // proven by /v1/me succeeding, whether by cookie or token
    me: null,
    guides: [],
    board: null, // the four queues from /v1/board
    activity: [],
    unread: 0,
    team: null, // full team detail when a team chip is selected
    q: "",
    status: "all",
    scope: "all",
    error: null,
    invite: null,
    editing: false,
    mode: "login", // login | signup | forgot
    authError: null,
    notice: null,
    tokens: [],
    newToken: null, // shown once, right after minting
    meError: null, // identity-form errors belong beside the identity form, not in the page slot
    typed: null, // a rejected handle stays in the field instead of snapping back
  };

  // Two ways to be signed in: a pasted token (CLI users) or the session cookie set by logging in.
  // The cookie rides along on its own, so the header only appears when a token is actually held.
  async function api(path, init = {}) {
    const headers = { ...(init.headers || {}) };
    if (state.token) headers.authorization = `Bearer ${state.token}`;
    const res = await fetch(path, { ...init, headers });
    if (res.status === 401) {
      store.set(null);
      state.token = null;
      state.signedIn = false;
      throw new Error("signed out");
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
      const [me, list, board, activity, tokens] = await Promise.all([
        api("/v1/me"),
        api(`/v1/guides?scope=${encodeURIComponent(state.scope)}`),
        api("/v1/board"),
        api("/v1/notifications?limit=30"),
        api("/v1/tokens"),
      ]);
      state.signedIn = true;
      state.tokens = tokens.tokens;
      state.me = me;
      state.guides = list.guides;
      state.board = board;
      state.activity = activity.notifications;
      state.unread = activity.unread;
      state.team =
        state.scope !== "all" && state.scope !== "mine"
          ? await api(`/v1/teams/${encodeURIComponent(state.scope)}`)
          : null;
    } catch (e) {
      // Not being signed in is a state, not an error to shout about.
      state.error = e.message === "signed out" ? null : e.message;
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

  // Both of these move a guide between queues, so reload rather than patch state by hand: the
  // board's buckets are defined by SQL, and guessing them here is how the two drift apart.
  const setStatus = (g, status) =>
    act(async () => {
      await api(`/v1/guides/${g.id}/status`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status }),
      });
      g.status = status;
      await load();
    });

  const remove = (g) => {
    if (!confirm(`Remove "${g.title}" from sync? Local copies are untouched.`)) return;
    act(async () => {
      await api(`/v1/guides/${g.id}`, { method: "DELETE" });
      await load();
    });
  };

  // The reader's answer to "does this work?". A failure must say why — the prompt is the whole
  // interface, because a text box here would be the first step toward a comment thread.
  const verdict = (g, ok) => {
    let note = "";
    if (!ok) {
      note = (prompt(`What went wrong with "${g.title}"?`) || "").trim();
      if (!note) return; // cancelled, or nothing useful to say
    }
    act(async () => {
      await api(`/v1/guides/${g.id}/verdict`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ok, note }),
      });
      await load();
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

  // "handle @x is taken" is the one error people actually hit, and it is useless at the bottom of
  // the page, so this one reports next to the field instead of through act().
  async function saveMe(patch) {
    state.meError = null;
    try {
      state.me = {
        ...state.me,
        ...(await api("/v1/me", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(patch),
        })),
      };
      state.editing = false;
      state.typed = null;
    } catch (e) {
      state.meError = e.message;
    }
    render();
  }

  const createTeam = (name) =>
    act(async () => {
      const t = await api("/v1/teams", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name }),
      });
      state.scope = t.slug;
      await load();
    });

  // Without a handle you cannot be addressed — `--to team/@you` has nothing to aim at — so an
  // account that has not claimed one is prompted rather than left to find the CLI.
  function identity() {
    const me = state.me;
    if (!me) return "";
    if (!me.handle || state.editing) {
      return el(
        "section",
        { class: `identity${me.handle ? "" : " needed"}` },
        el("h2", {}, me.handle ? "Your details" : "Claim a handle"),
        el(
          "p",
          { class: "muted" },
          me.handle
            ? "How teammates address you, and where handoffs are mailed."
            : "Teammates hand work to a handle. Until you claim one, nothing can be addressed to you.",
        ),
        el(
          "form",
          {
            onsubmit: (e) => {
              e.preventDefault();
              const f = e.target;
              state.typed = f.handle.value.trim();
              saveMe({
                handle: state.typed,
                name: f.name.value.trim(),
                email: f.email.value.trim(),
              });
            },
          },
          el("input", {
            name: "handle",
            value: state.typed ?? me.handle ?? "",
            placeholder: "handle",
            required: "required",
            spellcheck: "false",
            pattern: "[a-zA-Z0-9][a-zA-Z0-9-]{1,30}",
            title: "2–31 characters: letters, digits and dashes",
          }),
          el("input", { name: "name", value: me.name || "", placeholder: "name (optional)" }),
          el("input", {
            name: "email",
            type: "email",
            value: me.email || "",
            placeholder: "email (optional)",
          }),
          el("button", { class: "primary", type: "submit" }, "Save"),
          me.handle
            ? el(
                "button",
                {
                  class: "btn",
                  type: "button",
                  onclick: () => {
                    state.editing = false;
                    render();
                  },
                },
                "cancel",
              )
            : "",
        ),
        state.meError ? el("p", { class: "error" }, state.meError) : "",
      );
    }
    return "";
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

  // An invite link is the only entry that leads anywhere for someone with no team: an account on
  // its own has an empty hub, because guides are made by `passalong share`, not here. Accepting a
  // pasted link is the difference between a dead end and a next step.
  function invitePaste(label) {
    return el(
      "form",
      {
        class: "invite-paste",
        onsubmit: (e) => {
          e.preventDefault();
          const raw = $("input", e.target).value.trim();
          const code = raw.split("/").pop();
          if (code) location.assign(`/join/${encodeURIComponent(code)}`);
        },
      },
      el("input", {
        class: "grow",
        name: "invite",
        placeholder: "paste an invite link",
        "aria-label": label,
        spellcheck: "false",
      }),
      el("button", { class: "btn", type: "submit" }, "Join"),
    );
  }

  async function auth(path, body) {
    state.authError = null;
    state.notice = null;
    try {
      const res = await fetch(path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message || res.statusText);
      return await res.json();
    } catch (e) {
      state.authError = e.message;
      render();
      return null;
    }
  }

  // Signing in replaces any pasted token: the cookie is now the credential, and leaving a stale
  // bearer header in storage would keep authenticating as whoever that token belongs to.
  async function signedInAs() {
    store.set(null);
    state.token = null;
    await load();
  }

  function signIn() {
    const tab = (mode, label) =>
      el(
        "button",
        {
          class: `chip${state.mode === mode ? " on" : ""}`,
          onclick: () => {
            state.mode = mode;
            state.authError = null;
            state.notice = null;
            render();
          },
        },
        label,
      );

    const fields = [
      el(
        "label",
        {},
        "Email",
        el("input", { name: "email", type: "email", required: "required", autocomplete: "email" }),
      ),
      state.mode === "forgot"
        ? ""
        : el(
            "label",
            {},
            "Password",
            el("input", {
              name: "password",
              type: "password",
              required: "required",
              minlength: state.mode === "signup" ? "10" : null,
              autocomplete: state.mode === "signup" ? "new-password" : "current-password",
            }),
            state.mode === "signup" ? el("span", { class: "muted" }, "at least 10 characters") : "",
          ),
    ];

    const submit = async (e) => {
      e.preventDefault();
      const f = e.target;
      const email = f.email.value.trim();
      if (state.mode === "forgot") {
        const out = await auth("/v1/auth/forgot", { email });
        if (out) {
          state.notice = "If that address has an account, a reset link is on its way.";
          render();
        }
        return;
      }
      const path = state.mode === "signup" ? "/v1/auth/signup" : "/v1/auth/login";
      if (await auth(path, { email, password: f.password.value })) await signedInAs();
    };

    return el(
      "section",
      { class: "signin" },
      el("h2", {}, "Sign in"),
      el(
        "div",
        { class: "chips" },
        tab("login", "sign in"),
        tab("signup", "create account"),
        tab("forgot", "forgot password"),
      ),
      el(
        "form",
        { class: "join", onsubmit: submit },
        fields,
        el(
          "button",
          { class: "primary", type: "submit" },
          state.mode === "signup"
            ? "Create account"
            : state.mode === "forgot"
              ? "Email me a link"
              : "Sign in",
        ),
        state.authError ? el("p", { class: "error" }, state.authError) : "",
        state.notice ? el("p", { class: "muted" }, state.notice) : "",
      ),

      el("h2", {}, "Other ways in"),
      el(
        "p",
        {},
        "Been sent an invite? Opening the link makes your account and joins the team in one step.",
      ),
      invitePaste("invite link"),
      el(
        "p",
        {},
        "Or paste an API token — the CLI prints one with ",
        el("code", {}, "passalong login"),
        ", and ",
        el("code", {}, "passalong hub"),
        " opens this page already signed in.",
      ),
      el(
        "form",
        {
          class: "invite-paste",
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
          class: "grow",
          type: "password",
          placeholder: "pa_…",
          autocomplete: "off",
          spellcheck: "false",
        }),
        el("button", { class: "btn", type: "submit" }, "Use token"),
      ),
      state.error ? el("p", { class: "error" }, state.error) : "",
    );
  }

  function pulledBy(g) {
    if (!g.mine || !g.pulled_by?.length) return "";
    const parts = g.pulled_by.map((p) => `${p.handle ? `@${p.handle}` : "link"} ${rel(p.at)}`);
    return el("span", { class: "pulled" }, "pulled by ", el("b", {}, parts.join(", ")));
  }

  function row(g) {
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
    if (!g.mine) {
      actions.push(el("button", { class: "btn", onclick: () => verdict(g, true) }, "works"));
      actions.push(
        el("button", { class: "btn danger", onclick: () => verdict(g, false) }, "doesn't work"),
      );
    }
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
        who,
        g.source_context ? el("span", {}, "repo ", el("b", {}, g.source_context)) : "",
        el("span", {}, rel(g.created)),
        el("span", {}, `${g.pulls} pull${g.pulls === 1 ? "" : "s"}`),
        pulledBy(g),
        g.verdict
          ? el(
              "span",
              { class: g.failing ? "verdict bad" : "verdict" },
              g.verdict.ok ? "verified by " : "not working — ",
              el("b", {}, g.verdict.by ? `@${g.verdict.by}` : "someone"),
              g.verdict.note ? `: ${g.verdict.note}` : "",
            )
          : "",
        g.stack_assumptions?.length
          ? el("span", {}, "assumes ", el("b", {}, g.stack_assumptions.join(", ")))
          : "",
        (g.tags || []).map((t) => el("span", { class: "tag" }, `#${t}`)),
      ),
      el("div", { class: "actions" }, actions),
    );
  }

  // A queue line: what it is, who it is with, and the one action that moves it along. The full
  // row with every button lives in the list below; up here a card is a thing to act on, not to
  // browse.
  function cardRow(g, action) {
    const pull = `passalong pull ${g.id}`;
    return el(
      "li",
      { class: `card-row${g.stale ? " stale" : ""}` },
      el(
        "a",
        { class: "card-title", href: g.url, target: "_blank", rel: "noopener" },
        g.title || g.id,
      ),
      el(
        "span",
        { class: "meta" },
        g.mine
          ? el("span", {}, "to ", el("b", {}, `${g.team}${g.to ? ` / @${g.to}` : ""}`))
          : el("span", {}, "from ", el("b", {}, `@${g.from || "?"}`)),
        el("span", {}, rel(g.created)),
        g.stale ? el("span", { class: "warn" }, "not picked up") : "",
        g.failing && g.verdict
          ? el(
              "span",
              { class: "warn" },
              `${g.verdict.by ? `@${g.verdict.by}` : "someone"}: ${g.verdict.note || "no reason given"}`,
            )
          : "",
        g.pulls ? el("span", {}, `${g.pulls} pull${g.pulls === 1 ? "" : "s"}`) : "",
      ),
      action === "pull"
        ? el(
            "button",
            { class: "btn", onclick: (e) => copy(pull, e.target), title: pull },
            "copy pull",
          )
        : action === "done"
          ? el("button", { class: "btn", onclick: () => setStatus(g, "consumed") }, "done")
          : action === "promote"
            ? el(
                "button",
                { class: "btn nudge", onclick: () => setStatus(g, "promoted") },
                "promote",
              )
            : el("button", { class: "btn", onclick: (e) => copy(g.url, e.target) }, "copy link"),
    );
  }

  const card = (cls, title, note, guides, action) =>
    guides?.length
      ? el(
          "section",
          { class: `card ${cls}` },
          el(
            "div",
            { class: "head" },
            el("h2", {}, `${title} · ${guides.length}`),
            el("span", { class: "muted" }, note),
          ),
          el(
            "ul",
            { class: "card-rows" },
            guides.map((g) => cardRow(g, action)),
          ),
        )
      : "";

  // The state of your transfers, in the order you can do something about them.
  function board() {
    const b = state.board;
    if (!b) return "";
    return el(
      "div",
      { class: "board" },
      card("failing", "Not working", "someone tried it and it does not hold up", b.failing, "link"),
      card("waiting", "Waiting on you", "handed to you, not pulled yet", b.waiting, "pull"),
      card("flight", "In flight", "handed over, nobody has taken it", b.in_flight, "link"),
      card("landed", "Landed", "someone has it and hasn't said it shipped", b.landed, "done"),
      card(
        "promote",
        "Worth keeping",
        "pulled enough to graduate into a reference",
        b.promote,
        "promote",
      ),
    );
  }

  const markAllRead = () =>
    act(async () => {
      await api("/v1/notifications/read", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      for (const n of state.activity) n.read = true;
      state.unread = 0;
    });

  // What happened while you were away. The server renders each line so the hub, the CLI and an
  // agent all report the same sentence.
  function activityBox() {
    if (!state.activity.length) return "";
    return el(
      "section",
      { class: "activity" },
      el(
        "div",
        { class: "head" },
        el("h2", {}, state.unread ? `Activity · ${state.unread} new` : "Activity"),
        state.unread ? el("button", { class: "btn", onclick: markAllRead }, "mark all read") : "",
      ),
      el(
        "ul",
        { class: "notes" },
        state.activity.slice(0, 12).map((n) => {
          const url = state.guides.find((g) => g.id === n.guide)?.url;
          return el(
            "li",
            { class: `note${n.read ? "" : " unread"}` },
            el("span", { class: "when" }, rel(n.at)),
            url
              ? el("a", { href: url, target: "_blank", rel: "noopener" }, n.text)
              : el("span", {}, n.text),
          );
        }),
      ),
    );
  }

  const mintToken = (name) =>
    act(async () => {
      state.newToken = await api("/v1/tokens", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name }),
      });
      state.tokens = (await api("/v1/tokens")).tokens;
    });

  const revokeToken = (t) => {
    if (!confirm(`Revoke "${t.name}"? Anything using it stops working immediately.`)) return;
    act(async () => {
      await api(`/v1/tokens/${t.id}`, { method: "DELETE" });
      state.tokens = (await api("/v1/tokens")).tokens;
    });
  };

  // Tokens are for the CLI and MCP servers. They are listed here because a credential you cannot
  // see is a credential you cannot revoke.
  function tokensPanel() {
    return el(
      "section",
      { class: "tokens" },
      el(
        "div",
        { class: "head" },
        el("h2", {}, `API tokens · ${state.tokens.length}`),
        el(
          "button",
          {
            class: "btn",
            onclick: () => {
              const name = prompt("What is this token for? (e.g. laptop, work MacBook)");
              if (name?.trim()) mintToken(name.trim());
            },
          },
          "new token",
        ),
      ),
      el(
        "p",
        { class: "muted" },
        "For ",
        el("code", {}, "passalong login <token>"),
        " and MCP servers. Your password never goes near the CLI.",
      ),
      state.newToken
        ? el(
            "div",
            { class: "newtoken" },
            el("p", {}, el("b", {}, "Copy it now — this is the only time it is shown.")),
            el("code", {}, state.newToken.token),
            el(
              "button",
              { class: "btn", onclick: (e) => copy(state.newToken.token, e.target) },
              "copy",
            ),
            el(
              "button",
              {
                class: "btn",
                onclick: () => {
                  state.newToken = null;
                  render();
                },
              },
              "done",
            ),
          )
        : "",
      state.tokens.length
        ? el(
            "ul",
            { class: "members" },
            state.tokens.map((t) =>
              el(
                "li",
                {},
                el("b", {}, t.name),
                el(
                  "span",
                  { class: "muted" },
                  ` · made ${rel(t.created)} · ${t.last_used ? `last used ${rel(t.last_used)}` : "never used"} `,
                ),
                el("button", { class: "btn danger", onclick: () => revokeToken(t) }, "revoke"),
              ),
            ),
          )
        : el("p", { class: "muted" }, "None yet."),
    );
  }

  const setPassword = (email, password) =>
    act(async () => {
      await api("/v1/auth/password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      // The server rotated the session; a pasted token is no longer how this browser gets in.
      store.set(null);
      state.token = null;
      await load();
    });

  /** An account created by `passalong login` or an invite has no way to sign in yet. */
  function claim() {
    if (!state.me || state.me.has_password) return "";
    return el(
      "section",
      { class: "identity needed" },
      el("h2", {}, "Add a way to sign in"),
      el(
        "p",
        { class: "muted" },
        "This account only exists as a token. Set an email and password and you can sign in from any browser — and recover it if the token is lost.",
      ),
      el(
        "form",
        {
          onsubmit: (e) => {
            e.preventDefault();
            const f = e.target;
            setPassword(f.email.value.trim(), f.password.value);
          },
        },
        el("input", {
          name: "email",
          type: "email",
          required: "required",
          placeholder: "email",
          value: state.me.email || "",
        }),
        el("input", {
          name: "password",
          type: "password",
          required: "required",
          minlength: "10",
          placeholder: "password (10+ characters)",
          autocomplete: "new-password",
        }),
        el("button", { class: "primary", type: "submit" }, "Save"),
      ),
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
              "hand a teammate the link; they join in the browser, no install",
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
      claim(),
      identity(),
      board(),
      activityBox(),
      el(
        "div",
        { class: "chips scopes" },
        teams.length ? scopeChip("all", "everything") : "",
        teams.length ? scopeChip("mine", "mine") : "",
        teams.map((t) => scopeChip(t.slug, t.name)),
        el(
          "button",
          {
            class: "chip",
            onclick: () => {
              const name = prompt("Name your team");
              if (name?.trim()) createTeam(name.trim());
            },
          },
          teams.length ? "+ team" : "+ start a team",
        ),
      ),
      teamPanel(),
      tokensPanel(),
      state.guides.length ? el("h2", { class: "all" }, "All guides") : "",
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
            teams.length
              ? ""
              : el(
                  "p",
                  {},
                  "Waiting on someone else's work instead? Paste the invite link they sent you:",
                ),
            teams.length ? "" : invitePaste("invite link"),
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
          ? [
              el(
                "a",
                {
                  href: "#",
                  onclick: (e) => {
                    e.preventDefault();
                    state.editing = true;
                    state.meError = null;
                    state.typed = null;
                    render();
                  },
                },
                state.me.handle ? `@${state.me.handle}` : `account ${state.me.account}`,
              ),
              ` · ${state.me.guides} synced (${state.me.limit} active on the free tier) · `,
            ]
          : "",
        el(
          "a",
          {
            href: "#",
            onclick: async (e) => {
              e.preventDefault();
              // End the session server-side too, otherwise "sign out" only forgets locally.
              await fetch("/v1/auth/logout", { method: "POST" }).catch(() => {});
              store.set(null);
              Object.assign(state, {
                token: null,
                signedIn: false,
                guides: [],
                board: null,
                activity: [],
                unread: 0,
                tokens: [],
                newToken: null,
                me: null,
              });
              render();
            },
          },
          "sign out",
        ),
      ),
    );
  }

  function render() {
    const root = $("#app");
    root.replaceChildren(state.signedIn ? hub() : signIn());
    const q = $(".toolbar input", root);
    if (q && document.activeElement !== q && state.q) {
      q.focus();
      q.setSelectionRange(q.value.length, q.value.length);
    }
  }

  // A session cookie is invisible from here, so the only way to know is to ask.
  render();
  load();
})();
