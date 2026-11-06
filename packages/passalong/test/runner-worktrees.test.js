import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

// The runner (`passalong work --watch`, src/runner.js): each piece of work marked safe to run alone
// in a worktree and branch of its own, up to three at once and with no daily count, and work its
// agent did not finish goes back to its author (2026-11-06). Real git, in a throwaway repo and its origin;
// the server and the agent are stand-ins.
process.env.PASSALONG_HOME = mkdtempSync(join(tmpdir(), "passalong-runner-wt-"));
process.env.PASSALONG_API = "http://fake.test";
process.env.PASSALONG_TOKEN = "t";
const passalong = await import("../src/passalong.js");
const runner = await import("../src/runner.js");

const sh = (cwd, ...args) =>
  execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

/** A checkout with an origin to push to, as the runner needs. */
function checkout() {
  const top = mkdtempSync(join(tmpdir(), "passalong-repo-"));
  const origin = join(top, "origin.git");
  sh(top, "init", "--quiet", "--bare", "-b", "main", origin);
  const repo = join(top, "app");
  sh(top, "clone", "--quiet", origin, repo);
  sh(repo, "config", "user.email", "t@example.com");
  sh(repo, "config", "user.name", "T");
  writeFileSync(join(repo, "README.md"), "app\n");
  sh(repo, "add", ".");
  sh(repo, "commit", "--quiet", "-m", "start");
  sh(repo, "push", "--quiet", "origin", "main");
  sh(repo, "remote", "set-head", "origin", "main");
  return repo;
}

/** The queue: hands out `queue`, says which are done, and keeps what was passed back. */
function fakeServer(queue, { done = [] } = {}) {
  const handed = new Set();
  const asked = [];
  const passed = [];
  globalThis.fetch = async (url, init = {}) => {
    const u = new URL(url);
    const json = (body) =>
      new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } });
    if (u.pathname === "/v1/tasks/next") {
      asked.push(JSON.parse(init.body || "{}"));
      const id = queue.shift();
      if (id) handed.add(id);
      return json({ task: id ? { id, title: `task ${id}`, markdown: `# ${id}\n` } : null });
    }
    if (u.pathname === "/v1/tasks")
      return json({
        tasks: done
          .map((id) => ({ id, state: "done" }))
          // Handed out and not done: still held by the run that took it, as the server says.
          .concat(
            [...handed]
              .filter((id) => !done.includes(id))
              .map((id) => ({ id, state: "claimed", claim: {} })),
          )
          .concat([{ id: "zzzzzzzz", note: "x" }]),
      });
    const m = u.pathname.match(/^\/v1\/work\/(\w+)\/pass$/);
    if (m) {
      passed.push({ id: m[1], ...JSON.parse(init.body) });
      return json({ id: m[1], passed: true });
    }
    return json({});
  };
  return { asked, passed };
}

const stopAfter = (n) => {
  let looks = 0;
  return async () => {
    looks++;
    if (looks >= n) throw new Error("stop");
    await new Promise((r) => setTimeout(r, 5));
  };
};

test("each piece of work gets its own worktree and branch, and finished ones leave nothing behind", async () => {
  const repo = checkout();
  const { asked } = fakeServer(["aaaaaaaa"], { done: ["aaaaaaaa"] });
  const seen = [];
  const finished = [];
  await assert.rejects(
    passalong.watch({
      cwd: repo,
      every: 10,
      countFile: join(process.env.PASSALONG_HOME, "count-1.json"),
      runAgent: async ({ cwd, prompt, command, args }) => {
        seen.push({ cwd, branch: sh(cwd, "branch", "--show-current"), prompt, command, args });
        return { exit: 0, timedOut: false };
      },
      onFinished: (t) => finished.push(t.id),
      sleep: stopAfter(2),
    }),
    /stop/,
  );
  assert.equal(seen.length, 1);
  assert.equal(seen[0].branch, "passalong/aaaaaaaa", "on a branch of its own");
  assert.ok(seen[0].cwd.includes("app.passalong-runs"), "in a worktree beside the checkout");
  assert.match(seen[0].prompt, /git push -u origin passalong\/aaaaaaaa/);
  assert.match(seen[0].prompt, /gh pr create --fill --head passalong\/aaaaaaaa/);
  assert.equal(seen[0].command, "claude");
  assert.ok(seen[0].args.includes("dontAsk"), "nothing it isn't allowed is asked about");
  assert.deepEqual(finished, ["aaaaaaaa"]);
  assert.ok(!existsSync(seen[0].cwd), "a finished run's worktree is removed");
  assert.match(
    sh(repo, "branch", "--list", "passalong/aaaaaaaa"),
    /passalong\/aaaaaaaa/,
    "its branch stays",
  );
  assert.ok(
    asked.every((b) => b.alone === true),
    "only work marked safe to run alone",
  );
});

