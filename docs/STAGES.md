# Stages: research, work, review, send back

**Status:** Proposed 2026-10-12. Nothing built. The four stages and which two are pluggable are agreed;
everything under §6 is open.

## 1. Why

People complain about AI output, and most of the complaints are one of two failures:

1. **The agent builds what already exists.** It reads a guide, decides a feature is missing, and
   implements it — when the feature, or most of it, was already there. Nothing in the flow today asks
   it to look first, so it trips itself into believing the work is new.
2. **The agent hands in work nobody critiqued.** The hand-in gate (`checks`) makes it show evidence
   against each Acceptance or Verification line, but evidence that the lines hold is not the same as
   the work being good. Nobody reads the change with a critical eye before a person does.

Passalong already decides what an agent may say at hand-in. This proposal decides what it does
between `take` and `hand_in`, so the person reviewing receives work that was checked against what
existed before it started and critiqued after it finished.

## 2. The stages

Once an agent takes a guide, the work runs in four stages, in this order:

1. **Research.** Before building anything, the agent finds out what already exists: whether the
   feature, the fix or part of it is already in the code, in another guide, or in a folder document.
   The purpose is narrow: to stop the agent implementing something that is already implemented. It
   ends with the agent knowing what is genuinely left to do.
2. **Work.** The agent does what research said is left. Unchanged from today.
3. **Review.** After the agent has written the change, it critiques its own work with a reviewer, and
   acts on what the reviewer finds before handing in.
4. **Send back.** The normal `hand_in`, unchanged: checks, writeup, risk, evidence.

## 3. What is pluggable

**Research and Review are pluggable. Work and Send back are not.**

- A user can name their own plugin for Research, for Review, or for both: "use my reviewer to
  critique your work".
- Passalong ships a **default plugin for each**, so the stages work for somebody who never chooses
  one. A user opts into the default, or names their own.
- Work stays the agent's own, and Send back stays the one hand-in every kind of guide already uses.

## 4. How it fits what exists

- **`take`** is where the stages begin. Its `next` is the natural place to tell the agent which
  stage it is in and which plugin to use.
- **`progress`** already carries a one-line note per milestone; finishing a stage is a milestone.
- **`hand_in`** is Send back. Nothing about it changes in this proposal.
- **Hand-in checks that could not run here** (`not_run`, scoped separately) are the honest answer
  when Review or Verification needs an environment the agent does not have.

## 5. Out of scope

- Plugins for Work or Send back.
- Changing what `hand_in` accepts or refuses.
- A marketplace or registry of plugins.

## 6. Open questions

1. **What the default Research plugin does**, concretely: which sources it searches (the repo, other
   guides, folder documents, git history) and what it must produce before Work starts.
2. **What the default Review plugin does**: what it critiques, and what counts as acting on a finding.
3. **How a user names a plugin**: per account, per team, per guide, or per repo — and where that
   choice is stored.
4. **What a plugin is**: a Claude Code skill, an MCP prompt, an instruction the server sends in
   `next`, or something else — and whether it works the same for agents over stdio and over
   `POST /v1/mcp`.
5. **Whether a stage can be shown, not just claimed**: does the hand-in carry evidence that Research
   and Review happened, and does the reviewing person see it?
6. **Whether a stage is required or advised**: is a hand-in refused when Review did not run, or does
   the person just see that it did not?
