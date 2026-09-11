// Client for the hosted sync API (apps/api). Everything here is optional: with no token the
// CLI is a purely local tool, and every function throws an ApiError the CLI turns into a hint.
import { readConfig } from "./store.js";

export const DEFAULT_API = "https://passalong.dev";

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

const q = (params) => {
  const s = new URLSearchParams(Object.entries(params).filter(([, v]) => v)).toString();
  return s ? `?${s}` : "";
};

/** Mint a fresh account and return its token. No email, no password: the token is the account. */
export const createAccount = () => call("/v1/accounts", { method: "POST", auth: false });
export const me = () => call("/v1/me");
export const updateMe = (patch) => call("/v1/me", { method: "PATCH", body: patch });

export const teams = () => call("/v1/teams");
export const team = (slug) => call(`/v1/teams/${encodeURIComponent(slug)}`);
export const createTeam = (name) => call("/v1/teams", { method: "POST", body: { name } });
export const invite = (slug, email = "") =>
  call(`/v1/teams/${encodeURIComponent(slug)}/invites`, { method: "POST", body: { email } });
export const join = (code) =>
  call(`/v1/invites/${encodeURIComponent(code)}/accept`, { method: "POST" });

export const board = () => call("/v1/board");
/** What you did, newest first. `since` is a date prefix: 2026, 2026-09, 2026-09-11. */
export const log = ({ repo = "", since = "", limit = 0 } = {}) =>
  call(`/v1/log${q({ repo, since, limit: limit || "" })}`);
export const notifications = ({ unread = true, limit = 0 } = {}) =>
  call(`/v1/notifications${q({ unread: unread ? "1" : "", limit: limit || "" })}`);
/** No ids means "everything unread". */
export const markRead = (ids = []) =>
  call("/v1/notifications/read", { method: "POST", body: { ids } });

export const publish = (id, markdown) =>
  call(`/v1/guides/${id}`, { method: "PUT", body: markdown });
export const list = (query = "", scope = "") => call(`/v1/guides${q({ q: query, scope })}`);
export const inbox = () => call("/v1/inbox");
/** Open a report for a set of issues to be filed under. */
export const createReport = (body) => call("/v1/reports", { method: "POST", body });
/** One report and the issues filed under it, grouped by product area. */
export const report = (id) => call(`/v1/reports/${encodeURIComponent(id)}`);
export const get = (id) => call(`/v1/guides/${id}`, { raw: true });
export const setStatus = (id, status) =>
  call(`/v1/guides/${id}/status`, { method: "PATCH", body: { status } });
export const remove = (id) => call(`/v1/guides/${id}`, { method: "DELETE" });
/** Does it actually work? `note` is required when it does not. */
export const verdict = (id, ok, note = "") =>
  call(`/v1/guides/${id}/verdict`, { method: "PUT", body: { ok, note } });

export const ack = (id, taken, note = "") =>
  call(`/v1/guides/${id}/ack`, { method: "PUT", body: { taken, note } });

/**
 * Upload an image as evidence, and get back the URL a guide points at.
 *
 * Not `call()`: that serialises a body as JSON or markdown, and this route reads bytes and takes
 * the content type as the declaration of what they are. `name` is the label, and it travels in a
 * header rather than the body for the same reason.
 */
export async function uploadShot(bytes, type, name = "") {
  const t = token();
  if (!t) throw new ApiError(401, "not logged in — run `passalong login` to enable sync");
  const headers = { authorization: `Bearer ${t}`, "content-type": type };
  // A header is latin-1: a filename with an accent in it throws on the way out rather than at the
  // server, and the label is not worth failing an upload over.
  if (name) headers["x-shot-name"] = String(name).replace(/[^\x20-\x7e]/g, "");
  let res;
  try {
    res = await fetch(`${baseUrl()}/v1/shots`, { method: "POST", headers, body: bytes });
  } catch (err) {
    throw new ApiError(0, `could not reach ${baseUrl()} (${err.message})`);
  }
  if (!res.ok) {
    const body = await res.text();
    let message = body;
    try {
      message = JSON.parse(body).message || body;
    } catch {}
    throw new ApiError(res.status, message || res.statusText);
  }
  return (await res.json()).shot;
}

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
