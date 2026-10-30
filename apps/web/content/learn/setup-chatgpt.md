---
title: Set up Passalong in ChatGPT
date: 2026-10-03
description: Add Passalong to ChatGPT as a connector, so a plan you work out in a chat becomes work your agent can take, without leaving ChatGPT.
draft: false
---

ChatGPT cannot see your repo or run your code, so it is not where the work gets done. It is often
where the work gets decided: you think a feature through, settle the approach, and spot the bugs
in a screenshot. With Passalong connected, what you decide in ChatGPT becomes work that Claude Code or Codex can take in your repo, without copying anything across.

ChatGPT connects to the hosted Passalong server, so you need a Passalong account. It gets every
tool that does not need a working directory.

## Connect it

ChatGPT asks for a client ID when it adds a connector, so there is one extra step: you make the
client ID in Passalong and paste it back. It needs no secret.

1. In ChatGPT, open **Settings → Connectors** and start a custom connector.
2. Paste the server address, and choose **OAuth** when it asks how to sign in:

   ```
   https://passalong.dev/v1/mcp
   ```

3. Copy the callback address ChatGPT shows.
4. In [your Passalong hub's settings](/hub/settings), open **Set up a connector manually**, give it
   that callback address, and make a client ID. Leave the secret off.
5. Back in ChatGPT, fill in only the server URL, OAuth and the client ID. Leave the client secret
   empty.
6. Save, and approve Passalong in the window that opens.

**Leave the client secret empty.** A connector made with a secret is refused with "secret missing"
at every sign-in.

## Check it worked

In a chat, ask:

> What is on my Passalong board?

ChatGPT can draw your work as a board in the conversation: what is waiting on you, who is on what,
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

With Passalong connected to your tools, agents can run the whole loop: ChatGPT writes down the bugs
and the work, a coding agent takes it, reports progress, hands it in with evidence and writes what
it learned into the project's documents. Finishing is final; if something is not right, anyone on
the team can reopen it.

## Screenshots

Attach images in ChatGPT on the web. ChatGPT passes the file to Passalong itself, and it lands on the work it belongs to. The ChatGPT mobile apps send a file Passalong cannot download, so use the
web for anything with a screenshot.

## If something is off

- **"Secret missing" when signing in.** The connector or the client ID was made with a secret.
  Make a new client ID without one, and leave the secret field empty in ChatGPT.
- **ChatGPT does not offer the new tools.** Refresh the connector; ChatGPT can cache a server's
  tool list.
- **You want to disconnect it.** Your hub's settings list every app you have approved, under
  Connectors.

Setting up a different client? See [Claude Code](/learn/setup-claude-code),
[Codex](/learn/setup-codex) or [Claude](/learn/setup-claude), or [connect your tools](/connect)
for all of them.
