// The shapes `/v1/*` returns. Only the fields the hub actually reads — the API sends more, and
// pinning the rest here would just be a second place to keep in step with apps/api.

export interface Team {
  slug: string;
  name: string;
  role: string;
  /** "free", "team" or "lapsed". A lapsed team is read-only — see apps/api/src/quota.ts. */
  plan: string;
}

export interface Me {
  account: string;
  handle: string | null;
  name: string | null;
  email: string | null;
  /** False for an account minted by `passalong login` or an invite: a token, and no way to sign in. */
  has_password: boolean;
  guides: number;
  /** Only meaningful when `sync` is "free". See apps/api/src/quota.ts. */
  limit: number;
  /** "unlimited" | "free" | "none" — a falsy `limit` cannot tell the first from the last. */
  sync: string;
  /** This account's own subscription: "free", "solo" or "lapsed". Not the same fact as `sync` — a
      member of a paid team syncs without a ceiling and is still on `free` themselves. */
  plan: string;
  /** Set only on a plan that was given rather than bought: when it stops. See apps/api/src/gifts.ts. */
  plan_until?: string;
  /** "" for everybody, "super" for whoever runs Passalong. Draws /admin, and the way to it. */
  role?: string;
  /** Whether this account may make or remove a super — only the deployment's ADMIN_ACCOUNTS may. */
  can_make_supers?: boolean;
  teams: Team[];
  /** Name, else @handle, else @account id — worked out by the API. */
  display?: string;
}

export interface Verdict {
  ok: boolean;
  by: string | null;
  by_name?: string;
  note: string | null;
  at?: string;
}

export interface Pull {
  handle: string | null;
  /** How it arrived: "cli", "link", or a receipt a verdict ("verdict") or archive ("web") wrote. */
  via?: string;
  at: string;
}

export interface Guide {
  id: string;
  title: string | null;
  /** What it says to a person, a sentence or two. Empty on a guide from before summaries. */
  summary?: string;
  status: string;
  url: string;
  created: string;
  pulls: number;
  /** Yours to promote or delete; someone else's to verify. */
  mine: boolean;
  team: string | null;
  to: string | null;
  from: string | null;
  /** Display names worked out by the API: name, else @handle, else @account id. */
  from_name?: string;
  to_name?: string;
  team_name?: string;
  to_group_name?: string;
  taken_by_names?: string[];
  source_context: string | null;
  tags: string[];
  stack_assumptions: string[];
  pulled_by?: Pull[];
  verdict?: Verdict | null;
  /**
   * You were named, rather than being in the team it was shared with. Someone writing your handle
   * chose you; a team drop chose nobody, and the inbox sorts on the difference.
   */
  for_me?: boolean;
  /** The group inside the team it was handed to, by name. Empty when it went to a person or all. */
  to_group?: string;
  /** Who said they are on it, and who passed it back with a reason. See migrations/0013_acks.sql. */
  taken_by?: string[];
  declined?: Declined[];
  /** Your own standing answer, so a row offers the other one rather than asking again. */
  my_ack?: { taken: boolean; note: string; at: string } | null;
  /** The report this issue belongs to, when it is one — see migrations/0006_reports.sql. */
  report?: string;
  report_title?: string;
  /**
   * The guide this one came out of — see migrations/0015_lineage.sql. The title is only filled when
   * you can read the parent, so an id with no title is a parent in a team you are not in.
   */
  parent?: string;
  parent_title?: string;
  /** Its address, so "follows X" opens X rather than searching the list already on screen. */
  parent_url?: string;
  /** Follow-ups you can read: published guides that name this one as their parent. */
  children?: number;
  /** "bug", "task" or "transfer"; absent means transfer. */
  kind?: string;
  /**
   * What last wrote it: `cli@<version>`, `mcp`, `hub` or `api` — see migrations/0035. Empty on a
   * guide last written before that, which is unknown rather than any of the four.
   */
  client?: string;
  area?: string;
  severity?: string;
  /** Set by the board's SQL, not worked out here — see the note on `load()`. */
  failing?: boolean;
  stale?: boolean;
}

