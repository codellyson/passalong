---
title: Hand work to your agents, and see it come back
date: 2026-09-27
description: What Passalong is for, and what changed this month — a live hub, notifications when you're away, and proof that "it works".
author: The Passalong team
draft: true
---

Every AI coding session starts from zero. The agent in this repo doesn't know what the agent in the
other repo found out yesterday. The teammate you hand a fix to has to reconstruct why it's shaped
the way it is. And when an agent says "done", you mostly take its word for it.

Passalong is the handoff between those contexts. You — or your agent — write down the work as a
**guide**: plain markdown with a little frontmatter, in a shape the next agent can act on. It goes
to a person, a group, a team or the task queue, and whoever picks it up starts with what done
looks like, what was decided, and how to check it.

## Three kinds of guide

A guide says what it's asking for, because each kind asks for something different:

- **A task** is work nobody has done yet. It has a Goal, the Context, the Constraints and — the
  part that matters — an Acceptance list: what done means. There are no steps; working out how is
  the agent's job.
- **A transfer** is a finished piece of work to repeat somewhere else, or context the next agent
  needs so it doesn't start cold.
- **A bug** is a defect to fix where it is: how to see it, and what fixed looks like.

## Four calls, whatever the kind

An agent works any guide with the same four calls. It **takes** it, so nobody else does the same
work twice. It reports **progress** in one line at each milestone, and if it goes quiet for half an
hour, the guide shows as stalled. It **hands in** when it's done. Or it **passes**, with a reason,
when the work isn't its to do.

A hand-in is refused without evidence: what it ran and what came back, a link to the change, a
screenshot. The write-up is the agent's word for its own work; the evidence is the part you can
check. When it has sorted the evidence against your Acceptance lines, you review it line by line
and send back only the lines that aren't met.

Everything lives in the hub, and every guide is still a markdown file you can export and keep.

## What changed this month

**Every guide has a page, and it tells the story.** Open a guide in the hub and its sidebar shows
what happened to it, in order: who it was sent to, who opened it, who took it and where, what they
said along the way, what they handed in and showed — ending on where it stands now. The document
itself sits beside it, exactly as the share link shows it.

**The hub is live.** You no longer reload to see progress. When an agent posts a note, hands
something in, or a teammate says a fix didn't work, the page updates while you watch, and anything
that needs you arrives as a small notice in the corner.

**Notifications when you're not looking.** Turn them on per device in Settings, and Passalong will
tell your laptop or phone when something needs you: work sent to you, a hand-in waiting for review,
something that didn't work, an agent that went quiet or is stuck on you. Only those — a phone that
buzzes every time someone opens a link is a phone that gets muted. Messages are encrypted so the
push service carrying them can't read them, and each device can hide guide titles from its lock
screen.

**"It works" now comes with proof.** Saying a guide works used to be one click. Too often it didn't
— someone said it worked, and it hadn't been checked where it mattered. Now "it works" needs a
screenshot of it working. Proof is for the review, not for keeping forever: five days after the
guide is closed, those screenshots are deleted and a note says they were.

**Everything that needs you, in one list.** Tasks to review, handoffs handed back, work sent to you,
agents stuck on you — one list on the left, and the one you pick on the right, asking the one
question it has.

And the whole product has a calmer look, with a new mark to go with it.

## Try it

Install the CLI and connect your agent:

```
npm i -g passalong && passalong setup
```

Then, at the end of a session, tell your agent to pass it along — and see what comes back.
