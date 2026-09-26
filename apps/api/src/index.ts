// Passalong sync API + web view. A Hono app on a Worker with one D1 database.
//
//   POST   /v1/accounts               mint an anonymous account + its first token
//   POST   /v1/auth/signup             { email, password } → account + session cookie
//   POST   /v1/auth/login              { email, password } → session cookie
//   POST   /v1/auth/logout             end this session
//   POST   /v1/auth/password           { email?, password } claim an account, or change it
//   POST   /v1/auth/forgot             { email } → emailed reset link (always answers the same)
//   POST   /v1/auth/reset              { code, password } → new password + session
//   GET    /v1/tokens                  CLI/MCP credentials on this account
//   POST   /v1/tokens                  { name } → a new token, shown once
//   DELETE /v1/tokens/:id              revoke one
//   GET    /v1/me                      identity, teams, counts
//   PATCH  /v1/me                      { handle, name, email }
//   POST   /v1/teams                   { name } → create a team (you become owner)
//   GET    /v1/teams                   teams you belong to
//   GET    /v1/teams/:slug             one team with members (members only)
//   POST   /v1/teams/:slug/invites     { email? } → invite link (mailed when an email is given)
//   POST   /v1/invites/:code/accept    join the team behind an invite
//   GET    /v1/guides?q=&scope=        list/search: scope=all (default) | mine | <team slug>
//   GET    /v1/inbox                   guides handed to you (or your teams) you have not pulled
//   GET    /v1/board                   the queues: waiting, not working, in flight, landed, promote
//   GET    /v1/log?repo=&since=       what you did, newest first
//   GET    /v1/notifications?unread=   what happened while you were away
//   POST   /v1/notifications/read      { ids? } → mark read (everything unread when ids omitted)
//   PUT    /v1/guides/:id              upsert a guide (body: text/markdown; frontmatter team/to)
//   GET    /v1/guides/:id              guide as markdown (owner or team member); records a pull
//   GET    /v1/guides/:id/context      everything around a guide, for the hub; records no pull
//   PATCH  /v1/guides/:id/status       { status }  owner: any; team member: consumed/published
//   PUT    /v1/guides/:id/ack          { taken, note }  the reader's first word back
//   PUT    /v1/guides/:id/verdict      { ok, note? } → does it actually work?
//   DELETE /v1/guides/:id              owner only
//   GET    /v1/tasks                   every task you can see, with its column and its claim
//   POST   /v1/tasks/next              { agent, host, repo, worktree, any } → claim a task, or null
//   PUT    /v1/tasks/:id/progress      { agent, note? }  renew the lease, set the board's line
//   POST   /v1/tasks/:id/finish        { agent, report, pr?, note? } → review
//   POST   /v1/tasks/:id/approve       author: review → done
//   POST   /v1/tasks/:id/reject        { why }  author: review → ready, the reason added to the task
//   POST   /v1/tasks/:id/release       author: claimed or stalled → ready, with where it was left
//   GET    /g/:id/:key.md              a guide's raw markdown (share link); records a pull
//   GET    /og.png                     the site's own unfurl card\n//   GET    /g/:id/:key/og.png          the unfurl card for that link
//   GET    /health                     what CI waits on after a deploy
//
// **This app is not deployed on its own.** apps/web mounts it — see
// apps/web/server/middleware/1.api.ts — so everything above is served from the Nuxt Worker, on the
// same origin as the pages. That is what lets one middleware accept either credential without the
// browser ever making a cross-origin call.
//
// Every page a person looks at is apps/web's: `/`, the guide page at `/g/:id/:key`, `/hub`,
// `/join/:code`, `/reset`, and the 404. What is left here is the machine surface, plus the two
// `/g/**` routes that stayed because a crawler and an agent fetch them, not a browser — and
// because `workers-og` is ~1.7MB of wasm that only the card should ever pay for.
import { Hono } from "hono";
import { type AnalyticsEnv, type Props, track } from "./analytics.js";
import {
  clearCookie,
  decoyHash,
  EMAIL_RE,
  hashPassword,
  isBreached,
  passwordProblem,
  rand,
  readCookie,
  SESSION_COOKIE,
  sessionCookie,
  sessionExpiry,
  sha256,
  verifyPassword,
} from "./auth.js";
import {
  BillingError,
  isProvider,
  modeOf,
  type Provider,
  parseEvent,
  setSeats,
  startCheckout,
  verifyPaystack,
  verifyStripe,
} from "./billing.js";
import * as claims from "./claims.js";
import { CLIENT_HEADER, tooOld } from "./clients.js";
import {
  type MailEnv,
  sendConsumed,
  sendHandoff,
  sendInvite,
  sendPulled,
  sendReset,
  sendVerdict,
} from "./email.js";
import {
  findPeople,
  findSubject,
  gift,
  gifts,
  isAdmin,
  isPlatformOwner,
  makeSuper,
  revokeGift,
  superAccounts,
  unSuper,
} from "./gifts.js";
import {
  AREAS,
  clipFollowUp,
  dropField,
  FOLLOW_UPS_MAX,
  type Meta,
  parseMeta,
  SETTABLE,
  SEVERITIES,
  STATUSES,
  setField,
  setList,
  shotIds,
  slug,
  tag,
  tagList,
  unreachableImages,
} from "./guide.js";
import { logFeed, summary as logSummary, SINCE_RE } from "./log.js";
import { handleMcp } from "./mcp-http.js";
import {
  announce,
  displayName,
  feed,
  line,
  markRead,
  summary as notifSummary,
  notify,
  notifyAll,
  post,
  unreadCount,
  webhookAllowed,
} from "./notify.js";
import {
  authorizationServerMetadata,
  clientRefusal,
  DYNAMIC_TTL_MS,
  errorRedirect,
  invalidClient,
  MCP_SCOPE,
  pickRedirect,
  pkceMatches,
  protectedResourceMetadata,
  redirectHost,
  registrationResponse,
  timingSafeEqual,
  validateRegistration,
} from "./oauth.js";
import {
  clearRefusal,
  disconnect,
  findClient,
  listConnectors,
  recordApproval,
  recordRefusal,
  registrationCutoff,
  saveRegistration,
  sweepRegistrations,
  tokenClient,
} from "./oauth-clients.js";
import { grantFor, issueCode, issueTokens } from "./oauth-store.js";
import { renderOgImage, renderSiteOgImage } from "./og.js";
import { openapi } from "./openapi.js";
import {
  acceptsNewWork,
  type Ceiling,
  COUNTED,
  ceilingFor,
  isFull,
  planNow,
  seatsFull,
} from "./quota.js";
import { evidenceOn, holdShots, PROOF_DAYS, SHOT_TYPES, shotKey } from "./shots.js";
import {
  isUploadToken,
  publicUpload,
  sniffImage,
  UPLOAD_OPEN_MAX,
  UPLOAD_PREFIX,
  UPLOAD_TTL_MS,
} from "./uploads.js";

type RateLimiter = { limit(opts: { key: string }): Promise<{ success: boolean }> };

type Env = MailEnv &
  AnalyticsEnv & {
    DB: D1Database;
    ASSETS: Fetcher;
    /** Screenshot bytes. Optional: a deployment without the bucket refuses uploads and serves
        every other route exactly as before. */
    SHOTS?: R2Bucket;
    ACCOUNT_LIMIT?: RateLimiter;
    /** Per-IP throttle on OAuth dynamic client registration, the other unauthenticated write. */
    OAUTH_REGISTER_LIMIT?: RateLimiter;
    /** "0" closes the free ceiling to new accounts. Unset means it is still open — see quota.ts. */
    FREE_SIGNUP?: string;
    /** Billing. Optional, like every other integration here: without them a deployment runs
        exactly as before and every webhook is refused rather than trusted. */
    STRIPE_WEBHOOK_SECRET?: string;
    STRIPE_SECRET?: string;
    STRIPE_PRICE?: string;
    PAYSTACK_SECRET?: string;
    PAYSTACK_PLAN?: string;
    FREE_SYNC_LIMIT: string;
    /**
     * Who may give a plan away: account ids, comma-separated. Empty — the default — means nobody,
     * so a deployment that has not been told who the operator is has no admin routes at all rather
     * than a guessable one. A secret and not a column on purpose: an admin flag in the database is
     * reachable by every bug that can write a row, and this list is changed where the deployment
     * is, by whoever already has that access.
     */
    ADMIN_ACCOUNTS?: string;
    /**
     * "1" turns on the one-click demo sign-in at POST /v1/auth/demo, for working on the hub
     * without an account. Unset — the default, and what every wrangler.jsonc ships — means the
     * route does not exist, and it is absent from both of them on purpose: a var that has to be
     * added to turn this on cannot be left on by forgetting to remove it.
     *
     * The same shape as ADMIN_ACCOUNTS and for the same reason. A deployment that has not been
     * told to open a door has no door, rather than one with a guessable lock.
     */
    DEMO_LOGIN?: string;
    ENVIRONMENT: string;
    PUBLIC_ORIGIN?: string;
  };
type Vars = { account: string };
type Ctx = { env: Env; req: { url: string }; get: (k: "account") => string };

const app = new Hono<{ Bindings: Env; Variables: Vars }>();

// The `www` → apex redirect used to be the first middleware here. It now lives in
// apps/web/server/middleware/0.canonical.ts, because this app only ever sees `/v1/*`, `/health`
// and the two machine routes — a page request to www would never have reached it. `hosts.ts` and
// its test stay put; only the caller moved.

const ID_RE = /^[a-z0-9]{6,12}$/;
const HANDLE_RE = /^[a-z0-9][a-z0-9-]{1,30}$/;
// Ids people read out loud: no lookalike characters. Secrets use auth.ts's wider alphabet.
const ID_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
const rid = (n: number) => rand(n, ID_ALPHABET);

const now = () => new Date().toISOString();

/**
 * Fire an analytics event off the response path. Categorical props only — see analytics.ts for
 * why nothing identifying is allowed through here.
 */
function count(
  c: { env: Env; executionCtx?: { waitUntil(p: Promise<unknown>): void } },
  name: string,
  props: Props = {},
) {
  try {
    // Accessing executionCtx throws where there is none, which is why this is inside the try.
    c.executionCtx?.waitUntil(track(c.env, name, props));
  } catch {
    // No execution context (tests, some local paths): drop it rather than block.
  }
}

/**
 * A refusal, as `{ message }`. The hub prints `message` verbatim, so every one a person can reach
 * says what happened in their terms and what to do next: names rather than slugs or ids, and no
 * field names, endpoints or HTTP verbs. Refusals only an agent or the CLI can reach may carry more
 * detail, but are still sentences.
 */
const err = (c: { json: (o: unknown, s: number) => Response }, status: number, message: string) =>
  c.json({ message }, status);

const GUIDE_GONE =
  "This guide isn't available any more. It may have been deleted or moved to a team you're not in.";
const REPORT_GONE = "This report doesn't exist or was deleted.";
const NOT_AN_EMAIL = "That doesn't look like an email address. Check it and try again.";

// Share links are built from the request origin. Under `wrangler dev` a custom-domain route makes
// requests look like they came from production, so local dev overrides it via .dev.vars.
const origin = (c: { env: Env; req: { url: string } }) =>
  c.env.PUBLIC_ORIGIN || new URL(c.req.url).origin;

interface AccountRow {
  id: string;
  handle: string;
  name: string;
  email: string;
}
interface TeamRow {
  id: string;
  slug: string;
  name: string;
  created_by: string;
  created: string;
  /** "free", "team" or "lapsed" — see migrations/0015_plans.sql and quota.ts. */
  plan: string;
  seats: number;
  subscription_id: string;
  plan_since: string;
}
interface GuideRow {
  id: string;
  account_id: string;
  share_key: string;
  title: string;
  status: string;
  source_context: string;
  tags: string;
  stack: string;
  markdown: string;
  created: string;
  updated: string;
  pulls: number;
  team_id: string;
  to_account_id: string;
  /** A group inside the team, when the guide was handed to one. See migrations/0014_groups.sql. */
  to_group_id: string;
  report_id: string;
  area: string;
  severity: string;
  kind: string;
  /** The guide this one came out of. See migrations/0015_lineage.sql. */
  parent_id: string;
}
interface ReportRow {
  id: string;
  account_id: string;
  title: string;
  environment: string;
  team_id: string;
  to_account_id: string;
  created: string;
  updated: string;
}
interface VerdictRow {
  guide_id: string;
  account_id: string;
  ok: number;
  note: string;
  at: string;
  handle: string;
  name: string;
}
interface AckRow {
  guide_id: string;
  account_id: string;
  taken: number;
  note: string;
  at: string;
  handle: string;
  name: string;
}
interface PullRow {
  guide_id: string;
  account_id: string;
  via: string;
  at: string;
  handle: string;
}

const shareUrl = (base: string, row: Pick<GuideRow, "id" | "share_key">) =>
  `${base}/g/${row.id}/${row.share_key}`;

// ---- lookups ----------------------------------------------------------------------------

const db = (c: { env: Env }) => c.env.DB;

/**
 * A team as it stands now: a plan that was given (migrations/0026_gifts.sql) stops on its date.
 *
 * Applied in the two helpers every caller already goes through, rather than at each of them. A
 * plan is read on nearly every request — the ceiling, the seat check, what may be addressed to the
 * team — and an expiry that had to be remembered at each of those is one that will be forgotten at
 * one of them, which is the reading where a gift never ends.
 */
const asItStands = <T extends { plan: string; plan_until?: string }>(row: T, at: string): T => ({
  ...row,
  plan: planNow(row.plan, row.plan_until, at),
});

async function myTeams(c: Ctx): Promise<(TeamRow & { role: string })[]> {
  const { results } = await db(c)
    .prepare(
      `SELECT t.*, m.role FROM team t JOIN membership m ON m.team_id = t.id
       WHERE m.account_id = ? ORDER BY t.created`,
    )
    .bind(c.get("account"))
    .all<TeamRow & { role: string }>();
  const at = now();
  return results.map((t) => asItStands(t, at));
}

async function teamBySlug(c: Ctx, slug: string): Promise<(TeamRow & { role: string }) | null> {
  const row = await db(c)
    .prepare(
      `SELECT t.*, m.role FROM team t JOIN membership m ON m.team_id = t.id
       WHERE t.slug = ? AND m.account_id = ?`,
    )
    .bind(slug, c.get("account"))
    .first<TeamRow & { role: string }>();
  return row ? asItStands(row, now()) : null;
}

/**
 * Who can fix a team's plan, by name, for the refusal that needs them. Looked up only on the way to
 * refusing, so an invite that works costs nothing extra.
 */
async function ownerName(c: { env: Env }, teamId: string): Promise<string> {
  const owner = await db(c)
    .prepare(
      `SELECT a.id, a.handle, a.name FROM membership m JOIN account a ON a.id = m.account_id
       WHERE m.team_id = ? AND m.role = 'owner' ORDER BY m.joined LIMIT 1`,
    )
    .bind(teamId)
    .first<{ id: string; handle: string; name: string }>();
  return owner ? `the team owner, ${displayName(owner)},` : "the team owner";
}

/**
 * D1 refuses a statement binding more than 100 parameters ("too many SQL variables"), and a page of
 * guides is up to 200 rows, so every `IN (?, …)` over a page runs in slices and the results are
 * joined. `extra` is how many parameters the statement binds besides the ids. A LIMIT in the
 * statement applies per slice, which only ever returns more, never less.
 */
const D1_MAX_PARAMS = 100;
async function inSlices<T>(
  ids: string[],
  extra: number,
  run: (slice: string[], marks: string) => Promise<T[]>,
): Promise<T[]> {
  const size = D1_MAX_PARAMS - extra;
  const slices: string[][] = [];
  for (let i = 0; i < ids.length; i += size) slices.push(ids.slice(i, i + size));
  const results = await Promise.all(slices.map((s) => run(s, s.map(() => "?").join(","))));
  return results.flat();
}

async function accounts(c: { env: Env }, ids: string[]): Promise<Map<string, AccountRow>> {
  const map = new Map<string, AccountRow>();
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return map;
  const results = await inSlices(
    unique,
    0,
    async (slice, marks) =>
      (
        await db(c)
          .prepare(`SELECT id, handle, name, email FROM account WHERE id IN (${marks})`)
          .bind(...slice)
          .all<AccountRow>()
      ).results,
  );
  for (const a of results) map.set(a.id, a);
  return map;
}

/** Last few pulls per guide, excluding the owner's own, with the puller's handle. */
async function recentPulls(c: { env: Env }, rows: GuideRow[]): Promise<Map<string, PullRow[]>> {
  const map = new Map<string, PullRow[]>();
  if (!rows.length) return map;
  const results = await inSlices(
    rows.map((r) => r.id),
    0,
    async (slice, marks) =>
      (
        await db(c)
          .prepare(
            `SELECT p.guide_id, p.account_id, p.via, p.at, COALESCE(a.handle, '') AS handle
             FROM pull p LEFT JOIN account a ON a.id = p.account_id
             WHERE p.guide_id IN (${marks})
             ORDER BY p.at DESC LIMIT 500`,
          )
          .bind(...slice)
          .all<PullRow>()
      ).results,
  );
  const owner = new Map(rows.map((r) => [r.id, r.account_id]));
  for (const p of results) {
    if (p.account_id && p.account_id === owner.get(p.guide_id)) continue;
    const list = map.get(p.guide_id) || [];
    if (list.length < 5) list.push(p);
    map.set(p.guide_id, list);
  }
  return map;
}

/** Current verdicts per guide, newest first. One row per person, so this is everyone's answer. */
async function verdicts(c: { env: Env }, rows: GuideRow[]): Promise<Map<string, VerdictRow[]>> {
  const map = new Map<string, VerdictRow[]>();
  if (!rows.length) return map;
  const results = await inSlices(
    rows.map((r) => r.id),
    0,
    async (slice, marks) =>
      (
        await db(c)
          .prepare(
            `SELECT v.guide_id, v.account_id, v.ok, v.note, v.at,
                    COALESCE(a.handle, '') AS handle, COALESCE(a.name, '') AS name
             FROM verdict v LEFT JOIN account a ON a.id = v.account_id
             WHERE v.guide_id IN (${marks})
             ORDER BY v.at DESC LIMIT 200`,
          )
          .bind(...slice)
          .all<VerdictRow>()
      ).results,
  );
  for (const v of results) map.set(v.guide_id, [...(map.get(v.guide_id) || []), v]);
  return map;
}

/**
 * Who has answered "are you doing this?", newest first, for a page of guides.
 *
 * Shaped exactly like `verdicts()` above because it is the same kind of fact — the reader's, not
 * the author's, and one standing answer per person.
 */
async function acks(c: { env: Env }, rows: GuideRow[]): Promise<Map<string, AckRow[]>> {
  const map = new Map<string, AckRow[]>();
  if (!rows.length) return map;
  const results = await inSlices(
    rows.map((r) => r.id),
    0,
    async (slice, marks) =>
      (
        await db(c)
          .prepare(
            `SELECT k.guide_id, k.account_id, k.taken, k.note, k.at,
                    COALESCE(a.handle, '') AS handle, COALESCE(a.name, '') AS name
             FROM ack k LEFT JOIN account a ON a.id = k.account_id
             WHERE k.guide_id IN (${marks})
             ORDER BY k.at DESC LIMIT 200`,
          )
          .bind(...slice)
          .all<AckRow>()
      ).results,
  );
  for (const k of results) map.set(k.guide_id, [...(map.get(k.guide_id) || []), k]);
  return map;
}

/**
 * A person by id, as a sentence names them — see `displayName`. '' when there is no id at all, so
 * an unaddressed guide reads as unaddressed. An id whose account row is gone still names somebody.
 */
function nameOf(people: Map<string, AccountRow>, id: string): string {
  if (!id) return "";
  const a = people.get(id);
  return displayName({ id, handle: a?.handle, name: a?.name });
}

/** A verdict or an ack, which carry their author's handle and name joined onto the row. */
const personName = (r: { account_id: string; handle: string; name: string }) =>
  r.account_id ? displayName({ id: r.account_id, handle: r.handle, name: r.name }) : "someone";

async function summaries(c: Ctx, rows: GuideRow[]) {
  const me = c.get("account");
  const base = origin(c);
  const teams = new Map((await myTeams(c)).map((t) => [t.id, t]));
  const people = await accounts(
    c,
    rows.flatMap((r) => [r.account_id, r.to_account_id]),
  );
  const pulls = await recentPulls(c, rows);
  const said = await verdicts(c, rows);
  const answered = await acks(c, rows);
  // One lookup for the page, not one per row. A guide handed to a group has to say which one, or
  // its row reads as a team-wide share and nobody treats it as theirs.
  const groupIds = [...new Set(rows.map((r) => r.to_group_id).filter(Boolean))];
  const groups = new Map<string, { slug: string; name: string }>();
  const groupRows = await inSlices(
    groupIds,
    0,
    async (slice, marks) =>
      (
        await c.env.DB.prepare(`SELECT id, slug, name FROM team_group WHERE id IN (${marks})`)
          .bind(...slice)
          .all<{ id: string; slug: string; name: string }>()
      ).results,
  );
  for (const g of groupRows) groups.set(g.id, { slug: g.slug, name: g.name.trim() || g.slug });
  // A row that belongs to a report says so by name, not by id: "part of Pre-release sweep" is a
  // link someone follows, and a bare eight characters is not.
  const reportIds = [...new Set(rows.map((r) => r.report_id).filter(Boolean))];
  const reportTitles = new Map<string, string>();
  const reportRows = await inSlices(
    reportIds,
    0,
    async (slice, marks) =>
      (
        await c.env.DB.prepare(`SELECT id, title FROM report WHERE id IN (${marks})`)
          .bind(...slice)
          .all<{ id: string; title: string }>()
      ).results,
  );
  for (const row of reportRows) reportTitles.set(row.id, row.title);
  // A guide that came out of another says so by name, the way a report row does: "follows
  // Migrating the worker" is a link somebody follows, and eight characters are not. Both lookups
  // are scoped to what this caller can read. A follow-up published into a team you are in must not
  // hand you the title of a parent from a team you are not in, and a count of children you cannot
  // open is a number about things you are not allowed to see.
  const readable =
    "(account_id = ? OR team_id IN (SELECT team_id FROM membership WHERE account_id = ?))";
  const parentIds = [...new Set(rows.map((r) => r.parent_id).filter(Boolean))];
  const parentTitles = new Map<string, string>();
  const parentRows = await inSlices(
    parentIds,
    2,
    async (slice, marks) =>
      (
        await c.env.DB.prepare(
          `SELECT id, title, share_key FROM guide WHERE id IN (${marks}) AND ${readable}`,
        )
          .bind(...slice, me, me)
          .all<{ id: string; title: string; share_key: string }>()
      ).results,
  );
  // The address as well as the title. "follows Migrating the worker" was a link into a hub search
  // for the parent's id, which finds it only when it happens to be in the list already loaded —
  // so from an inbox row, where the parent usually is not, it found nothing at all.
  const parentUrls = new Map<string, string>();
  for (const row of parentRows) {
    parentTitles.set(row.id, row.title);
    parentUrls.set(row.id, shareUrl(base, row));
  }
  const childCounts = new Map<string, number>();
  const childRows = await inSlices(
    rows.map((r) => r.id),
    2,
    async (slice, marks) =>
      (
        await c.env.DB.prepare(
          `SELECT parent_id, COUNT(*) AS n FROM guide
            WHERE parent_id IN (${marks}) AND status <> 'draft' AND ${readable}
            GROUP BY parent_id`,
        )
          .bind(...slice, me, me)
          .all<{ parent_id: string; n: number }>()
      ).results,
  );
  for (const row of childRows) childCounts.set(row.parent_id, Number(row.n));
  return rows.map((r) => {
    const heard = said.get(r.id) || [];
    // The latest word, plus whether anyone's standing verdict is still negative.
    const latest = heard[0];
    const answers = answered.get(r.id) || [];
    const own = answers.find((k) => k.account_id === me);
    return {
      id: r.id,
      title: r.title,
      status: r.status,
      created: r.created,
      updated: r.updated,
      source_context: r.source_context,
      // Normalised on the way out as well as the way in: a guide stored before there was a rule
      // has its old spelling in the column until its author publishes it again.
      tags: tagList(JSON.parse(r.tags)),
      stack_assumptions: JSON.parse(r.stack) as string[],
      pulls: r.pulls,
      url: shareUrl(base, r),
      mine: r.account_id === me,
      from: people.get(r.account_id)?.handle || "",
      from_name: nameOf(people, r.account_id),
      team: teams.get(r.team_id)?.slug || "",
      team_name: teams.get(r.team_id)?.name || "",
      to: people.get(r.to_account_id)?.handle || "",
      to_name: nameOf(people, r.to_account_id),
      // The group it was handed to, by name. A deleted group keeps its id on the row rather than
      // rewriting history to say it went nowhere, so this can be empty while the id is not.
      to_group: groups.get(r.to_group_id)?.slug || "",
      to_group_name: groups.get(r.to_group_id)?.name || "",
      for_me: r.to_account_id === me,
      report: r.report_id || "",
      report_title: reportTitles.get(r.report_id) || "",
      parent: r.parent_id || "",
      parent_title: parentTitles.get(r.parent_id) || "",
      parent_url: parentUrls.get(r.parent_id) || "",
      children: childCounts.get(r.id) || 0,
      area: r.area || "",
      severity: r.severity || "",
      // No fallback. Every row has a kind — migration 0023 backfilled the ones written before the
      // column, and every write since goes through parseMeta, which seeds it. A `|| "transfer"`
      // here would be this file restating a rule guide.js owns, and a second place to change.
      kind: r.kind,
      verdict: latest
        ? {
            ok: Boolean(latest.ok),
            by: latest.handle,
            by_name: personName(latest),
            note: latest.note,
            at: latest.at,
          }
        : null,
      failing: heard.some((v) => !v.ok),
      // The first word back, before any work: who said they are on it, and who passed. A decline
      // is carried in full — the reason is the whole reason to say no out loud, exactly as it is
      // for a failing verdict.
      taken_by: answers.filter((k) => k.taken).map((k) => k.handle || "someone"),
      // Parallel to `taken_by`, index for index: the same people, as a person reads them.
      taken_by_names: answers.filter((k) => k.taken).map(personName),
      declined: answers
        .filter((k) => !k.taken)
        .map((k) => ({ by: k.handle, by_name: personName(k), note: k.note, at: k.at })),
      // Your own standing answer, so the row can offer the other one rather than asking again.
      my_ack: own ? { taken: Boolean(own.taken), note: own.note, at: own.at } : null,
      pulled_by: (pulls.get(r.id) || []).map((p) => ({
        handle: p.handle,
        via: p.via,
        at: p.at,
      })),
    };
  });
}

