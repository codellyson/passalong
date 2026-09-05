// Setting a new password from an emailed link. The code arrives in the URL fragment, which
// browsers never send to the server, so it stays out of request logs; the page reads it, uses it
// once, and scrubs the address bar.
import { html, render, useState } from "./vendor/index.js";

const CODE = (() => {
  const hash = location.hash.slice(1);
  const code = new URLSearchParams(hash).get("code") || hash;
  if (location.hash) history.replaceState(null, "", location.pathname);
  return code;
})();

function Reset() {
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  if (!CODE) {
    return html`<p class="error">
      This link is missing its code. Ask for a new one from the sign-in page.
    </p>`;
  }

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/v1/auth/reset", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code: CODE, password: e.target.password.value }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message || res.statusText);
      location.assign("/hub"); // the reset signs you in, so there is nowhere to send you but in
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return html`
    <form class="join" onsubmit=${submit}>
      <label>
        New password
        <input name="password" type="password" required placeholder="choose a new password" autocomplete="new-password" />
      </label>
      <button class="primary" type="submit" disabled=${busy}>
        ${busy ? "Saving…" : "Set password"}
      </button>
      ${error && html`<p class="error">${error}</p>`}
      <p class="muted">
        Every other session on this account is signed out when the password changes.
      </p>
    </form>
  `;
}

render(html`<${Reset} />`, document.getElementById("reset"));
