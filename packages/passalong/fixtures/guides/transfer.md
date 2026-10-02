---
id: tr4nsf3r
title: Mount the API inside the web Worker
summary: "How the API was moved inside the web Worker, so one deploy serves both. Done and working; this is for repeating it."
kind: transfer
created: "2026-04-02T09:14:00.000Z"
author: rae
source_context: "passalong@master"
status: published
stack_assumptions: [cloudflare-workers, hono, nuxt]
tags: [deploy, worker, routing]
---

## Problem
Two Workers meant two origins, two deploys and a CORS hop for every call.

## Solution shape
The web Worker mounts the API app in middleware and lets everything else fall through.

## Decisions and rationale
The match is written out rather than delegated to the router: a miss has to fall through, not
become a 404.

## Steps
1. ASSUMES: a Nuxt app on Workers. Add `server/middleware/1.api.ts`.
2. Hand `/v1/*` and `/health` to the mounted app; return nothing for anything else.
3. Delete the second Worker's deploy step.

## Verification
```sh
curl -sf http://localhost:3001/health
```
The page at `/` still renders, and `/v1/guides` answers on the same origin.

## Gotchas
`nitro.experimental.wasm` is required, not optional.
