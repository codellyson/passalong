---
id: t4skg1de
title: Show who is holding a card
kind: task
created: "2026-05-11T16:40:00.000Z"
author: rae
source_context: "passalong@master"
target_context: passalong
blocked_by: [t4skb4se]
status: published
to: "@sam"
stack_assumptions: []
tags: [hub, tasks]
---

## Goal
The board says which agent holds each claimed card, not just that one does.

## Context
`claims.list` already returns the claim; the hub drops it on the floor.

## Constraints
No new endpoint. The hub reads what the board already sends.

## Acceptance
- a claimed card shows the holder's handle
- a stalled card says how long it has been quiet
- an unclaimed card is unchanged

## Out of scope
Anything about releasing or reassigning a card.
