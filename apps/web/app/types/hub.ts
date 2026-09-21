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
  teams: Team[];
  /** Name, else @handle, else @account id — worked out by the API. */
  display?: string;
}

export interface Verdict {
  ok: boolean;
  by: string | null;
  by_name?: string;
  note: string | null;
}

export interface Pull {
  handle: string | null;
  at: string;
}

export interface Guide {
  id: string;
  title: string | null;
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
  /** Follow-ups you can read: published guides that name this one as their parent. */
  children?: number;
  /** "bug", "task" or "transfer"; absent means transfer. */
  kind?: string;
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
  /** The repo an agent has to be in to take it; empty for a task for no repo. */
  target: string;
  state: TaskState;
  created: string;
  /** You wrote it, so ready, approve, reject and release are yours. */
  mine: boolean;
  url: string;
  claim: {
    agent: string;
    host: string;
    repo: string;
    worktree: string;
    note: string;
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
}
