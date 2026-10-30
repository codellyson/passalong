/**
 * First-run setup (docs/LOOP.md §0, step 3): which steps a person has done or skipped, and whether
 * they put it away. Stored as JSON in `account.setup` (migration 0066) so it resumes on any device.
 *
 * The steps themselves write through the routes that already exist (teams, invites, groups,
 * folders, documents, inbound, connectors); this only remembers where the person got to. The hub
 * decides nothing from it but what to show next.
 *
 * Imports no sibling, so `test/setup.test.mjs` runs it against real SQLite.
 */

export const SETUP_STEPS = [
  "team",
  "people",
  "groups",
  "projects",
  "know",
  "inbox",
  "agents",
] as const;
export type SetupStep = (typeof SETUP_STEPS)[number];

export interface Setup {
  done: SetupStep[];
  skipped: SetupStep[];
  dismissed: boolean;
}

interface Db {
  prepare(q: string): {
    bind(...args: unknown[]): {
      first<T>(): Promise<T | null>;
      run(): Promise<unknown>;
    };
  };
}

const isStep = (s: unknown): s is SetupStep => SETUP_STEPS.includes(s as SetupStep);

/** The stored column, read forgivingly: anything it cannot hold is a setup not started. */
export function readSetup(raw: string | null | undefined): Setup {
  let v: Partial<Record<keyof Setup, unknown>> = {};
  try {
    v = raw ? JSON.parse(raw) : {};
  } catch {}
  const list = (x: unknown) => (Array.isArray(x) ? SETUP_STEPS.filter((s) => x.includes(s)) : []);
  const done = list(v.done);
  return {
    done,
    skipped: list(v.skipped).filter((s) => !done.includes(s)),
    dismissed: v.dismissed === true,
  };
}

export type SetupChange = { step: string; as: "done" | "skipped" } | { dismissed: boolean };

/** What is wrong with a change, in words for the person, or "" when it can be applied. */
export function setupProblem(change: unknown): string {
  const c = (change ?? {}) as Record<string, unknown>;
  if ("dismissed" in c)
    return typeof c.dismissed === "boolean" ? "" : "Say dismissed: true or false.";
  if (!isStep(c.step)) return `There is no setup step called "${String(c.step ?? "")}".`;
  if (c.as !== "done" && c.as !== "skipped") return "Say whether the step is done or skipped.";
  return "";
}

/**
 * Apply one change and return the result. Done outranks skipped: a step skipped once and done later
 * is done, and a step done is never put back to skipped by a later Skip.
 */
export function applySetup(s: Setup, change: SetupChange): Setup {
  if ("dismissed" in change) return { ...s, dismissed: change.dismissed };
  const step = change.step as SetupStep;
  if (change.as === "done")
    return {
      ...s,
      done: [...new Set([...s.done, step])],
      skipped: s.skipped.filter((x) => x !== step),
    };
  if (s.done.includes(step)) return s;
  return { ...s, skipped: [...new Set([...s.skipped, step])] };
}

export async function getSetup(db: Db, account: string): Promise<Setup> {
  const row = await db
    .prepare("SELECT setup FROM account WHERE id = ?")
    .bind(account)
    .first<{ setup: string }>();
  return readSetup(row?.setup);
}

export async function saveSetup(db: Db, account: string, change: SetupChange): Promise<Setup> {
  const next = applySetup(await getSetup(db, account), change);
  await db
    .prepare("UPDATE account SET setup = ? WHERE id = ?")
    .bind(JSON.stringify(next), account)
    .run();
  return next;
}
