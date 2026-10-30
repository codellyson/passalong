---
title: Set up Passalong in Claude
date: 2026-10-03
description: Add Passalong to Claude on the web or desktop as a connector, so a plan you work out in a chat becomes work your coding agent can take, and you can see and write down work from Claude.
draft: false
---

Claude on the web and desktop cannot see your repo, so it is not where the code changes. It is a
good place to decide what should change: think a feature through, settle the approach, read a
screenshot of what is broken. With Passalong connected, what you decide in Claude becomes work that Claude Code or Codex can take in your repo, without copying anything across.

Claude connects to the hosted Passalong server, so you need a Passalong account. It gets every
tool that does not need a working directory. Using Claude Code instead? See [Set up Passalong in
Claude Code](/learn/setup-claude-code).

## Connect it

Claude signs itself in, so there is nothing to make first.

1. In Claude, open **Settings → Connectors** and add a custom connector.
2. Paste the server address, and leave the advanced fields empty:

   ```
   https://passalong.dev/v1/mcp
   ```

3. Approve Passalong in the window that opens.
4. For screenshots, allow `passalong.dev` in Claude's code execution network settings. More on
   this below.

If your setup does ask for a callback address, it is
`https://claude.ai/api/mcp/auth_callback`.

## Check it worked

In a chat, ask:

> What is on my Passalong board?

Claude can draw your work as a board in the conversation: what is waiting on you, who is on what,
and what is open. It is read-only; moving work around happens in your hub.

## What to use it for

- **Turn a plan into work.** After working something out: "Write this down as Passalong work:
  what we want, what we agreed must not change, and what done looks like. Mark anything you are
  guessing about the codebase." A coding agent in your repo can then take it.
- **Split bigger work.** "Write this down as several pieces of Passalong work, each waiting on the
  ones it depends on, as a draft I can read first."
- **Write down bugs from what you see.** Attach screenshots and: "Write these down as Passalong
  work, one per bug, with how to see each and the screenshot on it."
- **Catch up.** "What needs me on Passalong, and who is on what?"
- **Keep what you know.** "Add what we just decided to the project's Passalong documents."

With Passalong connected to your tools, agents can run the whole loop: Claude writes down the bugs
and the work, a coding agent takes it, reports progress, hands it in with evidence and writes what
it learned into the project's documents. Finishing is final; if something is not right, anyone on
the team can reopen it.

## Screenshots

Claude sends images from its code sandbox to a one-time upload link on `passalong.dev`. That only
works if the domain is allowed in Claude's code execution network settings. Without it, the upload fails and the work arrives without its picture.

## If something is off

- **Screenshots do not arrive.** Allow `passalong.dev` in the code execution network settings,
  then try again.
- **Claude does not offer the new tools.** Remove and re-add the connector; a client can cache a
  server's tool list.
- **You want to disconnect it.** Your hub's settings list every app you have approved, under
  Connectors.

Setting up a different client? See [Claude Code](/learn/setup-claude-code),
[Codex](/learn/setup-codex) or [ChatGPT](/learn/setup-chatgpt), or [connect your tools](/connect)
for all of them.
