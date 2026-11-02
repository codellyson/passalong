---
title: AI-drafted customer replies, with a person on Send
date: 2026-10-30
description: AI-drafted customer replies with human approval: how a small team answers every customer, keeps one thread each, and never sends a reply nobody read.
draft: true
---

In a small team, whoever answers customers changes from day to day. It might be the founder, a
developer between tasks, or the one person whose job includes "support" alongside three other
things. What they share is that none of them has time to write every reply from nothing, and none
of them can afford to forget a customer.

An AI model can write a good first draft of most replies. The question is what to let it do on its
own. This article argues for a simple line: the agent drafts, a person sends. Then it covers what
makes the rest of a small team's help desk work: one conversation per customer, a draft worth
sending, when to hand a problem to developers, and a reminder before anyone waits too long.

## Why a person should press Send

Most of what an agent does at work can be undone. A task closed by mistake can be reopened. A
document edited badly can be put back. A reply to a customer cannot. Once it is in their inbox, it
is said.

That makes the reply the one step worth keeping human, even in a team that lets its agents decide
most things. The cost is small: reading a draft and pressing Send takes a fraction of the time it
takes to write one. What you avoid is a confident answer to the wrong question, a promise nobody
made, or an apology for a bug that is not real.

Keeping a person on Send also keeps someone in the conversation. They read what the customer said,
not a summary of it, every time.

## One conversation per customer

The fastest way to lose a customer is to lose track of what they already told you. A help desk for
a small team needs one rule above the others: **everything one customer says about one problem is
one conversation**.

That rule has practical parts.

- **A tracking number.** When a customer first writes, they get a short receipt with a number like
  `R-ABC234` in the subject. Replies carrying it, from the same address, join the same request
  instead of opening a new one.
- **Their own subject line.** Your replies go out under the subject they wrote, so in their inbox
  it stays one thread.
- **Coming back reopens it.** A customer who writes again after you marked their request solved is
  telling you it is not solved. The request should come straight back to the people who answer
  customers, not wait in a pile somewhere.
- **What they send is kept.** Screenshots and attachments are often the clearest part of a report.
  They belong on the request, where whoever picks it up can see them.

## What a good drafted reply looks like

A draft is only useful if it is close enough to send. Good drafts have a few things in common.

**It answers what they asked.** Not a general reply about the topic. If they asked whether an
export includes archived items, the first sentence says yes or no.

**It knows where the work stands.** If developers are fixing it, the draft says so. If the fix
finished yesterday, the draft says that instead. A draft written only from the customer's message
cannot do this; it needs to see the state of the work made from their request.

**It promises nothing nobody promised.** No dates, refunds or features the team did not agree to.

**It is short and in plain words.** Two or three sentences usually do it. No "I hope this email
finds you well".

**It carries no stray contact details or tracking numbers of its own.** The model should not invent
an address, a phone number or a different reference.

Here is the shape of a good one:

> Hi Kemi, thanks for the screenshot. The export is skipping archived projects, and that is a bug on
> our side. A fix is in progress; I will write again when it is out.

The person reading it changes one word, or none, and presses Send.

## When to bring in the developers

Not every message is a question someone in support can answer. When a customer reports something
broken, the request needs work from developers, and two things go wrong easily: the developers'
version loses the customer's evidence, and nobody tells the customer when it is fixed.

Keep them linked. Write the fix down as its own piece of work for the developers, made from the
request, so it carries the customer's words and screenshots. The request stays the conversation
with the customer; the fix is the work. When the fix finishes, the request should hear about it,
and whoever answers the customer should see that there is now something to tell them.

## Remind before anyone waits too long

Small teams rarely ignore customers on purpose. They forget, because the request arrived on a busy
afternoon and nothing reminded them. Set a limit, a few hours, and when a customer has waited that
long with no answer and nobody working on it, tell the people who can act. Once per wait is enough;
a reminder that fires every ten minutes gets muted.

## Telling the customer a fix is done

The last step is the one most often skipped. A bug is fixed, the work is closed, and the customer
who reported it never hears. Some teams want a nudge every time; others prefer to decide case by
case. Make it a choice the team makes once, not a rule forced on everyone.

## With Passalong

Passalong keeps customer requests beside the work they lead to, so the gap between support and
development has someone watching it.

- **A support address.** In the hub, under **Settings**, **Integrations**, each account has a
  customer support address, `key+support@`. Anyone may write to it. Each new request gets a tracking
  number and an automatic receipt; replies with that number, or replying in the same email thread,
  from the same address, join it. An auto-reply or a mailing list never opens a request, and blocked senders
  stay blocked. Up to five files on each message are kept on the request.
- **Sorted by the agent.** Passalong's agent writes the request's title and summary and sends it to
  the team group that should act, with its reason on the thread. When it is unsure, the author and
  the team's owners get its question by push and email.
- **The register.** **Support** in the hub lists every request, whoever is waiting on us first:
  the customer, their latest words, the project, its state (Needs reply, With the team, Waiting on
  the customer, Solved) and how long they have waited.
- **The drafted reply.** Open a request and the conversation is there with the reply box at the
  bottom. When the customer is waiting on you, the agent's draft is already in it, written from the
  conversation and the state of the work, labelled as the agent's until you change it. **Draft a
  reply** asks for another. The draft is never sent or stored by itself.
- **Send.** Nothing reaches a customer until a person presses **Send**. There is no agent tool or
  command that sends to a customer.
- **Work made from it.** A fix for the developers is work with the request as its parent, listed on
  the request under **Work made from it**. When it finishes, the request hears.
- **Four hours.** A customer left four hours with no answer and nobody holding the request reaches
  the author and the team's owners, by push and email, once per wait.
- **Tell the customer when a fix is done.** An owner turns this on for the team at the foot of the
  Support page. With it on, a finished fix shows on the request and the agent drafts the message.
  Someone still presses Send.
- **Mark solved.** It closes the request. If the customer writes again, it opens by itself.

[Open the hub](/hub) to get your support address, or read how
[email and webhooks become work](/learn/email-to-tasks-for-small-teams).