// ---- auth -------------------------------------------------------------------------------

// Open routes: creating an account, and the three that exist precisely because you cannot
// authenticate yet.
const PUBLIC = new Set([
  // A description of the API is not a use of it, and an agent platform fetches this before it has
  // anywhere to put a credential.
  "GET /v1/openapi.json",
  // The token endpoint proves the client to itself, with PKCE or a client secret. It cannot sit
  // behind the credential it exists to issue.
  "POST /v1/oauth/token",
  // RFC 7009: a client handing a credential back must never be refused for not having one. Being
  // told no here would leave the token live, which is the opposite of what was asked for.
  "POST /v1/oauth/revoke",
  // RFC 7591: a client registers before anyone has a credential to give it. What it registers
  // grants nothing until a signed-in person approves it; see the route.
  "POST /v1/oauth/register",
  "POST /v1/accounts",
  "POST /v1/auth/signup",
  "POST /v1/auth/login",
  "POST /v1/auth/forgot",
  "POST /v1/auth/reset",
  // Open for the same reason as the two above — it exists to hand out a session, so it cannot ask
  // for one. It is the only entry here that does not exist in production: the route itself answers
  // 404 unless DEMO_LOGIN is "1" and the request is for localhost, so listing it costs nothing
  // where it is off.
  "POST /v1/auth/demo",
]);

/**
 * Reading one screenshot, which cannot be in `PUBLIC` because the path carries an id.
 *
 * A screenshot is evidence inside a guide, and a guide travels as markdown to anyone holding its
 * share key. An image behind a login does not render in the document it was pasted into — it
 * renders as a broken image, for the reader the evidence was for. The id is the secret, which is
 * the same bargain the share key already makes.
 */
const publicShot = (method: string, path: string) =>
  method === "GET" && /^\/v1\/shots\/[a-z0-9]+$/.test(path);

/**
 * Every billing webhook path, including the ones naming a provider we do not have.
 *
 * A prefix rather than the two exact paths in PUBLIC, because a webhook pointed at the wrong URL is
 * a real thing that happens while somebody is setting this up, and the middleware answering it with
 * "not signed in — sign in at /hub" sends whoever is reading the provider's delivery log to a
 * screen that has nothing to do with the problem. Letting it through costs nothing: the route
 * refuses an unknown provider, and a known one still has to carry a valid signature.
 */
const publicWebhook = (method: string, path: string) =>
  method === "POST" && path.startsWith("/v1/billing/webhook/");

/**
 * How the app tells its own dispatch apart from a request off the wire.
 *
 * The MCP tools work by calling this app's routes — one implementation of every rule, and it is
 * the route — but those calls are not new requests from a client. The caller was authenticated at
 * `/v1/mcp` before any tool ran, and re-presenting their credential on the inner call meant a
 * connector's token, scoped to the MCP endpoint, was refused by the scope check the moment a tool
 * reached `/v1/inbox`. Which is to say: with a connector, every tool failed.
 *
 * A symbol on the Request object, not a header. A header can be sent by anyone; a module-local
 * symbol cannot cross an HTTP boundary at all — the only way to have it is to be the code that put
 * it there.
 */
const INTERNAL = Symbol("passalong.internal.account");

type Marked = Record<symbol, unknown>;

/** Dispatch a request as an account this app has already authenticated. */
function asAccount(request: Request, account: string): Request {
  (request as unknown as Marked)[INTERNAL] = account;
  return request;
}

/**
 * A 401 that says which authorization server can fix it.
 *
 * RFC 9728: without this header a client that has no token knows only that it was refused. With
 * it, it can find the metadata, discover the endpoints and start a flow — which is what turns the
 * MCP endpoint into something a connector can be pointed at rather than something that has to be
 * explained.
 */
function unauthorizedResource(base: string, error: string, description: string): Response {
  return new Response(JSON.stringify({ message: description }), {
    status: 401,
    headers: {
      "content-type": "application/json",
      "www-authenticate":
        `Bearer realm="passalong", error="${error}", error_description="${description}", ` +
        `resource_metadata="${base}/.well-known/oauth-protected-resource"`,
    },
  });
}

/** Either credential proves the same thing, so every route below is unchanged by having two. */
app.use("/v1/*", async (c, next) => {
  // The app calling itself for someone it already authenticated. Checked first, because there is
  // nothing left to check: the credential was verified at the boundary this came from.
  const internal = (c.req.raw as unknown as Marked)[INTERNAL];
  if (typeof internal === "string" && internal) {
    c.set("account", internal);
    return next();
  }
  if (PUBLIC.has(`${c.req.method} ${c.req.path}`)) return next();
  if (publicShot(c.req.method, c.req.path)) return next();
  if (publicUpload(c.req.method, c.req.path)) return next();
  if (publicWebhook(c.req.method, c.req.path)) return next();

  const auth = c.req.header("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";

  // An OAuth access token, held by a connector rather than pasted by a person. It reaches what its
  // scope names and nothing else — which is the whole reason a connector gets one of these instead
  // of a copy of your API token.
  if (token.startsWith("pa_at_")) {
    const grant = await grantFor(c.env.DB, token);
    if (!grant) return unauthorizedResource(origin(c), "invalid_token", "token expired or revoked");
    if (grant.scope !== MCP_SCOPE || c.req.path !== "/v1/mcp") {
      return unauthorizedResource(
        origin(c),
        "insufficient_scope",
        `this grant reaches ${grant.scope} only`,
      );
    }
    c.executionCtx.waitUntil(
      c.env.DB.prepare("UPDATE oauth_token SET last_used = ? WHERE access_hash = ?")
        .bind(now(), grant.access_hash)
        .run()
        .then(
          () => {},
          () => {},
        ),
    );
    c.set("account", grant.account_id);
    return next();
  }

  if (token) {
    const row = await c.env.DB.prepare(
      "SELECT id, account_id FROM token WHERE hash = ? AND revoked = ''",
    )
      .bind(await sha256(token))
      .first<{ id: string; account_id: string }>();
    if (!row) {
      return c.req.path === "/v1/mcp"
        ? unauthorizedResource(origin(c), "invalid_token", "token not recognized, or revoked")
        : err(
            c,
            401,
            "That token isn't recognized, or it was revoked. Make a new one in your hub.",
          );
    }
    // A CLI too old to follow today's rules is refused here, on every call, because the refusal
    // is the one text its agent is sure to read (clients.ts). `/v1/mcp` is the hosted server,
    // which a token can also reach and which has no package to update.
    if (c.req.path !== "/v1/mcp") {
      const stale = tooOld(c.req.header(CLIENT_HEADER), c.req.header("user-agent"));
      if (stale) return err(c, 426, stale);
    }
    c.set("account", row.account_id);
    // Best effort, off the response path: knowing a token is unused is what makes it safe to
    // revoke. `executionCtx` throws where there is none, so this never speaks for itself.
    try {
      c.executionCtx.waitUntil(
        c.env.DB.prepare("UPDATE token SET last_used = ? WHERE id = ?").bind(now(), row.id).run(),
      );
    } catch {}
    return next();
  }

  const sid = readCookie(c.req.header("cookie"), SESSION_COOKIE);
  if (sid) {
    const row = await c.env.DB.prepare(
      "SELECT account_id FROM session WHERE hash = ? AND expires > ?",
    )
      .bind(await sha256(sid), now())
      .first<{ account_id: string }>();
    if (!row) return err(c, 401, "Your session has ended. Sign in again to carry on.");
    c.set("account", row.account_id);
    return next();
  }
  // A client with no credential at all is the ordinary first request to an MCP endpoint. Answering
  // it with a bare 401 tells it only that it was refused; answering with the challenge tells it
  // which authorization server can fix that, which is the whole point of publishing the metadata.
  if (c.req.path === "/v1/mcp") {
    return unauthorizedResource(origin(c), "invalid_request", "authorization required");
  }
  return err(c, 401, "You're not signed in. Sign in to carry on, or use a token from your hub.");
});

async function startSession(c: Ctx, account: string): Promise<string> {
  const sid = rand(40);
  await db(c)
    .prepare("INSERT INTO session (hash, account_id, created, expires) VALUES (?, ?, ?, ?)")
    .bind(await sha256(sid), account, now(), sessionExpiry())
    .run();
  return sessionCookie(sid, c.req.url);
}

app.post("/v1/accounts", async (c) => {
  if (c.env.ACCOUNT_LIMIT) {
    const ip = c.req.header("cf-connecting-ip") || "unknown";
    const { success } = await c.env.ACCOUNT_LIMIT.limit({ key: ip });
    if (!success)
      return err(c, 429, "Too many accounts were made from this address. Try again in a minute.");
  }
  const id = rid(10);
  const token = `pa_${rand(32)}`;
  await c.env.DB.batch([
    // token_hash is the retired identity column: NOT NULL UNIQUE, read by nothing. See 0005.
    c.env.DB.prepare("INSERT INTO account (id, created, token_hash) VALUES (?, ?, ?)").bind(
      id,
      now(),
      `retired:${rid(24)}`,
    ),
    c.env.DB.prepare(
      "INSERT INTO token (id, account_id, name, hash, created) VALUES (?, ?, ?, ?, ?)",
    ).bind(rid(10), id, "first token", await sha256(token), now()),
  ]);
  count(c, "account_created", { kind: "anonymous" });
  return c.json({ account: id, token }, 201);
});

// ---- signing in -------------------------------------------------------------------------

const cred = async (c: { req: { json: () => Promise<unknown> } }) => {
  const b = (await c.req.json().catch(() => ({}))) as { email?: string; password?: string };
  return { email: (b.email || "").trim().toLowerCase(), password: b.password || "" };
};

/** Same shape whatever went wrong: which half of a login failed is not the caller's business. */
const BAD_LOGIN =
  "That email and password don't match. Try again, or use Forgot your password? to set a new one.";

/** Every place a password is set runs the same two checks: long enough, and not already public. */
async function passwordRefusal(password: string): Promise<string | null> {
  const problem = passwordProblem(password);
  if (problem) return problem;
  if (await isBreached(password))
    return "That password has shown up in a public list of leaked passwords. Choose a different one.";
  return null;
}

app.post("/v1/auth/signup", async (c) => {
  if (c.env.ACCOUNT_LIMIT) {
    const ip = c.req.header("cf-connecting-ip") || "unknown";
    const { success } = await c.env.ACCOUNT_LIMIT.limit({ key: ip });
    if (!success) return err(c, 429, "Too many sign-ups from this address. Try again in a minute.");
  }
  const { email, password } = await cred(c);
  if (!EMAIL_RE.test(email)) return err(c, 400, NOT_AN_EMAIL);
  const refusal = await passwordRefusal(password);
  if (refusal) return err(c, 400, refusal);
  const taken = await c.env.DB.prepare("SELECT id FROM account WHERE email = ?")
    .bind(email)
    .first();
  if (taken)
    return err(
      c,
      409,
      "There's already an account with that email. Sign in with it instead, or use a different email.",
    );

  const id = rid(10);
  await c.env.DB.prepare(
    "INSERT INTO account (id, created, email, password_hash, token_hash) VALUES (?, ?, ?, ?, ?)",
  )
    .bind(id, now(), email, await hashPassword(password), `retired:${rid(24)}`)
    .run();
  count(c, "account_created", { kind: "password" });
  return c.json({ account: id, email }, 201, { "set-cookie": await startSession(c, id) });
});

app.post("/v1/auth/login", async (c) => {
  const { email, password } = await cred(c);
  const row = await c.env.DB.prepare(
    "SELECT id, password_hash FROM account WHERE email = ? AND password_hash <> ''",
  )
    .bind(email)
    .first<{ id: string; password_hash: string }>();
  // Hash anyway when there is no such account, so a missing email is not faster than a wrong
  // password.
  const ok = await verifyPassword(password, row ? row.password_hash : await decoyHash());
  if (!row || !ok) return err(c, 401, BAD_LOGIN);
  return c.json({ account: row.id }, 200, { "set-cookie": await startSession(c, row.id) });
});

/**
 * A signed-in account in one click, for working on the hub locally without making one.
 *
 * Two gates, and both have to hold. `DEMO_LOGIN` must be "1", and it is in no wrangler.jsonc, so
 * production has no such route to reach. The request must also be for localhost, so the var alone
 * is not enough if it ever escapes a .dev.vars into somewhere real. Either one missing answers 404
 * rather than 403: a door that is not open should not announce that it exists.
 *
 * Every call mints a NEW empty account. It is a scratch account and the point of it is starting
 * from nothing — reusing one would accumulate whatever the last session was testing, which is the
 * thing it exists to avoid. They pile up in the local database, which is local.
 *
 * The account has no email and no password: the session cookie is the whole of it, and nothing
 * can sign in as it again once that cookie is gone. It is the only thing left that makes one —
 * `passalong login` asks for an email and a password now, and so does the invite page.
 */
app.post("/v1/auth/demo", async (c) => {
  const host = new URL(c.req.url).hostname;
  const local = host === "localhost" || host === "127.0.0.1" || host === "[::1]" || host === "::1";
  if (c.env.DEMO_LOGIN !== "1" || !local) return c.notFound();
  const id = rid(10);
  await c.env.DB.prepare("INSERT INTO account (id, created, token_hash) VALUES (?, ?, ?)")
    .bind(id, now(), `retired:${rid(24)}`)
    .run();
  return c.json({ account: id, demo: true }, 201, { "set-cookie": await startSession(c, id) });
});

app.post("/v1/auth/logout", async (c) => {
  const sid = readCookie(c.req.header("cookie"), SESSION_COOKIE);
  if (sid)
    await c.env.DB.prepare("DELETE FROM session WHERE hash = ?")
      .bind(await sha256(sid))
      .run();
  return c.json({ ok: true }, 200, { "set-cookie": clearCookie(c.req.url) });
});

/**
 * Claiming an account, or changing the password on one. Anonymous accounts — the ones `passalong
 * login` and invite links used to create — start with no email and no password; this is how they
 * become something you can sign in to. Both ask up front now, so what is left here is the accounts
 * made before that, which still need a way in.
 */
app.post("/v1/auth/password", async (c) => {
  const account = c.get("account");
  const { email, password } = await cred(c);
  const me = await c.env.DB.prepare("SELECT email, password_hash FROM account WHERE id = ?")
    .bind(account)
    .first<{ email: string; password_hash: string }>();
  const refusal = await passwordRefusal(password);
  if (refusal) return err(c, 400, refusal);
  const address = email || me?.email || "";
  if (!EMAIL_RE.test(address))
    return err(c, 400, "Add an email address so you can sign in with your password.");
  if (address !== me?.email) {
    const taken = await c.env.DB.prepare("SELECT id FROM account WHERE email = ? AND id <> ?")
      .bind(address, account)
      .first();
    if (taken)
      return err(
        c,
        409,
        "Another account already uses that email. Sign in with that email instead, or use a different one.",
      );
  }
  await c.env.DB.prepare("UPDATE account SET email = ?, password_hash = ? WHERE id = ?")
    .bind(address, await hashPassword(password), account)
    .run();
  // Changing a password ends every other session; a stolen one should not outlive the change.
  await c.env.DB.prepare("DELETE FROM session WHERE account_id = ?").bind(account).run();
  return c.json({ email: address }, 200, { "set-cookie": await startSession(c, account) });
});

app.post("/v1/auth/forgot", async (c) => {
  const { email } = await cred(c);
  const row = await c.env.DB.prepare("SELECT id FROM account WHERE email = ? AND email <> ''")
    .bind(email)
    .first<{ id: string }>();
  if (row) {
    const code = rand(40);
    await c.env.DB.prepare(
      "INSERT INTO reset (hash, account_id, created, expires) VALUES (?, ?, ?, ?)",
    )
      .bind(
        await sha256(code),
        row.id,
        now(),
        new Date(Date.now() + 3600e3).toISOString(), // an hour is long enough to read an email
      )
      .run();
    await sendReset(c.env, { to: email, url: `${origin(c)}/reset#${code}` });
  }
  // Always the same answer: this endpoint must not say whether an address has an account.
  return c.json({ sent: true });
});

app.post("/v1/auth/reset", async (c) => {
  const b = (await c.req.json().catch(() => ({}))) as { code?: string; password?: string };
  const refusal = await passwordRefusal(b.password || "");
  if (refusal) return err(c, 400, refusal);
  const hash = await sha256(b.code || "");
  const row = await c.env.DB.prepare(
    "SELECT account_id FROM reset WHERE hash = ? AND used = '' AND expires > ?",
  )
    .bind(hash, now())
    .first<{ account_id: string }>();
  if (!row)
    return err(
      c,
      400,
      "That reset link has expired or was already used. Ask for a new one from the sign-in page.",
    );
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE account SET password_hash = ? WHERE id = ?").bind(
      await hashPassword(b.password as string),
      row.account_id,
    ),
    c.env.DB.prepare("UPDATE reset SET used = ? WHERE hash = ?").bind(now(), hash),
    // Whoever was signed in before the reset should not still be.
    c.env.DB.prepare("DELETE FROM session WHERE account_id = ?").bind(row.account_id),
  ]);
  return c.json({ ok: true }, 200, { "set-cookie": await startSession(c, row.account_id) });
});

// ---- tokens -----------------------------------------------------------------------------

// A token is a credential for one CLI or MCP server, not the account. Named so you can tell them
// apart, and revocable so a leaked laptop does not cost you everything.
app.get("/v1/tokens", async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT id, name, created, last_used FROM token
     WHERE account_id = ? AND revoked = '' ORDER BY created DESC`,
  )
    .bind(c.get("account"))
    .all();
  return c.json({ tokens: results });
});

app.post("/v1/tokens", async (c) => {
  const { name } = (await c.req.json().catch(() => ({}))) as { name?: string };
  const label = (name || "").trim().slice(0, 60) || "untitled";
  const token = `pa_${rand(32)}`;
  const id = rid(10);
  await c.env.DB.prepare(
    "INSERT INTO token (id, account_id, name, hash, created) VALUES (?, ?, ?, ?, ?)",
  )
    .bind(id, c.get("account"), label, await sha256(token), now())
    .run();
  // The only time the plaintext exists outside the caller's machine.
  return c.json({ id, name: label, token }, 201);
});

app.delete("/v1/tokens/:id", async (c) => {
  const { meta } = await c.env.DB.prepare(
    "UPDATE token SET revoked = ? WHERE id = ? AND account_id = ? AND revoked = ''",
  )
    .bind(now(), c.req.param("id"), c.get("account"))
    .run();
  if (!meta.changes) return err(c, 404, "That token doesn't exist or was already revoked.");
  return c.json({ id: c.req.param("id"), revoked: true });
});

// ---- giving a plan away (migrations/0026_gifts.sql) --------------------------------------------
//
// The operator's own routes, and the only ones in the product that are not about guides. They are
// here rather than in a separate admin service because there is one deployment and one database,
// and a second Worker to run three statements would be a system to maintain for the rest of time.
//
// `ADMIN_ACCOUNTS` is the whole of the gate. Unset — which is what every deployment that has not
// been told otherwise has — means these routes answer 404 to everyone, so nothing about them is
// discoverable on a deployment that does not use them.

/** 404, not 403: an operator route nobody is the operator of does not exist as far as callers go. */
async function operator(c: Ctx & { env: Env }): Promise<string | null> {
  const account = c.get("account");
  return (await isAdmin(c.env.DB, c.env.ADMIN_ACCOUNTS, account)) ? account : null;
}

/**
 * Who the role itself answers to: only an account the deployment names in `ADMIN_ACCOUNTS`.
 *
 * A super runs the product and cannot decide who else may, so an admin session left open cannot
 * leave a permanent second owner behind. Changing that list is changing the deployment, which is
 * the point: it is the one act in the product that no session can perform.
 *
 * A super who is not the owner is told why; anybody else still gets the 404 that says nothing.
 */
async function platformOwner(
  c: Ctx & { env: Env },
): Promise<{ id: string } | { refuse: 403 | 404 }> {
  const account = c.get("account");
  if (isPlatformOwner(c.env.ADMIN_ACCOUNTS, account)) return { id: account };
  return { refuse: (await operator(c)) ? 403 : 404 };
}

// What happened and what to do about it. Why it works this way is in platformOwner() above; an
// error is not where somebody wants the reasoning.
const NOT_THE_OWNER =
  "Only the owner account can add or remove an admin. Add your id to ADMIN_ACCOUNTS on the " +
  "deployment, or ask whoever can.";

/**
 * Make an account that exists to run the product, and hand back the two ways into it.
 *
 * A separate account on purpose: admin work is then never done by the account that also publishes
 * guides, so a compromised working session cannot comp anybody, and the log of who did what says
 * which hat was on. It signs in like any other account — that is the whole point of the role being
 * a column — so nothing new is issued and nothing new can leak: a token for the CLI, and a link to
 * set a password for the hub, each shown exactly once.
 *
 * The link is the existing password-reset link, because "set your first password" and "set a new
 * one" are the same act against the same table, and a second one-time-code path is a second place
 * for an expiry bug to live.
 */
app.post("/v1/admin/accounts", async (c) => {
  const owner = await platformOwner(c);
  if ("refuse" in owner)
    return err(c, owner.refuse, owner.refuse === 403 ? NOT_THE_OWNER : "Not found.");
  const by = owner.id;
  const { email } = (await c.req.json().catch(() => ({}))) as { email?: string };
  const address = (email || "").trim().toLowerCase();
  if (!EMAIL_RE.test(address)) return err(c, 400, NOT_AN_EMAIL);
  const taken = await c.env.DB.prepare("SELECT id FROM account WHERE email = ?")
    .bind(address)
    .first();
  if (taken)
    return err(
      c,
      409,
      "There's already an account with that email. Make the existing one a super instead.",
    );

  const id = rid(10);
  const token = `pa_${rand(32)}`;
  const code = rand(40);
  const at = now();
  await c.env.DB.batch([
    // token_hash is the retired identity column, as in POST /v1/accounts. See migration 0005.
    c.env.DB.prepare(
      `INSERT INTO account (id, created, token_hash, email, role, role_since, role_by)
       VALUES (?, ?, ?, ?, 'super', ?, ?)`,
    ).bind(id, at, `retired:${rid(24)}`, address, at, by),
    c.env.DB.prepare(
      "INSERT INTO token (id, account_id, name, hash, created) VALUES (?, ?, ?, ?, ?)",
    ).bind(rid(10), id, "admin cli", await sha256(token), at),
    c.env.DB.prepare(
      "INSERT INTO reset (hash, account_id, created, expires) VALUES (?, ?, ?, ?)",
    ).bind(await sha256(code), id, at, new Date(Date.now() + 24 * 3600e3).toISOString()),
  ]);
  // Mailed as well when the deployment can send, so the person it is for gets it without the
  // operator copying a link out of a terminal into a chat window.
  await sendReset(c.env, { to: address, url: `${origin(c)}/reset#${code}` }).catch(() => {});
  count(c, "account_created", { kind: "super" });
  return c.json(
    {
      account: id,
      email: address,
      role: "super",
      token,
      // A day, not an hour: this one is handed over rather than clicked on the spot.
      password_url: `${origin(c)}/reset#${code}`,
      expires: new Date(Date.now() + 24 * 3600e3).toISOString(),
    },
    201,
  );
});

/**
 * Who somebody might mean, for the fields that ask for a person or a team.
 *
 * Operator-only like the rest: this searches every account on the deployment, which is nobody
 * else's business. It is deliberately not the team picker — a plan is given to a customer, who is
 * in no team of yours.
 */
app.get("/v1/admin/people", async (c) => {
  if (!(await operator(c))) return err(c, 404, "Not found.");
  return c.json(await findPeople(c.env.DB, c.req.query("q") || ""));
});

/** Who runs the product. */
app.get("/v1/admin/accounts", async (c) => {
  if (!(await operator(c))) return err(c, 404, "Not found.");
  return c.json({ supers: await superAccounts(c.env.DB) });
});

/** Make an account that already exists a super. */
app.put("/v1/admin/accounts/:id", async (c) => {
  const owner = await platformOwner(c);
  if ("refuse" in owner)
    return err(c, owner.refuse, owner.refuse === 403 ? NOT_THE_OWNER : "Not found.");
  const by = owner.id;
  const who = await findSubject(c.env.DB, c.req.param("id"));
  if (!who || who.kind !== "account") return err(c, 404, `no account "${c.req.param("id")}"`);
  await makeSuper(c.env.DB, { account: who.id, by, at: now() });
  return c.json({ account: who.id, name: who.name, role: "super" });
});

/** Take the role back. The account keeps everything else it has. */
app.delete("/v1/admin/accounts/:id", async (c) => {
  const owner = await platformOwner(c);
  if ("refuse" in owner)
    return err(c, owner.refuse, owner.refuse === 403 ? NOT_THE_OWNER : "Not found.");
  const by = owner.id;
  const who = await findSubject(c.env.DB, c.req.param("id"));
  if (!who || who.kind !== "account") return err(c, 404, `no account "${c.req.param("id")}"`);
  const r = await unSuper(c.env.DB, { account: who.id, by, at: now() });
  if ("error" in r) return err(c, r.status, r.error);
  return c.json({ account: who.id, name: who.name, role: "" });
});

/** Give Solo to a person or Team to a team, until a date. */
app.post("/v1/admin/gifts", async (c) => {
  const by = await operator(c);
  if (!by) return err(c, 404, "Not found.");
  const body = (await c.req.json().catch(() => ({}))) as {
    to?: string;
    until?: string;
    why?: string;
    seats?: number;
  };
  const given = await gift(c.env.DB, {
    to: String(body.to ?? ""),
    until: String(body.until ?? ""),
    why: String(body.why ?? ""),
    seats: Number(body.seats ?? 0),
    by,
    at: now(),
  });
  if ("error" in given) return err(c, given.status, given.error);
  count(c, "plan_gifted", { kind: given.subject.kind });
  return c.json({
    id: given.id,
    to: given.subject.name,
    kind: given.subject.kind,
    plan: given.subject.kind === "account" ? "solo" : "team",
    until: given.until,
    seats: given.seats,
  });
});

