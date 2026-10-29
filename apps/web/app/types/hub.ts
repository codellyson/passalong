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
  /** Whether the email was proven to reach its owner (migrations/0050). Absent from an older server. */
  email_verified?: boolean;
  /** Work is kept for good rather than tidied away on a clock. */
  keep_forever?: boolean;
  /** Whether this account may choose that. Everybody today; a plan will decide. */
  may_keep?: boolean;
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
  /** Set on a bought plan that was cancelled: when it stops. It is paid until then. */
  plan_ends?: string;
  /** "" for everybody, "super" for whoever runs Passalong. Draws /admin, and the way to it. */
  role?: string;
  /** Whether this account may make or remove a super — only the deployment's ADMIN_ACCOUNTS may. */
  can_make_supers?: boolean;
  teams: Team[];
  /** Name, else @handle, else @account id — worked out by the API. */
  display?: string;
}

export interface Pull {
  handle: string | null;
  /** How it arrived: "cli", "link", or a receipt a retired verdict ("verdict") or archive ("web") wrote. */
  via?: string;
  at: string;
}

/** A piece of work, as a list row. The route and table keep the old name, `guide`. */
export interface Guide {
  id: string;
  title: string | null;
  /** What it says to a person, a sentence or two. Empty on work from before summaries. */
  summary?: string;
  /** When its proof screenshots are deleted, or "". Only on finished work that has some. */
  proof_expires?: string;
  status: string;
  /** How it reached Done: finished, marked done ("approved"), or archived. '' while it is not done. */
  outcome?: "finished" | "approved" | "archived" | "";
  url: string;
  created: string;
  /** Its last edit or status change. */
  updated?: string;
  pulls: number;
  /** You wrote it. */
  mine: boolean;
  /** Its author, or the owner of its team: may archive, reassign or delete it. */
  manage?: boolean;
  team: string | null;
  to: string | null;
  from: string | null;
  /** Display names worked out by the API: name, else @handle, else @account id. */
  from_name?: string;
  to_name?: string;
  team_name?: string;
  to_group_name?: string;
  source_context: string | null;
  tags: string[];
  stack_assumptions: string[];
  pulled_by?: Pull[];
  /**
   * Addressed to you, by handle or to a group you are in, rather than dropped in the team. Someone
   * addressing you chose you; a team drop chose nobody, and the inbox sorts on the difference.
   */
  for_me?: boolean;
  /** Its column on the team board, worked out by the server the same for everyone. */
  stage?: "draft" | "todo" | "working" | "done";
  /** Whose rows it sits in when the board is by person: holders, else who it was sent to. Empty is Anyone. */
  lanes?: string[];
  /** Who holds it. `agent` is empty for a person working it in the browser. */
  held_by?: {
    name: string;
    agent: string;
    you: boolean;
    /** Waiting on a person's answer, gone quiet, a person's own hold, or working. */
    health: "asking" | "person" | "quiet" | "working";
    /** When it was last heard from. */
    since: string;
  }[];
  /** The group inside the team it was handed to, by name. Empty when it went to a person or all. */
  to_group?: string;
  /**
   * The work this came out of — see migrations/0015_lineage.sql. The title is only filled when you
   * can read the parent, so an id with no title is a parent in a team you are not in.
   */
  parent?: string;
  parent_title?: string;
  /** Its address, so "follows X" opens X rather than searching the list already on screen. */
  parent_url?: string;
  /** Work you can read that names this as its parent. */
  children?: number;
  /**
   * What last wrote it: `cli@<version>`, `mcp`, `hub`, `api` or `email` — see migrations/0035.
   * Empty on work last written before that, which is unknown rather than any of them.
   */
  client?: string;
}

/** The board's buckets are defined in SQL. The hub renders them; it never derives them. */
export interface Board {
  waiting: Guide[];
  in_flight: Guide[];
  landed: Guide[];
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
  /** The work's title. */
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
  /** Its `source_context`. The author's repo, which is not always the reader's. */
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
  /** Paid for through Bachs, so there is a billing page to open. A given plan has none. */
  subscribed?: boolean;
  /** Set when the team's plan was cancelled: when it stops. It is paid until then. */
  plan_ends?: string;
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
    /** Made the team: never demoted or removed. */
    creator?: boolean;
  }[];
}

