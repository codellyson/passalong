# The loop: every request closes

**Status:** Direction, recorded 2026-10-28 from a conversation with the author and extended
2026-10-29 by §0, which now leads. Much of §1a–§6 has since been built; each section says what.

## 0. Projects: the picture everything fits in (2026-10-29)

Passalong began as a way to pass information between contexts, which is where the old odd names came from. Usage moved away from that: 162 of 200 pieces of work in real use were
really tasks and bug reports, write-ups that followed their template went mostly unread, and teams
used Passalong to track work, not to pass documents. What a team will pay for is the thing that
keeps a mixed team (developers, marketing, support) from dropping work in the AI age, and that
gives every person and agent who picks work up the knowledge of the product. So:

**Five ideas.**
1. **Things come in**: email, a phone screenshot, the box in the hub, alerts.
2. **The agent sorts them**: which project each belongs to and which group should act.
3. **Projects**: one per product or repo (a marketing project needs no repo). Today's projects
   become projects.
4. **Documents**: what to know about a project. Its README says what the product is, who uses it,
   the words the team uses and how it is built; other pages cover one area each; a Log page says
   what changed. Agents read them when they take work and update them when they hand it in;
   every version is kept, so a person can see what changed and undo it.
5. **Work**: what to do. **One thing, with no kinds**: not task, bug or write-up, and no required
   sections, templates or headings. A piece of work is what it is in plain words, with whatever came
   with it (screenshots, files), its project, who has it and its state, plus a
   one- or two-line summary for people scanning the hub. The agent reads it and works out what done
   means; a writer may say "done when", nothing requires it. The hub may show a label such as "bug"
   that the agent sets, as description, never as a rule. A page says what is true; work says what
   someone must still do, and that is what reminds people and closes the loop.

**Two rules.**
- **Everything lives in exactly one project.** Nothing floats on its own.
- **People and groups belong to the team, not to a project.** One developer works across several
  projects without being added to each.

**What goes.**
- **Write-ups for one person.** Knowledge is written into a project's documents, where
  everyone finds it later, instead of a one-off document handed to one person. Old ones stay
  readable; nothing new is made as one.
- **Kinds and sections**: `kind:`, the per-kind templates and required headings, and every rule
  that turns on them. Splitting work into kinds was the system doing the agent's reading in advance.
- **The word "work"** everywhere: the hub, the agent tools, the CLI. Four nouns remain: project,
  document, work, file.

**The agent decides; people are told, not asked.** Passalong's own agent (the reader) reads the
problem and everything around it — notes, hand-ins, screenshots, output, linked work, a merged PR once GitHub is connected — and acts: Done, still going, or abandoned.
Waiting for a person to confirm, review or move a card is where work goes to sleep (64% of hand-ins
were never answered; no review ever sent anything back; the box's confirm step had to go). What
keeps it safe is not a gate but a record: every decision is written on the thread with its reason,
the people involved are told after the fact, and **Reopen** undoes it in one tap. **Evidence is an
input to the decision, never a gate**: a hand-in without proof is accepted and judged, not refused.

**What stays.** Everything that closes the loop: take, progress, hand-in with proof, reopen, the
reminders (untaken, stalled), the reader. Passalong carries
and remembers; it never hosts the agent that does the work (§6 item 5 is withdrawn).

**Overhaul, never patch.** What is wrong for this picture is replaced whole and the old removed
completely — code, routes, tools, columns, docs — not kept alive beside the new. Installed CLIs and
agents are moved by publishing the new CLI and raising `MIN_CLIENT`, not by keeping old routes.
Data is migrated, never silently dropped.

**Agent tools: 17, four nouns.** Work: `take`, `progress`, `hand_in`, `pass`, `ask`, `create_work`,
`find_work`, `update_work`. Projects: `find_projects`, `save_project`, `read_document`,
`save_document`, `delete_document`. Files: `add_file`, `read_file`, `delete_file`. Account:
`accounts`. Everything else (about 45 today) goes.

**Build order.** Each step lands whole. The first two answer what hurts in the live product today
(2026-10-29): agents filing a write-up nobody reads after finishing a task, which sits on the
board until someone archives it by hand; and finished work nobody moved to Done.
1. **One thing: work** — **built 2026-10-29** ([WORK.md](WORK.md)): kinds, sections,
   one-person write-ups and hand-in write-ups went in one overhaul, with the 17 tools; an agent's
   explanation goes in its hand-in or the project's documents. Existing write-ups stay as plain
   work (their `kind:` stripped); moving their knowledge into documents waits for step 4.
2. **The agent tidies the board**: a daily review of quiet work closes what is finished, archives
   what is abandoned and nudges what is still going; every hand-in is judged against what the task
   asked for and closed or reopened with what is missing. The proof gate on `hand_in`
   (`proofProblem()`) goes. Stronger with GitHub connected (a merged PR naming the task), useful
   without it.
3. **Onboarding** — **built 2026-10-30** (`/hub/start`; AGENTS.md, docs/llm-wiki/hub.md): a setup page run once by whoever creates the team: the team and its people,
   its groups, its projects (name, one line, repo if any), filling each project's documents (a
   prompt to paste into an agent for a repo; a few questions or pasted docs otherwise), where work
   comes in, and connecting agents.
