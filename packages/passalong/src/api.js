// Client for the hosted API (apps/api). Work lives there, so nearly every call needs a login, and
// every function throws an ApiError the CLI turns into a hint.
import { readFileSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { basename } from "node:path";
import { nameFor, readAccounts, readConfig, saveTeam } from "./store.js";

/**
 * This build's version, sent on every authenticated call as `x-passalong-version`. The server
 * refuses a CLI below its floor (apps/api/src/clients.ts), because the rules it enforces deploy on
 * merge and the text telling an agent how to follow them only arrives with a reinstall.
 */
export const VERSION = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
).version;
const CLIENT = { "x-passalong-version": VERSION };

export const DEFAULT_API = "https://passalong.dev";

export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// ---- which account -----------------------------------------------------------------------------
//
// A machine may be signed in to several (store.js). Who a call is made as comes from, in order:
// PASSALONG_TOKEN, an account named by PASSALONG_ACCOUNT, `--as` or `accounts` `use` (this process
// only), then the machine's default. With two or more logins and nobody having said which, a
// person at a terminal gets the default and an agent — a process with no terminal to ask on — is
// refused with the names, so it asks the person rather than choosing. That refusal is the prompt:
// an agent cannot be asked a question, but it can be told to put one to somebody.

let chosen = "";

const interactive = () => Boolean(process.stdin.isTTY && process.stdout.isTTY);

/** Names of the logins on this machine, each with what tells them apart. */
export function accountList() {
  return Object.entries(readAccounts()).map(([name, a]) => ({
    name,
    handle: a.handle || "",
    email: a.email || "",
    api: a.api || "",
  }));
}

/** Name an account for this process only, the way a person confirming one for a session does. */
export function chooseAccount(name) {
  const all = readAccounts();
  if (!all[name]) {
    const names = Object.keys(all).join(", ");
    throw new ApiError(
      0,
      `no account called "${name}" on this machine${names ? `. Signed in: ${names}` : ""}`,
    );
  }
  chosen = name;
  return { name, ...all[name] };
}

/** Take back a choice made with chooseAccount: the session is undecided again. */
export function forgetChoice() {
  chosen = "";
}

/** The account this process was told to use, or null when nobody said. */
function picked() {
  const want = chosen || process.env.PASSALONG_ACCOUNT || "";
  if (!want) return null;
  const a = readAccounts()[want];
  if (!a) {
    const names = Object.keys(readAccounts()).join(", ");
    throw new ApiError(0, `no account called "${want}" on this machine. Signed in: ${names}`);
  }
  return { name: want, ...a };
}

/** The name of the account in use, if there is one: for saying who a command is about to act as. */
export function accountInUse() {
  if (process.env.PASSALONG_TOKEN) return "";
  const p = picked();
  if (p) return p.name;
  return readConfig().active || "";
}

/** True when a call would have to guess which of several accounts is meant. */
export function needsChoice() {
  if (process.env.PASSALONG_TOKEN || chosen || process.env.PASSALONG_ACCOUNT) return false;
  return Object.keys(readAccounts()).length >= 2 && !interactive();
}

/** What an agent is told when it would have to guess. It is written to be passed on to a person. */
export function choiceMessage() {
  const list = accountList()
    .map((a) => {
      const who = a.email || (a.handle ? `@${a.handle}` : "");
      return who && who !== a.name ? `${a.name} (${who})` : a.name;
    })
    .join(", ");
  return (
    `More than one Passalong account is signed in on this machine (${list}) and nothing says which ` +
    "this session is for. Ask the person which one to use, then call accounts with `use` set to its name " +
    "(or run the command with --as <name>). Do not choose one yourself."
  );
}

export function baseUrl() {
  const base = process.env.PASSALONG_API || picked()?.api || readConfig().api || DEFAULT_API;
  return base.replace(/\/$/, "");
}

export function token() {
  return process.env.PASSALONG_TOKEN || picked()?.token || readConfig().token || null;
}

export function loggedIn() {
  return Boolean(token());
}

/**
 * Every login this machine holds, as `{ token, api }` for a call's `as`: each kept account and the
 * one in use, once each. For work that belongs to all of them, like `tidy`, rather than to one.
 */