test("work its agent did not finish goes back to its author, saying why, with the tick cleared", async () => {
  const repo = checkout();
  const { passed } = fakeServer(["bbbbbbbb"]);
  await assert.rejects(
    passalong.watch({
      cwd: repo,
      every: 10,
      countFile: join(process.env.PASSALONG_HOME, "count-2.json"),
      runAgent: async () => ({ exit: 1, timedOut: false }),
      sleep: stopAfter(2),
    }),
    /stop/,
  );
  assert.equal(passed.length, 1);
  assert.equal(passed[0].id, "bbbbbbbb");
  assert.equal(passed[0].runner, true, "the server clears Safe to run alone");
  assert.match(passed[0].why, /stopped with an error \(exit code 1\)/);
  assert.match(passed[0].why, /kept on branch passalong\/bbbbbbbb/);
});

test("at most three run at once", async () => {
  const repo = checkout();
  fakeServer(["c1111111", "c2222222", "c3333333", "c4444444"], {
    done: ["c1111111", "c2222222", "c3333333", "c4444444"],
  });
  let active = 0;
  let most = 0;
  let freed = false;
  const waiting = [];
  const started = [];
  const watching = passalong.watch({
    cwd: repo,
    every: 10,
    countFile: join(process.env.PASSALONG_HOME, "count-3.json"),
    runAgent: ({ cwd }) => {
      started.push(cwd);
      active++;
      most = Math.max(most, active);
      return new Promise((r) =>
        waiting.push(() => {
          active--;
          r({ exit: 0, timedOut: false });
        }),
      );
    },
    sleep: async () => {
      await new Promise((r) => setTimeout(r, 20));
      // Three are running: let one end, and the fourth may start.
      if (started.length === 3 && !freed) {
        freed = true;
        waiting.shift()();
      }
      if (started.length === 4) {
        for (const end of waiting.splice(0)) end();
        throw new Error("stop");
      }
    },
  });
  await assert.rejects(watching, /stop/);
  assert.equal(most, 3, "three at once, never four");
  assert.equal(started.length, 4, "the fourth starts once one of them ends");
});

test("no daily limit: a runner that has run fifty times today takes the next one too", async () => {
  // It stopped at ten, and a give-back loop spent all ten on one piece of work, so real work
  // waited until tomorrow (2026-11-06). Its count is shown in the hub, and limits nothing.
  const repo = checkout();
  const countFile = join(process.env.PASSALONG_HOME, "count-4.json");
  const today = runner.dayOf(Date.now());
  writeFileSync(countFile, JSON.stringify({ day: today, runs: 50 }));
  fakeServer(["d1111111", "d2222222"], { done: ["d1111111", "d2222222"] });
  const ran = [];
  await assert.rejects(
    passalong.watch({
      cwd: repo,
      every: 10,
      countFile,
      runAgent: async ({ cwd }) => {
        ran.push(cwd);
        return { exit: 0, timedOut: false };
      },
      sleep: stopAfter(3),
    }),
    /stop/,
  );
  assert.equal(ran.length, 2);
  assert.equal(runner.runsToday(countFile, today), 52);
});

