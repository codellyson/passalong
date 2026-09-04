// Accepting an invite, in a browser, with nothing installed. The person clicking this link is
// often the one who has never used Passalong — a tester, a designer, someone handed a link in
// chat — so the terminal cannot be on the critical path. Three calls, no password: mint an
// account, claim a handle, accept the invite. The CLI instructions stay on the page for people
// who would rather.
//
// Deliberately standalone: it shares no code with hub.js because a build step would buy less
// than it costs, and this file must stay small enough to read in one sitting.
(() => {
  const KEY = "passalong.token";
  const app = document.getElementById("join");
  if (!app) return;
  const CODE = app.dataset.code;
  const TEAM = app.dataset.team;

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

  const token = {
    get() {
      try {
        return localStorage.getItem(KEY);
      } catch {
        return null;
      }
    },
    set(t) {
      try {
        localStorage.setItem(KEY, t);
      } catch {
        // A browser with storage blocked can still join; it just cannot stay signed in.
      }
    },
  };

  async function call(path, { method = "GET", body, auth = true } = {}) {
    const headers = {};
    if (auth) headers.authorization = `Bearer ${token.get()}`;
    if (body !== undefined) headers["content-type"] = "application/json";
    const res = await fetch(path, { method, headers, body: body && JSON.stringify(body) });
    if (!res.ok) {
      let message = res.statusText;
      try {
        message = (await res.json()).message || message;
      } catch {}
      throw new Error(message);
    }
    return res.json();
  }

  const state = { me: null, busy: false, error: null, done: false };

  // An account is minted once and kept, so a rejected handle is retried against the same account
  // rather than leaving a trail of empty ones behind.
  async function ensureAccount() {
    if (token.get() && state.me) return;
    if (token.get()) {
      try {
        state.me = await call("/v1/me");
        return;
      } catch {
        // Stale or foreign token: start fresh rather than dead-end the invite.
      }
    }
    const minted = await call("/v1/accounts", { method: "POST", auth: false });
    token.set(minted.token);
    state.me = await call("/v1/me");
  }

  async function join(handle, name, email) {
    state.busy = true;
    state.error = null;
    render();
    try {
      await ensureAccount();
      const patch = {};
      if (handle && handle !== state.me.handle) patch.handle = handle;
      if (name) patch.name = name;
      if (email) patch.email = email;
      if (Object.keys(patch).length)
        state.me = await call("/v1/me", { method: "PATCH", body: patch });
      await call(`/v1/invites/${encodeURIComponent(CODE)}/accept`, { method: "POST" });
      state.done = true;
      render();
      location.assign("/hub");
    } catch (e) {
      state.error = e.message;
      state.busy = false;
      render();
    }
  }

  function form() {
    const known = state.me?.handle;
    return el(
      "form",
      {
        class: "join",
        onsubmit: (e) => {
          e.preventDefault();
          const f = e.target;
          join(f.handle.value.trim(), f.name.value.trim(), f.email.value.trim());
        },
      },
      el(
        "label",
        {},
        "Your handle",
        el("input", {
          name: "handle",
          value: known || "",
          placeholder: "ada",
          required: "required",
          autocomplete: "username",
          spellcheck: "false",
          pattern: "[a-zA-Z0-9][a-zA-Z0-9-]{1,30}",
          title: "2–31 characters: letters, digits and dashes",
        }),
        el(
          "span",
          { class: "muted" },
          `how teammates address you: passalong share --to <team>/@you`,
        ),
      ),
      el(
        "label",
        {},
        "Your name ",
        el("span", { class: "muted" }, "optional"),
        el("input", { name: "name", placeholder: "Ada Lovelace", autocomplete: "name" }),
      ),
      el(
        "label",
        {},
        "Email ",
        el("span", { class: "muted" }, "optional"),
        el("input", {
          name: "email",
          type: "email",
          placeholder: "ada@example.com",
          autocomplete: "email",
        }),
        el("span", { class: "muted" }, "only used to tell you when something is handed to you"),
      ),
      el(
        "button",
        { class: "primary", type: "submit", ...(state.busy ? { disabled: "disabled" } : {}) },
        state.busy ? "Joining…" : state.done ? "Joined" : `Join ${TEAM}`,
      ),
      state.error ? el("p", { class: "error" }, state.error) : "",
      el(
        "p",
        { class: "muted" },
        "No password. Your account is a token this browser keeps; ",
        el("code", {}, "passalong login"),
        " moves it to a terminal later if you want one.",
      ),
    );
  }

  function render() {
    app.replaceChildren(form());
  }

  // Someone already signed in gets their handle filled in rather than an empty form.
  if (token.get()) {
    call("/v1/me")
      .then((me) => {
        state.me = me;
        render();
      })
      .catch(() => {});
  }
  render();
})();
