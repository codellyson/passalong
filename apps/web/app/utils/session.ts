/** The cookie the API sets at sign-in. HttpOnly, so the browser's script cannot see it; the server can. */
export const SESSION_COOKIE = "pa_session";

/**
 * Whether a request carries a session, read off its `Cookie` header.
 *
 * Only that it is there: whether the session still stands is the hub's question, and a stale one
 * costs a visitor a click on "Open hub" that lands on the sign-in page rather than a wrong answer.
 * Read on the server, because the public pages never hydrate (`noScripts`) and have no other way.
 */
export function hasSession(cookie: string | undefined): boolean {
  return (cookie ?? "").split(";").some((part) => {
    const [name, ...value] = part.trim().split("=");
    return name === SESSION_COOKIE && value.join("=").length > 0;
  });
}