test("when Claude's usage runs out it pauses: nothing given back, nothing new, and it carries on", async () => {
  const repo = checkout();
  const done = [];
  const { asked, passed } = fakeServer(["u1111111", "u2222222"], { done });
  let clock = Date.parse("2026-11-06T12:00:00Z");
  const prompts = [];
  const kept = [];
  const posted = [];
  const paused = [];
  let looks = 0;
  let askedAtPause = -1;
  let askedAtCarryOn = -1;
  await assert.rejects(
    passalong.watch({
      cwd: repo,
      every: 10,
      atOnce: 1,
      now: () => clock,
      countFile: join(process.env.PASSALONG_HOME, "count-usage.json"),
      postSteps: async (id, steps) => {
        if (!steps.length) kept.push(id);
        posted.push(...steps.map((x) => x.text));
      },
      onPaused: (t, { until }) => {
        paused.push({ id: t.id, until });
        askedAtPause = asked.length;
      },
      runAgent: async ({ prompt, onStep }) => {
        prompts.push(prompt);
        if (prompts.length === 1) {
          onStep("Editing src/app.ts");
          return { exit: 1, timedOut: false, usage: { until: 0 } };
        }
        if (prompts.length === 2) askedAtCarryOn = asked.length;
        done.push(prompts.length === 2 ? "u1111111" : "u2222222");
        return { exit: 0, timedOut: false };
      },
      sleep: async () => {
        looks++;
        // Two looks while it is paused, then the quarter of an hour passes.
        if (looks === 3) clock += runner.USAGE_RETRY_MS + 1000;
        if (looks >= 6) throw new Error("stop");
        await new Promise((r) => setTimeout(r, 5));
      },
    }),
    /stop/,
  );
  assert.equal(passed.length, 0, "the work is not given back");
  assert.deepEqual(paused, [{ id: "u1111111", until: 0 }]);
  assert.match(
    posted.join("\n"),
    /Paused: Claude's usage ran out\. It carries on here when it's back/,
  );
  assert.ok(kept.includes("u1111111"), "its hold is kept alive while it waits");
  assert.match(prompts[1], /An earlier run on it stopped before it\s+finished/);
  assert.match(posted.join("\n"), /Carrying on now that Claude's usage is back/);
  assert.equal(prompts.length, 3, "then the next piece of work, once the first is finished");
  assert.equal(askedAtCarryOn, askedAtPause, "no new work was asked for while it was paused");
});

test("Claude Code's ways of saying its usage ran out, and when it is back", () => {
  const noon = new Date(2026, 10, 6, 12, 0).getTime();
  assert.deepEqual(runner.usageOut("Claude AI usage limit reached|1762444800"), {
    until: 1762444800000,
  });
  assert.equal(
    runner.usageOut("You've hit your limit · resets 3pm (Africa/Lagos)", noon).until,
    new Date(2026, 10, 6, 15, 0).getTime(),
  );
  assert.equal(
    runner.usageOut("5-hour limit reached ∙ resets 9am", noon).until,
    new Date(2026, 10, 7, 9, 0).getTime(),
    "a time already past today is tomorrow",
  );
  assert.deepEqual(runner.usageOut("Credit balance is too low"), { until: 0 });
  assert.equal(runner.usageOut("Added a daily limit to SMS sends, and a rate limit test."), null);
  assert.equal(runner.usageOut("Opened PR #12."), null);
  const said = runner.describe(
    JSON.stringify({
      type: "result",
      is_error: true,
      result: "Claude AI usage limit reached|1762444800",
    }),
  );
  assert.deepEqual(said.usage, { until: 1762444800000 });
  const refused = runner.describe(
    JSON.stringify({
      type: "assistant",
      error: "rate_limit",
      message: { content: [{ type: "text", text: "You've hit your limit" }] },
    }),
  );
  assert.deepEqual(refused.usage, { until: 0 });
});

test("a checkout with no origin is refused: there is nowhere to push", async () => {
  const bare = mkdtempSync(join(tmpdir(), "passalong-noorigin-"));
  sh(bare, "init", "--quiet");
  fakeServer([]);
  await assert.rejects(passalong.watch({ cwd: bare }), /no `origin` remote/);
});

test("what an unattended agent may do: its own branch and a pull request, never a force push", () => {
  const { allow, deny } = runner.PERMISSIONS;
  assert.ok(allow.includes("Bash(git push -u origin passalong/*)"));
  assert.ok(allow.includes("Bash(gh pr create *)"));
  assert.ok(allow.includes("mcp__passalong"));
  assert.ok(!allow.some((a) => /git push(?! -u origin passalong)/.test(a)), "no other push");
  assert.ok(deny.includes("Bash(git push --force*)"));
  const { args, stdin } = runner.claudeCommand({ cli: "/x/passalong" });
  assert.equal(stdin, true, "the prompt goes in on stdin, after every option");
  const mcp = JSON.parse(args[args.indexOf("--mcp-config") + 1]);
  assert.deepEqual(mcp.mcpServers.passalong.args, ["/x/passalong", "mcp"]);
  assert.equal(runner.LIMITS.atOnce, 3);
  assert.equal(runner.LIMITS.perDay, undefined, "no count of runs a day");
});

test("a run that ran out of time says so", () => {
  const why = runner.passBack({
    minutes: 60,
    timedOut: true,
    note: "BLOCKED: needs the staging key",
    dir: "/r/run-1",
    branch: "passalong/eeeeeeee",
  });
  assert.match(why, /ran out of its 60 minutes/);
  assert.match(why, /It said: "BLOCKED: needs the staging key"/);
  assert.doesNotMatch(
    why,
    /\/r\/run-1/,
    "a path on somebody's machine means nothing in a chat room",
  );
});

test("work back again while its last run's branch is still in use gets a fresh branch", async () => {
  // Found by a real run (2026-11-06): the second try failed on `git switch` and left the work
  // held with nobody on it.
  const repo = checkout();
  const { passed } = fakeServer(["ffffffff", "ffffffff"]);
  const branches = [];
  await assert.rejects(
    passalong.watch({
      cwd: repo,
      every: 10,
      atOnce: 1,
      countFile: join(process.env.PASSALONG_HOME, "count-5.json"),
      runAgent: async ({ cwd, prompt, log }) => {
        const branch = sh(cwd, "branch", "--show-current");
        branches.push(branch);
        assert.match(prompt, new RegExp(`git push -u origin ${branch}`), "told its own branch");
        writeFileSync(log, "working…\nNot logged in · Please run /login\n");
        return { exit: 1, timedOut: false };
      },
      sleep: stopAfter(3),
    }),
    /stop/,
  );
  assert.equal(branches[0], "passalong/ffffffff");
  assert.match(branches[1], /^passalong\/ffffffff-[a-z0-9]+$/, "a fresh branch beside it");
  assert.equal(passed.length, 2, "both runs gave the work back; neither left it held");
  assert.match(passed[0].why, /It said: "Not logged in · Please run \/login"/);
});

test("it tells the hub what it is on and how many runs it has started today", async () => {
  const repo = checkout();
  fakeServer(["gggggggg"], { done: ["gggggggg"] });
  const said = [];
  let during = null;
  await assert.rejects(
    passalong.watch({
      cwd: repo,
      every: 10,
      countFile: join(process.env.PASSALONG_HOME, "count-6.json"),
      report: async (s) => said.push(s),
      runAgent: async () => {
        during = said.at(-1);
        return { exit: 0, timedOut: false };
      },
      sleep: stopAfter(2),
    }),
    /stop/,
  );
  assert.deepEqual(
    during.running,
    [{ id: "gggggggg", title: "task gggggggg" }],
    "on it while it runs",
  );
  assert.equal(during.runs_today, 1);
  assert.equal(during.per_day, 0, "no daily limit");
  assert.equal(during.at_once, 3);
  assert.equal(during.stopped, false);
  assert.ok(during.host && during.repo, "which machine, and which repo");
  assert.deepEqual(said.at(-1).running, [], "and off it once it ends");
});

test("a run that stops to ask waits, keeps its worktree, and carries on once answered", async () => {
  const repo = checkout();
  // The queue hands out one piece of work; the task list says it is asking until a reply comes.
  let asking = "Which layout: two columns or one?";
  let done = false;
  const passed = [];
  globalThis.fetch = async (url, init = {}) => {
    const u = new URL(url);
    const json = (body) =>
      new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } });
    if (u.pathname === "/v1/tasks/next") {
      const first = !globalThis.__handed;
      globalThis.__handed = true;
      return json({
        task: first ? { id: "hhhhhhhh", title: "Pick a layout", markdown: "# h\n" } : null,
      });
    }
    if (u.pathname === "/v1/tasks")
      return json({
        tasks: globalThis.__handed
          ? [
              {
                id: "hhhhhhhh",
                title: "Pick a layout",
                state: done ? "done" : "claimed",
                claim: { asking, note: "" },
              },
            ]
          : [],
      });
    if (/\/pass$/.test(u.pathname)) passed.push(u.pathname);
    return json({});
  };
  const prompts = [];
  const waited = [];
  const resumed = [];
  let looks = 0;
  await assert.rejects(
    passalong.watch({
      cwd: repo,
      every: 10,
      countFile: join(process.env.PASSALONG_HOME, "count-7.json"),
      runAgent: async ({ prompt, cwd }) => {
        prompts.push({ prompt, cwd });
        if (prompts.length === 2) done = true;
        return { exit: 0, timedOut: false };
      },
      onWaiting: (t, { question }) => waited.push(question),
      onResumed: (t) => resumed.push(t.id),
      report: async () => {},
      sleep: async () => {
        looks++;
        if (looks === 2) asking = ""; // the person picked one
        if (looks >= 5) throw new Error("stop");
        await new Promise((r) => setTimeout(r, 5));
      },
    }),
    /stop/,
  );
  delete globalThis.__handed;
  assert.deepEqual(waited, ["Which layout: two columns or one?"]);
  assert.deepEqual(passed, [], "a question is not giving up: nothing went back");
  assert.deepEqual(resumed, ["hhhhhhhh"]);
  assert.equal(prompts.length, 2);
  assert.equal(prompts[1].cwd, prompts[0].cwd, "in the same worktree");
  assert.match(
    prompts[1].prompt,
    /They have answered\. Call the passalong MCP tool take with id hhhhhhhh first/,
  );
  assert.match(prompts[0].prompt, /call ask with id hhhhhhhh, one clear question, and `choices`/);
});

