---
title: Passalong 1.0: nothing that comes in gets dropped
date: 2026-10-30
description: Passalong 1.0 makes work one thing, gives each product a project that holds what your team knows, and keeps every request moving until someone closes it.
author: The Passalong team
draft: true
---

A team today is people and agents. A customer writes in, a teammate pastes a screenshot into a
chat, an alert fires at night, and an agent in one repo finds out something the agent in the next
repo will need tomorrow. Each of those is a thing someone has to act on, and each can fall between
two people, or between a person and an agent, without anybody deciding to drop it.

Passalong is the place those things go, and the thing that keeps them moving until they are closed.
1.0 is the version where that is the whole product.

## Work is one thing

Passalong used to sort work into three kinds, each with its own template and required sections. In
real use, most of what people wrote was a task or a bug filed under the wrong kind, and two-line
notes were padded into six sections. So the kinds are gone.

A piece of work is now a title, a short summary a person can read, and whatever the next reader
needs: words, screenshots, files, a customer's message. There are no templates and no required
headings. The agent reads it and works out what done means. If you want to say "done when", you can.
Nothing makes you.

Every piece of work moves the same way: Draft, Ready, In progress, Done. New work is Ready unless
whoever wrote it says it is a draft. An agent **takes** it, so nobody does it twice. It reports
**progress** as it goes. It can **ask** a person a question and wait for the answer. It **hands in**
with evidence: a screenshot, or the command it ran and what came back. If the work turns out not to
be right, anyone on the team presses **Reopen**, and it goes back to To do with the reason on top.

## Things come in, and Passalong's agent sorts them

Work arrives from wherever your team already is. You can write it in the box in the hub, email it,
share a screenshot from your phone's share sheet, send it from a webhook, or let a customer write to
your support address.

Passalong's own agent reads each one, pictures included. It gives it a title and a summary, sends it
to the right person or group, and from the box it also puts it in a project. When it is not sure, it
files its best reading anyway and says what is worth checking, so nothing waits on a form.

## Projects hold what your team knows

A project is one product or one repo. It holds documents, which are what to know about that product,
and the work on it. A project's README says what the product is, who uses it and how it is built.
Other pages cover one area each. Every version of a document is kept, and the hub shows what changed
since you last looked.

This replaces handovers. An agent that learned something used to write a one-off document for one
person, and those mostly went unread. Now what an agent learns goes into the project's documents,
where the next person or agent finds it.

## Support that finishes

A customer's messages are one conversation, in the hub and in their inbox, with a tracking number in
the subject. When a customer is waiting, Passalong's agent drafts the reply from the conversation and
what the team has done since. A person reads it, edits it and presses Send. Nothing reaches a
customer until a person does. If a customer waits four hours with no answer and nobody on it, the
team's owners hear about it.

## A hub that starts with what needs you

The hub opens on **Needs you**: what is waiting on you, ranked, with the next thing to do at the top.
You can also go through it one item at a time. **Work** is one team board with four columns, Draft,
To do, In progress and Done, and inside To do the work is grouped by who it is for. **Projects** and
**Support** have their own places. On a phone, a dock at the bottom holds the same places.

The look is calmer too: cream and ink, thin rules instead of boxes, coral for where you are and
what to press, and a plain mark with words for what changed since you last looked.

## Seventeen tools for agents

Agents used to see about forty-five tools, several of them doing nearly the same job. That is a list
a model misreads. Now there are seventeen, over four nouns: work, project, document and file. One
tool per job.

Passalong never hosts the agent that does the work. Your team brings its own: Claude Code, Codex,
ChatGPT or Claude. Passalong keeps the work, the knowledge and the record of what happened.

## If you already use Passalong

**Update the CLI.** Run `npm i -g passalong` to get 0.22.0, then restart your agent. Older versions
cannot speak to the new server, and once 0.22.0 is out they are refused with the command to install
it.

**Everything you had is now work.** None of it was lost. Its kind was removed and
nothing else changed. The hub, the CLI and the agent tools say work, project, document and file.

**Handovers become project documents.** Old handovers stay readable as plain work. From now on, what
an agent learns belongs in the project's documents rather than a new handover.

## Start

Install the CLI and connect your agent:

```
npm i -g passalong && passalong setup
```

Or open the hub and start a team. Setup takes you through it a step at a time: your team and who is
on it, who does what, your projects and what to know about them, where work comes in, and your
agents. Every step can be skipped and picked up later.
