// Accepting an invite, in a browser, with nothing installed. The person clicking this link is
// often the one who has never used Passalong — a tester, a designer, someone handed a link in
// chat — so the terminal cannot be on the critical path. Three calls, no password: mint an
// account, claim a handle, accept the invite. The CLI instructions stay on the page for people
// who would rather.
import { html, render, useEffect, useState } from "./vendor/index.js";

const KEY = "passalong.token";
const root = document.getElementById("join");
const CODE = root.dataset.code;
const TEAM = root.dataset.team;

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
    throw new Error((await res.json().catch(() => ({}))).message || res.statusText);
  }
  return res.json();
}

function Join() {
  const [me, setMe] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  // Someone already signed in gets their handle filled in rather than an empty form.
  useEffect(() => {
    if (token.get())
      call("/v1/me")
        .then(setMe)
        .catch(() => {});
  }, []);

  // An account is minted once and kept, so a rejected handle is retried against the same account
  // rather than leaving a trail of empty ones behind.
  async function account() {
    if (me) return me;
    if (token.get()) {
      try {
        return await call("/v1/me");
      } catch {
        // Stale or foreign token: start fresh rather than dead-end the invite.
      }
    }
    const minted = await call("/v1/accounts", { method: "POST", auth: false });
    token.set(minted.token);
    return call("/v1/me");
  }

  const submit = async (e) => {
    e.preventDefault();
    // Read the form before touching state. Any setState re-renders, and a re-render resets the
    // inputs to whatever the new state says — which is how the handle silently went missing.
    const f = e.target;
    const typed = {
      handle: f.handle.value.trim(),
      name: f.name.value.trim(),
      email: f.email.value.trim(),
    };
    setBusy(true);
    setError(null);
    try {
      const who = await account();
      setMe(who);
      const patch = {};
      if (typed.handle && typed.handle !== who.handle) patch.handle = typed.handle;
      if (typed.name) patch.name = typed.name;
      if (typed.email) patch.email = typed.email;
      if (Object.keys(patch).length) setMe(await call("/v1/me", { method: "PATCH", body: patch }));
      await call(`/v1/invites/${encodeURIComponent(CODE)}/accept`, { method: "POST" });
      location.assign("/hub");
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return html`
    <form class="join" onsubmit=${submit}>
      <label>
        Your handle
        <input
          name="handle"
          key=${me?.handle || "new"}
          defaultValue=${me?.handle || ""}
          placeholder="ada"
          required
          autocomplete="username"
          spellcheck="false"
          pattern="[a-zA-Z0-9][a-zA-Z0-9-]{1,30}"
          title="2–31 characters: letters, digits and dashes"
        />
        <span class="muted">how teammates address you: passalong share --to ${"<team>"}/@you</span>
      </label>
      <label>
        Your name <span class="muted">optional</span>
        <input name="name" placeholder="Ada Lovelace" autocomplete="name" />
      </label>
      <label>
        Email <span class="muted">optional</span>
        <input name="email" type="email" placeholder="ada@example.com" autocomplete="email" />
        <span class="muted">only used to tell you when something is handed to you</span>
      </label>
      <button class="primary" type="submit" disabled=${busy}>
        ${busy ? "Joining…" : `Join ${TEAM}`}
      </button>
      ${error && html`<p class="error">${error}</p>`}
      <p class="muted">
        No password. Your account is a token this browser keeps;
        <code>passalong login</code> moves it to a terminal later if you want one.
      </p>
    </form>
  `;
}

render(html`<${Join} />`, root);
