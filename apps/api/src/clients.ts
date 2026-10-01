/**
 * Which passalong CLI is calling, and whether it is too old to be served.
 *
 * The server's rules deploy the minute they merge; the text that tells an agent how to follow them
 * ships inside the CLI and reaches a machine only when somebody reinstalls it. For two weeks that
 * gap was the product: a hand-in was refused with a rule, the stdio MCP on 0.9.0 still told agents
 * the opposite, and the agents did what the older text said — published a second guide to carry
 * their evidence. The update notice existed and could not help, because `passalong mcp` never
 * prints one and an agent never reads stderr.
 *
 * So the server says it, as a refusal on the call the agent just made, which is the one text an
 * agent is sure to read. It refuses the CLI only: the hub, the hosted MCP and anybody's curl are
 * not an installed package and have nothing to update.
 *
 * Imports no sibling, so `test/clients.test.mjs` can load it under Node's type stripping.
 */

/** Sent by every CLI from 0.12.0 on, holding its package version. */
export const CLIENT_HEADER = "x-passalong-version";

/**
 * The oldest CLI this server serves. **Raise it only once that version is `latest` on npm**: this
 * deploys on merge, and a floor above what npm hands out refuses every agent with nothing it can
 * install to get past it.
 *
 * 0.12.0 since it went `latest` on 2026-09-25: the first release that sends its version, and the
 * first whose follow-up note stopped telling agents to publish what they found as a new guide.
 */
export const MIN_CLIENT = "0.12.0";

/**
 * What a CLI that sends no version is counted as: the last release that did not send one.
 *
 * Everything up to 0.11.0 calls with Node's own fetch and no header, and Node names itself `node`
 * (`undici` on 18) in the user-agent — which no browser, curl or SDK sends. That is how an old CLI
 * is told apart from a script someone wrote, and it is a ceiling rather than a guess: whatever that
 * build is, it is 0.11.0 or older, so raising the floor past it catches all of them.
 */
export const UNSTATED = "0.11.0";

/** The CLI version a request came from, or "" when it did not come from the CLI. */
export function clientVersion(
  header: string | null | undefined,
  userAgent: string | null | undefined,
): { version: string; stated: boolean } {
  const said = String(header ?? "").trim();
  if (said) return { version: said, stated: true };
  const ua = String(userAgent ?? "")
    .trim()
    .toLowerCase();
  return ua === "node" || ua === "undici"
    ? { version: UNSTATED, stated: false }
    : { version: "", stated: false };
}

/** Is `a` before `b`? Numeric parts only; anything unreadable is never called old. */
export function older(a: string, b: string): boolean {
  const parts = (v: string) =>
    (String(v).split("-")[0] ?? "").split(".").map((n) => Number.parseInt(n, 10));
  const x = parts(a);
  const y = parts(b);
  if (x.length !== 3 || y.length !== 3 || [...x, ...y].some(Number.isNaN)) return false;
  for (let i = 0; i < 3; i++) {
    const p = x[i] ?? 0;
    const q = y[i] ?? 0;
    if (p !== q) return p < q;
  }
  return false;
}

/**
 * The refusal for a CLI below the floor, or "" to serve it.
 *
 * Written to the agent as much as the person, because the agent is the one reading it: it can run
 * the install itself, and it cannot restart the server it is talking through — that step is the
 * person's, so it is told to say so rather than carry on with the old tools.
 */
export function tooOld(
  header: string | null | undefined,
  userAgent: string | null | undefined,
  floor = MIN_CLIENT,
): string {
  const { version, stated } = clientVersion(header, userAgent);
  if (!version || !older(version, floor)) return "";
  const have = stated ? `passalong ${version}` : `passalong ${UNSTATED} or older`;
  return (
    `This is ${have}, and passalong.dev needs ${floor} or later — the rules changed and this ` +
    "build tells agents the old ones. Update it: npm i -g passalong@latest. Then restart " +
    "whatever runs `passalong mcp` (in Claude Code: /mcp, then reconnect passalong, or start a " +
    "new session) — a running server keeps the old code until it restarts. Agents: run the " +
    "update yourself, then tell the person the restart is needed, and stop until it is done."
  );
}

/**
 * What wrote a guide, in one string: `cli@<version>`, `mcp`, `hub` or `api`.
 *
 * Stored on the guide row at every publish (migration 0035), so a malformed guide can be traced to
 * the release that produced it. The surface is known from the credential, which the server checked
 * itself; the version is what the CLI said, and it is diagnostic, not a permission — nothing is
 * decided by it that `tooOld` does not already decide.
 */
export function writtenBy(
  via: "internal" | "session" | "token",
  header?: string | null,
  userAgent?: string | null,
): string {
  if (via === "internal") return "mcp";
  if (via === "session") return "hub";
  const { version, stated } = clientVersion(header, userAgent);
  if (!version) return "api";
  return stated ? `cli@${version.slice(0, 32)}` : `cli@<=${UNSTATED}`;
}
