---
id: bugg1des
title: The 429 arrives without a Retry-After
kind: bug
created: "2026-06-20T11:02:00.000Z"
author: sam
source_context: "passalong@master"
parent: tr4nsf3r
status: published
stack_assumptions: []
tags: [rate-limit]
report: rep0rt1d
area: api
severity: minor
---

## Problem
The sixth request in a minute is refused with 429 and no `Retry-After`, so a client has nothing
to wait on and retries immediately.

## Reproduce
```sh
for i in $(seq 1 6); do curl -si localhost:3001/v1/accounts -X POST -d '{}'; done
```
The sixth response is 429 and carries no `Retry-After` header.

## Verification
The sixth response is 429 and carries `Retry-After: 60`.

## Gotchas
The limiter is per IP, so a proxy in front changes what you see.
