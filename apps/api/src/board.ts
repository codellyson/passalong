// The hub's work list and how its board places each card (`GET /v1/work`, `/hub/work`).
//
// Agents read the same board through `/v1/tasks` and `/v1/working` (claims.ts), and the two must
// show the same work: test/board-contract.test.mjs holds them to it. Imports no sibling, so that
// test can run this against real SQLite with every migration.

/**
 * How many pieces of work the list reads: every open one first, then the newest finished. The same
 * as `LIST_MAX` in claims.ts, which the contract test checks: a smaller cut here hides work from the
 * hub that agents are offered. It took the 200 newest rows, finished included, so old open work fell
 * off the hub's board once a team finished enough.
 */
export const WORK_LIST_MAX = 500;

/** Whose work the list reads: the caller's own, or theirs and their teams', or one team's. */
export type WorkListScope =
  | { kind: "mine" }
  | { kind: "all"; teams: string[] }
  | { kind: "team"; id: string };

export async function workList<Row>(
  db: D1Database,
  account: string,
  scope: WorkListScope,
  q = "",
): Promise<Row[]> {
  const binds: unknown[] = [];
  let where: string;
  if (scope.kind === "mine") {
    where = "account_id = ?";
    binds.push(account);
  } else if (scope.kind === "all") {
    where = scope.teams.length
      ? `(account_id = ? OR team_id IN (${scope.teams.map(() => "?").join(",")}))`
      : "account_id = ?";
    binds.push(account, ...scope.teams);
  } else {
    where = "team_id = ?";
    binds.push(scope.id);
  }
  let sql = `SELECT * FROM work WHERE ${where}`;
  for (const t of q ? q.split(/\s+/) : []) {
    sql +=
      " AND (lower(title) LIKE ? OR lower(tags) LIKE ? OR lower(stack) LIKE ? OR lower(source_context) LIKE ? OR lower(markdown) LIKE ?)";
    const like = `%${t}%`;
    binds.push(like, like, like, like, like);
  }
  sql += ` ORDER BY status = 'done', created DESC LIMIT ${WORK_LIST_MAX}`;
  const { results } = await db
    .prepare(sql)
    .bind(...binds)
    .all<Row>();
  return results;
}

/** The parts of a work row that place it. */
type Placed = { status: string; to_account_id: string; to_group_id: string };

/** A hold on a piece of work, as the board draws it. */
export type BoardClaim = {
  account_id: string;
  state: string;
  agent_id: string;
  name: string;
  lease_until: string;
  updated: string;
  note: string;
  asking: number;
};

/**
 * Who a piece of work is for, as the board's To do column groups it: whoever holds it (account ids), else
 * whoever it was sent to — one person, a group as `#slug`, or each of several named people. Empty is
 * Anyone: work sent to the whole team sits once. One piece of work shown under several people, never copies.
 */
export function lanesOf(
  r: Placed,
  claimRows: BoardClaim[],
  groups: Map<string, { slug: string }>,
  members: Map<string, string[]>,
): string[] {
  const holders = [...new Set(claimRows.map((k) => k.account_id))];
  if (holders.length) return holders;
  if (r.to_account_id) return [r.to_account_id];
  const slug = groups.get(r.to_group_id)?.slug ?? "";
  if (slug && !slug.startsWith("~")) return [`#${slug}`];
  return members.get(r.to_group_id) ?? [];
}

/** Where work sits on its team's board, the same for everyone who opens it: its status, then
 * whether anybody holds it. */
export function boardPlace(r: Placed, claimRows: BoardClaim[], me: string, at: string) {
  const stage =
    r.status === "done"
      ? "done"
      : r.status === "draft"
        ? "draft"
        : claimRows.length
          ? "working"
          : "todo";
  return {
    stage,
    // How the hold is doing, derived like `stalled` and never stored: waiting on a person's answer,
    // gone quiet past its lease, a person's own hold (which reports no progress and is never
    // measured against an agent's half hour), or working.
    held_by: claimRows.map((k) => {
      const person = k.agent_id.startsWith("person-");
      return {
        name: k.name || "someone",
        agent: person ? "" : k.agent_id,
        you: k.account_id === me,
        health:
          k.state === "review"
            ? "review"
            : k.asking
              ? "asking"
              : person
                ? "person"
                : k.lease_until <= at
                  ? "quiet"
                  : "working",
        since: k.updated,
        // The holder's last progress note: the one muted line an In progress card carries.
        note: k.note || "",
      };
    }),
  };
}
