---
title: How to write a task an AI coding agent can finish
date: 2026-10-03
description: Most agent tasks fail before the agent starts. How to size a task, what context to give, and how to write acceptance an agent can check itself against, with a template and a before-and-after.
draft: false
---

When a coding agent comes back with the wrong thing, the usual reaction is to blame the model.
More often the task was the problem. It was too big, it said how instead of what, it left out
something you knew and the agent did not, or it never said what done looks like.

This post is about writing the task: what goes in it, how big it should be, and how to tell
whether it is ready before you hand it over. It works the same whether the agent is Claude Code,
Codex or anything else. For the rest of the handoff, claiming the work and reviewing what comes
back, see [Handing work to AI coding agents](/learn/ai-agent-handoff).

## Start from a bad task

Here is a task as most of us write it:

> Fix the login bug where users get logged out.

Every word of it makes sense to the person who wrote it. To an agent starting cold, it raises
more questions than it answers. Which login: the web app, the mobile API, the admin panel? Logged
out when: after an hour, after a deploy, at random? What counts as fixed: no more reports, a
passing test, a longer session? Is changing the session lifetime allowed, or is that a security
decision someone else owns?

The agent will answer every one of those questions itself, quietly, and you will find out which
answers it picked when you review the change. Here is the same task written so it does not have to:

```markdown
## Goal
A signed-in user on the web app stays signed in
for the full 7-day session, across page reloads.

## Context
Users report being signed out after about an hour.
Sessions are stored in Redis (`src/auth/session.ts`).
The refresh call is in `src/web/api/client.ts`.
Production logs show 401s from `/api/me` right after
a 200 from `/api/refresh`.

## Constraints
- Do not change the 7-day session lifetime.
- Do not touch the mobile API (`src/mobile/`).

## Acceptance
- A test reproduces the sign-out before the fix,
  and passes after it.
- `npm test -- auth` passes.
- Manually: sign in, wait for the access token
  to expire (set it to 1 minute locally), reload.
  Still signed in.

## Out of scope
The "remember me" checkbox, which is broken too.
That is a separate task.
```

It took five minutes longer to write. It will save the agent an hour of guessing and save you a
review of a change you did not want.

## Say what, not how

The **Goal** is what is true when the work is done. It is not a list of steps.

If you write "add a retry to the refresh call", the agent will add a retry, whether or not that
fixes anything. If you write "users stay signed in for the full session", the agent will find out
why they do not, and the fix might be a retry, or it might be a race between two tabs that a retry
would hide.

Prescribe the approach only when it is genuinely a requirement, and then put it under Constraints,
not Goal: "use the existing job runner, not a one-off script". That tells the agent it is a rule
to follow rather than a guess to second-guess.

## Give it what you know and it does not

The agent can read the code. It cannot read your head, your issue tracker or last week's incident
channel. **Context** is for that gap:

- **Where to look.** The two or three files that matter, so it does not read forty.
- **What you have already seen.** Error messages, log lines, the request that fails. Paste them;
  do not describe them.
- **What already exists.** "There is a `retryWithBackoff` helper in `src/lib/`". Otherwise it
  writes a second one.
- **What you have already tried.** If you spent an hour ruling something out, say so.

Leave out what it can find itself in a few seconds. A task is not the place for the history of the
project. If you find yourself writing a lot of Context for every task, that material belongs in
your `CLAUDE.md` or `AGENTS.md` instead, where every session gets it.

If your work starts as tickets, [Passalong or an issue tracker?](/learn/passalong-vs-issue-tracker)
covers turning a ticket into a task an agent can take.

## Write the constraints you would otherwise review for

Constraints are the things you would reject in review. Writing them down first is cheaper than
rejecting the change later:

- What must not change: a public API, a schema, a session lifetime, a file another team owns.
- What to use: an existing helper, a library already in the project, a pattern the codebase follows.
- What to avoid: a new dependency, a long-running transaction, a change to shared config.

Keep them to the ones that matter for this task. Ten constraints read like a policy document, and
the one that mattered gets lost.

## Make acceptance checkable