export function logins() {
  const all = Object.values(readAccounts())
    .filter((a) => a.token)
    .map((a) => ({ token: a.token, api: a.api || readConfig().api || DEFAULT_API }));
  if (token()) all.push({ token: token(), api: baseUrl() });
  const seen = new Set();
  return all.filter((a) => !seen.has(`${a.token} ${a.api}`) && seen.add(`${a.token} ${a.api}`));
}

/** The team this account works in. It belongs to the account, not the machine. */
export function currentTeam() {
  const p = picked();
  return (p ? p.team : readConfig().team) || "";
}

export function setTeam(slug) {
  saveTeam(picked()?.name || readConfig().active || "", slug);
}

/** Who a token is, without it being the one this process uses: how a login is named before it is kept. */
export async function meWith(tokenValue, base = baseUrl()) {
  let res;
  try {
    res = await fetch(`${base}/v1/me`, {
      headers: { ...CLIENT, authorization: `Bearer ${tokenValue}` },
    });
  } catch (err) {
    throw new ApiError(0, `could not reach ${base} (${err.message})`);
  }
  const said = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, said.message || res.statusText);
  return said;
}

export { nameFor };

async function call(
  path,
  { method = "GET", body, auth = true, raw = false, uploadName = "", as = null } = {},
) {
  const headers = { ...CLIENT };
  if (auth) {
    if (!as && needsChoice()) throw new ApiError(409, choiceMessage());
    const t = as ? as.token : token();
    if (!t) throw new ApiError(401, "not logged in — run `passalong login` to enable sync");
    headers.authorization = `Bearer ${t}`;
  }
  if (body !== undefined) {
    headers["content-type"] = uploadName
      ? "application/octet-stream"
      : typeof body === "string"
        ? "text/markdown"
        : "application/json";
  }
  if (uploadName) headers["x-file-name"] = uploadName.replace(/[^\x20-\x7e]/g, "").slice(0, 120);
  const base = as ? as.api.replace(/\/$/, "") : baseUrl();
  let res;
  try {
    res = await fetch(`${base}${path}`, {
      method,
      headers,
      body:
        body === undefined
          ? undefined
          : uploadName || typeof body === "string"
            ? body
            : JSON.stringify(body),
    });
  } catch (err) {
    throw new ApiError(0, `could not reach ${base} (${err.message})`);
  }
  if (!res.ok) {
    const text = await res.text();
    let message = text;
    let parsed = {};
    try {
      parsed = JSON.parse(text);
      message = parsed.message || text;
    } catch {}
    // The whole answer rides along: a refusal can carry `next`, `say` or `holder`, which is what
    // an agent needs to decide what to do instead.
    throw Object.assign(new ApiError(res.status, message || res.statusText), { body: parsed });
  }
  return raw ? res.text() : res.json();
}

const q = (params) => {
  const s = new URLSearchParams(Object.entries(params).filter(([, v]) => v)).toString();
  return s ? `?${s}` : "";
};

/**
 * Sign this machine in from the browser. `challenge` is the sha256, in hex, of a secret kept here;
 * what comes back is a short code to show, the page to open, and how often to ask whether it was
 * approved. Nothing in the answer is a credential.
 */
export const deviceStart = (challenge, label) =>
  call("/v1/device/start", { method: "POST", auth: false, body: { challenge, label } });

/** `null` while nobody has said yes; the account and its token once somebody has. */
export async function devicePoll(id, verifier) {
  let res;
  try {
    res = await fetch(`${baseUrl()}/v1/device/poll`, {
      method: "POST",
      headers: { ...CLIENT, "content-type": "application/json" },
      body: JSON.stringify({ id, verifier }),
    });
  } catch (err) {
    throw new ApiError(0, `could not reach ${baseUrl()} (${err.message})`);
  }
  if (res.status === 202) return null;
  const said = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, said.message || res.statusText);
  return said;
}

export const me = () => call("/v1/me");
export const updateMe = (patch) => call("/v1/me", { method: "PATCH", body: patch });

export const teams = () => call("/v1/teams");
export const team = (slug) => call(`/v1/teams/${encodeURIComponent(slug)}`);
export const createTeam = (name) => call("/v1/teams", { method: "POST", body: { name } });
export const invite = (slug, email = "") =>
  call(`/v1/teams/${encodeURIComponent(slug)}/invites`, { method: "POST", body: { email } });