/** Someone handing a guide back, and why. The reason is the whole reason to say no out loud. */
export interface Declined {
  by: string;
  by_name?: string;
  note: string;
  at: string;
}

/** The board's buckets are defined in SQL. The hub renders them; it never derives them. */
export interface Board {
  failing: Guide[];
  waiting: Guide[];
  in_flight: Guide[];
  landed: Guide[];
  /** Always empty. A compatibility shim for the published CLI — see the note in /v1/board. */
  promote?: Guide[];
}

export interface Note {
  id: string;
  at: string;
  text: string;
  guide: string | null;
  read: boolean;
  /** What happened, as the server names it: "shared", "pulled", "verified"… */
  kind?: string;
  /** Who did it, as a person reads them. Empty for a clock or an anonymous reader. */
  actor_name?: string;
  team_name?: string;
  /** The guide's title. */
  title?: string;
}

/**
 * One thing you did. The server renders `text`, the same way it renders a notification's — see
 * apps/api/src/log.ts for why this is your own acts and `Note` is everyone else's.
 */
export interface LogEntry {
  act: "published" | "pulled" | "works" | "broken" | "took" | "passed";
  at: string;
  guide: string;
  title: string;
  /** The guide's `source_context`. The author's repo, which is not always the reader's. */
  repo: string;
  url: string;
  mine: boolean;
  note: string;
  text: string;
}

export interface ApiToken {
  id: string;
  name: string;
  created: string;
  last_used: string | null;
}

export interface TeamDetail extends Team {
  guides: number;
  /** How many members the plan is paid for. Zero on a free plan, where seats are not the limit. */
  seats?: number;
  members_count?: number;
  /** How many channels are connected. Never their URLs — those are credentials for rooms. */
  channels?: number;
  members: {
    /** The account id, which is the address of a teammate who has not chosen an @name. */
    id?: string;
    handle: string | null;
    name: string | null;
    role: string;
    joined: string;
    display?: string;
  }[];
}

/** Where a task is. Derived by the server on every read — see apps/api/src/claims.ts. */
export type TaskState = "draft" | "ready" | "blocked" | "claimed" | "stalled" | "review" | "done";

/** One task on the board, as `GET /v1/tasks` sends it. */
export interface Task {
  id: string;
  title: string;
  /** What it says to a person. Empty on a task from before summaries. */
  summary?: string;
  /** The repo an agent has to be in to take it; empty for a task for no repo. */
  target: string;
  state: TaskState;
  created: string;
  /** You wrote it, so ready, approve, reject and release are yours. */
  mine: boolean;
  /** The team it is in, by slug; empty when it is in none. */
  team?: string;
  /** Who it is for: "@handle", "#group", or empty for anyone in the team. */
  to?: string;
  /** Assigned to you, or to a group you are in, so you may pass it on. */
  for_me?: boolean;
  url: string;
  claim: {
    agent: string;
    host: string;
    repo: string;
    worktree: string;
    note: string;
    /** What it is waiting on you to answer, or empty. Derived on the server, never stored. */
    asking?: string;
    /** What it ran and what came back, sent with the hand-in. Empty until it hands in. */
    evidence?: string;
    /** The same evidence against the Acceptance line each piece answers, when the agent sorted it. */
    checks?: { check: string; ran: string; says?: string; ok?: boolean }[];
    /** What they think it could break. One line, often empty. See 0032_claim_risk.sql. */
    risk?: string;
    report: string;
    report_title?: string;
    report_url?: string;
    pr: string;
    claimed_at: string;
    lease_until: string;
    /** Whose agent has it. A teammate's agent can take your task. */
    by?: { handle: string; name: string; you: boolean };
  } | null;
}