test("a run handed in for review is finished here: not given back, and the hub is told", async () => {
  const repo = checkout();
  const passed = [];
  let handed = false;
  globalThis.fetch = async (url, init = {}) => {
    const u = new URL(url);
    const json = (body) =>
      new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } });
    if (u.pathname === "/v1/tasks/next") {
      if (handed) return json({ task: null });
      handed = true;
      return json({ task: { id: "rrrrrrrr", title: "task r", markdown: "# r\n" } });
    }
    if (u.pathname === "/v1/tasks")
      return json({ tasks: handed ? [{ id: "rrrrrrrr", state: "review", claim: {} }] : [] });
    if (u.pathname.endsWith("/pass")) passed.push(u.pathname);
    return json({});
  };
  const posted = [];
  const finished = [];
  await assert.rejects(
    passalong.watch({
      cwd: repo,
      every: 10,
      countFile: join(process.env.PASSALONG_HOME, "count-review.json"),
      postSteps: async (_id, steps) => posted.push(...steps.map((s) => s.text)),
      onFinished: (t) => finished.push(t.id),
      runAgent: async () => ({ exit: 0, timedOut: false }),
      sleep: stopAfter(2),
    }),
    /stop/,
  );
  assert.deepEqual(passed, [], "nothing given back");
  assert.deepEqual(finished, ["rrrrrrrr"]);
  assert.match(posted.at(-1), /^Handed in\. It's ready for your review/);
});

