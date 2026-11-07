/**
 * How much of a README an agent is shown when it takes work in the project: the first
 * README_SHOWN characters (apps/api/src/project-tree.ts, which this mirrors). Writers could not
 * tell where that was, and five of six READMEs written for a team ran past it, burying the rules
 * at their end (2026-11-07).
 *
 * Imports nothing, so it runs under `node --test` without Nuxt.
 */
export const README_SHOWN = 4000;

export const isReadme = (name: string) => /^readme(\.md)?$/i.test(String(name ?? "").trim());

/** The length, whether agents see all of it, and the last words they do see when not. */
export function readmeBudget(body: string): { length: number; cut: boolean; stopsAt: string } {
  const text = String(body ?? "");
  const cut = text.length > README_SHOWN;
  const seen = text.slice(0, README_SHOWN).replace(/\s+/g, " ").trimEnd();
  const tail = seen.slice(-70);
  const at = tail.indexOf(" ");
  return {
    length: text.length,
    cut,
    stopsAt: cut ? `…${at > 0 && at < 30 ? tail.slice(at + 1) : tail}` : "",
  };
}