/** What has been given, newest first, and whether each one is still doing anything. */
app.get("/v1/admin/gifts", async (c) => {
  if (!(await operator(c))) return err(c, 404, "Not found.");
  return c.json({ gifts: await gifts(c.env.DB, { at: now() }) });
});

/** Take one back. The plan goes to `lapsed`; a subscription bought since is left alone. */
app.delete("/v1/admin/gifts/:id", async (c) => {
  if (!(await operator(c))) return err(c, 404, "Not found.");
  const r = await revokeGift(c.env.DB, c.req.param("id"), { at: now() });
  if ("error" in r) return err(c, r.status, r.error);
  count(c, "plan_gift_revoked", {});
  return c.json({ id: c.req.param("id"), revoked: true });
});

// ---- identity ---------------------------------------------------------------------------

app.get("/v1/me", async (c) => {
  const account = c.get("account");
  const me = await c.env.DB.prepare(
    "SELECT id, handle, name, email, password_hash, plan, plan_until, role FROM account WHERE id = ?",
  )
    .bind(account)
    .first<
      AccountRow & { password_hash: string; plan: string; plan_until: string; role: string }
    >();
  // A gift that has run out is `lapsed` here too, so the hub says what the ceiling already does.
  const ownPlan = planNow(me?.plan || "free", me?.plan_until, now());
  const room = await quota(c, account);
  // The plan rides along with the team it belongs to. Without it the hub would have to fetch every
  // team to find out why a limit vanished, and the banner that explains the ceiling is drawn before
  // any team has been opened.
  const teams = (await myTeams(c)).map((t) => ({
    slug: t.slug,
    name: t.name,
    role: t.role,
    plan: t.plan,
  }));
  return c.json({
    account,
    handle: me?.handle || "",
    name: me?.name || "",
    display: displayName({ id: account, handle: me?.handle, name: me?.name }),
    email: me?.email || "",
    teams,
    // What is counted, not what exists: an archived guide takes up no room, so a warning drawn
    // from a total would have told people to delete things that were already out of the way.
    guides: room.used,
    limit: room.limit,
    // The name, because the number alone cannot say the difference between "no ceiling" and "may
    // sync nothing" — both of which would be a falsy `limit` to anything reading this.
    sync: room.plan,
    // This account's own subscription, which is a different fact from what it may sync: a member of
    // a paid team syncs without a ceiling and is still on `free` themselves.
    plan: ownPlan,
    // When it stops, and only for a plan that was given: a bought one ends when the provider says.
    plan_until: me?.plan_until || "",
    // '' for everybody who uses Passalong, 'super' for whoever runs it (migrations/0027_super.sql).
    // The hub draws the operator section from this; the routes check the database, not this field.
    role: (await isAdmin(c.env.DB, c.env.ADMIN_ACCOUNTS, account)) ? "super" : me?.role || "",
    // Whether this account may make or remove a super, which only the deployment's own list may
    // do. Named for what it permits rather than "owner", which already means something on a team.
    can_make_supers: isPlatformOwner(c.env.ADMIN_ACCOUNTS, account),
    unread: await unreadCount(c.env, account),
    // Whether this account can be signed in to, so the hub can offer to claim an anonymous one.
    // Never the hash itself.
    has_password: Boolean(me?.password_hash),
  });
});

/**
 * What this account has used of the free tier, and its ceiling.
 *
 * One function, two callers — `/v1/me`, which draws the warning, and the publish path, which
 * refuses the share. They were separate queries counting different things, so the interface
 * warned at a number the server did not enforce.
 */
async function quota(c: Ctx, account: string): Promise<{ used: number } & Ceiling> {
  const marks = COUNTED.map(() => "?").join(", ");
  const at = now();
  // `paid` is the whole of the plan's effect on an individual: being in one team that is currently
  // paying removes this account's ceiling. Asked here rather than stored on the account, so the
  // answer cannot be stale — see ceilingFor().
  const row = await c.env.DB.prepare(
    `SELECT (SELECT COUNT(*) FROM guide WHERE account_id = ? AND status IN (${marks})) AS used,
            (SELECT sync_limit FROM account WHERE id = ?) AS own,
            (SELECT grandfathered FROM account WHERE id = ?) AS old,
            (SELECT plan FROM account WHERE id = ?) AS own_plan,
            (SELECT plan_until FROM account WHERE id = ?) AS own_until,
            (SELECT COUNT(*) FROM membership m JOIN team t ON t.id = m.team_id
              WHERE m.account_id = ? AND t.plan = 'team'
                AND (t.plan_until = '' OR t.plan_until > ?)) AS paid`,
  )
    .bind(account, ...COUNTED, account, account, account, account, account, at)
    .first<{
      used: number;
      own: number;
      old: number;
      paid: number;
      own_plan: string;
      own_until: string;
    }>();
  return {
    used: row?.used ?? 0,
    ...ceilingFor(
      row?.paid,
      row?.own,
      c.env.FREE_SYNC_LIMIT,
      row?.old,
      c.env.FREE_SIGNUP,
      // The mirror of planNow(), because this one is a COUNT and cannot be done in TS: a team whose
      // gift has run out is not a team that is paying.
      planNow(row?.own_plan ?? "free", row?.own_until, at),
    ),
  };
}

app.patch("/v1/me", async (c) => {
  const account = c.get("account");
  const patch = (await c.req.json().catch(() => ({}))) as {
    handle?: string;
    name?: string;
    email?: string;
  };
  const sets: string[] = [];
  const binds: unknown[] = [];
  if (patch.handle !== undefined) {
    const h = patch.handle.trim().toLowerCase().replace(/^@/, "");
    if (!HANDLE_RE.test(h))
      return err(
        c,
        400,
        "Choose 2 to 31 letters, numbers or dashes, starting with a letter or number.",
      );
    const taken = await c.env.DB.prepare("SELECT id FROM account WHERE handle = ? AND id <> ?")
      .bind(h, account)
      .first();
    if (taken) return err(c, 409, `@${h} is already taken. Try another.`);
    sets.push("handle = ?");
    binds.push(h);
  }
  if (patch.name !== undefined) {
    sets.push("name = ?");
    binds.push(patch.name.trim().slice(0, 80));
  }
  if (patch.email !== undefined) {
    const e = patch.email.trim().toLowerCase();
    if (e && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return err(c, 400, NOT_AN_EMAIL);
    sets.push("email = ?");
    binds.push(e);
  }
  if (!sets.length)
    return err(c, 400, "There was nothing to save. Change your handle, name or email first.");
  await c.env.DB.prepare(`UPDATE account SET ${sets.join(", ")} WHERE id = ?`)
    .bind(...binds, account)
    .run();
  const me = await c.env.DB.prepare("SELECT id, handle, name, email FROM account WHERE id = ?")
    .bind(account)
    .first<AccountRow>();
  return c.json(me);
});

// ---- teams ------------------------------------------------------------------------------

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 30);
}

app.post("/v1/teams", async (c) => {
  const account = c.get("account");
  const { name } = (await c.req.json().catch(() => ({}))) as { name?: string };
  const clean = (name || "").trim().slice(0, 60);
  if (clean.length < 2) return err(c, 400, "Give the team a name at least 2 characters long.");
  let slug = slugify(clean);
  if (slug.length < 2) return err(c, 400, "A team name needs some letters or numbers in it.");
  for (let i = 2; i < 50; i++) {
    const taken = await c.env.DB.prepare("SELECT id FROM team WHERE slug = ?").bind(slug).first();
    if (!taken) break;
    slug = `${slugify(clean)}-${i}`;
  }
  const id = rid(10);
  const t = now();
  await c.env.DB.batch([
    c.env.DB.prepare(
      "INSERT INTO team (id, slug, name, created_by, created) VALUES (?, ?, ?, ?, ?)",
    ).bind(id, slug, clean, account, t),
    c.env.DB.prepare(
      "INSERT INTO membership (team_id, account_id, role, joined) VALUES (?, ?, 'owner', ?)",
    ).bind(id, account, t),
  ]);
  count(c, "team_created");
  return c.json({ id, slug, name: clean, role: "owner" }, 201);
});

app.get("/v1/teams", async (c) => {
  const teams = await myTeams(c);
  return c.json({ teams: teams.map((t) => ({ slug: t.slug, name: t.name, role: t.role })) });
});

app.get("/v1/teams/:slug", async (c) => {
  const team = await teamBySlug(c, c.req.param("slug"));
  if (!team) return err(c, 404, "You're not in that team any more, or it was deleted.");
  const { results: members } = await c.env.DB.prepare(
    `SELECT a.id, a.handle, a.name, m.role, m.joined FROM membership m JOIN account a ON a.id = m.account_id
     WHERE m.team_id = ? ORDER BY m.joined`,
  )
    .bind(team.id)
    .all<{ id: string; handle: string; name: string; role: string; joined: string }>();
  const n = await c.env.DB.prepare("SELECT COUNT(*) AS n FROM guide WHERE team_id = ?")
    .bind(team.id)
    .first<{ n: number }>();
  const chCount = await c.env.DB.prepare("SELECT COUNT(*) AS n FROM team_channel WHERE team_id = ?")
    .bind(team.id)
    .first<{ n: number }>();
  return c.json({
    slug: team.slug,
    name: team.name,
    role: team.role,
    created: team.created,
    // `display` is what a sentence calls them; the id is already what it falls back to.
    members: members.map((m) => ({ ...m, display: displayName(m) })),
    guides: n?.n ?? 0,
    channels: chCount?.n ?? 0,
    plan: team.plan,
    // Zero seats on a free plan is not "no room" — seats are simply not what limits that team, so
    // the client reads the plan first. Never the subscription id: it is the provider's handle on a
    // paying customer and nothing in a browser needs it.
    seats: team.seats,
    members_count: members.length,
  });
});

/**
 * A team's channels. Owners only, because a channel is a credential for a room.
 *
 * The URL is never read back — anyone holding it can post there, so it is written and then only
 * ever named. What the screen gets instead is whether each one is currently failing, which is the
 * question a list of channels actually has to answer.
 */
app.get("/v1/teams/:slug/channels", async (c) => {
  const team = await teamBySlug(c, c.req.param("slug"));
  if (!team) return err(c, 404, "You're not in that team any more, or it was deleted.");
  const { results } = await c.env.DB.prepare(
    `SELECT id, name, created, failures, last_error, substr(url, 1, 40) AS hint
     FROM team_channel WHERE team_id = ? ORDER BY created`,
  )
    .bind(team.id)
    .all();
  // A leading fragment, not the URL: enough to tell two channels apart at a glance, far short of
  // enough to post to either.
  return c.json({
    channels: results.map((r) => {
      const row = r as Record<string, unknown>;
      const hint = String(row.hint || "");
      let host = "";
      try {
        host = new URL(`${hint}`).hostname;
      } catch {
        host = "";
      }
      return { ...row, hint: undefined, host };
    }),
  });
});

app.post("/v1/teams/:slug/channels", async (c) => {
  const team = await teamBySlug(c, c.req.param("slug"));
  if (!team) return err(c, 404, "You're not in that team any more, or it was deleted.");
  if (team.role !== "owner")
    return err(c, 403, "Only the team's owner can change its channels. Ask them to do it.");
  const body = await c.req
    .json<{ name?: string; url?: string }>()
    .catch(() => ({}) as { name?: string; url?: string });

  const url = String(body.url ?? "").trim();
  if (!webhookAllowed(url)) {
    return err(
      c,
      400,
      "Paste the full webhook address from Slack, Discord or Google Chat. It should start with https://.",
    );
  }
  const { n } = (await c.env.DB.prepare("SELECT COUNT(*) AS n FROM team_channel WHERE team_id = ?")
    .bind(team.id)
    .first<{ n: number }>()) ?? { n: 0 };
  if (n >= 8) return err(c, 400, "A team can have up to 8 channels. Remove one to add another.");

  const id = rid(12);
  await c.env.DB.prepare(
    "INSERT INTO team_channel (id, team_id, name, url, created, created_by) VALUES (?, ?, ?, ?, ?, ?)",
  )
    .bind(id, team.id, String(body.name || "").slice(0, 60), url, now(), c.get("account"))
    .run();
  return c.json({ channel: { id, name: body.name || "" } }, 201);
});

app.delete("/v1/teams/:slug/channels/:id", async (c) => {
  const team = await teamBySlug(c, c.req.param("slug"));
  if (!team) return err(c, 404, "You're not in that team any more, or it was deleted.");
  if (team.role !== "owner")
    return err(c, 403, "Only the team's owner can change its channels. Ask them to do it.");
  const { meta } = await c.env.DB.prepare("DELETE FROM team_channel WHERE id = ? AND team_id = ?")
    .bind(c.req.param("id"), team.id)
    .run();
  if (!meta.changes)
    return err(c, 404, "That channel has already been removed. Refresh to see the current list.");
  return c.json({ id: c.req.param("id"), removed: true });
});

/** Post a line to one channel so someone can watch it arrive. Owners only. */
app.post("/v1/teams/:slug/channels/:id/test", async (c) => {
  const team = await teamBySlug(c, c.req.param("slug"));
  if (!team) return err(c, 404, "You're not in that team any more, or it was deleted.");
  if (team.role !== "owner") return err(c, 403, "Only the team's owner can test its channels.");
  const channel = await c.env.DB.prepare(
    "SELECT id, url, failures FROM team_channel WHERE id = ? AND team_id = ?",
  )
    .bind(c.req.param("id"), team.id)
    .first<{ id: string; url: string; failures: number }>();
  if (!channel)
    return err(c, 404, "That channel has already been removed. Refresh to see the current list.");
  const result = await post(
    c.env,
    channel,
    `Passalong is connected to ${team.name}. You'll see guides being sent and answered here.`,
  );
  // The channel's own answer, because "it did not arrive" is otherwise unattributable.
  return c.json({ delivered: result.ok, status: result.status, error: result.error });
});

/**
 * A team's groups: the people who do a thing, addressable as one.
 *
 * Readable by any member, because everyone needs to know who `#frontend` is before handing
 * something to it. Changed by owners only, for the same reason the member list is theirs — an
 * address that anyone can redirect is not an address.
 */
app.get("/v1/teams/:slug/groups", async (c) => {
  const team = await teamBySlug(c, c.req.param("slug"));
  if (!team) return err(c, 404, "You're not in that team any more, or it was deleted.");
  const { results } = await c.env.DB.prepare(
    `SELECT g.id, g.slug, g.name, g.created, COALESCE(a.handle, '') AS handle
     FROM team_group g
     LEFT JOIN group_member gm ON gm.group_id = g.id
     LEFT JOIN account a ON a.id = gm.account_id
     WHERE g.team_id = ? ORDER BY g.slug, a.handle`,
  )
    .bind(team.id)
    .all<{ id: string; slug: string; name: string; created: string; handle: string }>();
  // One row per membership comes back; the screen wants one row per group with its people on it.
  const byId = new Map<
    string,
    { id: string; slug: string; name: string; created: string; members: string[] }
  >();
  for (const r of results) {
    const g = byId.get(r.id) ?? {
      id: r.id,
      slug: r.slug,
      name: r.name,
      created: r.created,
      members: [],
    };
    if (r.handle) g.members.push(r.handle);
    byId.set(r.id, g);
  }
  return c.json({ groups: [...byId.values()] });
});

app.post("/v1/teams/:slug/groups", async (c) => {
  const team = await teamBySlug(c, c.req.param("slug"));
  if (!team) return err(c, 404, "You're not in that team any more, or it was deleted.");
  if (team.role !== "owner")
    return err(c, 403, "Only the team's owner can change its groups. Ask them to do it.");
  const body = await c.req
    .json<{ slug?: string; name?: string }>()
    .catch(() => ({}) as { slug?: string; name?: string });
  // The same normalisation a tag gets, because this is written by hand in frontmatter and two
  // spellings of one group is two addresses that look like one.
  const wanted = tag(body.slug ?? "");
  if (!wanted) return err(c, 400, "Give the group a name using letters, numbers and dashes.");
  const { n } = (await c.env.DB.prepare("SELECT COUNT(*) AS n FROM team_group WHERE team_id = ?")
    .bind(team.id)
    .first<{ n: number }>()) ?? { n: 0 };
  if (n >= 20) return err(c, 400, "A team can have up to 20 groups. Remove one to add another.");
  const id = rid(12);
  const made = await c.env.DB.prepare(
    "INSERT INTO team_group (id, team_id, slug, name, created) VALUES (?, ?, ?, ?, ?) ON CONFLICT DO NOTHING",
  )
    .bind(id, team.id, wanted, String(body.name || "").slice(0, 60), now())
    .run();
  if (!made.meta.changes)
    return err(
      c,
      409,
      `${team.name} already has a group called #${wanted}. Choose a different name.`,
    );
  return c.json({ group: { id, slug: wanted, name: body.name || "", members: [] } }, 201);
});

/**
 * Replace a group's membership in one call.
 *
 * Set semantics rather than add/remove: "who is in #frontend" is a list somebody edits, and two
 * endpoints racing over one list is how a person ends up half-added.
 */
app.put("/v1/teams/:slug/groups/:id/members", async (c) => {
  const team = await teamBySlug(c, c.req.param("slug"));
  if (!team) return err(c, 404, "You're not in that team any more, or it was deleted.");
  if (team.role !== "owner")
    return err(c, 403, "Only the team's owner can change its groups. Ask them to do it.");
  const group = await c.env.DB.prepare("SELECT id FROM team_group WHERE id = ? AND team_id = ?")
    .bind(c.req.param("id"), team.id)
    .first<{ id: string }>();
  if (!group) return err(c, 404, "That group has been removed. Refresh to see the current groups.");
  const body = await c.req
    .json<{ handles?: string[] }>()
    .catch(() => ({}) as { handles?: string[] });
  const handles = [
    ...new Set((body.handles ?? []).map((h: string) => String(h).replace(/^@/, "").toLowerCase())),
  ].slice(0, 100);

  // Only people already in the team. A group is a subset of a team, never a way into one.
  const found = handles.length
    ? (
        await c.env.DB.prepare(
          `SELECT a.id, a.handle FROM account a JOIN membership m ON m.account_id = a.id
           WHERE m.team_id = ? AND a.handle IN (${handles.map(() => "?").join(",")})`,
        )
          .bind(team.id, ...handles)
          .all<{ id: string; handle: string }>()
      ).results
    : [];
  const missing = handles.filter((h) => !found.some((f) => f.handle === h));
  if (missing.length)
    return err(
      c,
      400,
      `${missing.map((h) => `@${h}`).join(", ")} ${missing.length === 1 ? "isn't" : "aren't"} ` +
        `in ${team.name}. Invite them to the team first.`,
    );

  const writes = [c.env.DB.prepare("DELETE FROM group_member WHERE group_id = ?").bind(group.id)];
  for (const f of found) {
    writes.push(
      c.env.DB.prepare("INSERT INTO group_member (group_id, account_id) VALUES (?, ?)").bind(
        group.id,
        f.id,
      ),
    );
  }
  await c.env.DB.batch(writes);
  return c.json({ id: group.id, members: found.map((f) => f.handle) });
});

app.delete("/v1/teams/:slug/groups/:id", async (c) => {
  const team = await teamBySlug(c, c.req.param("slug"));
  if (!team) return err(c, 404, "You're not in that team any more, or it was deleted.");
  if (team.role !== "owner")
    return err(c, 403, "Only the team's owner can change its groups. Ask them to do it.");
  // Guides already handed to it keep the id: the row says who it went to, and rewriting history
  // to say it went to nobody is a worse answer than naming a group that no longer exists.
  await c.env.DB.prepare("DELETE FROM team_group WHERE id = ? AND team_id = ?")
    .bind(c.req.param("id"), team.id)
    .run();
  return c.json({ id: c.req.param("id"), deleted: true });
});

