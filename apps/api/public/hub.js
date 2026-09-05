// The hub: your transfers, your teams, your credentials. Talks to /v1/* as whoever you are — a
// session cookie after signing in, or a pasted API token. No build step: Preact and htm are
// vendored in public/vendor and the browser loads this file as written, so what you read here is
// what runs. Everything this page can do, the CLI and MCP server can do too.
import { html, render, useCallback, useEffect, useState } from "./vendor/index.js";

const KEY = "passalong.token";

const store = {
  get() {
    try {
      return localStorage.getItem(KEY);
    } catch {
      return null;
    }
  },
  set(t) {
    try {
      t ? localStorage.setItem(KEY, t) : localStorage.removeItem(KEY);
    } catch {}
  },
};

// `passalong hub` opens /hub#token=… so the token never hits the server or a log line; the page
// moves it into storage and scrubs the URL before anything else happens.
const fromHash = new URLSearchParams(location.hash.slice(1)).get("token");
if (fromHash) {
  store.set(fromHash);
  history.replaceState(null, "", location.pathname);
}

const EMPTY = {
  me: null,
  guides: [],
  board: null,
  activity: [],
  unread: 0,
  tokens: [],
  team: null,
};

const rel = (iso) => {
  if (!iso) return "";
  const d = (Date.now() - new Date(iso).getTime()) / 864e5;
  if (d < 1 / 24) return "just now";
  if (d < 1) return `${Math.floor(d * 24)}h ago`;
  if (d < 30) return `${Math.floor(d)}d ago`;
  return iso.slice(0, 10);
};

function copy(text, btn) {
  navigator.clipboard?.writeText(text).then(() => {
    const was = btn.textContent;
    btn.textContent = "copied";
    setTimeout(() => {
      btn.textContent = was;
    }, 1200);
  });
}

// ---- shared bits ---------------------------------------------------------------------------

/** An invite link is the only entry that leads anywhere for someone with no team. */
const InvitePaste = ({ label }) => html`
  <form
    class="invite-paste"
    onsubmit=${(e) => {
      e.preventDefault();
      const code = e.target.invite.value.trim().split("/").pop();
      if (code) location.assign(`/join/${encodeURIComponent(code)}`);
    }}
  >
    <input class="grow" name="invite" placeholder="paste an invite link" aria-label=${label} spellcheck="false" />
    <button class="btn" type="submit">Join</button>
  </form>
`;

// ---- signing in ----------------------------------------------------------------------------

function SignIn({ onToken, onSignedIn, error }) {
  const [mode, setMode] = useState("login");
  const [authError, setAuthError] = useState(null);
  const [notice, setNotice] = useState(null);

  const tab = (value, label) => html`
    <button
      class=${`chip${mode === value ? " on" : ""}`}
      onclick=${() => {
        setMode(value);
        setAuthError(null);
        setNotice(null);
      }}
    >
      ${label}
    </button>
  `;

  const submit = async (e) => {
    e.preventDefault();
    setAuthError(null);
    setNotice(null);
    const f = e.target;
    const body = { email: f.email.value.trim() };
    if (mode !== "forgot") body.password = f.password.value;
    const path = { login: "/v1/auth/login", signup: "/v1/auth/signup", forgot: "/v1/auth/forgot" }[
      mode
    ];
    try {
      const res = await fetch(path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message || res.statusText);
      if (mode === "forgot")
        setNotice("If that address has an account, a reset link is on its way.");
      else onSignedIn();
    } catch (err) {
      setAuthError(err.message);
    }
  };

  return html`
    <section class="signin">
      <h2>Sign in</h2>
      <div class="chips">
        ${tab("login", "sign in")}${tab("signup", "create account")}${tab("forgot", "forgot password")}
      </div>
      <form class="join" onsubmit=${submit}>
        <label>
          Email
          <input name="email" type="email" required autocomplete="email" />
        </label>
        ${
          mode !== "forgot" &&
          html`
          <label>
            Password
            <input
              name="password"
              type="password"
              required
              minlength=${mode === "signup" ? "12" : null}
              autocomplete=${mode === "signup" ? "new-password" : "current-password"}
            />
            ${
              mode === "signup" &&
              html`<span class="muted">at least 12 characters, and not one from a breach list</span>`
            }
          </label>
        `
        }
        <button class="primary" type="submit">
          ${mode === "signup" ? "Create account" : mode === "forgot" ? "Email me a link" : "Sign in"}
        </button>
        ${authError && html`<p class="error">${authError}</p>`}
        ${notice && html`<p class="muted">${notice}</p>`}
      </form>

      <h2>Other ways in</h2>
      <p>Been sent an invite? Opening the link makes your account and joins the team in one step.</p>
      <${InvitePaste} label="invite link" />
      <p>
        Or paste an API token — the CLI prints one with <code>passalong login</code>, and
        <code>passalong hub</code> opens this page already signed in.
      </p>
      <form
        class="invite-paste"
        onsubmit=${(e) => {
          e.preventDefault();
          const t = e.target.token.value.trim();
          if (t) onToken(t);
        }}
      >
        <input class="grow" name="token" type="password" placeholder="pa_…" autocomplete="off" spellcheck="false" />
        <button class="btn" type="submit">Use token</button>
      </form>
      ${error && html`<p class="error">${error}</p>`}
    </section>
  `;
}

