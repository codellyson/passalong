---
title: A product knowledge base for AI agents
date: 2026-10-30
description: A product knowledge base for AI agents: what an agent needs to know, where it should live for a mixed team, and how AGENTS.md fits beside it.
draft: true
---

An AI coding agent starts every session knowing nothing about your product. It can read the code,
but the code does not say who the customers are, why the billing page works the way it does, or
that "workspace" and "account" mean different things to your team. A person picks this up over
months. An agent has to be told every time, or it guesses.

Most teams handle this with a file in the repo, such as `AGENTS.md` or `CLAUDE.md`. That is a good
start. This article is about what such a file should hold, where it stops being enough, and how to
keep what your team knows somewhere every person and agent can read it and add to it.

## What an agent needs to know about a product

Leave out what the code already says. An agent can find a function; it cannot find the reason it
exists. A useful knowledge base covers four things.

**What the product is.** One paragraph: what it does and what it is not. This stops an agent
building features that pull the product somewhere it is not meant to go.

**Who uses it.** Who the people are, what they know and what they do not. "Our users are support
staff, not developers" changes how an agent writes an error message.

**The words the team uses.** Every product has terms that mean something specific. Write them down
with what they mean and what they do not mean. An agent that calls a "project" a "folder" in the
interface has made a real mistake, even if the code works.

**How it is built.** The parts, how they connect, what to run to check a change, and the sharp
edges: the migration that must never be re-run, the test that is flaky for a known reason, the
library that must not be upgraded.

Beyond those four, a page per area (billing, sign-in, deploys) and a short log of what changed.
The log is what lets someone returning after a month catch up in two minutes.

## AGENTS.md vs a team knowledge base

A file like `AGENTS.md` or `CLAUDE.md` at the root of a repo is read by the agent working in that
repo. For a single repo worked on by developers, it is close to ideal: it lives beside the code,
changes in the same commit and is reviewed with it.

It stops being enough in three situations.

**The product is more than one repo.** A web app, an API and a mobile app are often three repos and
one product. The words, the users and the decisions are the same in all three, but a file in each
repo is three copies that drift apart.

**Not everyone works in the repo.** Support, marketing and product people know things about the
product that agents need: what customers keep asking, what a launch promised, what a word means to
a customer. They do not open pull requests to edit a markdown file, so what they know never reaches
the agents.

**Some agents never see the repo.** A person asking ChatGPT or Claude to draft a reply or plan a
release has an agent with no checkout. It cannot read `AGENTS.md` at all.

The practical answer is both. Keep the repo file for what belongs to that repo: how to build it,
run its tests and avoid its traps. Keep what is true of the product, for everyone, somewhere every
person and agent on the team can read: one place per product, not per repo.

## Keeping it current

A knowledge base that was right in March and wrong in October is worse than none, because agents
trust it. The only reliable way to keep it current is to make adding to it part of finishing work.

**What an agent learns goes back in.** When an agent finds out why the export is slow, or that a
setting has a side effect, that is exactly what the next agent needs. At the end of the work, it
should update the page that covers that area, not write a separate note for one person. A one-off
handover document gets read once, if that.

**Change what is no longer true.** A page should say what is true now. Adding "update: this
changed" at the bottom leaves the old claim for the next reader to believe. Rewrite the line.

**One line in the log.** A dated sentence per change, with the work it came from. That is the
history people actually read.

**Open work is not knowledge.** "We should fix the retry logic" is not something to know; it is
something to do. Put it where someone owns it and it has a state. A page has neither, and tells
nobody.

## Versions and who changed what

Letting agents edit shared knowledge raises a fair worry: what if one gets it wrong? The answer is
the same as for any shared document. Keep every version, record who saved it (a person or an
agent), and make putting an old version back one step.

Two more things make it safe in practice. When two editors work on the same page, the second save
should be refused rather than silently overwrite the first; whoever was refused reads it again and
redoes their edit on top. And the people who care about a page should be able to see what changed
since they last looked, without diffing it by hand.

With that in place, agents writing to the knowledge base is not a risk to manage. It is the reason
the knowledge base stays alive.

## With Passalong

In Passalong each product is a **project**, and its **documents** are what to know about it. A
project can name the repo it is built from, and a marketing project needs no repo at all. People
edit documents in the hub; agents use the tools.

- **The README and its pages.** A project's README says what the product is, who uses it, the words
  the team uses and how it is built. Other documents cover one area each, and a Log page says what
  changed. Team projects are readable and editable by everyone in the team.
- **The README prompt.** When you set up a team in the hub, the step for what to know gives you a
  prompt to paste into your own agent for each project with a repo. It reads the repo and writes the
  README, a page per area and a Log page. A project without a repo gets a few questions instead, and
  your answers become its README.
- **Agents read and write with the tools.** Connected agents use `find_projects` to list a project's
  documents, `read_document` to read one and `save_document` to change one. This works from Claude
  Code and Codex, and from ChatGPT and Claude as a connector, so agents without a checkout read the
  same pages.
- **Writing back.** `passalong setup` installs a capture skill for Claude Code. At the end of a
  session it hands in what the session finished, updates the page that covers what was learned, and
  adds a line to the project's Log. Anything still to do is written down as work, not left in a
  page.
- **Versions.** Every version of a document is kept with what saved it, a person in the hub or an
  agent. A project's History tab shows what changed, a version can be put back, and a save made
  from a stale version is refused. Documents changed since you last opened them are marked.

Today agents read a project's documents when they choose to, with the tools; they are not handed
them automatically when they take work.

```sh
npm i -g passalong
passalong setup
passalong login
```

[Connect your agents](/connect), or [open the hub](/hub) to start a project.
