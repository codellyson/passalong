// Client for the hosted sync API (apps/api). Everything here is optional: with no token the
// CLI is a purely local tool, and every function throws a NotLoggedIn the CLI turns into a hint.
import { readConfig } from "./store.js";

export const DEFAULT_API = "https://passalong.kreativekorna.com";

export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function baseUrl() {
  return (process.env.PASSALONG_API || readConfig().api || DEFAULT_API).replace(/\/$/, "");
}

export function token() {
  return process.env.PASSALONG_TOKEN || readConfig().token || null;
}

export function loggedIn() {
  return Boolean(token());
}

async function call(path, { method = "GET", body, auth = true, raw = false } = {}) {
  const headers = {};
  if (auth) {
    const t = token();
    if (!t) throw new ApiError(401, "not logged in — run `passalong login` to enable sync");
    headers.authorization = `Bearer ${t}`;
  }
  if (body !== undefined) {
    headers["content-type"] = typeof body === "string" ? "text/markdown" : "application/json";
  }
  let res;
  try {
    res = await fetch(`${baseUrl()}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
    });
  } catch (err) {
    throw new ApiError(0, `could not reach ${baseUrl()} (${err.message})`);
  }
  if (!res.ok) {
    const text = await res.text();
    let message = text;
    try {
      message = JSON.parse(text).message || text;
    } catch {}
    throw new ApiError(res.status, message || res.statusText);
  }
  return raw ? res.text() : res.json();
}

/** Mint a fresh account and return its token. No email, no password: the token is the account. */
export const createAccount = () => call("/v1/accounts", { method: "POST", auth: false });
export const me = () => call("/v1/me");
export const publish = (id, markdown) =>
  call(`/v1/guides/${id}`, { method: "PUT", body: markdown });
export const list = (q = "") => call(`/v1/guides${q ? `?q=${encodeURIComponent(q)}` : ""}`);
export const get = (id) => call(`/v1/guides/${id}`, { raw: true });
export const setStatus = (id, status) =>
  call(`/v1/guides/${id}/status`, { method: "PATCH", body: { status } });
export const remove = (id) => call(`/v1/guides/${id}`, { method: "DELETE" });

/** Fetch a guide by its share link (no account needed). Accepts the web URL or the .md URL. */
export async function fetchShared(url) {
  const u = new URL(url);
  if (!u.pathname.endsWith(".md")) u.pathname = `${u.pathname.replace(/\/$/, "")}.md`;
  const res = await fetch(u);
  if (!res.ok)
    throw new ApiError(res.status, `could not fetch ${url}: ${res.status} ${res.statusText}`);
  return res.text();
}

export function shareUrl(id, key) {
  return `${baseUrl()}/g/${id}/${key}`;
}
