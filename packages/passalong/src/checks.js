/**
 * Running an Acceptance check, rather than reading the agent's account of running it.
 *
 * A hand-in used to be the agent's word about its own work: `ran` was a string, and the only rule
 * was that it was longer than a verdict. "ran the tests, all green" passed. This module is the
 * other half — when a check names the command that proves it, the command is run here and the exit
 * code is recorded from the process, so the agent reports what it did and the machine reports how
 * it went.
 *
 * **The command comes from the agent's own hand_in call, never from a guide.** A guide is written
 * somewhere else and pulled from a stranger's account; lifting a command out of its Acceptance
 * section and running it would turn every pulled guide into remote code execution. Nothing here
 * parses guide markdown, and nothing should.
 *
 * This runs only where there is a shell. `src/mcp.js` is a local stdio server on the agent's own
 * machine, so it can; `apps/api/src/mcp-http.ts` is a Worker, so it cannot, and a hand-in over HTTP
 * keeps the prose gate that `evidenceProblem()` applies.
 *
 * What this deliberately does NOT do is parse test output. SWE-bench needs 57 per-framework log
 * parsers to tell a skipped test from a passing one, and a half-parser that guesses is worse than
 * none: it would refuse honest runs in shapes nobody thought of, and pass the ones it misread. The
 * exit code is the whole verdict here, which is also how a CI step decides.
 */
import { spawnSync } from "node:child_process";

/** How long a check may run before it is killed. Long enough for a real suite, short of a lease. */
export const CHECK_TIMEOUT_MS = 10 * 60 * 1000;

/** The most captured output kept per check. Matches EVIDENCE_MAX in apps/api/src/claims.ts. */
export const OUTPUT_MAX = 4000;

/**
 * The tail of what a command printed, because that is where a runner puts what went wrong. A head
 * would hold the banner and the first hundred passing lines.
 */
function tail(out, max = OUTPUT_MAX) {
  const s = String(out ?? "").replace(/\s+$/, "");
  if (s.length <= max) return s;
  return `… ${s.length - max} earlier characters cut …\n${s.slice(-max)}`;
}

/**
 * One check, run if it names a command.
 *
 * Returns the check with three things added: `cmd` as it was run, `exit` — what the process
 * returned — and `ok`, whether the check is met. They are two fields on purpose. SARIF keeps
 * `exitCode` beside `executionSuccessful` "because not all programs exit with an exit code of 0 on
 * success and non-0 on failure", and GitHub Actions keeps `outcome` beside `conclusion` so a
 * policy that forgives a failure never overwrites what happened. Today `ok` is `exit === 0` and
 * nothing else; keeping the pair means a check that needs a different rule later does not have to
 * rewrite what was already recorded.
 *
 * A command that never ran — no such file, a shell that died, a timeout — is not a failing check.
 * It is an unknown, and it is recorded as one so that "it did not run" cannot read as "it ran and
 * found nothing wrong".
 */
export function runCheck(check, { cwd = process.cwd(), timeoutMs = CHECK_TIMEOUT_MS } = {}) {
  const cmd = String(check?.cmd ?? "").trim();
  if (!cmd) return { check: check.check, ran: check.ran };

  const r = spawnSync(cmd, {
    shell: true,
    cwd,
    timeout: timeoutMs,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });

  const out = tail(`${r.stdout ?? ""}${r.stderr ?? ""}`);
  // `status` is null when the child was killed rather than exited: a timeout, or a signal.
  if (r.error || r.status === null) {
    const why =
      r.signal === "SIGTERM" && r.error?.code === "ETIMEDOUT"
        ? `did not finish within ${Math.round(timeoutMs / 1000)}s`
        : r.signal
          ? `was killed by ${r.signal}`
          : `could not run: ${r.error?.message ?? "unknown error"}`;
    return {
      check: check.check,
      cmd,
      exit: null,
      ok: false,
      ran: `$ ${cmd}\nthe command ${why}${out ? `\n${out}` : ""}`,
    };
  }

  return {
    check: check.check,
    cmd,
    exit: r.status,
    ok: r.status === 0,
    // The recorded evidence is what the process printed, not what the agent said about it. An
    // empty run is written out rather than left blank: the exit code is what decided it, and a
    // blank `ran` reads like evidence nobody supplied.
    ran: out ? `$ ${cmd}\n${out}` : `$ ${cmd}\n(no output; exited ${r.status})`,
  };
}

/**
 * Every check, in the order the agent worked them, with the ones naming a command actually run.
 *
 * Stops at the first failure. A suite that fails at step two tells the agent what to fix, and
 * running the remaining eight minutes of checks against a tree that is already wrong buys nothing.
 */
export function runChecks(checks = [], opts = {}) {
  const done = [];
  for (const c of checks) {
    const r = runCheck(c, opts);
    done.push(r);
    if (r.ok === false) return { checks: done, failed: r, ran: done.filter((d) => d.cmd).length };
  }
  return { checks: done, failed: null, ran: done.filter((d) => d.cmd).length };
}

/** What the agent is told when a check it named did not hold. Its own output is the reason. */
export function refusal(failed, { ran, total }) {
  const what =
    failed.exit === null
      ? "did not run"
      : `exited ${failed.exit}${failed.exit === 0 ? "" : ", so the check does not hold"}`;
  return (
    `not handed in: \`${failed.cmd}\` ${what}.\n\n` +
    `${failed.ran}\n\n` +
    `This was check ${ran} of ${total}, "${failed.check}". Fix what it found and hand in again. ` +
    "Nothing was recorded, and you still hold this."
  );
}