app.post("/v1/teams/:slug/invites", async (c) => {
  const account = c.get("account");
  const team = await teamBySlug(c, c.req.param("slug"));
  if (!team) return err(c, 404, "You're not in that team any more, or it was deleted.");
  const { email } = (await c.req.json().catch(() => ({}))) as { email?: string };
  const to = (email || "").trim().toLowerCase();
  if (to && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return err(c, 400, NOT_AN_EMAIL);
  const code = rid(12);
  await c.env.DB.prepare(
    "INSERT INTO invite (code, team_id, email, created_by, created) VALUES (?, ?, ?, ?, ?)",
  )
    .bind(code, team.id, to, account, now())
    .run();
  const url = `${origin(c)}/join/${code}`;
  let mailed = false;
  if (to) {
    const me = (await accounts(c, [account])).get(account);
    mailed = await sendInvite(c.env, {
      to,
      team: team.name,
      by: displayName({ id: account, handle: me?.handle, name: me?.name }),
      url,
    });
  }
  return c.json({ code, url, email: to, mailed }, 201);
});

app.post("/v1/invites/:code/accept", async (c) => {
  const account = c.get("account");
  const code = c.req.param("code");
  const inv = await c.env.DB.prepare(
    "SELECT i.*, t.slug, t.name FROM invite i JOIN team t ON t.id = i.team_id WHERE i.code = ?",
  )
    .bind(code)
    .first<{
      team_id: string;
      slug: string;
      name: string;
      used_by: string;
      created_by: string;
    }>();
  if (!inv)
    return err(c, 404, "This invite doesn't work any more. Ask whoever sent it for a new link.");
  const already = await c.env.DB.prepare(
    "SELECT role FROM membership WHERE team_id = ? AND account_id = ?",
  )
    .bind(inv.team_id, account)
    .first<{ role: string }>();
  if (!already) {
    // Seats are counted where somebody joins, not where somebody pays. A count taken at checkout
    // is a count that drifts the first time a member leaves, and the drift is invisible until it
    // has been wrong for a month. An existing member re-opening their invite link is never
    // refused: they already occupy the seat this is protecting.
    const found = await c.env.DB.prepare(
      "SELECT t.plan, t.plan_until, t.seats," +
        " (SELECT COUNT(*) FROM membership WHERE team_id = t.id) AS members" +
        " FROM team t WHERE t.id = ?",
    )
      .bind(inv.team_id)
      .first<{ plan: string; plan_until: string; seats: number; members: number }>();
    const room = found ? asItStands(found, now()) : null;
    if (room && !acceptsNewWork(room.plan))
      return err(
        c,
        402,
        `${inv.name}'s plan has lapsed, so it isn't taking new members right now. ` +
          `Ask ${await ownerName(c, inv.team_id)} to renew it, then open this invite again.`,
      );
    if (room && seatsFull(room.plan, room.seats, room.members))
      return err(
        c,
        402,
        `${inv.name} is using all ${room.seats} of its seats. ` +
          `Ask ${await ownerName(c, inv.team_id)} to add a seat, then open this invite again.`,
      );
    await c.env.DB.batch([
      c.env.DB.prepare(
        "INSERT INTO membership (team_id, account_id, role, joined) VALUES (?, ?, 'member', ?)",
      ).bind(inv.team_id, account, now()),
      c.env.DB.prepare(
        "UPDATE invite SET used_by = ?, used = ? WHERE code = ? AND used_by = ''",
      ).bind(account, now(), code),
    ]);
    count(c, "member_joined");
    // Whoever sent the invite is the one waiting to hear it was taken up.
    await notify(c.env, {
      to: inv.created_by,
      kind: "joined",
      actor_id: account,
      team_id: inv.team_id,
    });
  }
  return c.json({
    slug: inv.slug,
    name: inv.name,
    role: already?.role || "member",
    joined: !already,
  });
});

// ---- guides -----------------------------------------------------------------------------

// ---- evidence ---------------------------------------------------------------------------

/**
 * A screenshot, stored so a guide can point at it.
 *
 * Evidence has to outlive the browser tab it was dropped into: a guide travels as markdown, an
 * image in markdown is a URL, and a `blob:` URL is meaningless to everyone but the person who
 * made it. So the bytes go in R2 and the issue's markdown carries `![alt](<origin>/v1/shots/id)`,
 * which the guide page already renders as a figure and its CSP already allows.
 *
 * The upload is raw bytes with a content-type, not multipart: there is one file per request and
 * parsing a multipart body to find it would be work in service of nothing.
 */
const SHOT_MAX = 5 * 1024 * 1024;

/**
 * Everything a guide points a screenshot from: its own markdown, and the evidence of every hand-in
 * on it. Both are documents somebody wrote, and either is reason enough to keep the file.
 */
async function carriedShots(c: Ctx, guide: string, markdown: string) {
  const said = await evidenceOn(c.env.DB, guide);
  return [...new Set([...shotIds(markdown), ...said.flatMap(shotIds)])];
}

/** The screenshots a document points at, claimed for it, and any it dropped let go. */
async function claimShots(c: Ctx, account: string, guide: string, markdown: string) {
  await holdShots(c.env.DB, {
    account,
    guide,
    mine: shotIds(markdown),
    carried: await carriedShots(c, guide, markdown),
  });
}

/**
 * The screenshots a hand-in's evidence points at, claimed for the guide it answers.
 *
 * Evidence is not markdown and lives on the claim, so nothing here was claiming it: a screenshot
 * referenced only from evidence stayed unowned, and the nightly sweep deleted it a day later —
 * leaving the one part of a hand-in a reviewer cannot reconstruct as a broken image.
 */
async function claimEvidenceShots(c: Ctx, account: string, guide: string, evidence: string) {
  const ids = shotIds(evidence);
  if (!ids.length) return;
  const row = await c.env.DB.prepare("SELECT markdown FROM guide WHERE id = ?")
    .bind(guide)
    .first<{ markdown: string }>();
  await holdShots(c.env.DB, {
    account,
    guide,
    mine: ids,
    carried: await carriedShots(c, guide, row?.markdown || ""),
  });
}

/**
 * Take a guide's evidence with it.
 *
 * R2 first: a bucket object with no row is invisible to everything and costs storage, while a row
 * with no object is a broken image on a page. If the delete half-fails, the second failure mode is
 * the one that is still recoverable.
 */
async function dropShots(c: Ctx, guide: string) {
  const { results } = await c.env.DB.prepare("SELECT id, type FROM shot WHERE guide_id = ?")
    .bind(guide)
    .all<{ id: string; type: string }>();
  if (!results.length) return;
  const bucket = c.env.SHOTS;
  if (bucket) {
    await bucket.delete(results.map((r) => shotKey(r.id, r.type))).catch(() => {
      // The rows go anyway. An object nothing points at is waste; a row pointing at nothing
      // that is gone would be worse.
    });
  }
  await c.env.DB.prepare("DELETE FROM shot WHERE guide_id = ?").bind(guide).run();
}

app.post("/v1/shots", async (c) => {
  const account = c.get("account");
  const bucket = c.env.SHOTS;
  if (!bucket) return err(c, 501, "Screenshots can't be uploaded here right now.");

  const type = (c.req.header("content-type") || "").split(";")[0]?.trim() || "";
  const ext = SHOT_TYPES[type];
  if (!ext) return err(c, 415, "That file isn't an image. Use a PNG, JPEG, WebP or GIF.");

  const body = await c.req.arrayBuffer();
  if (!body.byteLength) return err(c, 400, "That file is empty. Choose the image again.");
  if (body.byteLength > SHOT_MAX)
    return err(c, 413, "That image is over 5 MB. Use a smaller screenshot.");

  const shot = await storeShot(c, bucket, account, type, body, c.req.header("x-shot-name") || "");
  return c.json({ shot }, 201);
});

/**
 * Write one screenshot: the object, then the row that says whose it is. Shared by the direct
 * upload and the upload link, so there is one place a shot comes into being.
 */
async function storeShot(
  c: Ctx,
  bucket: R2Bucket,
  account: string,
  type: string,
  body: ArrayBuffer,
  name: string,
) {
  const id = rid(12);
  await bucket.put(shotKey(id, type), body, { httpMetadata: { contentType: type } });
  await c.env.DB.prepare(
    "INSERT INTO shot (id, account_id, guide_id, name, type, bytes, created) VALUES (?, ?, '', ?, ?, ?, ?)",
  )
    .bind(id, account, String(name).slice(0, 120), type, body.byteLength, now())
    .run();
  return { id, url: `${origin(c)}/v1/shots/${id}`, type, bytes: body.byteLength };
}

/**
 * Mint an upload link: somewhere an agent's sandbox can send an image it holds as a file.
 *
 * See uploads.ts for why this exists. Minting needs the account, because the link uploads as that
 * account; using it does not, because the thing using it has no credential. Spent and expired links
 * for the account are cleared here rather than on a cron — they are tiny, and this is the only
 * moment anything reads them.
 */
app.post("/v1/uploads", async (c) => {
  const account = c.get("account");
  if (!c.env.SHOTS) return err(c, 501, "Screenshots can't be uploaded here right now.");
  const body = (await c.req.json().catch(() => ({}))) as { name?: unknown };
  const at = now();
  await c.env.DB.prepare("DELETE FROM upload WHERE account_id = ? AND (expires <= ? OR used <> '')")
    .bind(account, at)
    .run();
  const open = await c.env.DB.prepare("SELECT COUNT(*) AS n FROM upload WHERE account_id = ?")
    .bind(account)
    .first<{ n: number }>();
  if (Number(open?.n || 0) >= UPLOAD_OPEN_MAX) {
    return err(
      c,
      429,
      "Too many upload links are open. Use one, or wait ten minutes for them to expire.",
    );
  }
  const token = `${UPLOAD_PREFIX}${rand(32)}`;
  const expires = new Date(Date.now() + UPLOAD_TTL_MS).toISOString();
  const name =
    typeof body.name === "string" ? body.name.replace(/[^\x20-\x7e]/g, "").slice(0, 120) : "";
  await c.env.DB.prepare(
    "INSERT INTO upload (hash, account_id, name, created, expires) VALUES (?, ?, ?, ?, ?)",
  )
    .bind(await sha256(token), account, name, at, expires)
    .run();
  return c.json({ upload_url: `${origin(c)}/v1/uploads/${token}`, expires }, 201);
});

/**
 * Send an image to an upload link. No credential: the link is the authorization, and the
 * middleware lets exactly this shape through (`publicUpload`).
 *
 * Everything that can be checked without the link is checked before the link is spent, so a wrong
 * file does not burn it. Spending is one conditional UPDATE, so two uploads racing for the same link
 * cannot both win.
 */
app.on(["PUT", "POST"], "/v1/uploads/:token", async (c) => {
  const token = c.req.param("token");
  if (!isUploadToken(token)) return c.notFound();
  const bucket = c.env.SHOTS;
  if (!bucket) return err(c, 501, "Screenshots can't be uploaded here right now.");

  const body = await c.req.arrayBuffer();
  if (!body.byteLength) return err(c, 400, "That file is empty. Check the path you sent.");
  if (body.byteLength > SHOT_MAX)
    return err(c, 413, "That image is over 5 MB. Use a smaller screenshot.");
  const type = sniffImage(body);
  if (!type) return err(c, 415, "That file isn't an image. Use a PNG, JPEG, WebP or GIF.");

  const at = now();
  const ticket = await c.env.DB.prepare(
    "UPDATE upload SET used = ? WHERE hash = ? AND used = '' AND expires > ? RETURNING account_id, name",
  )
    .bind(at, await sha256(token), at)
    .first<{ account_id: string; name: string }>();
  if (!ticket) {
    return err(c, 410, "That upload link has expired or was already used. Ask for a new one.");
  }
  const shot = await storeShot(c, bucket, ticket.account_id, type, body, ticket.name);
  const label = (ticket.name || "screenshot").replace(/[[\]]/g, "");
  return c.json({ shot, markdown: `![${label}](${shot.url})` }, 201);
});

/**
 * Served to anyone with the link, like the guide that embeds it. The id is the secret — a guide's
 * share key is the same bargain, and an image behind a login is an image that does not render in
 * the markdown the guide was pasted into.
 */
app.get("/v1/shots/:id", async (c) => {
  const bucket = c.env.SHOTS;
  const id = c.req.param("id");
  if (!bucket || !/^[a-z0-9]{6,16}$/.test(id)) return c.notFound();
  const row = await c.env.DB.prepare("SELECT type FROM shot WHERE id = ?")
    .bind(id)
    .first<{ type: string }>();
  if (!row) return c.notFound();
  const object = await bucket.get(shotKey(id, row.type));
  if (!object) return c.notFound();
  return new Response(object.body, {
    headers: {
      "content-type": row.type,
      "cache-control": "public, max-age=31536000, immutable",
      "content-security-policy": "default-src 'none'; sandbox",
      "x-content-type-options": "nosniff",
    },
  });
});

// ---- reports ----------------------------------------------------------------------------

/**
 * A report is a parent, and deliberately little else: a title, an environment, and who it went
 * to. Everything a reader acts on lives on the issues, because an issue is a guide and the whole
 * product already knows what to do with one.
 *
 * It exists at all for two reasons a tag could not cover: a set handed over together should
 * arrive together, and "6 issues across 3 areas" should survive one of them being fixed.
 */
app.post("/v1/reports", async (c) => {
  const account = c.get("account");
  const body = await c.req
    .json<{
      title?: string;
      environment?: string;
      team?: string;
      to?: string;
    }>()
    .catch(() => ({}) as Record<string, string>);

  let team: (TeamRow & { role: string }) | null = null;
  let toAccount: AccountRow | null = null;
  if (body.team) {
    team = await teamBySlug(c, String(body.team));
    if (!team)
      return err(
        c,
        400,
        `You're not in a team called "${body.team}". Check the name, or ask to be invited.`,
      );
  }
  if (body.to) {
    const handle = String(body.to).replace(/^@/, "").toLowerCase();
    if (!team)
      return err(
        c,
        400,
        "A report can only be sent to someone inside a team. Choose the team first.",
      );
    toAccount = await c.env.DB.prepare(
      `SELECT a.id, a.handle, a.name, a.email FROM account a JOIN membership m ON m.account_id = a.id
       WHERE a.handle = ? AND m.team_id = ?`,
    )
      .bind(handle, team.id)
      .first<AccountRow>();
    if (!toAccount)
      return err(
        c,
        400,
        `@${handle} isn't in ${team.name}. Check the handle, or invite them to the team first.`,
      );
  }

  const id = rid(8);
  const t = now();
  await c.env.DB.prepare(
    `INSERT INTO report (id, account_id, title, environment, team_id, to_account_id, created, updated)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      account,
      String(body.title || "").slice(0, 200),
      slug(body.environment, 16),
      team?.id || "",
      toAccount?.id || "",
      t,
      t,
    )
    .run();
  return c.json(
    { report: { id, title: body.title || "", environment: slug(body.environment, 16) } },
    201,
  );
});

/** One report and its issues, grouped the way they were filed. */
app.get("/v1/reports/:id", async (c) => {
  const account = c.get("account");
  const id = c.req.param("id");
  if (!ID_RE.test(id)) return err(c, 400, REPORT_GONE);
  const row = await c.env.DB.prepare("SELECT * FROM report WHERE id = ?")
    .bind(id)
    .first<ReportRow>();
  // A report you cannot see is one that does not exist: which reports an account has is not
  // something a 403 should confirm.
  if (!row) return err(c, 404, REPORT_GONE);
  const mine = row.account_id === account;
  const teams = await myTeams(c);
  const shared = row.team_id && teams.some((t) => t.id === row.team_id);
  if (!mine && !shared) return err(c, 404, REPORT_GONE);

  const { results } = await c.env.DB.prepare(
    "SELECT * FROM guide WHERE report_id = ? ORDER BY area, created",
  )
    .bind(id)
    .all<GuideRow>();
  return c.json({ report: await reportSummary(c, row, results) });
});

/**
 * The report's own fields, after the fact. Its issues are guides and are updated as guides; this
 * is only the parent — the title someone gave the sweep, and who it is for.
 */
app.patch("/v1/reports/:id", async (c) => {
  const account = c.get("account");
  const id = c.req.param("id");
  if (!ID_RE.test(id)) return err(c, 400, REPORT_GONE);
  const row = await c.env.DB.prepare("SELECT * FROM report WHERE id = ?")
    .bind(id)
    .first<ReportRow>();
  if (!row || row.account_id !== account) return err(c, 404, REPORT_GONE);

  const body = await c.req
    .json<{ title?: string; environment?: string; team?: string; to?: string }>()
    .catch(() => ({}) as Record<string, string>);

  let team_id = row.team_id;
  let to_account_id = row.to_account_id;
  if (body.team !== undefined) {
    if (!body.team) {
      team_id = "";
      to_account_id = "";
    } else {
      const team = await teamBySlug(c, String(body.team));
      if (!team)
        return err(
          c,
          400,
          `You're not in a team called "${body.team}". Check the name, or ask to be invited.`,
        );
      team_id = team.id;
    }
  }
  if (body.to !== undefined) {
    const handle = String(body.to).replace(/^@/, "").toLowerCase();
    if (!handle) to_account_id = "";
    else {
      if (!team_id)
        return err(
          c,
          400,
          "A report can only be sent to someone inside a team. Choose the team first.",
        );
      const person = await c.env.DB.prepare(
        `SELECT a.id, a.handle, a.name, a.email FROM account a JOIN membership m ON m.account_id = a.id
         WHERE a.handle = ? AND m.team_id = ?`,
      )
        .bind(handle, team_id)
        .first<AccountRow>();
      if (!person)
        return err(
          c,
          400,
          `@${handle} isn't in that team. Check the handle, or invite them to the team first.`,
        );
      to_account_id = person.id;
    }
  }

  await c.env.DB.prepare(
    "UPDATE report SET title = ?, environment = ?, team_id = ?, to_account_id = ?, updated = ? WHERE id = ?",
  )
    .bind(
      body.title === undefined ? row.title : String(body.title).slice(0, 200),
      body.environment === undefined ? row.environment : slug(body.environment, 16),
      team_id,
      to_account_id,
      now(),
      id,
    )
    .run();
  return c.body(null, 204);
});

/** Every report I filed, newest first, each with its counts. */
app.get("/v1/reports", async (c) => {
  const account = c.get("account");
  const { results } = await c.env.DB.prepare(
    "SELECT * FROM report WHERE account_id = ? ORDER BY created DESC LIMIT 50",
  )
    .bind(account)
    .all<ReportRow>();
  if (!results.length) return c.json({ reports: [] });
  const ids = results.map((r) => r.id);
  const { results: issues } = await c.env.DB.prepare(
    `SELECT * FROM guide WHERE report_id IN (${ids.map(() => "?").join(",")})`,
  )
    .bind(...ids)
    .all<GuideRow>();
  const reports = [];
  for (const row of results) {
    reports.push(
      await reportSummary(
        c,
        row,
        issues.filter((g) => g.report_id === row.id),
      ),
    );
  }
  return c.json({ reports });
});

/**
 * The shape both report routes answer with. Areas are a GROUP BY, not a table — the grouping is
 * derived from the issues every time, so removing the last issue in an area removes the area.
 */
async function reportSummary(c: Ctx, row: ReportRow, issues: GuideRow[]) {
  const teams = new Map((await myTeams(c)).map((t) => [t.id, t]));
  const people = await accounts(c, [row.account_id, row.to_account_id]);
  const summarised = await summaries(c, issues);
  const areas = new Map<string, typeof summarised>();
  for (const issue of summarised) {
    const key = issue.area || "";
    const bucket = areas.get(key);
    if (bucket) bucket.push(issue);
    else areas.set(key, [issue]);
  }
  return {
    id: row.id,
    title: row.title,
    environment: row.environment,
    created: row.created,
    updated: row.updated,
    mine: row.account_id === c.get("account"),
    from: people.get(row.account_id)?.handle || "",
    from_name: nameOf(people, row.account_id),
    team: teams.get(row.team_id)?.slug || "",
    team_name: teams.get(row.team_id)?.name || "",
    to: people.get(row.to_account_id)?.handle || "",
    to_name: nameOf(people, row.to_account_id),
    issues: summarised.length,
    open: summarised.filter((i) => i.status === "draft").length,
    failing: summarised.filter((i) => i.failing).length,
    areas: [...areas].map(([area, list]) => ({ area, issues: list })),
  };
}

app.get("/v1/guides", async (c) => {
  const account = c.get("account");
  const q = (c.req.query("q") || "").trim().toLowerCase();
  const scope = (c.req.query("scope") || "all").trim();
  const teams = await myTeams(c);
  const binds: unknown[] = [];
  let where: string;
  if (scope === "mine") {
    where = "account_id = ?";
    binds.push(account);
  } else if (scope === "all") {
    const ids = teams.map((t) => t.id);
    where = ids.length
      ? `(account_id = ? OR team_id IN (${ids.map(() => "?").join(",")}))`
      : "account_id = ?";
    binds.push(account, ...ids);
  } else {
    const team = teams.find((t) => t.slug === scope);
    if (!team)
      return err(
        c,
        404,
        `You're not in a team called "${scope}". Check the name, or ask to be invited.`,
      );
    where = "team_id = ?";
    binds.push(team.id);
  }
  let sql = `SELECT * FROM guide WHERE ${where}`;
  for (const t of q ? q.split(/\s+/) : []) {
    sql +=
      " AND (lower(title) LIKE ? OR lower(tags) LIKE ? OR lower(stack) LIKE ? OR lower(source_context) LIKE ? OR lower(markdown) LIKE ?)";
    const like = `%${t}%`;
    binds.push(like, like, like, like, like);
  }
  sql += " ORDER BY created DESC LIMIT 200";
  const { results } = await c.env.DB.prepare(sql)
    .bind(...binds)
    .all<GuideRow>();
  return c.json({ guides: await summaries(c, results) });
});

// Handed to me (or to a team I'm in, by someone else) and not yet pulled by me.
async function inboxRows(c: Ctx, limit = 100): Promise<GuideRow[]> {
  const account = c.get("account");
  const ids = (await myTeams(c)).map((t) => t.id);
  // Three addresses reach you, and they are not the same ask:
  //
  //   to_account_id = you        somebody wrote your handle
  //   to_group_id in your groups somebody addressed the people who do a thing, and you are one
  //   team, addressed to nobody  it was put in a room you are in
  //
  // The team clause has to exclude both of the others, or a guide handed to #frontend would also
  // land on every other member of the team as if it had been shared with all of them.
  const teamClause = ids.length
    ? `OR (team_id IN (${ids.map(() => "?").join(",")}) AND to_account_id = '' AND to_group_id = '')`
    : "";
  const MY_GROUPS = "SELECT group_id FROM group_member WHERE account_id = ?";
  const { results } = await c.env.DB.prepare(
    `SELECT * FROM guide
     WHERE account_id <> ? AND status = 'published'
       AND (to_account_id = ? OR (to_group_id <> '' AND to_group_id IN (${MY_GROUPS})) ${teamClause})
       AND id NOT IN (SELECT guide_id FROM pull WHERE account_id = ?)
       -- Passing on something takes it off your board and puts it back on its author's. Saying
       -- "on it" does not: you still owe the work, so it stays where you will see it.
       AND id NOT IN (SELECT guide_id FROM ack WHERE account_id = ? AND taken = 0)
       -- Somebody else took it, holds it, or said how it went. That only clears a guide addressed
       -- to more than one person: when a group or a team was asked, one person answering is the
       -- answer for all of them, and leaving it in everyone else's lane is how two people end up
       -- doing the same work. "On it" was the only answer counted once, so a teammate who did the
       -- work and said it worked — without saying "on it" first — left it waiting on everyone
       -- else. A guide with your handle on it was asked of you, and nobody else answering ends that.
       AND (to_account_id = ?
            OR (id NOT IN (SELECT guide_id FROM ack WHERE taken = 1 AND account_id <> ?)
                AND id NOT IN (SELECT guide_id FROM verdict WHERE account_id <> ?)
                AND id NOT IN (SELECT guide_id FROM claim WHERE account_id <> ?)))
     -- Named beats dropped. Someone writing your handle chose you; a guide shared with a team you
     -- happen to be in chose nobody, and a group sits between the two — so the lane reads in that
     -- order rather than by age alone, which buried what was addressed to you under the rest.
     ORDER BY CASE WHEN to_account_id = ? THEN 0 WHEN to_group_id <> '' THEN 1 ELSE 2 END,
              created DESC LIMIT ?`,
  )
    .bind(
      account,
      account,
      account,
      ...ids,
      account,
      account,
      account,
      account,
      account,
      account,
      account,
      limit,
    )
    .all<GuideRow>();
  return results;
}

app.get("/v1/inbox", async (c) => c.json({ guides: await summaries(c, await inboxRows(c)) }));

// ---- board ------------------------------------------------------------------------------

// A transfer is only finished when it lands on the other side, so the dashboard is queues
// rather than numbers: what is waiting on you, what you handed over and nobody has taken
// yet, what landed and is still open, and what has been pulled enough times to be worth keeping.
// Someone else pulling is what counts everywhere here — your own pull from another machine is
// not the transfer landing.
const STALE_DAYS = 7;
const PULLED_BY_OTHERS = `EXISTS (SELECT 1 FROM pull p WHERE p.guide_id = g.id
     AND p.account_id <> '' AND p.account_id <> g.account_id)`;
const FAILING = "EXISTS (SELECT 1 FROM verdict v WHERE v.guide_id = g.id AND v.ok = 0)";
// Addressed to someone and still untouched by them. Named because the buckets below are tested in
// order and the first match wins (DESIGN_BRIEF §2), so the later ones have to say what they are
// not: each query carries the negation of every bucket above it rather than trusting the reader —
// or the CLI, or the agent tool — to apply the order themselves.
const IN_FLIGHT = `(g.to_account_id <> '' OR g.team_id <> '') AND NOT ${PULLED_BY_OTHERS}`;

app.get("/v1/board", async (c) => {
  const account = c.get("account");
  const mine = (sql: string, ...binds: unknown[]) =>
    c.env.DB.prepare(sql)
      .bind(account, ...binds)
      .all<GuideRow>();

  const [waiting, failing, flight, landed] = await Promise.all([
    inboxRows(c, 20),
    // Someone tried your work and it does not hold up. The most actionable thing on the page.
    mine(
      `SELECT g.* FROM guide g WHERE g.account_id = ? AND g.status = 'published' AND ${FAILING}
       ORDER BY g.updated DESC LIMIT 20`,
    ).then((r) => r.results),
    // Handed to a person or a team, and still untouched by anyone but you. A failed verdict wins
    // over "nobody has it yet": a verdict usually implies a pull row, but one left by the guide's
    // own author does not (recordReceipt skips itself), so without this guard a self-verdict of
    // { ok: false } on an unpulled guide would fill a card here and in `failing` at the same time.
    mine(
      `SELECT g.* FROM guide g WHERE g.account_id = ? AND g.status = 'published'
         AND ${IN_FLIGHT} AND NOT ${FAILING}
       ORDER BY g.created ASC LIMIT 20`,
    ).then((r) => r.results),
    // Someone else has it. This used to stop at three pulls, above which a guide moved to a
    // "worth keeping" queue of its own — but that was a counter with a bucket around it, and it
    // meant something nobody acts on. The pull count is on the row; being pulled by someone else
    // is itself the negation of `in_flight`, so this needs no separate guard against it.
    mine(
      `SELECT g.* FROM guide g WHERE g.account_id = ? AND g.status = 'published'
         AND ${PULLED_BY_OTHERS} AND NOT ${FAILING}
       ORDER BY g.updated DESC LIMIT 20`,
    ).then((r) => r.results),
  ]);

  // One summaries() pass over every row, then split back into buckets: the lookups it does
  // (teams, people, recent pulls) are per-call, not per-row.
  const all = [...waiting, ...failing, ...flight, ...landed];
  const byId = new Map((await summaries(c, all)).map((s) => [s.id, s]));
  const pick = (rows: GuideRow[]) => rows.map((r) => byId.get(r.id)).filter(Boolean);
  const cutoff = Date.now() - STALE_DAYS * 864e5;

  return c.json({
    waiting: pick(waiting),
    failing: pick(failing),
    in_flight: pick(flight).map((g) => ({
      ...g,
      stale: new Date(g?.created ?? 0).getTime() < cutoff,
    })),
    landed: pick(landed),
    // Kept, always empty, for one release. `passalong board` in the published CLI reads
    // `b.promote.length` with no guard, so dropping the key outright makes an installed 0.1.0
    // throw rather than degrade. It goes when the CLI's own removal ships.
    promote: [] as ReturnType<typeof pick>,
    unread: await unreadCount(c.env, account),
  });
});

// ---- log --------------------------------------------------------------------------------

// What you did, newest first. The opposite face of `/v1/notifications`: that one is what other
// people did to your guides and it clears when you read it, this one is your own acts and it never
// clears. Neither the buckets of the board nor the rank of the guides page — the only order here
// is time, which is the one axis nothing else in the product offers.
//
// See log.ts for why this invents no table, and for the one thing it cannot honestly claim to be.
app.get("/v1/log", async (c) => {
  const since = (c.req.query("since") || "").trim();
  // A malformed `since` compares lexicographically against ISO timestamps and silently returns
  // either everything or nothing, so it is refused rather than guessed at.
  if (since && !SINCE_RE.test(since))
    return err(
      c,
      400,
      "The since filter needs a date, like 2026, 2026-09, 2026-09-11 or a full ISO time.",
    );
  const rows = await logFeed(c.env, c.get("account"), {
    repo: (c.req.query("repo") || "").trim(),
    since,
    limit: Number(c.req.query("limit")) || 100,
  });
  return c.json({ log: rows.map(logSummary(origin(c), c.get("account"))) });
});

// ---- billing ----------------------------------------------------------------------------------

// The provider telling us a subscription changed. It is the only write in the product that no
// person authenticates: the signature over the raw body is the entire credential, which is why
// `billing.ts` is unit-tested to the edges and why the body is read with `c.req.text()` here —
// parsing first and verifying second is the classic way to verify a different set of bytes than
// the one that was signed.
app.post("/v1/billing/webhook/:provider", async (c) => {
  const named = c.req.param("provider");
  if (!isProvider(named)) return err(c, 404, "That billing provider isn't supported.");
  const provider: Provider = named;
  const raw = await c.req.text();

  let event: unknown;
  try {
    event =
      provider === "stripe"
        ? await verifyStripe(
            raw,
            c.req.header("stripe-signature") || "",
            c.env.STRIPE_WEBHOOK_SECRET || "",
          )
        : await verifyPaystack(
            raw,
            c.req.header("x-paystack-signature") || "",
            c.env.PAYSTACK_SECRET || "",
          );
  } catch (e) {
    // The provider's own message, which is about our configuration and never about their payload,
    // so there is nothing here that helps someone guess a secret.
    return err(c, 400, e instanceof BillingError ? e.message : "could not read that webhook");
  }

  const change = parseEvent(provider, event);
  // 200 for an event we do not act on. A webhook endpoint that errors on anything it has no opinion
  // about is one the provider retries all day and then disables, taking the events that do matter
  // with it.
  if (!change) return c.json({ ok: true, applied: false });

  // By subscription first, then by the team id the provider carried in metadata. The second is how
  // a *first* subscription is ever matched: the id does not exist when we send someone to a checkout
  // page, so until this event arrives there is nothing on the team to look it up by.
  type TeamPlanRow = { id: string; slug: string; plan: string; seats: number };
  // A Solo subscription belongs to a person, so it is looked up the same two ways and applied to
  // `account` instead. Checked first only because it is the cheaper query; the two subjects are
  // mutually exclusive, since the metadata carries exactly one of them.
  const soloId =
    change.account_id ||
    (
      await c.env.DB.prepare("SELECT id FROM account WHERE subscription_id = ?")
        .bind(change.subscription_id)
        .first<{ id: string }>()
    )?.id ||
    "";
  if (soloId && !change.team_id) {
    const plan = change.plan === "team" ? "solo" : change.plan;
    // `plan_until` is cleared: a subscription is not a gift, and a date left over from one would
    // expire a plan somebody is now being charged for. See migrations/0026_gifts.sql.
    const done = await c.env.DB.prepare(
      "UPDATE account SET plan = ?, plan_since = ?, plan_until = '', subscription_id = ? WHERE id = ?",
    )
      .bind(plan, now(), change.subscription_id, soloId)
      .run();
    if (done.meta.changes) {
      count(c, "plan_changed", { provider, plan, subject: "account" });
      return c.json({ ok: true, applied: true });
    }
  }

  let team = await c.env.DB.prepare(
    "SELECT id, slug, plan, seats FROM team WHERE subscription_id = ?",
  )
    .bind(change.subscription_id)
    .first<TeamPlanRow>();
  if (!team && change.team_id) {
    team = await c.env.DB.prepare("SELECT id, slug, plan, seats FROM team WHERE id = ?")
      .bind(change.team_id)
      .first<TeamPlanRow>();
  }
  // Also 200, and deliberately: a subscription we have never heard of is the provider's business,
  // not a failure of ours, and answering 4xx would have them retry something that can never work.
  if (!team) return c.json({ ok: true, applied: false });

  // Seats only move when the event carried a count. A payment failing says nothing about how many
  // seats were bought, and writing zero there would silently unseat the whole team.
  // The subscription id is written here and only here, which is what binds a team to the thing
  // paying for it. Never cleared on a lapse: a lapsed team that renews is the same subscription,
  // and forgetting it would orphan every event that follows.
  // `plan_until` cleared for the same reason as above: what the team is on is now the provider's
  // to end, not a date an operator typed.
  await c.env.DB.prepare(
    "UPDATE team SET plan = ?, seats = ?, plan_since = ?, plan_until = '', subscription_id = ? WHERE id = ?",
  )
    .bind(change.plan, change.seats ?? team.seats, now(), change.subscription_id, team.id)
    .run();
  count(c, "plan_changed", { provider, plan: change.plan, subject: "team" });
  return c.json({ ok: true, applied: true });
});