4. **Sorting into projects**: the reader picks the project as it already picks the group.
5. **Documents on take and hand-in**: `take` hands the project's README, a list of its pages and
   the pages that match the work; `hand_in` asks for the pages the work changed and a Log line.
6. **The hub around projects**: open a project to see its documents, its open work and its history.

**The test for any new feature: which of the five does it live in?** One that fits none probably
does not belong. The risk this guards against is becoming Linear, Notion and Freshdesk at once and
losing to each on features; the line to hold is *your team's agents know your product, and nothing
that comes in gets dropped*.

## 1. The dream, and how to tell it is true

Passalong should let AI do work end to end with little or no human interference. The measure is
not activity, it is closure:

- **In development, work gets done.** A task goes from Ready to Done with proof, and nobody has to
  nudge it along the way.

"Nothing left behind" is countable: items with no owner and no movement, getting older. That number
should be zero, and the product should show it.

## 1a. Three problems, and the author's calls (2026-10-28)

The work is organised by the problem it solves. The author answered each solution in a shared doc
([Passalong: problems and solutions](https://claude.ai/artifact/X8H9UBRe6vAMwFLw9xEmqa)); this is
what was decided.

**Problem 1 — support loses track of customers.** *Withdrawn 2026-11-09: the customer support
feature did not fit and was removed whole (migration 0084).*

**Problem 2 — people create Passalongs in ChatGPT and Claude, not on Passalong.** Decided:
- *Built 2026-10-28:* the reader (`apps/api/src/reader.ts`, provider-agnostic through the
  AI SDK: Anthropic, OpenAI, Google or any OpenAI-compatible provider) sorts what comes in and routes it to the
  team's group by name; unsure, it files for the whole team and asks the author and owners by push
  and mail. The box on its own screen is next, on the same reader.
- *Built 2026-10-28:* the box is `/hub/new` ("Write it down here" in the New menu). The reader files
  what was written at once as work for a group (`POST /v1/compose`); the page
  says what it became, with one-click move and undo. When unsure it still files its best reading and
  says what is worth checking, with the question on the thread. The input is a WYSIWYG editor (TipTap, `components/hub/Writer.vue`): it reads as
  you type (`POST /v1/compose/preview`, nothing filed) and lists work already on the board that
  looks the same; a pasted screenshot uploads and shows in place, a pasted error or log becomes a
  code block, links stay links; `@` suggests people and `#` the team's groups. The page leads with the agent at work: "What do you need?", starter chips, and an Agent panel beside the editor that fills in as you write — what it is, where it goes and why, what it has drafted, what already looks like it — then where it was filed; the last few it filed are listed below (`GET /v1/compose/recent`).
- The box lives on **its own screen**.
- The reader runs on **strict, tested rules**.
- **It classifies on its own; there is no confirm step.** This reverses §6 item 4 below. To keep the
  intent of "a silent default is a fabrication", the work records that the reader classified it,
  the person sees the result at once, and changing it is one click.
- When it is unsure and asks, the question is **impossible to miss** — push and email, not only the
  feed.

**Problem 3 — work handed to agents stops and nobody notices.** Decided:
- Untaken work reminds people **every day until someone acts**, not once. *Built 2026-10-28:* the
  feed and the phone hear it daily; the email goes the first time only.
- *Built 2026-10-29, removed 2026-11-07:* a runner (`passalong work --watch`) on an always-on
  machine took work a person ticked **Safe to run alone** and ran Claude Code on it with nobody
  watching; later each run had its own worktree, opened a pull request, and waited in review for a
  person. In use it closed work people hadn't looked at, gave work back in ways that confused even
  its author, and needed a CLI release for every change; run from CI instead, it would have spent
  compute minutes polling an empty queue. It is gone: work is taken by an agent in a session a
  person opens. Migration 0078 finished any hand-in left in review and cleared the ticks; the
  `runner` and `work_step` tables and the `alone` columns are left in place, unread.

**Order, approved:** 1. the reader and its screen · 2. the runner. Before 1: make the untaken
reminder daily.

## 2. The lens

*Withdrawn 2026-11-09 with customer support: the help-desk half of this lens did not fit.* A feature
is built only if it closes the loop below, not because an incumbent has it.

## 3. The loop

1. Something comes in. It becomes a piece of work.
2. Someone takes it: an agent or a person. A defect found on the way can go to development as a
   child with the work as its `parent`.
3. The child is fixed, with proof.
4. The child finishing wakes the parent.
5. Both are Done. If anything stops on the way, a person is told; it never goes quiet.

## 4. The experience, person by person

*Withdrawn 2026-11-09: this followed one customer's request through the support feature, which was
removed whole.*

## 5. Principles agreed along the way

- **No manager agent in the middle.** Passalong is the middle, and it runs on rules, not on a model.
  A supervising agent is one more thing that can drop work, is nondeterministic, and would be a
  second place for rules — and the codebase's rule is that a rule lives in the route.
- **Passalong is the referee, not only a player.** Its job is to guarantee every item closes,
  whoever does the work: Fin, Claude Code, Devin or a person. Outside agents already plug in through
  MCP, webhooks and email in, and are held to the same rules. Building our own worker is a second
  product; do it only if real users have no agent at all.
- **Not every user is technical.** For a support person, a product manager or a tester, nothing is
  installed and nothing is typed in a terminal. They say what they want (email, hub, phone), see who
  or what is on it in plain words, answer when asked, and see proof they understand — a screenshot,
  never command output. Anything that runs work for them is hosted,
  or set up once by one technical teammate.
- **Setup does not grow Settings** (it is already too much); it goes on the board or in a project.

## 6. What is missing, in order

1. **Stop the leaks, and count what drops.** *Built 2026-10-28; tightened 2026-11-07* — an agent
   at work renews its hold from the tool hook, so only an agent that stopped goes quiet; a Claude
   Code session that ends gives back what it still holds at once (the SessionEnd hook); stalled
   holds go back in the queue half an hour after their lease lapses, checked every minute
   (`requeueStalled`); a question unanswered for a day is mailed to the author again; a second
   requeue mails the author
   (`stuck`); sent work nobody took stays Ready and mails its author and the team's owners after
   three days (`untaken`); `scripts/metrics.mjs` opens with "Left behind — right now". Before that,
   work could be left behind by design:
   - A stalled claim stays locked until a person releases it (`claims.ts`); nothing re-queues it.
   - Ready work nobody takes for a fortnight goes back to Draft (`backToDraft`), where it reaches
     nobody.
   - `scripts/metrics.mjs` measures PRD §14, not how much was dropped.

   The fix: stalled work goes back to the queue and a second stall tells a person; untaken work is
   escalated to a person rather than shelved; a "dropped" count in metrics. Highest value for the
   least code — every automation added before this just drops work faster.
2. *Withdrawn 2026-11-09: the customer as a party on a piece of work was built, then removed whole.*
3. **A parent wakes when its child does.** *Built 2026-10-28* — when a piece of work made from another
   reaches Done, the parent gets a note on its thread (which its holder and next taker are handed)
   and its author and holders a `child_done` notification. It wakes, it does not close.
4. **Filing work from the hub, without an agent of your own.** Today a piece of work is made by an agent
   through MCP or the CLI, or by email in. A support person, a tester or a product manager has
   neither. The hub gets one box: the person writes or pastes whatever they have — a sentence, a
   screenshot — and a small model on the server (Claude Haiku, or another
   small model) reads it and derives the purpose: which kind it is, the summary, and the sections
   that kind needs (Acceptance for a task, Reproduce and Verification for a bug). It is not an
   editor and the person writes no structure.

   *Reversed 2026-10-28 (§1a): it classifies on its own, with no confirm step; the work records that
   the reader classified it and the person changes it in one click.* As first agreed:
   **The person confirms; the model never decides alone.** It shows back what it understood, in
   plain words — "Something broken. Jane can't export. Done when: the export downloads." — with
   **Looks right** and **Change**. Nothing is stored until the person says it is right, so the kind
   and the summary are still stated by the author, by confirming them; the rule that a silent
   default is a fabrication still holds. When the model cannot tell, it asks one question rather
   than guess.

   One reader, two doors: the hub box and email in. It writes through the same `PUT /v1/work/:id` everything else uses.
   It reverses "the hub has no editor and will not get one", the original design brief, which assumed
   every piece of work starts where an agent already did the work; in the loop, work starts with a person
   asking. AGENTS.md says so now.
5. *Withdrawn 2026-10-29: Passalong never hosts the agent that does the work (§0).* **Later:** a hosted runner so Ready work is picked up without a person opening a session —
   for development, a one-time-connected sandbox or a teammate's machine.

## 7. Open

- Whether a long agent run can live in the Worker (time limits suggest Workflows or a Durable
  Object), if Passalong ever runs a worker itself.
- What one piece of work filed from the hub box costs in model calls.
