import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

// The runner made usable (2026-11-06): one runner for a folder of checkouts, the folder checked
// before anything is promised, no worktree made just to ask for work, and every step its agent takes
// sent to the hub. Real git; the server and the agent are stand-ins.
process.env.PASSALONG_HOME = mkdtempSync(join(tmpdir(), "passalong-runner-folder-"));
process.env.PASSALONG_API = "http://fake.test";
process.env.PASSALONG_TOKEN = "t";
const passalong = await import("../src/passalong.js");
const runner = await import("../src/runner.js");

const sh = (cwd, ...args) =>
  execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

/** A folder holding checkouts, each with an origin of its own; `bare` ones have no origin. */
function folder(names, { bare = [] } = {}) {
  const top = mkdtempSync(join(tmpdir(), "passalong-folder-"));
  const origins = join(top, ".origins");
  mkdirSync(origins);
  for (const name of [...names, ...bare]) {
    const repo = join(top, "apps", name);
    mkdirSync(repo, { recursive: true });
    sh(repo, "init", "--quiet", "-b", "main");
    sh(repo, "config", "user.email", "t@example.com");
    sh(repo, "config", "user.name", "T");
    writeFileSync(join(repo, "README.md"), `${name}\n`);
    sh(repo, "add", ".");
    sh(repo, "commit", "--quiet", "-m", "start");
    if (bare.includes(name)) continue;
    const origin = join(origins, `${name}.git`);
    sh(top, "init", "--quiet", "--bare", "-b", "main", origin);
    sh(repo, "remote", "add", "origin", origin);
    sh(repo, "push", "--quiet", "origin", "main");
    sh(repo, "remote", "set-head", "origin", "main");
  }
  return top;
}

/** Hands `id` to the first ask whose repo ends with `/for`; records every ask and every step. */
function fakeServer({ id, for: forRepo, done = true } = {}) {
  const asked = [];
  const reports = [];
  let given = false;
  globalThis.fetch = async (url, init = {}) => {
    const u = new URL(url);
    const json = (body) =>
      new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } });
    const body = JSON.parse(init.body || "{}");
    if (u.pathname === "/v1/tasks/next") {
      asked.push(body);
      if (!given && id && body.repo.endsWith(`/${forRepo}`)) {
        given = true;
        return json({ task: { id, title: `task ${id}`, markdown: `# ${id}\n` } });
      }
      return json({ task: null });
    }
    if (u.pathname === "/v1/tasks")
      return json({
        tasks:
          !id || !given ? [] : [done ? { id, state: "done" } : { id, state: "claimed", claim: {} }],
      });
    if (u.pathname === "/v1/runner") {
      reports.push(body);
      return json({ ok: true });
    }
    return json({});
  };
  return { asked, reports };
}

const stopAfter = (n) => {
  let looks = 0;
  return async () => {
    looks++;
    if (looks >= n) throw new Error("stop");
    await new Promise((r) => setTimeout(r, 5));
  };
};

test("started in a folder, one runner serves every checkout in it that has an origin", async () => {
  const top = folder(["shop", "api"], { bare: ["notes"] });
  const { asked, reports } = fakeServer({ id: "aaaaaaaa", for: "api" });
  let started = null;
  const ran = [];
  await assert.rejects(
    passalong.watch({
      cwd: top,
      every: 10,
      countFile: join(process.env.PASSALONG_HOME, "count-1.json"),
      machine: () => "Ada's MacBook",
      onStart: (s) => (started = s),
      runAgent: async ({ cwd }) => {
        ran.push({
          cwd,
          agent: JSON.parse(readFileSync(join(cwd, ".passalong", "agent.json"))).id,
        });
        return { exit: 0, timedOut: false };
      },
      sleep: stopAfter(2),
    }),
    /stop/,
  );
  assert.equal(started.repos.length, 2);
  assert.ok(started.repos.some((r) => r.endsWith("/api")));
  assert.ok(started.repos.some((r) => r.endsWith("/shop")));
  assert.equal(started.skipped.length, 1, "a checkout with no origin is skipped, and said");
  assert.ok(new Set(asked.map((a) => a.repo)).size >= 2, "each repo is asked for");
  assert.equal(ran.length, 1);
  assert.ok(ran[0].cwd.includes("api.passalong-runs"), "run beside the repo it is for");
  const took = asked.find((a) => a.repo.endsWith("/api") && a.worktree === ran[0].cwd);
  assert.ok(took, "the worktree is the one named when the work was asked for");
  assert.equal(ran[0].agent, took.agent, "and its agent is the one that took it");
  const last = reports.at(-1);
  assert.equal(last.host, "Ada's MacBook");
  assert.equal(last.repos.length, 2, "the hub hears every repo it serves");
});

