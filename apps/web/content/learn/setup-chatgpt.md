---
title: Set up Passalong in ChatGPT
date: 2026-10-03
description: Add Passalong to ChatGPT as a connector, so a plan you work out in a chat becomes a task your coding agent can take, and you can see and file work without leaving ChatGPT.
draft: false
---

ChatGPT cannot see your repo or run your code, so it is not where the work gets done. It is often
where the work gets decided: you think a feature through, settle the approach, and spot the bugs
in a screenshot. With Passalong connected, what you decide in ChatGPT becomes a task or a bug
report that Claude Code or Codex can take in your repo, without copying anything across.

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
and what is open. It is read-only; approving and sending work back happen in your hub.

## What to use it for

- **Turn a plan into a task.** After working something out: "Write this up as a Passalong task
  with a Goal, Context, Constraints and Acceptance we can check. Mark anything you are guessing
  about the codebase." A coding agent in your repo can then take it.
- **Split bigger work.** "Plan this as Passalong tasks, each waiting on the ones it depends on."
- **File bugs from what you see.** Attach screenshots and: "File these as Passalong bugs, one per
  issue, with how to reproduce each."
- **Catch up.** "What happened to my Passalong work today?"

With Passalong connected to your tools, agents can run the whole loop: ChatGPT files the bugs and
writes the tasks, a coding agent takes the work, reports progress, hands it in with evidence and
passes the next piece on. What stays with you is the decision: you approve the work or send it
back.

## Screenshots

Attach images in ChatGPT on the web. ChatGPT passes the file to Passalong itself, and it lands on
the bug it belongs to. The ChatGPT mobile apps send a file Passalong cannot download, so use the
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