// ---- identity ------------------------------------------------------------------------------

/** An account created by `passalong login` or an invite has no way to sign in yet. */
function Claim({ me, api, reload }) {
  const [error, setError] = useState(null);
  if (!me || me.has_password) return null;

  const submit = async (e) => {
    e.preventDefault();
    const f = e.target;
    const body = { email: f.email.value.trim(), password: f.password.value };
    setError(null);
    try {
      await api("/v1/auth/password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      // The server rotated the session; a pasted token is no longer how this browser gets in.
      store.set(null);
      await reload({ dropToken: true });
    } catch (err) {
      setError(err.message);
    }
  };

  return html`
    <section class="identity needed">
      <h2>Add a way to sign in</h2>
      <p class="muted">
        This account only exists as a token. Set an email and password and you can sign in from any
        browser — and recover it if the token is lost.
      </p>
      <form onsubmit=${submit}>
        <input name="email" type="email" required placeholder="email" defaultValue=${me.email || ""} />
        <input
          name="password"
          type="password"
          required
          minlength="12"
          placeholder="password (12+ characters)"
          autocomplete="new-password"
        />
        <button class="primary" type="submit">Save</button>
      </form>
      ${error && html`<p class="error">${error}</p>`}
    </section>
  `;
}

/**
 * Without a handle you cannot be addressed — `--to team/@you` has nothing to aim at — so an
 * account that has not claimed one is prompted rather than left to find the CLI.
 */
function Identity({ me, editing, setEditing, api, setMe }) {
  const [error, setError] = useState(null);
  if (!me || (me.handle && !editing)) return null;

  const submit = async (e) => {
    e.preventDefault();
    // Read first, then set state: a re-render would reset these inputs to the stored values.
    const f = e.target;
    const body = {
      handle: f.handle.value.trim(),
      name: f.name.value.trim(),
      email: f.email.value.trim(),
    };
    setError(null);
    try {
      const next = await api("/v1/me", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      setMe({ ...me, ...next });
      setEditing(false);
    } catch (err) {
      // "handle @x is taken" is the one error people actually hit, and it is useless at the
      // bottom of the page, so it reports next to the field. Preact keeps what was typed.
      setError(err.message);
    }
  };

  return html`
    <section class=${`identity${me.handle ? "" : " needed"}`}>
      <h2>${me.handle ? "Your details" : "Claim a handle"}</h2>
      <p class="muted">
        ${
          me.handle
            ? "How teammates address you, and where handoffs are mailed."
            : "Teammates hand work to a handle. Until you claim one, nothing can be addressed to you."
        }
      </p>
      <form onsubmit=${submit}>
        <input
          name="handle"
          defaultValue=${me.handle || ""}
          placeholder="handle"
          required
          spellcheck="false"
          pattern="[a-zA-Z0-9][a-zA-Z0-9-]{1,30}"
          title="2–31 characters: letters, digits and dashes"
        />
        <input name="name" defaultValue=${me.name || ""} placeholder="name (optional)" />
        <input name="email" type="email" defaultValue=${me.email || ""} placeholder="email (optional)" />
        <button class="primary" type="submit">Save</button>
        ${
          me.handle &&
          html`<button class="btn" type="button" onclick=${() => setEditing(false)}>cancel</button>`
        }
      </form>
      ${error && html`<p class="error">${error}</p>`}
    </section>
  `;
}

// ---- the board -----------------------------------------------------------------------------

/**
 * A queue line: what it is, who it is with, and the one action that moves it along. The full row
 * with every button lives in the list below; up here a card is a thing to act on, not to browse.
 */
const CardRow = ({ g, action, onStatus }) => html`
  <li class=${`card-row${g.stale ? " stale" : ""}`}>
    <a class="card-title" href=${g.url} target="_blank" rel="noopener">${g.title || g.id}</a>
    <span class="meta">
      ${
        g.mine
          ? html`<span>to <b>${g.team}${g.to ? ` / @${g.to}` : ""}</b></span>`
          : html`<span>from <b>@${g.from || "?"}</b></span>`
      }
      <span>${rel(g.created)}</span>
      ${g.stale && html`<span class="warn">not picked up</span>`}
      ${
        g.failing &&
        g.verdict &&
        html`<span class="warn">
        ${g.verdict.by ? `@${g.verdict.by}` : "someone"}: ${g.verdict.note || "no reason given"}
      </span>`
      }
      ${g.pulls ? html`<span>${g.pulls} pull${g.pulls === 1 ? "" : "s"}</span>` : null}
    </span>
    ${
      action === "pull"
        ? html`<button
          class="btn"
          title=${`passalong pull ${g.id}`}
          onclick=${(e) => copy(`passalong pull ${g.id}`, e.target)}
        >
          copy pull
        </button>`
        : action === "done"
          ? html`<button class="btn" onclick=${() => onStatus(g, "consumed")}>done</button>`
          : action === "promote"
            ? html`<button class="btn nudge" onclick=${() => onStatus(g, "promoted")}>promote</button>`
            : html`<button class="btn" onclick=${(e) => copy(g.url, e.target)}>copy link</button>`
    }
  </li>
`;

const Card = ({ cls, title, note, guides, action, onStatus }) =>
  guides?.length
    ? html`
        <section class=${`card ${cls}`}>
          <div class="head">
            <h2>${title} · ${guides.length}</h2>
            <span class="muted">${note}</span>
          </div>
          <ul class="card-rows">
            ${guides.map((g) => html`<${CardRow} key=${g.id} g=${g} action=${action} onStatus=${onStatus} />`)}
          </ul>
        </section>
      `
    : null;

/** The state of your transfers, in the order you can do something about them. */
const Board = ({ board, onStatus }) =>
  !board
    ? null
    : html`
        <div class="board">
          <${Card} cls="failing" title="Not working" note="someone tried it and it does not hold up"
                   guides=${board.failing} action="link" onStatus=${onStatus} />
          <${Card} cls="waiting" title="Waiting on you" note="handed to you, not pulled yet"
                   guides=${board.waiting} action="pull" onStatus=${onStatus} />
          <${Card} cls="flight" title="In flight" note="handed over, nobody has taken it"
                   guides=${board.in_flight} action="link" onStatus=${onStatus} />
          <${Card} cls="landed" title="Landed" note="someone has it and hasn't said it shipped"
                   guides=${board.landed} action="done" onStatus=${onStatus} />
          <${Card} cls="promote" title="Worth keeping" note="pulled enough to graduate into a reference"
                   guides=${board.promote} action="promote" onStatus=${onStatus} />
        </div>
      `;

// ---- activity ------------------------------------------------------------------------------

/**
 * What happened while you were away. The server renders each line so the hub, the CLI and an
 * agent all report the same sentence.
 */
const Activity = ({ activity, unread, guides, onReadAll }) =>
  !activity.length
    ? null
    : html`
        <section class="activity">
          <div class="head">
            <h2>${unread ? `Activity · ${unread} new` : "Activity"}</h2>
            ${unread ? html`<button class="btn" onclick=${onReadAll}>mark all read</button>` : null}
          </div>
          <ul class="notes">
            ${activity.slice(0, 12).map((n) => {
              const url = guides.find((g) => g.id === n.guide)?.url;
              return html`
                <li class=${`note${n.read ? "" : " unread"}`} key=${n.id}>
                  <span class="when">${rel(n.at)}</span>
                  ${
                    url
                      ? html`<a href=${url} target="_blank" rel="noopener">${n.text}</a>`
                      : html`<span>${n.text}</span>`
                  }
                </li>
              `;
            })}
          </ul>
        </section>
      `;

// ---- guides --------------------------------------------------------------------------------

const PulledBy = ({ g }) =>
  !g.mine || !g.pulled_by?.length
    ? null
    : html`<span class="pulled">
        pulled by
        <b>${g.pulled_by.map((p) => `${p.handle ? `@${p.handle}` : "link"} ${rel(p.at)}`).join(", ")}</b>
      </span>`;

function GuideRow({ g, onStatus, onRemove, onVerdict }) {
  const pull = `passalong pull ${g.id}`;
  return html`
    <li class=${`guide ${g.status}`}>
      <div class="head">
        <a class="title" href=${g.url} target="_blank" rel="noopener">${g.title || g.id}</a>
        <span class=${`status ${g.status}`}>${g.status}</span>
      </div>
      <div class="meta">
        <span>id <b>${g.id}</b></span>
        ${
          g.team
            ? html`<span>
              ${g.mine ? "to " : "from "}
              <b>${g.mine ? `${g.team}${g.to ? ` / @${g.to}` : ""}` : `@${g.from || "?"} in ${g.team}`}</b>
            </span>`
            : null
        }
        ${g.source_context ? html`<span>repo <b>${g.source_context}</b></span>` : null}
        <span>${rel(g.created)}</span>
        <span>${g.pulls} pull${g.pulls === 1 ? "" : "s"}</span>
        <${PulledBy} g=${g} />
        ${
          g.verdict &&
          html`<span class=${g.failing ? "verdict bad" : "verdict"}>
          ${g.verdict.ok ? "verified by " : "not working — "}
          <b>${g.verdict.by ? `@${g.verdict.by}` : "someone"}</b>
          ${g.verdict.note ? `: ${g.verdict.note}` : ""}
        </span>`
        }
        ${g.stack_assumptions?.length ? html`<span>assumes <b>${g.stack_assumptions.join(", ")}</b></span>` : null}
        ${(g.tags || []).map((t) => html`<span class="tag" key=${t}>#${t}</span>`)}
      </div>
      <div class="actions">
        <a class="btn" href=${g.url} target="_blank" rel="noopener">open</a>
        <button class="btn" title=${pull} onclick=${(e) => copy(pull, e.target)}>copy pull</button>
        <button class="btn" onclick=${(e) => copy(g.url, e.target)}>copy link</button>
        ${
          !g.mine &&
          html`
          <button class="btn" onclick=${() => onVerdict(g, true)}>works</button>
          <button class="btn danger" onclick=${() => onVerdict(g, false)}>doesn't work</button>
        `
        }
        ${
          g.status !== "consumed" &&
          html`<button class="btn" onclick=${() => onStatus(g, "consumed")}>done</button>`
        }
        ${
          g.mine &&
          g.status !== "promoted" &&
          html`<button
          class=${`btn${g.status === "published" && g.pulls >= 3 ? " nudge" : ""}`}
          onclick=${() => onStatus(g, "promoted")}
        >
          ${g.status === "published" && g.pulls >= 3 ? "★ promote — keeps getting pulled" : "promote"}
        </button>`
        }
        ${
          g.mine &&
          (g.status === "consumed" || g.status === "promoted") &&
          html`<button class="btn" onclick=${() => onStatus(g, "published")}>reopen</button>`
        }
        ${g.mine && html`<button class="btn danger" onclick=${() => onRemove(g)}>remove</button>`}
      </div>
    </li>
  `;
}

// ---- teams and tokens ------------------------------------------------------------------------

function TeamPanel({ team, api, reload }) {
  const [invite, setInvite] = useState(null);
  if (!team) return null;
  const make = async () => {
    setInvite(
      await api(`/v1/teams/${encodeURIComponent(team.slug)}/invites`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      }),
    );
    reload();
  };
  return html`
    <section class="team">
      <div class="head">
        <h2>${team.name}</h2>
        <span class="meta">
          <span>${team.members.length} member${team.members.length === 1 ? "" : "s"}</span>
          <span>${team.guides} guide${team.guides === 1 ? "" : "s"}</span>
          <span>you are ${team.role}</span>
        </span>
      </div>
      <ul class="members">
        ${team.members.map(
          (m) => html`
            <li key=${m.handle}>
              <b>${m.handle ? `@${m.handle}` : "(no handle yet)"}</b>${m.name ? ` ${m.name}` : ""}
              <span class="muted"> · ${m.role} · joined ${rel(m.joined)}</span>
            </li>
          `,
        )}
      </ul>
      <div class="actions">
        <button class="btn" onclick=${make}>new invite link</button>
        ${
          invite
            ? html`<span class="invite">
              <code>${invite.url}</code>
              <button class="btn" onclick=${(e) => copy(invite.url, e.target)}>copy</button>
            </span>`
            : html`<span class="muted">hand a teammate the link; they join in the browser, no install</span>`
        }
      </div>
    </section>
  `;
}

/**
 * Tokens are for the CLI and MCP servers. They are listed here because a credential you cannot
 * see is a credential you cannot revoke.
 */
function Tokens({ tokens, api, reload }) {
  const [fresh, setFresh] = useState(null);

  const mint = async () => {
    const name = prompt("What is this token for? (e.g. laptop, work MacBook)");
    if (!name?.trim()) return;
    setFresh(
      await api("/v1/tokens", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      }),
    );
    reload();
  };

  const revoke = async (t) => {
    if (!confirm(`Revoke "${t.name}"? Anything using it stops working immediately.`)) return;
    await api(`/v1/tokens/${t.id}`, { method: "DELETE" });
    reload();
  };

  return html`
    <section class="tokens">
      <div class="head">
        <h2>API tokens · ${tokens.length}</h2>
        <button class="btn" onclick=${mint}>new token</button>
      </div>
      <p class="muted">
        For <code>passalong login ${"<token>"}</code> and MCP servers. Your password never
        goes near the CLI.
      </p>
      ${
        fresh &&
        html`
        <div class="newtoken">
          <p><b>Copy it now — this is the only time it is shown.</b></p>
          <code>${fresh.token}</code>
          <button class="btn" onclick=${(e) => copy(fresh.token, e.target)}>copy</button>
          <button class="btn" onclick=${() => setFresh(null)}>done</button>
        </div>
      `
      }
      ${
        tokens.length
          ? html`<ul class="members">
            ${tokens.map(
              (t) => html`
                <li key=${t.id}>
                  <b>${t.name}</b>
                  <span class="muted">
                    · made ${rel(t.created)} · ${t.last_used ? `last used ${rel(t.last_used)}` : "never used"}
                  </span>
                  <button class="btn danger" onclick=${() => revoke(t)}>revoke</button>
                </li>
              `,
            )}
          </ul>`
          : html`<p class="muted">None yet.</p>`
      }
    </section>
  `;
}

// ---- the app -------------------------------------------------------------------------------

function App() {
  const [token, setToken] = useState(store.get());
  const [signedIn, setSignedIn] = useState(false);
  const [d, setD] = useState(EMPTY);
  const [scope, setScope] = useState("all");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(false);

  // Two ways to be signed in: a pasted token (CLI users) or the session cookie set by logging in.
  // The cookie rides along on its own, so the header only appears when a token is actually held.
  const api = useCallback(
    async (path, init = {}) => {
      const headers = { ...(init.headers || {}) };
      if (token) headers.authorization = `Bearer ${token}`;
      const res = await fetch(path, { ...init, headers });
      if (res.status === 401) {
        store.set(null);
        setToken(null);
        setSignedIn(false);
        throw new Error("signed out");
      }
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message || res.statusText);
      return res.status === 204 ? null : res.json();
    },
    [token],
  );

  const load = useCallback(
    async (opts = {}) => {
      const t = opts.dropToken ? null : token;
      if (opts.dropToken) setToken(null);
      const call = async (path) => {
        const headers = t ? { authorization: `Bearer ${t}` } : {};
        const res = await fetch(path, { headers });
        if (res.status === 401) throw new Error("signed out");
        if (!res.ok)
          throw new Error((await res.json().catch(() => ({}))).message || res.statusText);
        return res.json();
      };
      setError(null);
      try {
        const [me, list, board, activity, tokens] = await Promise.all([
          call("/v1/me"),
          call(`/v1/guides?scope=${encodeURIComponent(scope)}`),
          call("/v1/board"),
          call("/v1/notifications?limit=30"),
          call("/v1/tokens"),
        ]);
        const team =
          scope !== "all" && scope !== "mine"
            ? await call(`/v1/teams/${encodeURIComponent(scope)}`)
            : null;
        setD({
          me,
          guides: list.guides,
          board,
          activity: activity.notifications,
          unread: activity.unread,
          tokens: tokens.tokens,
          team,
        });
        setSignedIn(true);
      } catch (e) {
        // Not being signed in is a state, not an error to shout about.
        setSignedIn(false);
        setD(EMPTY);
        setError(e.message === "signed out" ? null : e.message);
      }
    },
    [token, scope],
  );

  // A session cookie is invisible from here, so the only way to know is to ask.
  useEffect(() => {
    load();
  }, [load]);

  // Both of these move a guide between queues, so reload rather than patch state by hand: the
  // board's buckets are defined in SQL, and guessing them here is how the two drift apart.
  const onStatus = async (g, next) => {
    try {
      await api(`/v1/guides/${g.id}/status`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      await load();
    } catch (e) {
      setError(e.message);
    }
  };

  const onRemove = async (g) => {
    if (!confirm(`Remove "${g.title}" from sync? Local copies are untouched.`)) return;
    try {
      await api(`/v1/guides/${g.id}`, { method: "DELETE" });
      await load();
    } catch (e) {
      setError(e.message);
    }
  };

  // The reader's answer to "does this work?". A failure must say why — the prompt is the whole
  // interface, because a text box here would be the first step toward a comment thread.
  const onVerdict = async (g, ok) => {
    let note = "";
    if (!ok) {
      note = (prompt(`What went wrong with "${g.title}"?`) || "").trim();
      if (!note) return;
    }
    try {
      await api(`/v1/guides/${g.id}/verdict`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ok, note }),
      });
      await load();
    } catch (e) {
      setError(e.message);
    }
  };

  const createTeam = async () => {
    const name = prompt("Name your team");
    if (!name?.trim()) return;
    try {
      const t = await api("/v1/teams", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      setScope(t.slug);
    } catch (e) {
      setError(e.message);
    }
  };

  const readAll = async () => {
    try {
      await api("/v1/notifications/read", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      await load();
    } catch (e) {
      setError(e.message);
    }
  };

  const signOut = async (e) => {
    e.preventDefault();
    // End the session server-side too, otherwise "sign out" only forgets locally.
    await fetch("/v1/auth/logout", { method: "POST" }).catch(() => {});
    store.set(null);
    setToken(null);
    setSignedIn(false);
    setD(EMPTY);
  };

  if (!signedIn) {
    return html`<${SignIn}
      error=${error}
      onToken=${(t) => {
        store.set(t);
        setToken(t);
      }}
      onSignedIn=${() => {
        // Signing in replaces any pasted token: the cookie is the credential now, and a stale
        // bearer header would keep authenticating as whoever that token belongs to.
        store.set(null);
        setToken(null);
        load({ dropToken: true });
      }}
    />`;
  }

  const terms = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const visible = d.guides.filter((g) => {
    if (status !== "all" && g.status !== status) return false;
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
  const counts = {};
  for (const g of d.guides) counts[g.status] = (counts[g.status] || 0) + 1;
  const teams = d.me?.teams || [];
  const statusChip = (value, label) => html`
    <button class=${`chip${status === value ? " on" : ""}`} onclick=${() => setStatus(value)}>
      ${label}${value === "all" ? ` ${d.guides.length}` : counts[value] ? ` ${counts[value]}` : ""}
    </button>
  `;
  const scopeChip = (value, label) => html`
    <button class=${`chip${scope === value ? " on" : ""}`} onclick=${() => setScope(value)} key=${value}>
      ${label}
    </button>
  `;

  return html`
    <section class="hub">
      <${Claim} me=${d.me} api=${api} reload=${load} />
      <${Identity} me=${d.me} editing=${editing} setEditing=${setEditing} api=${api}
                   setMe=${(me) => setD({ ...d, me })} />
      <${Board} board=${d.board} onStatus=${onStatus} />
      <${Activity} activity=${d.activity} unread=${d.unread} guides=${d.guides} onReadAll=${readAll} />

      <div class="chips scopes">
        ${teams.length ? scopeChip("all", "everything") : null}
        ${teams.length ? scopeChip("mine", "mine") : null}
        ${teams.map((t) => scopeChip(t.slug, t.name))}
        <button class="chip" onclick=${createTeam}>${teams.length ? "+ team" : "+ start a team"}</button>
      </div>
      <${TeamPanel} team=${d.team} api=${api} reload=${load} />
      <${Tokens} tokens=${d.tokens} api=${api} reload=${load} />

      ${d.guides.length ? html`<h2 class="all">All guides</h2>` : null}
      <div class="toolbar">
        <input
          type="search"
          placeholder="search title, tags, stack, source, people…"
          value=${q}
          oninput=${(e) => setQ(e.target.value)}
        />
        <div class="chips">
          ${statusChip("all", "all")}${statusChip("published", "published")}
          ${statusChip("consumed", "consumed")}${statusChip("promoted", "promoted")}
        </div>
      </div>
      ${error && html`<p class="error">${error}</p>`}
      ${
        d.guides.length === 0
          ? html`
            <div class="empty">
              <p>Nothing synced yet. After your next finished piece of work:</p>
              <pre><code>passalong share</code></pre>
              <p>or say <em>“pass this along”</em> to Claude Code.</p>
              ${
                !teams.length &&
                html`
                <p>Waiting on someone else's work instead? Paste the invite link they sent you:</p>
                <${InvitePaste} label="invite link" />
              `
              }
            </div>
          `
          : visible.length === 0
            ? html`<p class="empty">No guides match.</p>`
            : html`<ul class="guides">
              ${visible.map(
                (
                  g,
                ) => html`<${GuideRow} key=${g.id} g=${g} onStatus=${onStatus} onRemove=${onRemove}
                                          onVerdict=${onVerdict} />`,
              )}
            </ul>`
      }
      <footer>
        ${
          d.me &&
          html`
          <a
            href="#"
            onclick=${(e) => {
              e.preventDefault();
              setEditing(true);
            }}
            >${d.me.handle ? `@${d.me.handle}` : `account ${d.me.account}`}</a
          >
          ${` · ${d.me.guides} synced (${d.me.limit} active on the free tier) · `}
        `
        }
        <a href="#" onclick=${signOut}>sign out</a>
      </footer>
    </section>
  `;
}

render(html`<${App} />`, document.getElementById("app"));
