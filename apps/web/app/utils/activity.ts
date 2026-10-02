/**
 * The feed with runs folded: eight guides shared by one person in a row is one line, not eight.
 *
 * Plain functions with no imports beyond a type, so it is testable without Nuxt. The server still
 * writes every sentence (`line()` in apps/api/src/notify.ts); only the plural is made here, and
 * only for the kinds whose sentence has a count in it. The notes themselves are never dropped — a
 * group keeps them, and opens to show them.
 */
import type { Note } from "~/types/hub";

/** A run is folded at this many or more. Two lines read as two lines. */
export const FOLD_AT = 3;

/** Kind → what the person did, with the count in. Anything else is never folded. */
const MANY: Record<string, (n: number, team: string) => string> = {
  shared: (n, team) => `shared ${n} guides with ${team || "your team"}`,
  handoff: (n) => `sent you ${n} guides`,
  pulled: (n) => `opened ${n} guides`,
  taken: (n) => `is taking ${n} guides`,
  declined: (n) => `passed on ${n} guides`,
  consumed: (n) => `is done with ${n} guides`,
  verified: (n) => `said ${n} guides worked`,
  failed: (n) => `said ${n} guides didn't work`,
};

export type Entry =
  | { kind: "note"; note: Note }
  | { kind: "group"; id: string; text: string; at: string; read: boolean; notes: Note[] };

/** Same person, same thing, same team: the three things a sentence is made of. */
const sameRun = (a: Note, b: Note) =>
  Boolean(a.kind) &&
  a.kind === b.kind &&
  Boolean(a.actor_name) &&
  a.actor_name === b.actor_name &&
  (a.team_name ?? "") === (b.team_name ?? "") &&
  a.kind! in MANY;

/** Newest first in, newest first out. Only neighbours fold, so the order is never disturbed. */
export function groupNotes(notes: Note[]): Entry[] {
  const out: Entry[] = [];
  let i = 0;
  while (i < notes.length) {
    const first = notes[i] as Note;
    let j = i + 1;
    while (j < notes.length && sameRun(first, notes[j] as Note)) j++;
    const run = notes.slice(i, j);
    if (run.length >= FOLD_AT) {
      const say = MANY[first.kind as string] as (n: number, team: string) => string;
      out.push({
        kind: "group",
        id: `group:${first.id}`,
        text: `${first.actor_name} ${say(run.length, first.team_name ?? "")}`,
        at: first.at,
        read: run.every((n) => n.read),
        notes: run,
      });
    } else for (const note of run) out.push({ kind: "note", note });
    i = j;
  }
  return out;
}