// Buy Solo: a subscription that belongs to this account rather than to a team.
//
// The landing page has sold this since the pricing went up and nothing could buy it — every
// subscription route was team-scoped and owner-only, so an individual who wanted to pay had to
// invent a team of one. That is also why `FREE_SIGNUP` could not be closed: there was nowhere for a
// new account to go.
//
// One seat, not a number: the plan is one person by definition, and a quantity field on it would be
// a way to ask a question with only one answer.
app.post("/v1/subscribe", async (c) => {
  const account = c.get("account");
  const { provider } = (await c.req.json().catch(() => ({}))) as { provider?: string };
  if (!provider || !isProvider(provider))
    return err(c, 400, "Choose Stripe or Paystack to pay with.");

  const me = await c.env.DB.prepare("SELECT email, plan, subscription_id FROM account WHERE id = ?")
    .bind(account)
    .first<{ email: string; plan: string; subscription_id: string }>();
  // Asked of the subscription, not of the plan: somebody on a gifted Solo (0026_gifts.sql) has the
  // plan and pays nothing, and telling them they already have it would leave them no way to buy
  // the thing before their gift runs out.
  if (me?.subscription_id) return err(c, 400, "You're already on the Solo plan.");
  if (!me?.email)
    return err(
      c,
      400,
      "Add an email address to your account first, so the receipt has somewhere to go.",
    );

  try {
    const checkout = await startCheckout(provider, c.env, {
      subject: { kind: "account", id: account },
      seats: 1,
      email: me.email,
      returnTo: `${origin(c)}/hub/settings`,
    });
    count(c, "checkout_started", { provider, mode: checkout.mode, subject: "account" });
    return c.json(checkout);
  } catch (e) {
    return err(
      c,
      502,
      e instanceof BillingError
        ? e.message
        : "We couldn't reach the payment provider. Try again in a moment.",
    );
  }
});

// Start paying. Owner only, and it hands back a hosted page rather than taking a card: this product
// does not touch card details, which is also why there is no form here to build.
app.post("/v1/teams/:slug/subscribe", async (c) => {
  const team = await teamBySlug(c, c.req.param("slug"));
  if (!team) return err(c, 404, "You're not in that team any more, or it was deleted.");
  if (team.role !== "owner")
    return err(c, 403, "Only the team's owner can change its plan. Ask them to do it.");
  const { provider, seats } = (await c.req.json().catch(() => ({}))) as {
    provider?: string;
    seats?: number;
  };
  if (!provider || !isProvider(provider))
    return err(c, 400, "Choose Stripe or Paystack to pay with.");
  const wanted = Math.trunc(Number(seats)) || 0;
  if (wanted < 1) return err(c, 400, "Choose at least one seat.");

  const members = await c.env.DB.prepare("SELECT COUNT(*) AS n FROM membership WHERE team_id = ?")
    .bind(team.id)
    .first<{ n: number }>();
  // Buying fewer seats than the team already has would leave it instantly over its own limit, and
  // the person who finds out is whoever tries to accept the next invite.
  if (wanted < (members?.n ?? 0))
    return err(
      c,
      400,
      `${team.name} already has ${members?.n} members, so choose at least ${members?.n} seats.`,
    );

  const me = await c.env.DB.prepare("SELECT email FROM account WHERE id = ?")
    .bind(c.get("account"))
    .first<{ email: string }>();
  if (!me?.email)
    return err(
      c,
      400,
      "Add an email address to your account first, so the receipt has somewhere to go.",
    );

  try {
    const checkout = await startCheckout(provider, c.env, {
      subject: { kind: "team", id: team.id },
      seats: wanted,
      email: me.email,
      returnTo: `${origin(c)}/hub/settings`,
    });
    count(c, "checkout_started", { provider, mode: checkout.mode, subject: "team" });
    return c.json(checkout);
  } catch (e) {
    return err(
      c,
      502,
      e instanceof BillingError
        ? e.message
        : "We couldn't reach the payment provider. Try again in a moment.",
    );
  }
});

// Change how many seats are paid for. Owner only, and never below the number of people already in
// the team — the seat count is what admits the next member, so setting it under the current size is
// a refusal aimed at whoever joins next rather than at the person doing it.
app.patch("/v1/teams/:slug/seats", async (c) => {
  const team = await teamBySlug(c, c.req.param("slug"));
  if (!team) return err(c, 404, "You're not in that team any more, or it was deleted.");
  if (team.role !== "owner")
    return err(c, 403, "Only the team's owner can change its seats. Ask them to do it.");
  if (team.plan !== "team")
    return err(c, 400, `${team.name} isn't on a paid plan, so there are no seats to change.`);
  if (!team.subscription_id)
    return err(
      c,
      400,
      `${team.name} has no subscription to change. Choose a plan in Settings first.`,
    );
  const { seats } = (await c.req.json().catch(() => ({}))) as { seats?: number };
  const wanted = Math.trunc(Number(seats)) || 0;
  if (wanted < 1) return err(c, 400, "Choose at least one seat.");
  const members = await c.env.DB.prepare("SELECT COUNT(*) AS n FROM membership WHERE team_id = ?")
    .bind(team.id)
    .first<{ n: number }>();
  if (wanted < (members?.n ?? 0))
    return err(
      c,
      400,
      `${team.name} has ${members?.n} members. Remove someone before dropping to ${wanted} seat${wanted === 1 ? "" : "s"}.`,
    );

  // Stripe ids are `sub_...`; Paystack's are `SUB_...`. The subscription itself says which provider
  // it belongs to, so nothing has to be stored twice and the two can never disagree.
  const provider: Provider = team.subscription_id.startsWith("sub_") ? "stripe" : "paystack";
  try {
    await setSeats(provider, c.env, team.subscription_id, wanted);
  } catch (e) {
    return err(
      c,
      502,
      e instanceof BillingError
        ? e.message
        : "We couldn't reach the payment provider. Try again in a moment.",
    );
  }
  // The provider's webhook is what writes the number: one source for what is paid for, and it is
  // the subscription. Answering with the asked-for figure would have the hub show a seat count
  // nothing has confirmed yet.
  return c.json({ ok: true, seats: team.seats, pending: wanted });
});

// What this deployment can take money with, and in which mode. No secrets, only their shape — and
// the mode is read off the key, so it cannot disagree with the keys actually in use.
app.get("/v1/billing", (c) =>
  c.json({
    stripe: modeOf(c.env.STRIPE_SECRET || ""),
    paystack: modeOf(c.env.PAYSTACK_SECRET || ""),
  }),
);

// ---- notifications ----------------------------------------------------------------------

app.get("/v1/notifications", async (c) => {
  const account = c.get("account");
  // `?unread` (bare, or =1) narrows to what you have not seen; absent means the whole feed.
  const flag = c.req.query("unread");
  const rows = await feed(c.env, account, {
    unread: flag !== undefined && flag !== "0" && flag !== "false",
    limit: Number(c.req.query("limit")) || 50,
  });
  return c.json({
    notifications: rows.map(notifSummary),
    unread: await unreadCount(c.env, account),
  });
});

app.post("/v1/notifications/read", async (c) => {
  const { ids } = (await c.req.json().catch(() => ({}))) as { ids?: number[] };
  const clean = (ids || []).map(Number).filter(Number.isInteger).slice(0, 200);
  const read = await markRead(c.env, c.get("account"), clean);
  return c.json({ read, unread: await unreadCount(c.env, c.get("account")) });
});

/**
 * How far a chain of guides is allowed to run.
 *
 * A rendering limit before it is a storage one: eight hops back is already a history nobody opens,
 * and a page that has to draw an arbitrary number of ancestors draws none of them well. It doubles
 * as the bound on the walk that refuses cycles, which is what makes that walk safe to run against
 * rows written before this rule existed.
 */
const LINEAGE_MAX = 8;

app.put("/v1/guides/:id", async (c) => {
  const account = c.get("account");
  const id = c.req.param("id");
  if (!ID_RE.test(id))
    return err(c, 400, "That isn't a valid guide id. Use 6 to 12 lowercase letters and numbers.");
  // The document, either as itself or wrapped in JSON.
  //
  // `text/markdown` is the honest shape and what the CLI sends: the guide *is* the body. But an
  // agent platform that builds its calls from an OpenAPI document — a ChatGPT action, Gemini
  // function calling — only knows how to send JSON, so without this the one route that publishes
  // anything is the one route those agents cannot reach.
  const sentJson =
    (c.req.header("content-type") || "").split(";")[0]?.trim() === "application/json";
  let markdown = "";
  if (sentJson) {
    const wrapper = await c.req.json<{ markdown?: unknown; parent?: unknown }>().catch(() => null);
    if (typeof wrapper?.markdown === "string") markdown = wrapper.markdown;
    // A caller composing a tool call can name the parent beside the document rather than edit
    // frontmatter by hand. It is written *into* the frontmatter, so the stored guide is exactly the
    // document it would be had the author typed `parent:` — the markdown stays the one source.
    if (markdown.trim() && typeof wrapper?.parent === "string" && wrapper.parent.trim())
      markdown = setField(markdown, "parent", wrapper.parent.trim());
  } else {
    markdown = await c.req.text();
  }
  if (!markdown.trim()) {
    return err(
      c,
      400,
      sentJson
        ? 'The guide is empty. Send {"markdown": "---\\ntitle: ...\\n---\\n\\n## Problem ..."}.'
        : 'The guide is empty. Send it as text/markdown, or as JSON: {"markdown": "..."}.',
    );
  }
  if (markdown.length > 512 * 1024)
    return err(c, 413, "This guide is over 512 KB. Move large logs or files out and link to them.");
  const meta: Meta = parseMeta(markdown);
  if (meta.id && meta.id !== id)
    return err(c, 400, "The id in the guide's frontmatter doesn't match the id it is saved under.");
  if (!meta.title) return err(c, 400, "The guide needs a title. Add title: to its frontmatter.");

  // Addressing: `team: <slug>` puts the guide in a team; `to: <handle>` hands it to a member.
  let team: (TeamRow & { role: string }) | null = null;
  let toAccount: AccountRow | null = null;
  if (meta.team) {
    team = await teamBySlug(c, String(meta.team));
    if (!team)
      return err(
        c,
        400,
        `You're not in a team called "${meta.team}". Check the team in the guide, or ask to be invited.`,
      );
    // Read-only, not closed: everything already in the team stays readable, pullable and
    // answerable, and this is the one door that shuts. 402 rather than 403 — nobody lacks
    // permission, the subscription lapsed, and the two are fixed in completely different places.
    if (!acceptsNewWork(team.plan))
      return err(
        c,
        402,
        `${team.name}'s plan has lapsed, so it can't take new guides. Everything already in it ` +
          "can still be read and answered. Ask the team owner to renew.",
      );
  }
  // `to:` names either a person or a group, and the sigil says which: `@ada` is one teammate,
  // `#frontend` is the people who do a thing. Both need a `team:` — an address is only meaningful
  // inside the room it belongs to.
  let toGroup: { id: string; slug: string; name: string } | null = null;
  if (meta.to) {
    const raw = String(meta.to).trim();
    if (!team)
      return err(
        c,
        400,
        "To send a guide to a person or a group, also say which team it's in (team: in the frontmatter).",
      );
    if (raw.startsWith("#")) {
      const wanted = tag(raw.slice(1));
      toGroup = await c.env.DB.prepare(
        "SELECT id, slug, name FROM team_group WHERE slug = ? AND team_id = ?",
      )
        .bind(wanted, team.id)
        .first<{ id: string; slug: string; name: string }>();
      if (!toGroup)
        return err(
          c,
          400,
          `${team.name} has no group called #${wanted}. Check the name in the team's settings.`,
        );
    } else {
      const handle = raw.replace(/^@/, "").toLowerCase();
      toAccount = await c.env.DB.prepare(
        `SELECT a.id, a.handle, a.name, a.email FROM account a JOIN membership m ON m.account_id = a.id
         WHERE (a.handle = ?1 OR (a.handle = '' AND a.id = ?1)) AND m.team_id = ?2`,
      )
        .bind(handle, team.id)
        .first<AccountRow>();
      if (!toAccount)
        return err(
          c,
          400,
          `@${handle} isn't in ${team.name}. Check the handle, or invite them to the team first.`,
        );
    }
  }

  // A report is the parent of a set of issues, and it is addressed as a unit: an issue can only
  // join a report the same account owns. Everything else about the issue — its own share key, its
  // own pull, its own verdict — is untouched by having a parent, which is the point of making an
  // issue a guide rather than a row inside one.
  let report: ReportRow | null = null;
  if (meta.report) {
    const wanted = String(meta.report);
    if (!ID_RE.test(wanted))
      return err(c, 400, "The report named in this guide isn't a valid report id.");
    report = await c.env.DB.prepare("SELECT * FROM report WHERE id = ?")
      .bind(wanted)
      .first<ReportRow>();
    if (!report)
      return err(c, 400, `There's no report called "${wanted}". Check the report id in the guide.`);
    if (report.account_id !== account)
      return err(c, 403, "That report belongs to another account, so this guide can't join it.");
  }

  // `parent:` is the guide this one came out of — someone pulled that, did the work, and wrote
  // down what they learned. Unlike `report:`, a parent that does not resolve is dropped rather
  // than refused, for three separate reasons that all land in the same place.
  //
  // It belongs to somebody else, so a guide you were handed before you left a team has to keep
  // publishing after you leave. Refusing "not yours" separately from "no such guide" would turn
  // publish into an oracle for which ids exist. And `parent:` was not a reserved field name until
  // lineage existed, so a guide written months ago may carry one meaning something else — a value
  // that is not an id at all is that, not a typo, and rejecting it would make somebody's own
  // document unpublishable by them. A dropped parent costs lineage that does not apply; a refused
  // publish costs the transfer.
  //
  // A self-parent is still refused: there is no reading of it that is anything but a mistake.
  let parentId = "";
  if (meta.parent) {
    const wanted = String(meta.parent);
    if (wanted === id)
      return err(c, 400, "A guide can't follow itself. Point parent: at a different guide.");
    const parent = ID_RE.test(wanted) ? await readableGuide(c, wanted) : null;
    if (parent) {
      // Walk up from the parent. Two things end the walk: reaching this guide, which would close a
      // loop that every reader of the chain then follows forever, and running out of hops. The cap
      // is a rendering limit before it is a storage one — past it the chain is a history nobody
      // opens — and it is also what keeps this walk bounded on data that already went wrong.
      let at = parent.row.parent_id;
      for (let hop = 0; at && hop < LINEAGE_MAX; hop++) {
        if (at === id)
          return err(
            c,
            400,
            "That parent would make this guide its own ancestor. Point parent: at a different guide.",
          );
        const up = await c.env.DB.prepare("SELECT parent_id FROM guide WHERE id = ?")
          .bind(at)
          .first<{ parent_id: string }>();
        at = up?.parent_id || "";
      }
      if (at)
        return err(
          c,
          400,
          `A chain of guides can be at most ${LINEAGE_MAX} deep. Leave parent: off to start a new one.`,
        );
      parentId = parent.row.id;
    }
  }

  // An image nobody but the author's own client can load is not evidence, and a publish that
  // accepts one stores a guide with a dead picture in it. Refused rather than stripped: the
  // screenshot is usually the most useful thing in a bug report, so the answer is to upload it,
  // not to quietly drop the line naming it.
  const unreachable = unreachableImages(markdown);
  if (unreachable.length)
    return err(
      c,
      400,
      `An image in this guide (${unreachable[0]}) is on your computer, so nobody else can see it. ` +
        "Upload it first, then use the link you get back. Agents: use the attach_screenshot tool.",
    );

  const existing = await c.env.DB.prepare(
    "SELECT id, account_id, share_key, created, status, team_id, to_account_id, to_group_id FROM guide WHERE id = ?",
  )
    .bind(id)
    .first<
      Pick<
        GuideRow,
        | "id"
        | "account_id"
        | "share_key"
        | "created"
        | "status"
        | "team_id"
        | "to_account_id"
        | "to_group_id"
      >
    >();
  if (existing && existing.account_id !== account)
    return err(c, 403, "That guide id is already used by another account. Choose a different id.");

  // Handed in means the actor's turn is over. A new guide under work its publisher has handed in,
  // and that is waiting on its author, is refused.
  //
  // Every follow-up in real use that nobody asked for came from exactly here: an agent handed in,
  // was told something about its evidence, and published a second guide to carry what it had
  // found — "Hand-in evidence: …", six screenshots with Problem and Steps around them. The author
  // then had two documents to review and one of them was the agent answering itself. Instructions
  // saying not to were already on hand_in; the note on every `take` said the opposite ("what you
  // found doing it — publish that"), and an agent follows the text it read last.
  //
  // Only new guides: a write-up published before the hand-in can still be corrected. Only the
  // hand-in's own account, and never the author of the parent, who is the one reviewing it. Only
  // until the author answers: a send-back or a close deletes the claim, and an approved task is
  // `consumed` while its claim stays in review, so it is excluded by status.
  if (parentId && !existing) {
    const handed = await c.env.DB.prepare(
      `SELECT 1 FROM claim c JOIN guide g ON g.id = c.guide_id
        WHERE c.guide_id = ? AND c.account_id = ? AND c.state = 'review' AND g.account_id <> ?
          AND g.status <> 'consumed'
        LIMIT 1`,
    )
      .bind(parentId, account, account)
      .first();
    if (handed)
      return err(
        c,
        409,
        `You handed ${parentId} in, and it is waiting on its author. What you did and found ` +
          "belongs on that hand-in — `checks` for what you ran, `writeup` for what you had to " +
          "adapt — not in a new guide. Nothing more is needed from you: stop, and tell the " +
          "person it is handed in.",
      );
  }

  // Frontmatter still round-trips `promoted`, because the document is the record and a guide shared
  // a month ago must re-share today. It cannot be acquired, though: only a guide already carrying
  // the status keeps it, and that is read from the stored row rather than the markdown just sent.
  const asked =
    meta.status && (STATUSES as readonly string[]).includes(meta.status) ? meta.status : "";
  const status =
    asked === "promoted"
      ? existing?.status === "promoted"
        ? "promoted"
        : "published"
      : asked || "published";

  if (!existing) {
    const room = await quota(c, account);
    if (isFull(room.used, room)) {
      // Two refusals, because they are fixed in completely different places. Being over a ceiling
      // is solved by archiving; having no plan at all is solved by buying one, and telling somebody
      // to "archive some" when they have nothing synced would be nonsense.
      return err(
        c,
        402,
        room.plan === "none"
          ? "Syncing guides needs a plan. Choose one in Settings."
          : `You're using all ${room.limit} guides on your plan. Archive a finished guide to ` +
              "make room, or choose a bigger plan in Settings.",
      );
    }
  }

  /**
   * What it is, said by its author. Refused here rather than guessed.
   *
   * This is the server half of the fix: the CLI parser stopped seeding `transfer`, but a client on
   * any older version still publishes documents with no `kind:` line, and the row below used to
   * coerce whatever arrived into `transfer`. Between them, 162 of 200 real guides were stored as
   * transfers while their titles were tasks and bug reports — and publish_guide's own description
   * had been promising "kind: task (the default)" the whole time.
   *
   * It has to be here because this runs for every client whatever version it is on, which is the
   * lesson of a rule that shipped server-side while its remedy shipped by npm and never arrived.
   */
  const said = slug(meta.kind, 16);
  if (!said)
    return err(
      c,
      400,
      "say what this is: add `kind: task`, `kind: bug` or `kind: transfer` to the frontmatter. " +
        "A task is work nobody has done yet, a bug is a defect to report, and a transfer is " +
        "context handed to whoever picks the work up.",
    );
  if (!["task", "bug", "transfer"].includes(said))
    return err(c, 400, `"${said}" is not a kind. Use \`task\`, \`bug\` or \`transfer\`.`);

  const base = origin(c);
  const share_key = existing?.share_key ?? rid(22);
  const url = shareUrl(base, { id, share_key });
  markdown = setField(markdown, "url", url);
  if (!meta.id) markdown = setField(markdown, "id", id);
  // And what it is, written back in the one spelling. Never invented: the guard above has already
  // refused a document that did not say, so this only ever normalises what its author wrote.
  markdown = setField(markdown, "kind", said);
  // `parseMeta` already normalised what it read, so this writes the one style back into the
  // document the author will pull again. It is a no-op when they already agree, which is every
  // publish after the first.
  markdown = setList(markdown, "tags", meta.tags);
  const t = now();
  const created = String(meta.created || existing?.created || t);

  await c.env.DB.prepare(
    `INSERT INTO guide (id, account_id, share_key, title, status, source_context, tags, stack, markdown, created, updated, team_id, to_account_id, to_group_id, report_id, area, severity, kind, parent_id, target)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET title=excluded.title, status=excluded.status, source_context=excluded.source_context,
       tags=excluded.tags, stack=excluded.stack, markdown=excluded.markdown, updated=excluded.updated,
       team_id=excluded.team_id, to_account_id=excluded.to_account_id, to_group_id=excluded.to_group_id,
       report_id=excluded.report_id, area=excluded.area, severity=excluded.severity, kind=excluded.kind,
       parent_id=excluded.parent_id, target=excluded.target`,
  )
    .bind(
      id,
      account,
      share_key,
      meta.title,
      status,
      String(meta.source_context || ""),
      JSON.stringify(meta.tags),
      JSON.stringify(meta.stack_assumptions),
      markdown,
      created,
      t,
      team?.id || "",
      toAccount?.id || "",
      toGroup?.id || "",
      report?.id || "",
      slug(meta.area),
      slug(meta.severity, 8),
      // Exactly what was said. It used to read `["bug","task"].includes(k) ? k : "transfer"`,
      // which turned every unstated and every misspelled kind into a transfer guide.
      said,
      parentId,
      // Only a task is for a repo; on anything else the field means nothing to the queue.
      said === "task" ? claims.repoKey(meta.target_context).slice(0, 200) : "",
    )
    .run();

  await claimShots(c, account, id, markdown);
  // What a task waits for is rewritten from its frontmatter on every publish, like the rest of it.
  if (said === "task") await claims.blockOn(c.env.DB, id, meta.blocked_by || [], { account });

  // Tell whoever the guide just became relevant to. Re-publishing an unchanged address is not a
  // new event, so only a *newly* addressed person or a newly shared team hears anything.
  let notified = false;
  const addressed =
    toAccount && toAccount.id !== account && existing?.to_account_id !== toAccount.id;
  const handedToGroup = toGroup && existing?.to_group_id !== toGroup.id;
  const newlyShared = team && existing?.team_id !== team.id;
  if (addressed || handedToGroup || newlyShared) {
    const me = (await accounts(c, [account])).get(account);
    const fromName = displayName({ id: account, handle: me?.handle, name: me?.name });
    if (addressed && toAccount) {
      await notify(c.env, {
        to: toAccount.id,
        kind: "handoff",
        guide_id: id,
        actor_id: account,
        team_id: team?.id,
        // A handoff to a named person is the one event worth an email: it is addressed work.
        mail: async () => {
          notified = await sendHandoff(c.env, {
            to: toAccount.email,
            fromName,
            title: String(meta.title),
            id,
            url,
            team: team?.name || "",
          });
          return notified;
        },
      });
    }
    // A group is addressed work for each of its people, so each of them is told the way a named
    // person is — the same `handoff`, not the team's `shared`. No mail: one guide reaching six
    // inboxes is six emails, and a group exists precisely because the sender does not know which
    // of them will take it.
    if (handedToGroup && toGroup) {
      const { results } = await c.env.DB.prepare(
        "SELECT account_id FROM group_member WHERE group_id = ? AND account_id <> ?",
      )
        .bind(toGroup.id, account)
        .all<{ account_id: string }>();
      await notifyAll(
        c.env,
        results.map((m) => m.account_id),
        { kind: "handoff", guide_id: id, actor_id: account, team_id: team?.id },
      );
    }
    // A team-wide share reaches the whole team's feed, but nobody's inbox: it is addressed to
    // no one in particular, and that is exactly the mail people learn to filter out.
    if (newlyShared && team) {
      const { results } = await c.env.DB.prepare(
        "SELECT account_id FROM membership WHERE team_id = ? AND account_id <> ?",
      )
        .bind(team.id, account)
        .all<{ account_id: string }>();
      const others = results.map((m) => m.account_id).filter((mid) => mid !== toAccount?.id);
      await notifyAll(c.env, others, {
        kind: "shared",
        guide_id: id,
        actor_id: account,
        team_id: team.id,
      });
    }
    if (team) {
      // The room hears who it went to: a person, a group, or the team itself. Never "you" — a
      // channel is read by everyone in it, so "sent you" would be wrong for all but one of them.
      const kind = toAccount || toGroup ? "handoff" : "shared";
      const to = toAccount
        ? displayName(toAccount)
        : toGroup
          ? toGroup.name.trim() || `#${toGroup.slug}`
          : "";
      await announce(c.env, {
        kind,
        team_id: team.id,
        text: line({
          kind,
          actor_name: fromName,
          title: String(meta.title),
          team_name: team.name,
          to,
          times: 1,
        }),
        title: String(meta.title),
        url,
      });
    }
  }
  count(c, existing ? "guide_updated" : "guide_shared", {
    addressed: Boolean(toAccount),
    team: Boolean(team),
  });
  return c.json(
    {
      id,
      url,
      status,
      created: !existing,
      team: team?.slug || "",
      to: toAccount?.handle || (toGroup ? `#${toGroup.slug}` : ""),
      notified,
    },
    existing ? 200 : 201,
  );
});

