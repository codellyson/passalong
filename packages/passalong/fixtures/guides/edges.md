---
id: edgyid12
title: "A title: with a colon, a comma, and [brackets]"
summary: "A guide whose title needs quoting, kept to prove the format round-trips awkward text."
kind: transfer
created: "2026-07-01T00:00:00.000Z"
author: ""
source_context: "repo@feature/branch-with-slash"
status: draft
stack_assumptions: ["a, b", plain, "trailing space "]
tags: [one]
url: "https://example.test/a?b=c&d=e"
environment: staging
priority: 2
---

## Problem
Quoting. Every value here needs it, or needs to prove it does not.

## Solution shape
The serializer quotes anything YAML would misread and leaves the rest alone.

## Steps
1. Read `quote()`.

## Verification
This file round-trips to itself.
