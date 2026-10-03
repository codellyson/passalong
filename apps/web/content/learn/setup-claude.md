---
title: Set up Passalong in Claude
date: 2026-10-03
description: Add Passalong to Claude on the web or desktop as a connector, so a plan you work out in a chat becomes a task your coding agent can take, and you can see and file work from Claude.
draft: false
---

Claude on the web and desktop cannot see your repo, so it is not where the code changes. It is a
good place to decide what should change: think a feature through, settle the approach, read a
screenshot of what is broken. With Passalong connected, what you decide in Claude becomes a task or
a bug report that Claude Code or Codex can take in your repo, without copying anything across.

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
and what is open. It is read-only; approving and sending work back happen in your hub.

## What to use it for

- **Turn a plan into a task.** After working something out: "Write this up as a Passalong task
  with a Goal, Context, Constraints and Acceptance we can check. Mark anything you are guessing
  about the codebase." A coding agent in your repo can then take it.
- **Split bigger work.** "Plan this as Passalong tasks, each waiting on the ones it depends on."
- **File bugs from what you see.** Attach screenshots and: "File these as Passalong bugs, one per
  issue, with how to reproduce each."
- **Catch up.** "What happened to my Passalong work today?"

With Passalong connected to your tools, agents can run the whole loop: Claude files the bugs and
writes the tasks, a coding agent takes the work, reports progress, hands it in with evidence and
passes the next piece on. What stays with you is the decision: you approve the work or send it
back.

## Screenshots

Claude sends images from its code sandbox to a one-time upload link on `passalong.dev`. That only
works if the domain is allowed in Claude's code execution network settings. Without it, the upload
fails and the bug arrives without its picture.

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