**Acceptance** is the definition of done, and the part that does the most work. Each line should
be something a person or a script can check, with an answer nobody can argue with. It is also what
you will review against, so it is worth getting right.

Good acceptance names the observable result and, where it can, the command that shows it. What that
looks like depends on the kind of work:

**A bug fix**: a test that fails before and passes after. (For reporting the bug itself, see
[A bug report template for AI coding agents](/learn/bug-report-template-for-ai-agents).)

```markdown
- A test reproduces the bug and passes after the fix.
```

**A feature**: the behaviour, from the outside.

```markdown
- `POST /api/invites` with an existing member's
  email returns 409, not 500.
```

**A refactor**: what must stay the same.

```markdown
- `npm test` passes with no test changed.
- No change to exports: `git diff main -- src/index.ts`
  is empty.
```

**A migration or backfill**: the end state, and how it got there safely.

```markdown
- On staging, `SELECT count(*) ... IS NULL` returns 0.
- Runs in batches of at most 1,000 rows.
```

**Anything visual**: what to look at, and where.

```markdown
- At 375px wide, the settings page has no
  horizontal scroll. Screenshot attached.
```

Lines to avoid: "works correctly", "clean code", "well tested", "improved performance". They feel
like acceptance and check nothing. If you cannot say how you would check it, the agent cannot
either.

## Say what is out of scope

Agents are helpful in a way that costs you review time. Ask for a fix to sign-out and you may also
get a tidied-up auth module, a renamed helper and a fix for the "remember me" bug you mentioned in
passing.

**Out of scope** names the nearby things it should leave alone. The best candidates are the ones
you noticed while writing the task: if you thought "that is broken too", write it down here, and
write it up as its own task.

## Size it so one session can finish it

A task should be something one agent can finish in one sitting and you can review in one go. Signs
it is too big:

- The Goal has an "and" in it that joins two outcomes.
- The Acceptance list is longer than about six lines.
- You cannot think of a single test or check that shows it is done.
- It touches several areas that different people would review.

Split it along those lines, and say which pieces depend on which: "the API change first, then the
UI that calls it". Each piece gets its own Goal and Acceptance. Small tasks also fail more
cheaply: if one goes wrong, you throw away an hour of work, not a day.

## Let the agent draft it

You do not have to write every task from scratch. If you have been thinking a problem through with
ChatGPT or Claude, ask it to write the task before you leave the chat:

> Write this up as a task for a coding agent: a Goal (what is true when it is done), the Context
> it needs, the Constraints we agreed, Acceptance lines that can each be checked, and what is out
> of scope. Mark anything you are guessing about the codebase.

The chat assistant has not seen your repo, so read what it writes. It will invent plausible file
paths and helper names. Fix the ones you know, and leave the rest marked as guesses for the coding
agent to check.

## Check it before you hand it over

Read the task once as if you had never seen the project:

- [ ] The Goal says what is true when it is done, not what to do.
- [ ] Context points at the right files and includes what you have already seen.
- [ ] Constraints list what you would otherwise reject in review.
- [ ] Every Acceptance line can be checked, and you know how.
- [ ] Out of scope names what is nearby and not part of this.
- [ ] One agent can finish it in one sitting.

## Writing tasks with Passalong

[Passalong](/) uses exactly this shape. A task is a guide with Goal, Context, Constraints,
Acceptance and Out of scope ([the format](/docs/guide-format)), and Acceptance is required: a task
without it is refused. When an agent hands the work in, it attaches evidence against each
Acceptance line, and you review line by line, sending back only the lines that are not met.

With Passalong connected to your tools, an agent can run the whole loop itself: file the bugs it
finds, write a task, take work that is waiting, report progress, hand it in with evidence, and pass
the next piece to another agent or a teammate. Nothing gets copied between tools by hand. What stays
with you is the decision: you approve the work or send it back.

Bigger work can be split into a plan of tasks, each waiting on the ones it depends on, so an agent
only picks up a step when the steps before it are approved.

Write a task from the command line:

```sh
passalong task "Users stay signed in for 7 days"
```

Or ask your agent, in Claude Code, Codex, ChatGPT or Claude, to write it up as a Passalong task.
[Connect your tools](/connect) to get started.