export const setMemberRole = (slug, who, role) =>
  call(`/v1/teams/${encodeURIComponent(slug)}/members/${encodeURIComponent(who)}`, {
    method: "PATCH",
    body: { role },
  });
export const removeMember = (slug, who) =>
  call(`/v1/teams/${encodeURIComponent(slug)}/members/${encodeURIComponent(who)}`, {
    method: "DELETE",
  });
export const join = (code) =>
  call(`/v1/invites/${encodeURIComponent(code)}/accept`, { method: "POST" });

export const folders = (scope = "all", query = "") => call(`/v1/folders${q({ scope, q: query })}`);
export const createFolder = (
  title,
  description = "",
  team = "",
  parent = "",
  color = "",
  repo = "",
) =>
  call("/v1/folders", { method: "POST", body: { title, description, team, parent, color, repo } });
export const folder = (id) => call(`/v1/folders/${encodeURIComponent(id)}`);
export const updateFolder = (id, changes) =>
  call(`/v1/folders/${encodeURIComponent(id)}`, { method: "PATCH", body: changes });
export const folderDocument = (folderId, documentId) =>
  call(`/v1/folders/${encodeURIComponent(folderId)}/documents/${encodeURIComponent(documentId)}`);
export const folderAsset = (folderId, assetId) =>
  call(`/v1/folders/${encodeURIComponent(folderId)}/assets/${encodeURIComponent(assetId)}/agent`);
export async function addFolderAsset(folderId, path, name = "") {
  const file = await stat(path);
  if (!file.isFile()) throw new ApiError(400, "Choose a file to add to the folder.");
  if (file.size > 10 * 1024 * 1024) throw new ApiError(413, "That file is over 10 MB.");
  return call(`/v1/folders/${encodeURIComponent(folderId)}/assets`, {
    method: "POST",
    body: new Uint8Array(await readFile(path)),
    uploadName: name || basename(path),
  });
}
export const createFolderDocument = (folderId, name, body) =>
  call(`/v1/folders/${encodeURIComponent(folderId)}/documents`, {
    method: "POST",
    body: { name, body },
  });
export const saveFolderDocument = (folderId, documentId, version, body) =>
  call(`/v1/folders/${encodeURIComponent(folderId)}/documents/${encodeURIComponent(documentId)}`, {
    method: "PUT",
    body: { version, body },
  });
/** Rename a document, move it to another folder (`folder`), or both. Its id and history stay. */
export const patchFolderDocument = (folderId, documentId, changes) =>
  call(`/v1/folders/${encodeURIComponent(folderId)}/documents/${encodeURIComponent(documentId)}`, {
    method: "PATCH",
    body: changes,
  });
export const folderDocumentHistory = (folderId, documentId, version = 0) =>
  call(
    `/v1/folders/${encodeURIComponent(folderId)}/documents/${encodeURIComponent(documentId)}/revisions${version ? `/${version}` : ""}`,
  );
export const deleteFolderDocument = (folderId, documentId) =>
  call(`/v1/folders/${encodeURIComponent(folderId)}/documents/${encodeURIComponent(documentId)}`, {
    method: "DELETE",
  });
export const deleteFolderAsset = (folderId, assetId) =>
  call(`/v1/folders/${encodeURIComponent(folderId)}/assets/${encodeURIComponent(assetId)}`, {
    method: "DELETE",
  });
export const publish = (id, markdown) =>
  call(`/v1/guides/${id}`, { method: "PUT", body: markdown });
export const list = (query = "", scope = "") => call(`/v1/guides${q({ q: query, scope })}`);
export const get = (id, { peek = false, as = null } = {}) =>
  call(`/v1/guides/${id}${q({ peek: peek ? "1" : "" })}`, { raw: true, as });
/** One page of every guide this account can read, for `export`. Records no pull. */
export const exportPage = (after = "", as = null) => call(`/v1/export${q({ after })}`, { as });
/**
 * The work this one came out of, with where it has got to. `markdown` adds its content. Reading it
 * is not opening it: no pull is recorded on the parent.
 */
export const parent = (id, { markdown = false } = {}) =>
  call(`/v1/guides/${encodeURIComponent(id)}/parent${q({ markdown: markdown ? "1" : "" })}`);