test("asking for work makes no worktree: nothing is left behind while it waits", async () => {
  const top = folder(["shop"]);
  fakeServer({});
  let idle = null;
  await assert.rejects(
    passalong.watch({
      cwd: top,
      every: 10,
      countFile: join(process.env.PASSALONG_HOME, "count-2.json"),
      onIdle: (repos) => (idle = repos),
      sleep: stopAfter(3),
    }),
    /stop/,
  );
  assert.equal(idle.length, 1);
  assert.deepEqual(readdirSync(join(top, "apps", "shop.passalong-runs")), []);
  assert.doesNotMatch(sh(join(top, "apps", "shop"), "worktree", "list"), /passalong-runs/);
});

test("a folder with no checkout is refused before anything is promised", async () => {
  const empty = mkdtempSync(join(tmpdir(), "passalong-empty-"));
  fakeServer({});
  let started = false;
  await assert.rejects(
    passalong.watch({ cwd: empty, onStart: () => (started = true), sleep: stopAfter(1) }),
    /no git checkout in .* or the folders under it\. Start the runner inside a repo, or in the folder that holds your repos/,
  );
  assert.equal(started, false);
});

test("a run that ends unfinished says so in its last step, before the work goes back", async () => {
  const top = folder(["shop"]);
  fakeServer({ id: "dddddddd", for: "shop", done: false });
  const posted = [];
  await assert.rejects(
    passalong.watch({
      cwd: top,
      every: 10,
      countFile: join(process.env.PASSALONG_HOME, "count-4.json"),
      postSteps: async (_id, steps) => posted.push(...steps.map((s) => s.text)),
      runAgent: async () => ({ exit: 1, timedOut: false }),
      sleep: stopAfter(2),
    }),
    /stop/,
  );
  assert.match(posted.at(-1) ?? "", /^Gave it back unfinished/);
});

test("what the agent does reaches the hub as steps, starting with where it runs", async () => {
  const top = folder(["shop"]);
  fakeServer({ id: "cccccccc", for: "shop" });
  const posted = [];
  const printed = [];
  await assert.rejects(
    passalong.watch({
      cwd: top,
      every: 10,
      countFile: join(process.env.PASSALONG_HOME, "count-3.json"),
      machine: () => "build-box",
      postSteps: async (id, steps) => posted.push(...steps.map((s) => ({ id, ...s }))),
      onStep: (_t, text) => printed.push(text),
      runAgent: async ({ onStep }) => {
        onStep("Reading src/app.ts");
        onStep("Running `npm test`");
        return { exit: 0, timedOut: false };
      },
      sleep: stopAfter(2),
    }),
    /stop/,
  );
  assert.deepEqual(
    posted.map((s) => s.text),
    [
      `Started on build-box in ${posted[0].text.split(" in ")[1].split(",")[0]}, on branch passalong/cccccccc`,
      "Reading src/app.ts",
      "Running `npm test`",
    ],
  );
  assert.ok(posted.every((s) => s.id === "cccccccc" && s.at));
  assert.deepEqual(
    printed,
    posted.map((s) => s.text),
    "and to the terminal",
  );
});

