// The theme switch, as a link.
//
// Every public page here runs no script at all — `/`, `/connect` and every guide page are
// `noScripts` with a policy naming no `script-src` — so the usual toggle, a click handler writing
// to localStorage, cannot exist on the pages that most need one. This is the same switch built out
// of the things that do work without script: a link, a cookie, and a redirect back to where you
// were.
//
// It is better than the scripted version in one way worth keeping even if script ever arrives
// here. The server knows the answer before it renders, so the page arrives already in the right
// theme; a script that reads storage after first paint has to flash the wrong one first.
export default defineEventHandler((event) => {
  const q = getQuery(event);
  const to = String(q.to || "");
  // Three states, not two: "system" is a real answer and the default, and a switch that cannot get
  // back to it has taken something away from whoever asked for neither.
  const choice = to === "dark" || to === "light" ? to : "";

  if (choice) {
    setCookie(event, "theme", choice, {
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
      sameSite: "lax",
      // Nothing on the client reads this; the server stamps the attribute during render.
      httpOnly: true,
      secure: !import.meta.dev,
    });
  } else {
    deleteCookie(event, "theme", { path: "/" });
  }

  // Where the reader was. Same-origin paths only: `back` arrives in a URL, so anyone can put
  // anything in it, and a redirector that will send a visitor to another origin is an open
  // redirect — the kind of thing that turns your own domain into the trustworthy half of somebody
  // else's phishing link.
  const asked = String(q.back || "/");
  const back = /^\/(?![/\\])[^\s]*$/.test(asked) ? asked : "/";
  return sendRedirect(event, back, 303);
});
