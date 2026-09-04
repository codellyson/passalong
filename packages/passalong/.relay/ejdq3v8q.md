---
id: ejdq3v8q
title: Verify Paystack webhook signatures
created: "2026-09-03T20:18:14.188Z"
author: Isiaka Lukman
source_context: "monieplan@main"
status: published
stack_assumptions: [Next.js 15]
tags: [paystack, webhooks]
url: "http://localhost:8787/g/ejdq3v8q/f9qfnxwdb9b8tag7q3y53h"
---

## Problem
Webhooks were trusted without checking x-paystack-signature.
## Solution shape
HMAC-SHA512 the raw body with the secret key and compare.
## Decisions and rationale
- Chose raw-body HMAC over IP allowlisting because Paystack's IPs change.
## Steps
1. ASSUMES: Next.js route handlers. If Express, read req.rawBody instead.
## Verification
curl with a bad signature returns 401.
## Gotchas
- JSON.stringify(body) does not reproduce the raw bytes; use request.text().