test("Claude Code's events become sentences, and secrets don't leave the machine", () => {
  const ev = (o) => JSON.stringify(o);
  const said = runner.describe(
    ev({
      type: "assistant",
      message: {
        content: [
          { type: "text", text: "Looking at the deal form first.\nThen the API." },
          { type: "tool_use", name: "Edit", input: { file_path: "/w/src/deal.ts" } },
          { type: "tool_use", name: "Bash", input: { command: "GITHUB_TOKEN=ghp_abc npm test" } },
          { type: "tool_use", name: "mcp__passalong__progress", input: { note: "form done" } },
        ],
      },
    }),
    "/w",
  );
  assert.deepEqual(said.step.split("\n"), [
    "Looking at the deal form first.",
    "Editing src/deal.ts",
    "Running `GITHUB_TOKEN=[hidden] npm test`",
    "Progress: form done",
  ]);
  assert.match(said.log, /Then the API\./, "the log keeps all it said");
  assert.equal(
    runner.describe(
      ev({
        type: "user",
        message: {
          content: [{ type: "tool_result", is_error: true, content: "npm ERR! missing script" }],
        },
      }),
    ).step,
    "That didn't work: npm ERR! missing script",
  );
  assert.equal(
    runner.describe(ev({ type: "result", is_error: false, result: "Opened PR #12." })).step,
    "Finished: Opened PR #12.",
  );
  assert.equal(runner.describe(ev({ type: "user", message: { content: [] } })).step, "");
  assert.equal(runner.describe("Error: something broke").step, "Error: something broke");
  assert.equal(
    runner.hideSecrets("key abcd1234efgh5678ijkl9012mnop3456qrst used"),
    "key [hidden] used",
  );
  const claude = runner.claudeCommand({ cli: "x" });
  assert.ok(claude.args.includes("stream-json"), "Claude Code says what it does as it goes");
});

test("a give-back leads with what the agent said, in words a chat room can read", () => {
  const said =
    "Not done: the backend repo check, and starting the app to screenshot the notifications page. " +
    "I couldn't open Gmail or Google Calendar from here. Everything else is on the branch.";
  const why = runner.passBack({
    minutes: 60,
    exit: 0,
    said,
    branch: "passalong/q7",
    machine: "Mac",
  });
  assert.match(
    why,
    /^The runner's agent ended its run without handing it in\. It said: "Not done:/,
  );
  assert.doesNotMatch(why, /exit 0/);
  assert.match(why, /no runner takes it again until someone ticks it/);
  assert.match(why, /on branch passalong\/q7 on Mac\.$/);
  assert.equal(
    runner.sentences("The form sends the offset now. The detail screen still needs the tag.", 40),
    "The form sends the offset now.",
  );
  assert.match(runner.sentences("a ".repeat(400), 100), /…$/);
});

test("Claude Code's last message comes back from the run, for why it gave the work back", async () => {
  const dir = mkdtempSync(join(tmpdir(), "passalong-said-"));
  const log = join(dir, "x.log");
  const script = join(dir, "agent.mjs");
  writeFileSync(
    script,
    `process.stdout.write(JSON.stringify({ type: "result", result: "Not done: needs the staging key." }) + "\\n");`,
  );
  const ran = await runner.runAgent({
    command: process.execPath,
    args: [script],
    cwd: dir,
    log,
    minutes: 1,
  });
  assert.equal(ran.exit, 0);
  assert.equal(ran.said, "Not done: needs the staging key.");
});

test("a GitLab checkout ends in a merge request, not a gh pull request", () => {
  assert.equal(runner.forgeOf("git@gitlab.com:khaime/khaime-mobile.git"), "gitlab");
  assert.equal(runner.forgeOf("https://github.com/o/r.git"), "github");
  const gl = runner.runnerPrompt({ id: "abcdefgh", markdown: "x" }, "passalong/abcdefgh", {
    forge: "gitlab",
  });
  assert.match(gl, /git push -u origin passalong\/abcdefgh -o merge_request\.create/);
  assert.doesNotMatch(gl, /gh pr create/);
  assert.match(gl, /Never call pass yourself/);
});