/** One guide someone is working on right now, of any kind. See GET /v1/working. */
export interface Working {
  id: string;
  title: string;
  /** What it says to a person. Empty on a guide from before summaries. */
  summary?: string;
  kind: string;
  target: string;
  url: string;
  state: "claimed" | "stalled";
  /** You wrote it, so you can take it back. */
  mine: boolean;
  by: { handle: string; name: string; you: boolean };
  agent: string;
  host: string;
  repo: string;
  worktree: string;
  note: string;
  /** What it is waiting on you to answer, or empty. */
  asking?: string;
  /** What a person wrote that this agent has not been told yet. */
  replies?: number;
  claimed_at: string;
  lease_until: string;
}

/** A handoff or bug you wrote that somebody handed in, waiting on you. See GET /v1/handed_in. */
export interface HandedIn {
  /** The evidence sorted against the `## Verification` line each part answers, as JSON. */
  checks?: string;
  id: string;
  title: string;
  kind: string;
  url: string;
  /** The repo it was handed in from; '' for a person in the browser. What send-back names. */
  place: string;
  by: { handle: string; name: string };
  agent: string;
  host: string;
  worktree: string;
  note: string;
  /** What it ran and what came back, sent with the hand-in. See migrations/0025_claim_evidence.sql. */
  evidence: string;
  /** What they had to adapt to make it work there. Prose, often empty. See 0031_writeup.sql. */
  writeup?: string;
  /** What they think it could break. One line, often empty. See 0032_claim_risk.sql. */
  risk?: string;
  at: string;
}

export interface HubData {
  me: Me | null;
  guides: Guide[];
  board: Board | null;
  activity: Note[];
  /** Your own acts, newest first. The window the server sends, not everything you have ever done. */
  log: LogEntry[];
  unread: number;
  tokens: ApiToken[];
  team: TeamDetail | null;
  tasks: Task[];
  working: Working[];
  handedIn: HandedIn[];
}

/** One line of a guide's thread. See GET /v1/guides/:id/thread and claims.thread(). */
export interface ThreadItem {
  id: string;
  kind:
    | "taken"
    | "progress"
    | "handed_in"
    | "passed"
    | "released"
    | "approved"
    | "sent_back"
    | "closed"
    | "asked"
    | "replied"
    | "noted"
    | "verdict"
    | "ack";
  at: string;
  body: string;
  /** A verdict or an ack only: it worked, or they took it. */
  ok?: boolean;
  by: { name: string; handle: string; agent: boolean; host: string; you: boolean };
}

/** One place a guide is held, with what came back if it was handed in. See GET /v1/guides/:id/context. */
export interface ContextClaim {
  /** '' for a task; the taker's repo for a handoff or a bug, which is taken once per repo. */
  place: string;
  state: "claimed" | "stalled" | "review";
  by: { handle: string; name: string };
  /** Held or handed in by the account looking at the page. */
  mine?: boolean;
  agent: string;
  host: string;
  repo: string;
  note: string;
  writeup: string;
  evidence: string;
  checks: { check: string; ran: string; says?: string; ok?: boolean }[];
  /** The reviewer's, so only the author is sent it. */
  risk: string;
  pr: string;
  /** The write-up guide it handed in, when this reader can open it. */
  report: { id: string; title: string; url: string } | null;
  claimed_at: string;
  lease_until: string;
  updated: string;
}

/** Everything around one guide, for its page in the hub. No markdown: that stays on the share page. */
export interface GuideContext {
  guide: Guide;
  owner: boolean;
  claims: ContextClaim[];
  /** Every standing verdict, newest first, with what it showed: a "works" carries screenshots. */
  verdicts: {
    ok: boolean;
    by: { handle: string; name: string };
    note: string;
    detail: string;
    at: string;
  }[];
  /** Each person's standing answer to "are you taking this?", with when they gave it. */
  acks: { taken: boolean; by: { handle: string; name: string }; note: string; at: string }[];
  parent: Guide | null;
  children: Guide[];
  blocked_by: Guide[];
  blocks: Guide[];
}
