import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

// The runner (`passalong work --watch`, src/runner.js): each piece of work marked safe to run alone
// in a worktree and branch of its own, up to three at once and ten a day, and work its agent did
// not finish goes back to its author (2026-11-06). Real git, in a throwaway repo and its origin;
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
  const asked = [];
  const passed = [];
  globalThis.fetch = async (url, init = {}) => {
    const u = new URL(url);
    const json = (body) =>
      new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } });
    if (u.pathname === "/v1/tasks/next") {
      asked.push(JSON.parse(init.body || "{}"));
      const id = queue.shift();
      return json({ task: id ? { id, title: `task ${id}`, markdown: `# ${id}\n` } : null });
    }
    if (u.pathname === "/v1/tasks")
      return json({
        tasks: done.map((id) => ({ id, state: "done" })).concat([{ id: "zzzzzzzz", note: "x" }]),
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
  assert.match(passed[0].why, /stopped without finishing \(exit 1\)/);
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

test("ten runs a day, then it waits for tomorrow and says so once", async () => {
  const repo = checkout();
  const countFile = join(process.env.PASSALONG_HOME, "count-4.json");
  const today = runner.dayOf(Date.now());
  writeFileSync(countFile, JSON.stringify({ day: today, runs: 9 }));
  fakeServer(["d1111111", "d2222222"], { done: ["d1111111", "d2222222"] });
  const ran = [];
  let capped = 0;
  await assert.rejects(
    passalong.watch({
      cwd: repo,
      every: 10,
      countFile,
      runAgent: async ({ cwd }) => {
        ran.push(cwd);
        return { exit: 0, timedOut: false };
      },
      onCapped: () => capped++,
      sleep: stopAfter(3),
    }),
    /stop/,
  );
  assert.equal(ran.length, 1, "the tenth run, and no eleventh");
  assert.equal(capped, 1);
  assert.equal(runner.runsToday(countFile, today), 10);
  assert.equal(runner.runsToday(countFile, "1999-01-01"), 0, "a new day starts at nought");
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
  assert.equal(runner.LIMITS.perDay, 10);
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
  assert.match(why, /Its last note: "BLOCKED: needs the staging key"/);
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
  assert.match(passed[0].why, /The last thing it printed: "Not logged in · Please run \/login"/);
});

test("it tells the hub what it is on and how much of today it has used", async () => {
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
  assert.equal(during.per_day, 10);
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