/**
 * Giving a plan away, for whoever the deployment names in `ADMIN_ACCOUNTS`. Every other account
 * gets a 404 from these, so the CLI does not have to know who the operator is either.
 */
export const makeAdmin = (email) => call("/v1/admin/accounts", { method: "POST", body: { email } });
export const listAdmins = () => call("/v1/admin/accounts");
export const grantAdmin = (who) =>
  call(`/v1/admin/accounts/${encodeURIComponent(who)}`, { method: "PUT", body: {} });
export const revokeAdmin = (who) =>
  call(`/v1/admin/accounts/${encodeURIComponent(who)}`, { method: "DELETE" });
export const giveGift = (body) => call("/v1/admin/gifts", { method: "POST", body });
export const listGifts = () => call("/v1/admin/gifts");
export const takeGiftBack = (id) =>
  call(`/v1/admin/gifts/${encodeURIComponent(id)}`, { method: "DELETE" });
export const setStatus = (id, status) =>
  call(`/v1/guides/${id}/status`, { method: "PATCH", body: { status } });
export const remove = (id) => call(`/v1/guides/${id}`, { method: "DELETE" });
export const tasks = () => call("/v1/tasks");
export const nextTask = (body) => call("/v1/tasks/next", { method: "POST", body });
export const reopen = (id, why) =>
  call(`/v1/guides/${encodeURIComponent(id)}/reopen`, { method: "POST", body: { why } });
/** Take work back from whoever holds it. */
export const release = (id) =>
  call(`/v1/guides/${encodeURIComponent(id)}/release`, { method: "POST", body: {} });
export const working = () => call("/v1/working");
export const assign = (id, to) =>
  call(`/v1/guides/${encodeURIComponent(id)}/assign`, { method: "POST", body: { to } });
export const take = (body) => call("/v1/take", { method: "POST", body });
export const progress = (id, body) =>
  call(`/v1/guides/${encodeURIComponent(id)}/progress`, { method: "PUT", body });
export const handIn = (id, body) =>
  call(`/v1/guides/${encodeURIComponent(id)}/hand_in`, { method: "POST", body });
export const ask = (id, body) =>
  call(`/v1/guides/${encodeURIComponent(id)}/ask`, { method: "POST", body });
export const reply = (id, body) =>
  call(`/v1/guides/${encodeURIComponent(id)}/reply`, { method: "POST", body: { body } });
export const pass = (id, body) =>
  call(`/v1/guides/${encodeURIComponent(id)}/pass`, { method: "POST", body });
/**
 * Upload a file that is not a picture, and get back what the server made of it. The server decides
 * what the bytes are and refuses what it does not keep; `type` and `name` are hints. The name travels
 * percent-encoded because a header cannot hold what a filename can.
 */
export async function uploadFile(bytes, type, name = "") {
  if (needsChoice()) throw new ApiError(409, choiceMessage());
  const t = token();
  if (!t) throw new ApiError(401, "not logged in — run `passalong login` to enable sync");
  const headers = {
    ...CLIENT,
    authorization: `Bearer ${t}`,
    "content-type": type || "application/octet-stream",
  };
  if (name) headers["x-file-name"] = encodeURIComponent(String(name));
  let res;
  try {
    res = await fetch(`${baseUrl()}/v1/attachments`, { method: "POST", headers, body: bytes });
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
  return (await res.json()).attachment;
}

/**
 * Upload a picture, and get back the URL work points at. Not `call()`: that serialises a body as
 * JSON or markdown, and this route reads bytes and takes the content type as what they are.
 */
export async function uploadShot(bytes, type, name = "") {
  const t = token();
  if (!t) throw new ApiError(401, "not logged in — run `passalong login` to enable sync");
  const headers = { ...CLIENT, authorization: `Bearer ${t}`, "content-type": type };
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

/** Fetch work by its share link (no account needed). Accepts the web URL or the .md URL. */
export async function fetchShared(url) {
  const u = new URL(url);
  if (!u.pathname.endsWith(".md")) u.pathname = `${u.pathname.replace(/\/$/, "")}.md`;
  const res = await fetch(u);
  if (!res.ok)
    throw new ApiError(res.status, `could not fetch ${url}: ${res.status} ${res.statusText}`);
  return res.text();
}