/** A guide the caller may read: their own, or one in a team they belong to. */
async function readableGuide(
  c: Ctx,
  id: string,
): Promise<{ row: GuideRow; owner: boolean } | null> {
  const row = await db(c).prepare("SELECT * FROM guide WHERE id = ?").bind(id).first<GuideRow>();
  if (!row) return null;
  const me = c.get("account");
  if (row.account_id === me) return { row, owner: true };
  if (row.team_id) {
    const m = await db(c)
      .prepare("SELECT role FROM membership WHERE team_id = ? AND account_id = ?")
      .bind(row.team_id, me)
      .first();
    if (m) return { row, owner: false };
  }
  return null;
}

/**
 * Record a pull and tell the author it landed — the other half of the transfer, and the one
 * question a sender actually has. `account` is '' for an anonymous share-link read.
 */
async function recordPull(
  c: { env: Env; req: { url: string } },
  row: GuideRow,
  account: string,
  via: string,
) {
  await db(c).batch([
    db(c)
      .prepare("INSERT INTO pull (guide_id, account_id, via, at) VALUES (?, ?, ?, ?)")
      .bind(row.id, account, via, now()),
    db(c).prepare("UPDATE guide SET pulls = pulls + 1 WHERE id = ?").bind(row.id),
  ]);
  count(c as { env: Env }, "guide_pulled", { via, own: row.account_id === account });
  if (row.account_id === account) return; // pulling your own guide on another machine
  const people = await accounts(c, [account, row.account_id]);
  await notify(c.env, {
    to: row.account_id,
    kind: "pulled",
    guide_id: row.id,
    actor_id: account,
    team_id: row.team_id,
    // Only a named person's pull is worth an inbox. An anonymous link read has no "who" to
    // report and anything can open a URL, so it stays in the feed.
    mail: account
      ? () =>
          sendPulled(c.env, {
            to: people.get(row.account_id)?.email || "",
            byName: nameOf(people, account),
            title: row.title,
            url: shareUrl(origin(c), row),
          })
      : undefined,
  });
}

/**
 * Proof a guide reached someone who never runs `pull`. Saying it works, or marking it consumed,
 * is not something you can do without having had the guide — but for a browser-only receiver
 * (a tester, a designer) no pull row exists, so the sender's board says "never picked up" about
 * work that has already been checked, and the receiver's inbox never clears.
 *
 * No notification: the verdict or the status change is the news, and "@x pulled" alongside
 * "@x verified" is the same fact told twice.
 */
async function recordReceipt(c: Ctx, row: GuideRow, via: string) {
  const account = c.get("account");
  if (!account || row.account_id === account) return;
  const seen = await db(c)
    .prepare("SELECT 1 AS n FROM pull WHERE guide_id = ? AND account_id = ?")
    .bind(row.id, account)
    .first();
  if (seen) return;
  await db(c).batch([
    db(c)
      .prepare("INSERT INTO pull (guide_id, account_id, via, at) VALUES (?, ?, ?, ?)")
      .bind(row.id, account, via, now()),
    db(c).prepare("UPDATE guide SET pulls = pulls + 1 WHERE id = ?").bind(row.id),
  ]);
}

app.get("/v1/guides/:id", async (c) => {
  const found = await readableGuide(c, c.req.param("id"));
  if (!found) return err(c, 404, GUIDE_GONE);
  await recordPull(c, found.row, c.get("account"), "cli");
  return c.text(found.row.markdown, 200, { "content-type": "text/markdown; charset=utf-8" });
});

/**
 * The guides that came out of this one, one level down.
 *
 * One level rather than the tree: a caller can walk it, and a recursive query returning every
 * descendant of a guide that travelled is a response nobody renders. Readable on the parent is the
 * gate, and each child is filtered again on its own — a follow-up published into a team you are
 * not in does not appear under a guide you can see. Drafts are not children yet.
 *
 * `?markdown=1` is the reader's form: a follow-up is more context for the guide, so whoever opens
 * the original — an agent through get_guide or take, a person through `passalong pull` —
 * gets the follow-ups' content with it. That form is oldest first, because context reads in the
 * order it was added and a later follow-up may build on or correct an earlier one; at most
 * `FOLLOW_UPS_MAX` of them, each clipped by `clipFollowUp`. Without it the listing is newest first,
 * up to 100, summaries only, as the hub has always read it.
 *
 * Neither form records a pull on the children. Fetching context for a guide is not the reader
 * opening those guides: a pull row moves a guide into its author's "landed" queue and mails them,
 * and a follow-up nobody chose to open must not tell its author it was picked up.
 */
app.get("/v1/guides/:id/children", async (c) => {
  const found = await readableGuide(c, c.req.param("id"));
  if (!found) return err(c, 404, GUIDE_GONE);
  const account = c.get("account");
  const withMarkdown = ["1", "true"].includes(c.req.query("markdown") || "");
  const { results } = await c.env.DB.prepare(
    `SELECT * FROM guide WHERE parent_id = ? AND status <> 'draft'
       AND (account_id = ? OR team_id IN (SELECT team_id FROM membership WHERE account_id = ?))
     ORDER BY created ${withMarkdown ? "ASC" : "DESC"} LIMIT ?`,
  )
    .bind(found.row.id, account, account, withMarkdown ? FOLLOW_UPS_MAX : 100)
    .all<GuideRow>();
  const guides = await summaries(c, results);
  if (!withMarkdown) return c.json({ guides });
  const markdown = new Map(results.map((r) => [r.id, clipFollowUp(r.id, r.markdown)]));
  return c.json({
    guides: guides.map((g) => ({ ...g, markdown: markdown.get(g.id) || "" })),
  });
});

/**
 * The guide this one came out of, with its content and where it has got to.
 *
 * Follow-ups travelled one way. Opening a guide handed over the guides written under it, and
 * opening one of those handed over nothing: an agent given a follow-up got a document that assumes
 * a piece of work it has never read, and had to go and find the original itself — or, worse, act
 * as though the follow-up were the whole job. A follow-up is more context for a guide, so the
 * guide travels with it.
 *
 * `state` is what decides whether this follow-up can be acted on at all, so it is answered here
 * rather than left to another call: a follow-up to work nobody has done yet is not work to start.
 * `draft`, `open`, `held` (by whom), `handed in` or `done`.
 *
 * Readable on the follow-up is not enough: the parent is filtered again on its own, so a follow-up
 * shared with your team does not hand you a guide from a team you are not in. Like the children
 * route, this records no pull — reading context for a guide is not opening that guide.
 */
app.get("/v1/guides/:id/parent", async (c) => {
  const found = await readableGuide(c, c.req.param("id"));
  if (!found) return err(c, 404, GUIDE_GONE);
  const none = { guide: null };
  if (!found.row.parent_id) return c.json(none);
  const parent = await readableGuide(c, found.row.parent_id);
  if (!parent) return c.json(none);

  const claim = await c.env.DB.prepare(
    `SELECT c.state, COALESCE(a.name, '') AS name, COALESCE(a.handle, '') AS handle
       FROM claim c LEFT JOIN account a ON a.id = c.account_id
      WHERE c.guide_id = ? ORDER BY c.updated DESC LIMIT 1`,
  )
    .bind(parent.row.id)
    .first<{ state: string; name: string; handle: string }>();
  const state =
    parent.row.status === "consumed"
      ? "done"
      : parent.row.status === "draft"
        ? "draft"
        : claim?.state === "review"
          ? "handed in"
          : claim?.state === "claimed"
            ? "held"
            : "open";
  const [summary] = await summaries(c, [parent.row]);
  const withMarkdown = ["1", "true"].includes(c.req.query("markdown") || "");
  return c.json({
    guide: {
      ...summary,
      state,
      by: claim ? { name: claim.name, handle: claim.handle } : null,
      ...(withMarkdown ? { markdown: clipFollowUp(parent.row.id, parent.row.markdown) } : {}),
    },
  });
});

/**
 * Everything around one guide, for the hub's page about it: where it is, who has it, what was
 * handed in, and the guides it is tied to. No markdown and no pull.
 *
 * The hub reads a guide's content from its share page in a script-less frame, never through this,
 * because the hub runs script and a guide is markdown somebody else wrote. And looking at your own
 * board is not opening the guide: a pull row moves it into its author's "landed" queue and mails
 * them, so this route answers from rows that already exist and writes none.
 *
 * Every related guide is filtered on its own, as /children and /parent are: being able to read
 * this one does not hand you the title of a blocker in a team you are not in. `risk` is the
 * reviewer's (migration 0032), so only the author sees it; the rest of a hand-in is what
 * `GET /v1/tasks` already shows anyone who can see the task.
 */
app.get("/v1/guides/:id/context", async (c) => {
  const found = await readableGuide(c, c.req.param("id"));
  if (!found) return err(c, 404, GUIDE_GONE);
  const me = c.get("account");
  const at = now();
  const row = found.row;
  const readable =
    "(g.account_id = ? OR g.team_id IN (SELECT team_id FROM membership WHERE account_id = ?))";
  const related = async (sql: string, ...bind: unknown[]) =>
    (
      await c.env.DB.prepare(sql)
        .bind(...bind, me, me)
        .all<GuideRow>()
    ).results;
  const [held, parentRows, childRows, blockerRows, blocksRows, said] = await Promise.all([
    c.env.DB.prepare(
      `SELECT c.*, COALESCE(a.handle, '') AS by_handle, COALESCE(a.name, '') AS by_name
         FROM claim c LEFT JOIN account a ON a.id = c.account_id
        WHERE c.guide_id = ? ORDER BY c.updated DESC`,
    )
      .bind(row.id)
      .all<claims.ClaimRow & { by_handle: string; by_name: string }>(),
    row.parent_id
      ? related(`SELECT g.* FROM guide g WHERE g.id = ? AND ${readable}`, row.parent_id)
      : Promise.resolve([] as GuideRow[]),
    related(
      `SELECT g.* FROM guide g WHERE g.parent_id = ? AND g.status <> 'draft' AND ${readable}
        ORDER BY g.created DESC LIMIT 100`,
      row.id,
    ),
    related(
      `SELECT g.* FROM task_block b JOIN guide g ON g.id = b.blocker_id
        WHERE b.guide_id = ? AND ${readable} ORDER BY g.created`,
      row.id,
    ),
    related(
      `SELECT g.* FROM task_block b JOIN guide g ON g.id = b.guide_id
        WHERE b.blocker_id = ? AND ${readable} ORDER BY g.created`,
      row.id,
    ),
    // What each person who answered showed: a "works" carries screenshots of it working, a
    // "didn't work" the whole report. The summary above has only the latest one-line note.
    c.env.DB.prepare(
      `SELECT v.ok, v.note, v.detail, v.at, COALESCE(a.handle, '') AS handle,
              COALESCE(a.name, '') AS name
         FROM verdict v LEFT JOIN account a ON a.id = v.account_id
        WHERE v.guide_id = ? ORDER BY v.at DESC`,
    )
      .bind(row.id)
      .all<{
        ok: number;
        note: string;
        detail: string;
        at: string;
        handle: string;
        name: string;
      }>(),
  ]);
  const claimRows = held.results;
  // A hand-in's write-up is a guide of its own; name it only when this caller can read it.
  const reportIds = [...new Set(claimRows.map((k) => k.report_id).filter(Boolean))];
  const reportRows = reportIds.length
    ? await related(
        `SELECT g.* FROM guide g WHERE g.id IN (${reportIds.map(() => "?").join(",")}) AND ${readable}`,
        ...reportIds,
      )
    : [];
  const base = origin(c);
  const reports = new Map(
    reportRows.map((r) => [r.id, { id: r.id, title: r.title, url: shareUrl(base, r) }]),
  );

  const all = [row, ...parentRows, ...childRows, ...blockerRows, ...blocksRows];
  const views = new Map((await summaries(c, all)).map((v) => [v.id, v]));
  const pick = (rows: GuideRow[]) => rows.map((r) => views.get(r.id)).filter(Boolean);

  return c.json({
    guide: views.get(row.id),
    owner: found.owner,
    claims: claimRows.map((k) => ({
      place: k.place,
      state: k.state === "review" ? "review" : k.lease_until > at ? "claimed" : "stalled",
      by: { handle: k.by_handle, name: k.by_name },
      agent: k.agent_id,
      host: k.host,
      repo: k.repo,
      note: k.note,
      writeup: k.writeup,
      evidence: k.evidence,
      checks: readChecks(k.checks),
      risk: found.owner ? k.risk : "",
      pr: k.pr,
      report: reports.get(k.report_id) ?? null,
      claimed_at: k.claimed_at,
      lease_until: k.lease_until,
      updated: k.updated,
    })),
    verdicts: said.results.map((v) => ({
      ok: Boolean(v.ok),
      by: { handle: v.handle, name: v.name },
      note: v.note,
      detail: v.detail,
      at: v.at,
    })),
    parent: pick(parentRows)[0] ?? null,
    children: pick(childRows),
    blocked_by: pick(blockerRows),
    blocks: pick(blocksRows),
  });
});

app.patch("/v1/guides/:id/status", async (c) => {
  const found = await readableGuide(c, c.req.param("id"));
  if (!found) return err(c, 404, GUIDE_GONE);
  const { status } = (await c.req.json().catch(() => ({}))) as { status?: string };
  // `promoted` is readable and no longer settable, so it is refused by name rather than by being
  // missing from a list — an installed CLI still calls this, and "must be one of ..." would read
  // as a typo rather than as a status that was retired.
  if (status === "promoted")
    return err(
      c,
      400,
      "Promoted was retired: how often a guide is opened already says how far it has travelled. " +
        "Guides that carry it keep it.",
    );
  if (!status || !(SETTABLE as readonly string[]).includes(status))
    return err(c, 400, `A guide's status can only be ${SETTABLE.join(", ")}.`);
  if (!found.owner && !["consumed", "published"].includes(status))
    return err(
      c,
      403,
      "Only the author can move a guide back to draft. You can say you're done with it.",
    );
  // A task's status is its place in the queue: published puts it in front of agents and consumed
  // is approval. Both are its author's call, through `ready` and the gate — a teammate marking one
  // consumed would approve work with nobody reading it.
  if (!found.owner && found.row.kind === "task")
    return err(c, 403, "Only a task's author moves it: ready, approve, reject or release.");
  const markdown = setField(found.row.markdown, "status", status);
  await c.env.DB.prepare("UPDATE guide SET status = ?, markdown = ?, updated = ? WHERE id = ?")
    .bind(status, markdown, now(), found.row.id)
    .run();
  // Anything a person who is not the author does to a guide, its author hears about. Archiving
  // told them and un-archiving did not, which is the asymmetry that let a guide move on somebody
  // else's say-so in silence.
  if (!found.owner && status === "published") {
    await notify(c.env, {
      to: found.row.account_id,
      kind: "reopened",
      guide_id: found.row.id,
      actor_id: c.get("account"),
      team_id: found.row.team_id,
    });
  }
  // The end of the loop: someone else shipped what you handed them.
  if (!found.owner && status === "consumed") {
    await recordReceipt(c, found.row, "web");
    const account = c.get("account");
    const people = await accounts(c, [account, found.row.account_id]);
    await notify(c.env, {
      to: found.row.account_id,
      kind: "consumed",
      guide_id: found.row.id,
      actor_id: account,
      team_id: found.row.team_id,
      mail: () =>
        sendConsumed(c.env, {
          to: people.get(found.row.account_id)?.email || "",
          byName: nameOf(people, account),
          title: found.row.title,
          url: shareUrl(origin(c), found.row),
        }),
    });
  }
  return c.json({ id: found.row.id, status });
});

// A verdict is the reader's answer to "does this work?", and the only way the sender learns that
// their handoff did not land. Deliberately separate from status: status is the author's lifecycle
// and holds one value, while a verdict belongs to whoever tried it and can be negative.
const NOTE_MAX = 280;

/**
 * A raw ack or verdict on a task. Both carry no agent, and a task is only ever held by one: taken
 * with take, handed in with hand_in and its write-up, which its author reviews. So these refuse it
 * and name the calls that do the job. The MCP tools under these old names already route there.
 */
const TASK_TOOLS =
  "This is a task: take it with POST /v1/take (the take tool), and hand it in with its write-up " +
  "via POST /v1/guides/{id}/hand_in (the hand_in tool); its author reviews it.";

/**
 * "It worked" or "it didn't", from someone who tried it: stored, receipted, and told to the author
 * and the room. Shared by the verdict route and hand_in, so either way the author hears the same.
 */
/**
 * Somebody's standing answer to "does this guide hold?", and the report behind it.
 *
 * `note` is the line a row shows and stays short. `detail` and `checks` are why, at the length
 * that takes — see migrations/0030_verdict_detail.sql. A failing hand-in already collects both;
 * before this they landed on the claim, where only the author could see them, and the guide itself
 * said nothing, so the only way to warn the next reader was to publish a second guide.
 */
async function recordVerdict(
  c: Ctx & { env: Env },
  row: GuideRow,
  ok: boolean,
  note: string,
  {
    detail = "",
    checks = "",
    writeup = "",
  }: { detail?: string; checks?: string; writeup?: string } = {},
) {
  const account = c.get("account");
  await c.env.DB.prepare(
    `INSERT INTO verdict (guide_id, account_id, ok, note, detail, checks, writeup, at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(guide_id, account_id) DO UPDATE SET ok = excluded.ok, note = excluded.note,
       detail = excluded.detail, checks = excluded.checks,
       -- Kept when the new hand-in has nothing to add. A verdict is one row per account, so the
       -- same person handing the same guide in from a second repo would otherwise erase what they
       -- wrote the first time by saying nothing — and silence is not a retraction.
       writeup = CASE WHEN excluded.writeup <> '' THEN excluded.writeup ELSE verdict.writeup END,
       at = excluded.at`,
  )
    .bind(
      row.id,
      account,
      ok ? 1 : 0,
      note,
      String(detail ?? "").slice(0, claims.EVIDENCE_MAX),
      String(checks ?? "").slice(0, claims.EVIDENCE_MAX * 2),
      String(writeup ?? "").slice(0, claims.WRITEUP_MAX),
      now(),
    )
    .run();
  await recordReceipt(c, row, "verdict");

  const people = await accounts(c, [account, row.account_id]);
  await notify(c.env, {
    to: row.account_id,
    kind: ok ? "verified" : "failed",
    guide_id: row.id,
    actor_id: account,
    team_id: row.team_id,
    note,
    mail: () =>
      sendVerdict(c.env, {
        to: people.get(row.account_id)?.email || "",
        byName: nameOf(people, account),
        title: row.title,
        url: shareUrl(origin(c), row),
        ok: ok === true,
        note,
      }),
  });
  // Once for the room, after once-per-person above. A failed verdict is the thing this product
  // exists to surface, and a channel is where a team sees it today rather than eventually.
  await announce(c.env, {
    kind: ok ? "verified" : "failed",
    team_id: row.team_id,
    text: line({
      kind: ok ? "verified" : "failed",
      actor_name: nameOf(people, account),
      title: row.title,
      times: 1,
    }),
    title: row.title,
    // Set apart rather than run into the sentence: a failure's reason is the only part anyone
    // reads twice, and in a card it gets its own paragraph.
    note,
    url: shareUrl(origin(c), row),
  });
  count(c, "verdict_given", { ok: ok });
}

/**
 * The first word back — "on it", or "not me, and why" — stored and told to the author and the room.
 * Shared by the ack route, take and pass, so the sender's signal is the same whichever was called.
 */
async function recordAck(c: Ctx & { env: Env }, row: GuideRow, taken: boolean, note: string) {
  const account = c.get("account");
  await c.env.DB.prepare(
    `INSERT INTO ack (guide_id, account_id, taken, note, at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(guide_id, account_id) DO UPDATE SET taken = excluded.taken, note = excluded.note, at = excluded.at`,
  )
    .bind(row.id, account, taken ? 1 : 0, note, now())
    .run();

  const people = await accounts(c, [account, row.account_id]);
  const kind = taken ? "taken" : "declined";
  await notify(c.env, {
    to: row.account_id,
    kind,
    guide_id: row.id,
    actor_id: account,
    team_id: row.team_id,
    note,
  });
  // And once for the room. A guide nobody has taken is the thing a channel is for: it is work
  // that has stopped moving, and whoever picks it up is probably reading there.
  await announce(c.env, {
    kind,
    team_id: row.team_id,
    text: line({
      kind,
      actor_name: nameOf(people, account),
      title: row.title,
      times: 1,
    }),
    title: row.title,
    note,
    url: shareUrl(origin(c), row),
  });
  count(c, "guide_acked", { taken });
}

/** Said when "it works" arrives with nothing to look at. Names the one command that fixes it. */
const NEEDS_PROOF =
  "Show that it works: add at least one screenshot of it working. " +
  "`passalong works <id> <image>` uploads it for you; in the hub, add it on the Works form. " +
  // 0.12.0 and older take no image on `works`, but they have `attach`, and a note holding the
  // link it prints is proof. Said here, because the refusal is the one text an old CLI shows.
  "On an older CLI: `passalong attach <image>`, then `passalong works <id> <the link it printed>`. " +
  `Screenshots are removed ${PROOF_DAYS} days after the guide is closed.`;

app.put("/v1/guides/:id/verdict", async (c) => {
  const found = await readableGuide(c, c.req.param("id"));
  if (!found) return err(c, 404, GUIDE_GONE);
  if (found.row.kind === "task") return err(c, 400, TASK_TOOLS);
  const account = c.get("account");
  const body = (await c.req.json().catch(() => ({}))) as {
    ok?: boolean;
    note?: string;
    detail?: string;
  };
  if (typeof body.ok !== "boolean")
    return err(c, 400, 'Say whether it worked: send {"ok": true} or {"ok": false}.');
  const note = (body.note || "").trim().slice(0, NOTE_MAX);
  // One line, not a thread. Saying "it doesn't work" without saying how helps nobody, and
  // anything longer than this is a conversation the product deliberately does not host.
  if (!body.ok && !note)
    return err(c, 400, "Say what went wrong, so the author knows what to fix.");
  const detail = typeof body.detail === "string" ? body.detail.trim() : "";

  // "It works" is shown, not said. People said a guide worked and the author found it did not, and
  // a note is only the sender's word for it. A screenshot of it working is the part the author can
  // look at — and it has to be one this account uploaded, or pointing at a screenshot somebody else
  // took would pass. Removed PROOF_DAYS after the guide is closed; see shots.ts.
  if (body.ok) {
    const named = [...new Set([...shotIds(detail), ...shotIds(note)])];
    const own = named.length
      ? (
          await c.env.DB.prepare(
            `SELECT id FROM shot WHERE account_id = ? AND id IN (${named.map(() => "?").join(",")})`,
          )
            .bind(account, ...named)
            .all<{ id: string }>()
        ).results
      : [];
    if (!own.length) return err(c, 400, NEEDS_PROOF);
  }

  // What the row shows is one line; what the guide shows can be the whole report. A correction
  // that did not fit in 280 characters is exactly why people published them as guides instead.
  await recordVerdict(c, found.row, body.ok, note, { detail });
  await claimEvidenceShots(c, account, found.row.id, `${note}\n${detail}`);
  // Said in the browser by the person holding it: that is handing it in, so the hold moves to
  // waiting on the author, who closes it or sends it back. No hold, nothing to move.
  await claims.handIn(
    c.env.DB,
    found.row.id,
    { account, agent: personAgent(account) },
    // A person in the hub, not an agent with a terminal: what they showed is the evidence — the
    // screenshots a "works" needs, or the reason a "didn't work" needs.
    { at: now(), note, evidence: detail || note, person: true },
  );
  return c.json({ id: found.row.id, ok: body.ok, note });
});

/**
 * The receiver's first word back: "on it", or "not me, and here is why".
 *
 * This is the hop the product had no signal for. Between handing something over and someone
 * pulling it, the sender saw "in flight · not pulled yet" whether the receiver had queued it for
 * Thursday or never opened it — so the only way to tell was to go and ask.
 *
 * Declining requires a reason for the same reason a failing verdict does: "no" without "why"
 * leaves the sender exactly where the silence did. It is one line, not a thread.
 */
app.put("/v1/guides/:id/ack", async (c) => {
  const found = await readableGuide(c, c.req.param("id"));
  if (!found) return err(c, 404, GUIDE_GONE);
  if (found.row.kind === "task") return err(c, 400, TASK_TOOLS);
  const account = c.get("account");
  // The author is not a party to this. They can see who answered; answering their own handoff
  // would be telling themselves something they already know.
  if (found.owner)
    return err(c, 403, "This is your own guide, so there's nothing to take or pass on.");
  const body = (await c.req.json().catch(() => ({}))) as { taken?: boolean; note?: string };
  if (typeof body.taken !== "boolean")
    return err(
      c,
      400,
      'Say whether you\'re taking it: send {"taken": true}, or {"taken": false} with a reason.',
    );
  const note = (body.note || "").trim().slice(0, NOTE_MAX);
  if (!body.taken && !note)
    return err(c, 400, "Say why you're passing it on, so the sender knows what to do next.");

  await recordAck(c, found.row, body.taken, note);
  // A person taking it in the browser holds it, like an agent does, so Working now shows them. A
  // week's hold, not half an hour's, and several at once: people do not post progress. Passing
  // lets go of that hold. Best effort — the ack is the answer the sender waits for, and it stands.
  const person = { account, agent: personAgent(account), repo: "" };
  const at = now();
  if (body.taken)
    await claims.take(c.env.DB, found.row.id, person, {
      at,
      many: true,
      leaseMs: claims.PERSON_LEASE_MS,
    });
  else await claims.pass(c.env.DB, found.row.id, person, { at, why: note || "passed" });
  return c.json({ id: found.row.id, taken: body.taken, note });
});

/** The claim-holder a person is when they take something in the browser, rather than an agent. */
const personAgent = (account: string) =>
  `person-${account.toLowerCase().replace(/[^a-z0-9-]/g, "")}`;

// ---- tasks -------------------------------------------------------------------------------

// The queue an agent takes work from. See docs/V2.md and claims.ts, which holds every rule; these
// routes only read the request and say what happened. `agent` is the id a worktree minted for
// itself, and it is what a claim belongs to — the account alone cannot tell two of its own agents
// apart, and telling them apart is the whole point of a lock.

/** The agent a request speaks for, or a refusal naming what is missing. */
function agentOf(c: Ctx, raw: unknown): claims.Agent & Record<string, unknown> {
  const body = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
  return {
    ...body,
    account: c.get("account"),
    // Checked rather than trimmed into shape: two agents whose names differ only in what a cleaner
    // would strip would end up as one agent, sharing a lock that exists to keep them apart.
    agent: AGENT_RE.test(String(body.agent ?? "")) ? String(body.agent) : "",
    host: str(body.host, 120),
    repo: str(body.repo, 400),
    worktree: str(body.worktree, 400),
  };
}

