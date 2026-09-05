// Setting a new password from an emailed link. The code arrives in the URL fragment, which
// browsers never send to the server, so it stays out of request logs; the page reads it, uses it
// once, and scrubs the address bar.
(() => {
  const app = document.getElementById("reset");
  if (!app) return;
  const CODE = new URLSearchParams(location.hash.slice(1)).get("code") || location.hash.slice(1);
  if (location.hash) history.replaceState(null, "", location.pathname);

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

  const state = { error: null, busy: false };

  async function submit(password) {
    state.busy = true;
    state.error = null;
    render();
    try {
      const res = await fetch("/v1/auth/reset", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code: CODE, password }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message || res.statusText);
      // The reset signs you in, so there is nowhere to send you but in.
      location.assign("/hub");
    } catch (e) {
      state.error = e.message;
      state.busy = false;
      render();
    }
  }

  function render() {
    app.replaceChildren(
      CODE
        ? el(
            "form",
            {
              class: "join",
              onsubmit: (e) => {
                e.preventDefault();
                submit(e.target.password.value);
              },
            },
            el(
              "label",
              {},
              "New password",
              el("input", {
                name: "password",
                type: "password",
                required: "required",
                minlength: "12",
                autocomplete: "new-password",
              }),
              el(
                "span",
                { class: "muted" },
                "at least 12 characters, and not one from a breach list",
              ),
            ),
            el(
              "button",
              { class: "primary", type: "submit", ...(state.busy ? { disabled: "disabled" } : {}) },
              state.busy ? "Saving…" : "Set password",
            ),
            state.error ? el("p", { class: "error" }, state.error) : "",
            el(
              "p",
              { class: "muted" },
              "Every other session on this account is signed out when the password changes.",
            ),
          )
        : el(
            "p",
            { class: "error" },
            "This link is missing its code. Ask for a new one from the sign-in page.",
          ),
    );
  }

  render();
})();