/** Where a task is. Derived by the server on every read — see apps/api/src/claims.ts. */
export type TaskState = "draft" | "ready" | "blocked" | "claimed" | "stalled" | "done";

/** One piece of work in the queue, as `GET /v1/tasks` sends it. */
export interface Task {
  id: string;
  title: string;
  /** What it says to a person. Empty on work from before summaries. */
  summary?: string;
  /** The repo an agent has to be in to take it with no id; empty for no repo. */
  target: string;
  state: TaskState;
  created: string;
  /** You wrote it. */
  mine: boolean;
  /** You wrote it or administer its team, so you may manage it. */
  manage?: boolean;
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
    /** What finishing took, in their words, sent with the hand-in. */
    writeup?: string;
    /** The same evidence against what each piece answers, when the agent sorted it. */
    checks?: { check: string; ran: string; says?: string; ok?: boolean }[];
    pr: string;
    claimed_at: string;
    lease_until: string;
    /** Whose agent has it. A teammate's agent can take your work. */
    by?: { handle: string; name: string; you: boolean };
  } | null;
}

/** One piece of work someone is on right now. See GET /v1/working. */
export interface Working {
  id: string;
  title: string;
  /** What it says to a person. Empty on work from before summaries. */
  summary?: string;
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
}

/** One row of the Support table: a customer's request and where it stands (GET /v1/support). */
export interface SupportRow {
  id: string;
  title: string;
  ref: string;
  customer: { name: string; email: string };
  state: "new" | "needs_reply" | "with_development" | "waiting" | "solved";
  /** Since when the customer has waited on us; "" when the next word is theirs or it is solved. */
  waiting_since: string;
  last: { by: "customer" | "team" | ""; line: string; at: string };
  updated: string;
  /** Whether the request's team asked to be reminded to tell the customer a fix is done. */
  tell: boolean;
}

/** `GET /v1/support`: the requests, and the teams whose reminder the viewer (an owner) can set. */
export interface SupportList {
  requests: SupportRow[];
  teams: { slug: string; name: string; tell: boolean }[];
}

/** One line of a piece of work's thread. See GET /v1/guides/:id/thread and claims.thread(). */
export interface ThreadItem {
  id: string;
  kind:
    | "taken"
    | "progress"
    | "handed_in"
    | "passed"
    | "released"
    | "reopened"
    | "asked"
    | "replied"
    | "noted"
    | "customer"
    | "answered";
  at: string;
  body: string;
  by: { name: string; handle: string; agent: boolean; host: string; you: boolean };
}

/** Whoever holds a piece of work. See GET /v1/guides/:id/context. */
export interface ContextClaim {
  state: "claimed" | "stalled";
  by: { handle: string; name: string };
  /** Held by the account looking at the page. */
  mine?: boolean;
  agent: string;
  host: string;
  repo: string;
  note: string;
  evidence: string;
  claimed_at: string;
  lease_until: string;
  updated: string;
}

/** Everything around one piece of work, for its page in the hub. No markdown: that stays on the share page. */
export interface GuideContext {
  guide: Guide;
  /** Its repo, as the queue matches it; '' for no repo. */
  target: string;
  /** Repos this account's work and agents already use, to pick from when marking it Ready. */
  repos: string[];
  /** A person marked it safe for the runner to take with nobody watching. */
  alone: boolean;
  /** A support request's customer and tracking number; null for any other work. */
  customer?: { name: string; email: string; ref: string } | null;
  owner: boolean;
  /** The owner of its team, and not its author: may act on it as if they were. */
  admin?: boolean;
  claims: ContextClaim[];
  /** What it was finished with, newest first: each hand-in is kept as one (`complete()` in claims.ts). */
  verdicts: {
    ok: boolean;
    by: { handle: string; name: string };
    note: string;
    detail: string;
    /** What finishing took, in the finisher's words. */
    writeup: string;
    at: string;
  }[];
  parent: Guide | null;
  children: Guide[];
  blocked_by: Guide[];
  blocks: Guide[];
  /** The folders holding it that the reader can open. */
  folders: { id: string; title: string; color: string }[];
}