/**
 * Tell the other side of a task what just happened to it. `to` is the task's author when an agent
 * acted, and the account whose agent had it when the author did. notify() drops an event addressed
 * to whoever caused it, so a person working alone with their own agents hears nothing.
 */
async function taskEvent(
  c: Ctx & { env: Env },
  id: string,
  kind: "task_claimed" | "task_finished" | "task_approved" | "task_rejected" | "task_released",
  to: string,
  note = "",
) {
  const row = await db(c)
    .prepare("SELECT account_id, team_id FROM guide WHERE id = ?")
    .bind(id)
    .first<{ account_id: string; team_id: string }>();
  if (!row) return;
  await notify(c.env, {
    to: to || row.account_id,
    kind,
    guide_id: id,
    actor_id: c.get("account"),
    team_id: row.team_id,
    note,
  });
}

const AGENT_RE = /^[a-z0-9-]{8,64}$/;
const NO_AGENT =
  "send `agent`: 8 to 64 of a-z, 0-9 and -, the same on every call — a local agent's is in its " +
  "worktree's .passalong/agent.json";

/** One task as the API answers it: where it is, and who has it. */
/** A claim's `checks` column as a list. Anything unreadable is nothing, never half a list. */
function readChecks(raw: string): { check: string; ran: string }[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (c): c is { check: string; ran: string } =>
        typeof (c as { check?: unknown })?.check === "string" &&
        typeof (c as { ran?: unknown })?.ran === "string",
    );
  } catch {
    return [];
  }
}

function taskView(
  task: { id: string; title: string; target: string; status: string; created: string },
  claim: claims.ClaimRow | null,
  state: claims.TaskState,
) {
  return {
    id: task.id,
    title: task.title,
    target: task.target,
    state,
    created: task.created,
    claim: claim
      ? {
          agent: claim.agent_id,
          host: claim.host,
          repo: claim.repo,
          worktree: claim.worktree,
          note: claim.note,
          evidence: claim.evidence,
          // Parsed here, once: the hub reads a list, and a screen that has to JSON.parse a column
          // is a screen that has to decide what to do when it does not parse.
          checks: readChecks(claim.checks),
          report: claim.report_id,
          pr: claim.pr,
          claimed_at: claim.claimed_at,
          lease_until: claim.lease_until,
        }
      : null,
  };
}

app.get("/v1/tasks", async (c) => {
  const at = now();
  const me = c.get("account");
  const rows = await claims.list(c.env.DB, me, at);
  return c.json({
    tasks: rows.map((r) => {
      const base = origin(c);
      const v = {
        ...taskView(r.task, r.claim, r.state),
        mine: r.task.account_id === me,
        url: shareUrl(base, r.task),
        // Where it sits and who it is for, so its author can give it to someone else.
        team: r.task.team_slug,
        // Assigned to you, or to a group you are in: yours to pass on, as well as its author's.
        for_me: Boolean(r.task.for_me),
        to: r.task.to_handle
          ? `@${r.task.to_handle}`
          : r.task.to_group_slug
            ? `#${r.task.to_group_slug}`
            : "",
      };
      if (!v.claim || !r.by) return v;
      const report_url = r.report_key
        ? shareUrl(base, { id: v.claim.report, share_key: r.report_key })
        : "";
      return { ...v, claim: { ...v.claim, report_title: r.report_title, report_url, by: r.by } };
    }),
  });
});

/**
 * Who is working on what: every guide someone holds right now, of every kind, that this account
 * can see. One row per taker — a handoff repeated in two repos is two rows. See claims.working().
 */
app.get("/v1/working", async (c) => {
  const base = origin(c);
  const rows = await claims.working(c.env.DB, c.get("account"), now());
  return c.json({
    working: rows.map((r) => ({
      id: r.guide.id,
      title: r.guide.title,
      kind: r.guide.kind,
      target: r.guide.target,
      url: shareUrl(base, r.guide),
      state: r.state,
      // Whether the person reading this wrote it. Only an author takes work back, and this is the
      // one view that knows who is holding what — the guide rows know who acknowledged a handoff,
      // which is not the same as who holds the claim.
      mine: r.guide.account_id === c.get("account"),
      by: r.by,
      agent: r.claim.agent_id,
      host: r.claim.host,
      repo: r.claim.repo,
      worktree: r.claim.worktree,
      note: r.claim.note,
      claimed_at: r.claim.claimed_at,
      lease_until: r.claim.lease_until,
    })),
  });
});

app.post("/v1/tasks/next", async (c) => {
  const who = agentOf(c, await c.req.json().catch(() => ({})));
  if (!who.agent) return err(c, 400, NO_AGENT);
  const at = now();
  const got = await claims.next(c.env.DB, who, { at, any: who.any === true });
  if (!got) return c.json({ task: null, ...claims.steps("", "nothing") });
  count(c, "task_claimed", { resumed: got.resumed });
  if (!got.resumed) await taskEvent(c, got.task.id, "task_claimed", got.task.account_id);
  return c.json({
    task: {
      ...taskView(got.task, got.claim, claims.stateOf(got.task, got.claim, at)),
      resumed: got.resumed,
      markdown: got.task.markdown,
    },
    ...claims.steps("task", "taken"),
  });
});

app.put("/v1/tasks/:id/progress", async (c) => {
  const who = agentOf(c, await c.req.json().catch(() => ({})));
  if (!who.agent) return err(c, 400, NO_AGENT);
  const note = typeof who.note === "string" ? who.note : null;
  const claim = await claims.renew(c.env.DB, c.req.param("id"), who, { at: now(), note });
  // The answer an agent needs to stop: somebody released it, or it was never this agent's.
  if (!claim) return stopWith(c, "this agent does not hold that task — stop work on it");
  return c.json({
    id: claim.guide_id,
    lease_until: claim.lease_until,
    note: claim.note,
    ...claims.steps("task", "progress"),
  });
});

app.post("/v1/tasks/:id/finish", async (c) => {
  const who = agentOf(c, await c.req.json().catch(() => ({})));
  if (!who.agent) return err(c, 400, NO_AGENT);
  const report = typeof who.report === "string" ? who.report.trim() : "";
  if (!report) return err(c, 400, "send `report`: the id of the transfer guide about this work");
  const done = await claims.finish(c.env.DB, c.req.param("id"), who, {
    at: now(),
    report,
    evidence: typeof who.evidence === "string" ? who.evidence : "",
    checks: Array.isArray(who.checks) ? (who.checks as claims.Check[]) : [],
    pr: typeof who.pr === "string" ? who.pr : "",
    note: typeof who.note === "string" ? who.note : "",
  });
  if ("error" in done) return err(c, done.status, done.error);
  await claimEvidenceShots(
    c,
    who.account,
    done.claim.guide_id,
    typeof who.evidence === "string" ? who.evidence : "",
  );
  count(c, "task_finished", {});
  await taskEvent(c, done.claim.guide_id, "task_finished", "");
  return c.json({
    id: done.claim.guide_id,
    state: "review",
    report: done.claim.report_id,
    ...claims.steps("task", "handed_in"),
  });
});

// The gate. A person's calls, not an agent's: there is no MCP tool for any of these, because an
// agent approving work — its own or another's — is the thing the gate exists to stop.
app.post("/v1/tasks/:id/approve", async (c) => {
  const r = await claims.approve(c.env.DB, c.req.param("id"), {
    account: c.get("account"),
    at: now(),
  });
  if ("error" in r) return err(c, r.status, r.error);
  count(c, "task_approved", {});
  await taskEvent(c, c.req.param("id"), "task_approved", r.claimant);
  return c.json({ id: c.req.param("id"), state: r.state });
});

app.post("/v1/tasks/:id/reject", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { why?: unknown };
  const r = await claims.reject(c.env.DB, c.req.param("id"), {
    account: c.get("account"),
    at: now(),
    why: typeof body.why === "string" ? body.why : "",
  });
  if ("error" in r) return err(c, r.status, r.error);
  count(c, "task_rejected", {});
  await taskEvent(c, c.req.param("id"), "task_rejected", r.claimant, body.why as string);
  return c.json({ id: c.req.param("id"), state: r.state });
});

/**
 * The author takes their work back from whoever is holding it, whatever kind it is.
 *
 * It was tasks only, which left an asymmetry nobody chose: a task you could reclaim, a handoff you
 * could not — the author's only ways out were `close` (marks it done, which it is not) or assigning
 * it to a third party, which takes it back as a side effect of giving it away.
 *
 * Every live claim goes, because a handoff has one per repo and "take it back" means from whoever
 * has it. A returning agent is refused by the fence rather than writing over whoever holds it next,
 * which is what migration 0029 is for.
 */
// Two paths, one registration. `/v1/tasks/...` is the old spelling — `release` was a task verb
// when the path was written and is every kind's now — and an installed CLI still calls it, where a
// 404 for a command that used to work is worse than a path whose first segment is history.
app.on("POST", ["/v1/guides/:id/release", "/v1/tasks/:id/release"], async (c) => {
  const id = c.req.param("id");
  const r = await claims.release(c.env.DB, id, { account: c.get("account"), at: now() });
  if ("error" in r) return err(c, r.status, r.error);
  count(c, "task_released", {});
  for (const who of r.claimants) await taskEvent(c, id, "task_released", who);
  return c.json({ id, state: r.state, from: r.places });
});

// ---- one set of verbs for every guide (docs/V2.md §11) -----------------------------------------

// take, progress, hand_in, pass: the same four calls whatever kind the guide is. The rules are in
// claims.ts; these read the request, tell the other side, and attach `next` — the calls that make
// sense from here — to every answer, because the answer to its last call is what an agent reads.

/** A refusal that also says what to do: stop, usually. */
const stopWith = (c: Ctx & { json: (b: unknown, s: 409) => Response }, message: string) =>
  c.json({ message, ...claims.steps("", "not_held") }, 409);

/** A guide as the verbs answer it: enough to act on, the document itself when it was just taken. */
function heldView(
  base: string,
  g: {
    id: string;
    title: string;
    kind: string;
    target: string;
    share_key?: string;
    markdown?: string;
  },
  claim: claims.ClaimRow,
) {
  return {
    id: g.id,
    title: g.title,
    kind: g.kind,
    target: g.target,
    url: g.share_key ? shareUrl(base, { id: g.id, share_key: g.share_key }) : "",
    agent: claim.agent_id,
    repo: claim.repo,
    state: claim.state,
    note: claim.note,
    lease_until: claim.lease_until,
    // The claim's generation. The CLI keeps it and sends it back with progress, hand_in and pass;
    // a write carrying the wrong one is a write from a claim that has since been released and
    // re-taken. See migrations/0029_claim_fence.sql.
    fence: claim.fence,
    ...(g.markdown !== undefined ? { markdown: g.markdown } : {}),
  };
}

/**
 * Take one guide by `id`, or with no id the next one waiting for this agent. Any kind. Taking a
 * handoff also says "on it" to its sender, exactly as ack taken=true did, so their board moves.
 */
app.post("/v1/take", async (c) => {
  const who = agentOf(c, await c.req.json().catch(() => ({})));
  if (!who.agent) return err(c, 400, NO_AGENT);
  const at = now();
  const id = typeof who.id === "string" ? who.id.trim() : "";
  const base = origin(c);

  if (!id) {
    const got = await claims.next(c.env.DB, who, { at, any: who.any === true });
    if (!got) return c.json({ guide: null, ...claims.steps("", "nothing") });
    count(c, "task_claimed", { resumed: got.resumed });
    if (!got.resumed) await taskEvent(c, got.task.id, "task_claimed", got.task.account_id);
    // The queue hands out tasks and nothing else — next()'s SQL says `g.kind = 'task'` — so the
    // fallback below is that invariant, not a guess about an empty kind.
    const row = await c.env.DB.prepare("SELECT kind, share_key FROM guide WHERE id = ?")
      .bind(got.task.id)
      .first<{ kind: string; share_key: string }>();
    // Not a default: next() selects `g.kind = 'task'` and returns nothing else, so this is the
    // queue's invariant written down where it is relied on. Reading it off the row and falling
    // back would be a second opinion about what an absent kind means.
    const kind = "task";
    return c.json({
      guide: {
        ...heldView(base, { ...got.task, kind, share_key: row?.share_key }, got.claim),
        resumed: got.resumed,
      },
      ...claims.steps(kind, "taken"),
    });
  }

  const got = await claims.take(c.env.DB, id, who, { at });
  if ("error" in got)
    return c.json(
      {
        message: got.error,
        holder: got.holder
          ? {
              agent: got.holder.agent_id,
              host: got.holder.host,
              repo: got.holder.repo,
              worktree: got.holder.worktree,
              note: got.holder.note,
            }
          : undefined,
      },
      got.status,
    );
  if (!got.resumed) {
    if (got.task.kind === "task") {
      count(c, "task_claimed", { resumed: false });
      await taskEvent(c, id, "task_claimed", got.task.account_id);
    } else if (got.task.account_id !== c.get("account")) {
      const found = await readableGuide(c, id);
      if (found) await recordAck(c, found.row, true, "");
    }
  }
  const share = await c.env.DB.prepare("SELECT share_key FROM guide WHERE id = ?")
    .bind(id)
    .first<{ share_key: string }>();
  return c.json({
    guide: {
      ...heldView(base, { ...got.task, share_key: share?.share_key }, got.claim),
      resumed: got.resumed,
    },
    ...claims.steps(got.task.kind, "taken"),
  });
});

app.put("/v1/guides/:id/progress", async (c) => {
  const who = agentOf(c, await c.req.json().catch(() => ({})));
  if (!who.agent) return err(c, 400, NO_AGENT);
  const note = typeof who.note === "string" ? who.note : null;
  const claim = await claims.renew(c.env.DB, c.req.param("id"), who, {
    at: now(),
    note,
    fence: fenceIn(who.fence),
  });
  if (!claim) return stopWith(c, "this agent does not hold that — stop working on it");
  const kind = await c.env.DB.prepare("SELECT kind FROM guide WHERE id = ?")
    .bind(claim.guide_id)
    .first<{ kind: string }>();
  return c.json({
    id: claim.guide_id,
    lease_until: claim.lease_until,
    note: claim.note,
    ...claims.steps(kind?.kind || "", "progress"),
  });
});

/**
 * Done here. A task needs `report`, the id of the write-up its author reviews against Acceptance.
 * Anything else needs `ok` — did its Verification hold — and a note when it did not, which is the
 * verdict its sender has always heard; the claim, if this agent took it, moves out of working.
 */
/**
 * Evidence against the line it answers, when the agent sorted it that way. Anything that is not a
 * pair of strings is dropped rather than refused: the block of text is still required, so a
 * malformed extra cannot leave a hand-in with nothing to read.
 *
 * A check a local runner executed also carries the command, what the process returned, and whether
 * it holds (packages/passalong/src/checks.js). Those three are taken only as a set: a `cmd` with no
 * `exit` beside it is an agent saying what it would have run, which is the claim this exists to
 * replace.
 */
/** The generation an agent says it is holding, when its client is new enough to have one. */
const fenceIn = (raw: unknown): number | undefined =>
  typeof raw === "number" && Number.isInteger(raw) && raw >= 0 ? raw : undefined;

function checksIn(raw: unknown): claims.Check[] {
  if (!Array.isArray(raw)) return [];
  return (raw as unknown[])
    .filter((c): c is claims.Check => {
      const o = c as { check?: unknown; ran?: unknown };
      return typeof o?.check === "string" && typeof o?.ran === "string";
    })
    .map((c) => {
      const o = c as { cmd?: unknown; exit?: unknown; ok?: unknown };
      const ran = typeof o.cmd === "string" && (typeof o.exit === "number" || o.exit === null);
      if (!ran) return { check: c.check, ran: c.ran };
      return {
        check: c.check,
        ran: c.ran,
        cmd: o.cmd as string,
        exit: o.exit as number | null,
        ok: o.ok === true,
      };
    })
    .slice(0, 50);
}

app.post("/v1/guides/:id/hand_in", async (c) => {
  const who = agentOf(c, await c.req.json().catch(() => ({})));
  if (!who.agent) return err(c, 400, NO_AGENT);
  const found = await readableGuide(c, c.req.param("id"));
  if (!found) return err(c, 404, GUIDE_GONE);
  const at = now();
  const note = typeof who.note === "string" ? who.note.trim().slice(0, NOTE_MAX) : "";

  const evidence = typeof who.evidence === "string" ? who.evidence : "";
  const checks = checksIn(who.checks);
  // What had to be adapted to make it work where they ran it. Never required: most hand-ins have
  // nothing to add, and a field an agent must fill gets filled with "nothing to report".
  const writeup =
    typeof who.writeup === "string" ? who.writeup.trim().slice(0, claims.WRITEUP_MAX) : "";
  // What it could break — the PR template's "Risk", for whoever reviews it. Optional for the same
  // reason as the write-up: required, it is "low risk" on every hand-in and says nothing.
  const risk = typeof who.risk === "string" ? who.risk.trim().slice(0, NOTE_MAX) : "";

  if (found.row.kind === "task") {
    const report = typeof who.report === "string" ? who.report.trim() : "";
    if (!report) return err(c, 400, "send `report`: the id of the transfer guide about this work");
    const done = await claims.finish(c.env.DB, found.row.id, who, {
      at,
      report,
      evidence,
      checks,
      fence: fenceIn(who.fence),
      pr: typeof who.pr === "string" ? who.pr : "",
      note,
      risk,
    });
    if ("error" in done)
      return done.status === 409 ? stopWith(c, done.error) : err(c, done.status, done.error);
    await claimEvidenceShots(c, who.account, found.row.id, evidence);
    count(c, "task_finished", {});
    await taskEvent(c, found.row.id, "task_finished", "");
    return c.json({
      id: found.row.id,
      state: "review",
      report: done.claim.report_id,
      ...claims.steps("task", "handed_in"),
    });
  }

  if (typeof who.ok !== "boolean")
    return err(
      c,
      400,
      'Say whether its Verification held: send "ok": true, or "ok": false with a note.',
    );
  if (!who.ok && !note) return err(c, 400, "Say what went wrong, so the author knows what to fix.");
  if (found.owner) return err(c, 403, "This is your own guide: there is nobody to hand it in to.");
  // Evidence before the verdict is recorded: a refused hand-in must leave nothing behind, or the
  // author is told "it worked" by a call that did not go through. Checks are evidence sorted
  // against the Verification line each one answers, and bringing them is bringing it.
  const bad = checks.length ? claims.checksProblem(checks) : claims.evidenceProblem(evidence);
  if (bad) return err(c, 400, bad);
  // The evidence the agent just sent, on the verdict as well as the claim. This is the correction
  // channel: a hand-in that says it did not hold now carries what was run, and the guide shows it.
  await recordVerdict(c, found.row, who.ok, note, {
    detail: evidence,
    checks: checks.length ? JSON.stringify(checks) : "",
    writeup,
  });
  await claims.handIn(c.env.DB, found.row.id, who, {
    at,
    note,
    evidence,
    checks,
    writeup,
    risk,
    fence: fenceIn(who.fence),
  });
  await claimEvidenceShots(c, who.account, found.row.id, evidence);
  return c.json({
    id: found.row.id,
    ok: who.ok,
    note,
    ...claims.steps(found.row.kind, "handed_in"),
  });
});

/**
 * Not this agent's to do, with the reason. What it held is open again; on a handoff the sender is
 * told "not me, and why", the way ack taken=false always told them.
 */
app.post("/v1/guides/:id/pass", async (c) => {
  const who = agentOf(c, await c.req.json().catch(() => ({})));
  if (!who.agent) return err(c, 400, NO_AGENT);
  const found = await readableGuide(c, c.req.param("id"));
  if (!found) return err(c, 404, GUIDE_GONE);
  const why = typeof who.why === "string" ? who.why : "";
  const r = await claims.pass(c.env.DB, found.row.id, who, {
    at: now(),
    why,
    fence: fenceIn(who.fence),
  });
  // Passing a handoff nobody took is still a real answer to its sender: not me, and why.
  if ("error" in r && !(r.status === 409 && found.row.kind !== "task" && !found.owner))
    return r.status === 409 ? stopWith(c, r.error) : err(c, r.status, r.error);
  if (found.row.kind === "task") {
    count(c, "task_passed", {});
    await taskEvent(c, found.row.id, "task_released", found.row.account_id, why);
  } else if (!found.owner) {
    await recordAck(c, found.row, false, why.trim().slice(0, NOTE_MAX));
  }
  return c.json({ id: found.row.id, passed: true, ...claims.steps(found.row.kind, "passed") });
});

// ---- reassigning: who a guide is for, changed after it was sent ---------------------------------

/**
 * Give a guide or task to someone else in its team: `to` is `@handle` for one person, `#group` for
 * the people who do a thing, or empty for the whole team. Only its author decides.
 *
 * The frontmatter's `to:` is rewritten, so the document says who it is for wherever it travels.
 * Anyone holding it whom the new assignment leaves out has it taken back (claims.dropOutside) and
 * is told; on a task the queue then only hands it to the new assignee's agents. The new person, or
 * the group's members, are told it is theirs.
 */