test("work sent back starts from the branch its last run pushed, not from scratch", async () => {
  const repo = checkout();
  // The earlier run's branch, pushed, with a commit the main branch doesn't have.
  sh(repo, "switch", "--quiet", "-c", "passalong/ssssssss");
  writeFileSync(join(repo, "first-try.txt"), "first\n");
  sh(repo, "add", ".");
  sh(repo, "commit", "--quiet", "-m", "ssssssss: first try");
  sh(repo, "push", "--quiet", "origin", "passalong/ssssssss");
  sh(repo, "switch", "--quiet", "main");
  sh(repo, "branch", "--quiet", "-D", "passalong/ssssssss");
  fakeServer(["ssssssss"], { done: ["ssssssss"] });
  let saw = null;
  await assert.rejects(
    passalong.watch({
      cwd: repo,
      every: 10,
      countFile: join(process.env.PASSALONG_HOME, "count-back.json"),
      runAgent: async ({ cwd, prompt }) => {
        saw = { first: existsSync(join(cwd, "first-try.txt")), prompt };
        return { exit: 0, timedOut: false };
      },
      sleep: stopAfter(2),
    }),
    /stop/,
  );
  assert.equal(saw.first, true, "its earlier commit is there to carry on from");
  assert.match(saw.prompt, /First call the passalong MCP tool take with id ssssssss/);
});