app.post("/v1/guides/:id/assign", async (c) => {
  const found = await readableGuide(c, c.req.param("id"));
  if (!found) return err(c, 404, GUIDE_GONE);
  const row = found.row;
  const me = c.get("account");
  // Its author, or whoever it is assigned to — the person, or anyone in the group — may pass it on.
  // Assigned to the whole team, it is nobody's in particular, and only its author moves it.
  const assignee =
    row.to_account_id === me ||
    (row.to_group_id !== "" &&
      Boolean(
        await c.env.DB.prepare("SELECT 1 FROM group_member WHERE group_id = ? AND account_id = ?")
          .bind(row.to_group_id, me)
          .first(),
      ));
  if (!found.owner && !assignee)
    return err(
      c,
      403,
      "Only its author, or whoever it is assigned to, can give it to someone else.",
    );
  if (!row.team_id)
    return err(
      c,
      400,
      "It isn't in a team, so there is nobody to give it to. Send it to a team first.",
    );
  const team = await c.env.DB.prepare("SELECT id, slug, name FROM team WHERE id = ?")
    .bind(row.team_id)
    .first<{ id: string; slug: string; name: string }>();
  if (!team) return err(c, 404, GUIDE_GONE);
  const body = (await c.req.json().catch(() => ({}))) as { to?: unknown };
  const raw = typeof body.to === "string" ? body.to.trim().replace(/^[^/@#]+\//, "") : "";

  let person: { id: string; handle: string } | null = null;
  let group: { id: string; slug: string } | null = null;
  let accounts: string[] | null = null;
  if (raw.startsWith("#")) {
    group = await c.env.DB.prepare("SELECT id, slug FROM team_group WHERE slug = ? AND team_id = ?")
      .bind(tag(raw.slice(1)), team.id)
      .first<{ id: string; slug: string }>();
    if (!group) return err(c, 400, `${team.name} has no group called ${raw}.`);
    const { results } = await c.env.DB.prepare(
      "SELECT account_id FROM group_member WHERE group_id = ?",
    )
      .bind(group.id)
      .all<{ account_id: string }>();
    accounts = results.map((r) => r.account_id);
  } else if (raw) {
    const handle = raw.replace(/^@/, "").toLowerCase();
    // By @name, or by account id for a teammate who has not chosen one.
    person = await c.env.DB.prepare(
      `SELECT a.id, a.handle FROM account a JOIN membership m ON m.account_id = a.id
        WHERE (a.handle = ?1 OR (a.handle = '' AND a.id = ?1)) AND m.team_id = ?2`,
    )
      .bind(handle, team.id)
      .first<{ id: string; handle: string }>();
    if (!person) return err(c, 400, `@${handle} isn't in ${team.name}.`);
    accounts = [person.id];
  }
  // A teammate who never chose an @name is addressed by their account id, which is what the
  // frontmatter then says: every path that reads `to:` resolves either.
  const address = person ? `@${person.handle || person.id}` : "";
  const label = person ? address : group ? `#${group.slug}` : `everyone in ${team.name}`;
  const at = now();

  const dropped = await claims.dropOutside(c.env.DB, row.id, {
    accounts,
    at,
    why: `reassigned to ${label}`,
  });
  // Their "on it" goes with the work: anyone the new assignment leaves out said they were taking
  // something that is no longer theirs, and left in place it kept the guide in their Needs you as
  // "you're taking it". The author's own answer, if any, is not theirs to lose.
  if (accounts) {
    const keep = new Set([...accounts, row.account_id]);
    const { results: acks } = await c.env.DB.prepare(
      "SELECT account_id FROM ack WHERE guide_id = ? AND taken = 1",
    )
      .bind(row.id)
      .all<{ account_id: string }>();
    const gone = acks.map((a) => a.account_id).filter((a) => !keep.has(a));
    if (gone.length)
      await c.env.DB.batch(
        gone.map((a) =>
          c.env.DB.prepare("DELETE FROM ack WHERE guide_id = ? AND account_id = ?").bind(row.id, a),
        ),
      );
  }

  // Read again: taking a task back writes a line into it.
  const current = await c.env.DB.prepare("SELECT markdown FROM guide WHERE id = ?")
    .bind(row.id)
    .first<{ markdown: string }>();
  const md = current?.markdown ?? row.markdown;
  const markdown = person
    ? setField(md, "to", address)
    : group
      ? setField(md, "to", `#${group.slug}`)
      : dropField(md, "to");
  await c.env.DB.prepare(
    "UPDATE guide SET markdown = ?, to_account_id = ?, to_group_id = ?, updated = ? WHERE id = ?",
  )
    .bind(markdown, person?.id || "", group?.id || "", at, row.id)
    .run();

  for (const to of dropped)
    await notify(c.env, {
      to,
      kind: "reassigned",
      guide_id: row.id,
      actor_id: me,
      team_id: team.id,
      note: label,
    });
  for (const to of accounts ?? [])
    await notify(c.env, { to, kind: "handoff", guide_id: row.id, actor_id: me, team_id: team.id });
  // Passed on by its assignee: the author hears where their work went. notify() drops an event
  // addressed to whoever caused it, so an author reassigning their own hears nothing.
  if (!dropped.includes(row.account_id))
    await notify(c.env, {
      to: row.account_id,
      kind: "reassigned",
      guide_id: row.id,
      actor_id: me,
      team_id: team.id,
      note: label,
    });
  count(c, "guide_reassigned", { to: person ? "person" : group ? "group" : "team" });
  return c.json({
    id: row.id,
    to: person ? address : group ? `#${group.slug}` : "",
    taken_back: dropped.length,
  });
});

// ---- the author's close on a handed-in handoff or bug -------------------------------------------

/** Handoffs and bugs you wrote that somebody handed in, waiting for you to close or send back. */
app.get("/v1/handed_in", async (c) => {
  const base = origin(c);
  const rows = await claims.handedIn(c.env.DB, c.get("account"));
  return c.json({
    handed_in: rows.map((r) => ({
      id: r.guide.id,
      title: r.guide.title,
      kind: r.guide.kind,
      url: shareUrl(base, r.guide),
      place: r.claim.place,
      by: r.by,
      agent: r.claim.agent_id,
      host: r.claim.host,
      worktree: r.claim.worktree,
      note: r.claim.note,
      evidence: r.claim.evidence,
      // The same evidence sorted against the Verification line each part answers, when the agent
      // sent it that way. The flat block stays, because a hand-in from before this, or from a
      // person in the browser, has only that.
      checks: r.claim.checks,
      // What they had to adapt. The author sees it here before they close, and the next person to
      // open the guide sees it there; both, because the author is the one who decides whether the
      // guide itself should change, and they cannot decide that from a row that hides it.
      writeup: r.claim.writeup,
      // What they think it could break, so the author knows where to look before closing.
      risk: r.claim.risk,
      at: r.claim.updated,
    })),
  });
});

/** Accept what was handed in: the guide is done, and whoever had it is told. */
/**
 * Who a guide was addressed to: the person named, else the group's members, else the team.
 *
 * `already` is who has been told something else about it already — whoever held it hears `closed`
 * rather than `consumed`, and one event twice in two sentences is worse than once.
 */
async function addressees(
  c: Ctx & { env: Env },
  row: GuideRow | undefined,
  already: string[] = [],
): Promise<string[]> {
  if (!row) return [];
  const seen = new Set([row.account_id, ...already]);
  const keep = (ids: string[]) => ids.filter((id) => id && !seen.has(id));
  if (row.to_account_id) return keep([row.to_account_id]);
  if (row.to_group_id) {
    const { results } = await c.env.DB.prepare(
      "SELECT account_id FROM group_member WHERE group_id = ?",
    )
      .bind(row.to_group_id)
      .all<{ account_id: string }>();
    return keep(results.map((r) => r.account_id));
  }
  if (row.team_id) {
    const { results } = await c.env.DB.prepare(
      "SELECT account_id FROM membership WHERE team_id = ?",
    )
      .bind(row.team_id)
      .all<{ account_id: string }>();
    return keep(results.map((r) => r.account_id));
  }
  return [];
}

app.post("/v1/guides/:id/close", async (c) => {
  const r = await claims.closeGuide(c.env.DB, c.req.param("id"), {
    account: c.get("account"),
    at: now(),
  });
  if ("error" in r) return err(c, r.status, r.error);
  const found = await readableGuide(c, c.req.param("id"));
  const id = c.req.param("id");
  const team_id = found?.row.team_id || "";
  for (const to of r.claimants)
    await notify(c.env, { to, kind: "closed", guide_id: id, actor_id: c.get("account"), team_id });
  // And whoever it was addressed to, who is usually nobody in `claimants` — that is the whole
  // case this exists for: a guide the receiver never opened. `closed` reads as "accepted your
  // work", which is wrong for somebody who did none, so they hear `consumed`: it is done with.
  for (const to of await addressees(c, found?.row, r.claimants))
    await notify(c.env, {
      to,
      kind: "consumed",
      guide_id: id,
      actor_id: c.get("account"),
      team_id,
    });
  count(c, "handoff_closed", {});
  return c.json({ id, state: "done" });
});

/** Turn one repo's hand-in down, with why: it is open there again, and its taker is told. */
app.post("/v1/guides/:id/send_back", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { place?: unknown; why?: unknown };
  const why = typeof body.why === "string" ? body.why.trim().slice(0, 1000) : "";
  const r = await claims.sendBackHandedIn(c.env.DB, c.req.param("id"), {
    account: c.get("account"),
    at: now(),
    place: typeof body.place === "string" ? body.place : "",
    why,
  });
  if ("error" in r) return err(c, r.status, r.error);
  const found = await readableGuide(c, c.req.param("id"));
  await notify(c.env, {
    to: r.claimant,
    kind: "sent_back",
    guide_id: c.req.param("id"),
    actor_id: c.get("account"),
    team_id: found?.row.team_id || "",
    note: why,
  });
  count(c, "handoff_sent_back", {});
  return c.json({ id: c.req.param("id"), state: "open" });
});

app.delete("/v1/guides/:id", async (c) => {
  const found = await readableGuide(c, c.req.param("id"));
  if (!found) return err(c, 404, GUIDE_GONE);
  if (!found.owner) return err(c, 403, "Only the author can delete a guide.");
  // Before the guide, so a failure leaves the guide to try again rather than orphaning its
  // evidence with nothing left pointing at it.
  await dropShots(c, found.row.id);
  await c.env.DB.prepare("DELETE FROM guide WHERE id = ?").bind(found.row.id).run();
  return c.json({ id: found.row.id, deleted: true });
});

// ---- share links ------------------------------------------------------------------------

async function shared(c: { env: Env }, id: string, key: string): Promise<GuideRow | null> {
  if (!ID_RE.test(id) || !/^[a-z0-9]{16,32}$/.test(key)) return null;
  return c.env.DB.prepare("SELECT * FROM guide WHERE id = ? AND share_key = ?")
    .bind(id, key)
    .first<GuideRow>();
}

// A guide's raw markdown is the owner's own text, but a share link is fetched by other people —
// and by agents. The CSP turns anything script-shaped in it inert instead of trusting a sanitizer.
// The same header on the rendered page now comes from apps/web's route rules (shared/csp.ts).
const VIEW_HEADERS = {
  "content-security-policy":
    "default-src 'none'; style-src 'self'; font-src 'self'; img-src 'self' https: data:; manifest-src 'self'; base-uri 'none'; form-action 'none'",
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
  // A share link is for whoever holds it. The raw markdown has no <head> for a noindex meta.
  "x-robots-tag": "noindex, nofollow, noarchive",
};

app.get("/g/:id/:key{.+\\.md}", async (c) => {
  const row = await shared(c, c.req.param("id"), c.req.param("key").replace(/\.md$/, ""));
  if (!row) return c.text("no such guide", 404);
  await recordPull(c, row, "", "link");
  return c.text(row.markdown, 200, {
    "content-type": "text/markdown; charset=utf-8",
    ...VIEW_HEADERS,
  });
});

// The unfurl card. Deliberately not counted as a pull: this is fetched by crawlers, not people.
// A miss answers with a bare 404 rather than the 404 *page* — this endpoint returns an image, and
// its caller is an unfurler that will never render HTML.
// The site's own unfurl card. `/` is the page most people meet first and it had no image at all,
// so a link to the product previewed as a bare text row — the same blank card the guide pages were
// fixed for. Static in every sense: it takes no parameters and changes only when this code does.
app.get("/og.png", async (c) => renderSiteOgImage(c.env, origin(c), later(c)));

app.get("/g/:id/:key/og.png", async (c) => {
  const row = await shared(c, c.req.param("id"), c.req.param("key"));
  if (!row) return c.text("no such guide", 404, VIEW_HEADERS);
  const people = await accounts(c, [row.account_id]);
  return renderOgImage(
    c.env,
    c.req.url,
    { id: row.id, meta: parseMeta(row.markdown), from: nameOf(people, row.account_id) },
    later(c),
  );
});

/** `waitUntil`, where there is an execution context. Accessing it throws where there is none. */
function later(c: { executionCtx: { waitUntil(p: Promise<unknown>): void } }) {
  try {
    const ctx = c.executionCtx;
    return (p: Promise<unknown>) => ctx.waitUntil(p);
  } catch {
    return undefined;
  }
}

/**
 * The API, described for agents that only speak HTTP — a ChatGPT action, Gemini function calling,
 * anything that cannot run `passalong mcp` because that is a local process. See openapi.ts for
 * what it deliberately leaves out.
 */
app.get("/v1/openapi.json", (c) =>
  c.json(openapi(origin(c)), 200, { "cache-control": "public, max-age=300" }),
);

/**
 * The MCP server at an address.
 *
 * `passalong mcp` is stdio and reaches only what can run a local process. This is the same tools
 * over HTTP, for assistants that add outside tools as remote servers.
 *
 * It sits under `/v1/` so the credential middleware above has already run: the bearer token that
 * authenticates every other call authenticates this one, and a tool never sees a request the API
 * would have refused. Each tool then dispatches back through this same app carrying that header,
 * so there is one implementation of every rule and it is the route.
 */
app.all("/v1/mcp", async (c) => {
  if (c.req.method !== "POST") {
    // No session and no server-initiated messages, so there is nothing for a GET stream or a
    // DELETE to do. Say which method works rather than answering an empty stream.
    return c.json({ message: "POST JSON-RPC to this endpoint" }, 405, { allow: "POST" });
  }
  const base = origin(c);
  const vocabulary = {
    areas: AREAS.map((a) => a.slug).join(", "),
    severities: SEVERITIES.map((s) => `${s.slug} ${s.label.toLowerCase()}`).join(", "),
    shotTypes: `Accepts ${Object.keys(SHOT_TYPES).join(", ")}`,
  };
  return handleMcp(
    c.req.raw,
    async (method, path, body, raw) => {
      // `raw` means the body is already bytes and says what they are — `/v1/shots` reads an image,
      // not JSON. Everything else is serialised as it always was.
      const headers = raw
        ? { "content-type": raw.contentType, ...(raw.headers || {}) }
        : body === undefined
          ? {}
          : { "content-type": "application/json" };
      const res = await app.fetch(
        asAccount(
          new Request(`${base}${path}`, {
            method,
            headers,
            body:
              body === undefined ? undefined : raw ? (body as ArrayBuffer) : JSON.stringify(body),
          }),
          c.get("account"),
        ),
        c.env,
        c.executionCtx,
      );
      return { status: res.status, text: await res.text() };
    },
    vocabulary,
  );
});

// ---- oauth ---------------------------------------------------------------------------------

/**
 * Discovery. Both documents are public and neither is a use of the API: a client reads them before
 * it has any credential at all, which is the point.
 */
app.get("/.well-known/oauth-authorization-server", (c) =>
  c.json(authorizationServerMetadata(origin(c)), 200, { "cache-control": "public, max-age=300" }),
);
app.get("/.well-known/oauth-protected-resource", (c) =>
  c.json(protectedResourceMetadata(origin(c)), 200, { "cache-control": "public, max-age=300" }),
);
// Some clients look for the resource document beneath the resource's own path rather than at the
// host root. Answering both costs one line and saves a support conversation.
app.get("/.well-known/oauth-protected-resource/v1/mcp", (c) =>
  c.json(protectedResourceMetadata(origin(c)), 200, { "cache-control": "public, max-age=300" }),
);

/**
 * Where the client sends the person, and where the person says yes.
 *
 * This route does not render the consent screen — /oauth/consent does, as a page, because it needs
 * the session cookie and a person reading it. What happens here is only validation: refuse an
 * unusable request outright, and hand a usable one to the page with everything it needs.
 *
 * The redirect_uri is checked before anything is bounced back to it. Sending an error to an
 * unregistered address is how an authorization server becomes an open redirector.
 */
app.get("/oauth/authorize", async (c) => {
  const q = c.req.query();
  // A person is looking at this response, and neither problem can be sent back to the client: an
  // unknown client has nowhere trusted to go, and a mismatched redirect is the address we must not
  // use. So both go to the consent page, which says what to do in words rather than a status line.
  const problem = (kind: string) => c.redirect(`${origin(c)}/oauth/consent?problem=${kind}`, 302);
  const client = await findClient(
    c.env.DB,
    q.client_id || "",
    registrationCutoff(new Date(), DYNAMIC_TTL_MS),
  );
  if (!client) return problem("unknown_client");
  const redirect = pickRedirect(client.redirect_uris, q.redirect_uri);
  if (!redirect) return problem("redirect_mismatch");

  if (q.response_type !== "code") {
    return c.redirect(
      errorRedirect(redirect, q.state, "unsupported_response_type", "only `code` is supported"),
    );
  }
  if (!q.code_challenge || (q.code_challenge_method || "plain") !== "S256") {
    return c.redirect(
      errorRedirect(redirect, q.state, "invalid_request", "PKCE with S256 is required"),
    );
  }
  const url = new URL(`${origin(c)}/oauth/consent`);
  for (const [k, v] of Object.entries(q)) url.searchParams.set(k, v);
  url.searchParams.set("redirect_uri", redirect);
  // The page does not take the name from its own address bar — anyone can write a link to
  // /oauth/consent with any name in it. It asks /v1/oauth/consent, which reads the database.
  url.searchParams.delete("client_name");
  return c.redirect(url.toString(), 302);
});

/**
 * RFC 7591 dynamic client registration: how Claude or ChatGPT connect from one pasted address.
 *
 * Unauthenticated, because that is what it is for. The rules that make that safe:
 *
 * - A registration grants nothing. It is stored in `oauth_registration`, which the token endpoint
 *   never reads; it becomes a client only when a signed-in person approves it on the consent page,
 *   and approval takes the session cookie, never a bearer token (/v1/oauth/approve).
 * - Public clients only. `token_endpoint_auth_method` is always `none`, so no secret exists to
 *   leak, and PKCE with S256 is required at authorize and checked at the token endpoint.
 * - Redirect URIs: https, or http for loopback only; no fragments, wildcards or userinfo; at most
 *   five, each under 2000 characters (validateRegistration in oauth.ts). At authorize they are
 *   exact-matched, with only the RFC 8252 loopback-port allowance.
 * - `client_name` is capped and stripped of control and bidi characters, and the consent page
 *   shows the redirect host beside it, so a registration cannot pass itself off as someone else.
 * - Throttled per IP with its own rate-limit binding, the body is capped, and registrations
 *   nobody approved are deleted after 24 hours — here, lazily, and by the nightly sweep.
 */
app.post("/v1/oauth/register", async (c) => {
  const refuse = (status: number, error: string, description: string) =>
    c.json({ error, error_description: description }, status as 400, {
      "cache-control": "no-store",
    });

  if (c.env.OAUTH_REGISTER_LIMIT) {
    const ip = c.req.header("cf-connecting-ip") || "unknown";
    const { success } = await c.env.OAUTH_REGISTER_LIMIT.limit({ key: ip });
    if (!success) {
      return c.json(
        {
          error: "too_many_requests",
          error_description: "too many registrations from this address; try again in a minute",
        },
        429,
        { "retry-after": "60", "cache-control": "no-store" },
      );
    }
  }

  // A registration is a few hundred bytes. Anything much larger is not one.
  const raw = await c.req.text().catch(() => "");
  if (raw.length > 16_000) {
    return refuse(400, "invalid_client_metadata", "the registration is too large");
  }
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return refuse(400, "invalid_client_metadata", "the registration must be a JSON object");
  }
  const result = validateRegistration(body);
  if (!result.ok) return refuse(400, result.error, result.error_description);

  const issued = new Date();
  const id = `pa_client_${rid(24)}`;
  await saveRegistration(c.env.DB, id, result.registration, issued.toISOString());

  // Lazy expiry, off the response path, so the table cannot grow between nightly sweeps.
  try {
    c.executionCtx.waitUntil(
      sweepRegistrations(c.env.DB, registrationCutoff(issued, DYNAMIC_TTL_MS)).catch(() => 0),
    );
  } catch {}
  count(c, "oauth_registered", {});
  return c.json(registrationResponse(id, issued, result.registration), 201, {
    "cache-control": "no-store",
  });
});

/**
 * What the consent page shows: the client's name and where approving sends you.
 *
 * Read from the database rather than the page's query string, so a hand-written link cannot put a
 * different name on the screen. The host is the one the code will actually be sent to.
 */
app.get("/v1/oauth/consent", async (c) => {
  const q = c.req.query();
  const client = await findClient(
    c.env.DB,
    q.client_id || "",
    registrationCutoff(new Date(), DYNAMIC_TTL_MS),
  );
  if (!client) return err(c, 404, "unknown client_id");
  const redirect = pickRedirect(client.redirect_uris, q.redirect_uri);
  if (!redirect) return err(c, 400, "redirect_uri does not match one registered for this client");
  return c.json({
    name: client.name,
    host: redirectHost(redirect),
    registered: client.registered,
  });
});

/**
 * The person approved. Mint the code.
 *
 * Session cookie only — never a bearer token. Approving a grant is something a person does in a
 * browser, and accepting an API token here would let one credential silently mint another.
 */
app.post("/v1/oauth/approve", async (c) => {
  // Session cookie only, checked here rather than assumed: the middleware above accepts either
  // credential, so without this an API token could mint a connector grant — one credential
  // quietly creating another, longer-lived one, which is the laundering this whole flow exists to
  // prevent. Approving is something a person does in a browser.
  if (!readCookie(c.req.header("cookie"), SESSION_COOKIE)) {
    return err(
      c,
      403,
      "approve a connector while signed in to your hub — a token cannot grant one",
    );
  }
  const account = c.get("account");
  type Approval = {
    client_id?: string;
    redirect_uri?: string;
    state?: string;
    code_challenge?: string;
  };
  const body = await c.req.json<Approval>().catch(() => ({}) as Approval);
  const client = await findClient(
    c.env.DB,
    body.client_id || "",
    registrationCutoff(new Date(), DYNAMIC_TTL_MS),
  );
  if (!client) return err(c, 400, "unknown client_id");
  const redirect = pickRedirect(client.redirect_uris, body.redirect_uri);
  if (!redirect) return err(c, 400, "redirect_uri does not match the one registered");
  if (!body.code_challenge) return err(c, 400, "PKCE with S256 is required");

  // The step that lets a client get a token at all. A self-registered client becomes a real one
  // here, owned by the person approving, and appears in their Settings → Connectors from now on.
  await recordApproval(c.env.DB, client, account, now());

  const code = await issueCode(c.env.DB, {
    client_id: client.id,
    account_id: account,
    challenge: body.code_challenge,
    method: "S256",
    redirect_uri: redirect,
    scope: MCP_SCOPE,
  });
  const url = new URL(redirect);
  url.searchParams.set("code", code);
  if (body.state) url.searchParams.set("state", body.state);
  count(c, "oauth_granted", {});
  return c.json({ redirect: url.toString() });
});

/**
 * Code for tokens, or refresh for tokens.
 *
 * Public. The client proves itself here with PKCE, or with its secret if it was given one — which
 * is why this is the one `/v1/*` path outside the credential middleware.
 */
app.post("/v1/oauth/token", async (c) => {
  const form = await c.req.parseBody().catch(() => ({}) as Record<string, string>);
  const field = (name: string) => String((form as Record<string, unknown>)[name] ?? "");

  // client_secret_basic puts the credentials in the header; client_secret_post puts them in the
  // body; a public client sends only its id. All three end up as the same two values.
  let clientId = field("client_id");
  let clientSecret = field("client_secret");
  const basic = c.req.header("authorization") || "";
  const usedBasic = basic.startsWith("Basic ");
  if (usedBasic) {
    // A malformed header is a client that failed to authenticate, not a server error.
    try {
      const decoded = atob(basic.slice(6));
      const colon = decoded.indexOf(":");
      clientId = decodeURIComponent(colon < 0 ? decoded : decoded.slice(0, colon));
      clientSecret = decodeURIComponent(colon < 0 ? "" : decoded.slice(colon + 1));
    } catch {
      clientId = "";
      clientSecret = "";
    }
  }

  // Approved clients only: a self-registration nobody has approved is not in the table this reads.
  const client = await tokenClient(c.env.DB, clientId);
  const refusal = clientRefusal(
    client,
    clientSecret ? await sha256(clientSecret) : "",
    clientSecret,
  );
  if (refusal || !client) {
    const reason = refusal ?? "unknown_client";
    // The reason and the method, never the secret: this is what `wrangler tail` shows when a
    // connector's settings page says only that it failed.
    console.warn(
      JSON.stringify({
        event: "oauth_token_refused",
        reason,
        client_id: clientId.slice(0, 64),
        method: usedBasic ? "client_secret_basic" : clientSecret ? "client_secret_post" : "none",
      }),
    );
    // Kept on the client when there is one, so Settings can show the reason beside the connector
    // instead of leaving it in a log line nobody reads.
    if (client) await recordRefusal(c.env.DB, client.id, reason, now());
    // RFC 6749 §5.2: a client that tried HTTP Basic is told which scheme to retry with.
    return c.json(
      invalidClient(reason),
      401,
      usedBasic ? { "www-authenticate": 'Basic realm="passalong"' } : {},
    );
  }

  const grantType = field("grant_type");

  if (grantType === "refresh_token") {
    const presented = field("refresh_token");
    const row = await c.env.DB.prepare(
      "SELECT * FROM oauth_token WHERE refresh_hash = ? AND client_id = ?",
    )
      .bind(await sha256(presented), client.id)
      .first<{ access_hash: string; account_id: string; scope: string }>();
    if (!row) return c.json({ error: "invalid_grant" }, 400);
    await clearRefusal(c.env.DB, client.id);
    // Rotation: the old pair goes as the new one is written, so a refresh token is worth one use.
    return c.json(
      await issueTokens(
        c.env.DB,
        { client_id: client.id, account_id: row.account_id, scope: row.scope },
        row.access_hash,
      ),
    );
  }

  if (grantType !== "authorization_code") {
    return c.json({ error: "unsupported_grant_type" }, 400);
  }

  const row = await c.env.DB.prepare("SELECT * FROM oauth_code WHERE code = ?")
    .bind(await sha256(field("code")))
    .first<{
      code: string;
      client_id: string;
      account_id: string;
      challenge: string;
      redirect_uri: string;
      scope: string;
      expires: string;
      redeemed: string;
    }>();
  if (!row || row.client_id !== client.id) return c.json({ error: "invalid_grant" }, 400);
  if (row.redeemed || row.expires <= now()) return c.json({ error: "invalid_grant" }, 400);
  if (field("redirect_uri") && !timingSafeEqual(row.redirect_uri, field("redirect_uri"))) {
    return c.json({ error: "invalid_grant" }, 400);
  }
  if (!(await pkceMatches(field("code_verifier"), row.challenge))) {
    return c.json({ error: "invalid_grant", error_description: "PKCE verification failed" }, 400);
  }

  // Spent before the tokens exist: a code that races itself redeems once.
  await c.env.DB.prepare("UPDATE oauth_code SET redeemed = ? WHERE code = ? AND redeemed = ''")
    .bind(now(), row.code)
    .run();
  count(c, "oauth_token_issued", {});
  await clearRefusal(c.env.DB, client.id);
  return c.json(
    await issueTokens(c.env.DB, {
      client_id: client.id,
      account_id: row.account_id,
      scope: row.scope,
    }),
  );
});

/** Hand a token back. Public, per RFC 7009: a client giving up a credential should never be told no. */
app.post("/v1/oauth/revoke", async (c) => {
  const form = await c.req.parseBody().catch(() => ({}) as Record<string, string>);
  const token = String((form as Record<string, unknown>).token ?? "");
  if (token) {
    const hash = await sha256(token);
    await c.env.DB.prepare("DELETE FROM oauth_token WHERE access_hash = ? OR refresh_hash = ?")
      .bind(hash, hash)
      .run();
  }
  return c.body(null, 200);
});

/**
 * The connectors you can see and disconnect: the ones you created, and the ones you approved.
 * `host` is where each sends its codes, which is how a person recognises "claude.ai".
 */
app.get("/v1/oauth/clients", async (c) => {
  const clients = await listConnectors(c.env.DB, c.get("account"));
  return c.json({
    clients: clients.map((client) => ({ ...client, host: redirectHost(client.redirect_uri) })),
  });
});

/**
 * Register a connector.
 *
 * The secret is optional and the default is not to have one: a public client with PKCE is the
 * better shape when the "client" is a configuration form in somebody else's product. When one is
 * asked for it is shown once, like every other credential here.
 */
app.post("/v1/oauth/clients", async (c) => {
  const account = c.get("account");
  type NewClient = { name?: string; redirect_uri?: string; confidential?: boolean };
  const body = await c.req.json<NewClient>().catch(() => ({}) as NewClient);
  const redirect = String(body.redirect_uri || "").trim();
  if (!/^https:\/\/[^\s]+$/.test(redirect)) {
    return err(c, 400, "redirect_uri must be an https URL — copy it from the connector's form");
  }
  const id = `pa_client_${rid(20)}`;
  const secret = body.confidential ? `pa_cs_${rid(40)}` : "";
  await c.env.DB.prepare(
    `INSERT INTO oauth_client (id, account_id, name, secret_hash, redirect_uri, created)
     VALUES (?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      account,
      String(body.name || "").slice(0, 60),
      secret ? await sha256(secret) : "",
      redirect,
      now(),
    )
    .run();
  // Shown once. There is no route that returns it again.
  return c.json({ client: { id, secret, redirect_uri: redirect } }, 201);
});

app.delete("/v1/oauth/clients/:id", async (c) => {
  const id = c.req.param("id");
  // Everything it holds for you stops working now, not in an hour when its access token happens
  // to expire. A connector you created is revoked outright; one you approved is disconnected from
  // you — see disconnect() in oauth-clients.ts for why those differ.
  if (!(await disconnect(c.env.DB, id, c.get("account"), now()))) {
    return err(c, 404, "no such client");
  }
  return c.json({ id, revoked: true });
});

app.get("/health", (c) => c.json({ ok: true }));

// Every route this app serves is machine-facing now, so a miss is JSON rather than a page. The
// pages — `/`, `/g/:id/:key`, `/hub`, `/join/:code`, `/reset` and the 404 itself — are Nuxt's,
// and a request that matches none of the routes above never reaches here: apps/web's middleware
// only hands over `/v1/*`, `/health` and the two machine routes.
app.notFound((c) => err(c, 404, "There's nothing at this address."));

// The real error goes to the log. The person gets a sentence that is true and says what to do.
app.onError((e, c) => {
  console.error(e);
  return err(c, 500, "Something went wrong on our side. Try again in a moment.");
});

export default app;
