# Log

Append-only. Newest at the bottom. One line per change to this wiki: date, what changed, and the
source it came from.

- 2026-09-27 — Wiki created: overview, guides, work lifecycle, evidence and proof, answers, teams
  and plans, surfaces, hub, notifications, blog and publish, codebase map, security model, design
  system, decisions, open questions. Sources: AGENTS.md, docs/PRD.md, docs/V2.md,
  docs/PUBLISH.md, docs/wiki/, and merged PRs #1–#65.
- 2026-10-03 — blog-and-publish: added the /learn pages (topic guides on the blog's reader, published from shared/pages.ts). Source: branch seo/pillar-agent-handoff.
- 2026-10-08 — guides: size limits and reading in parts (get_guide outline/section/full; 60,000-character ceiling on new guides). Source: branch feat/guide-size-and-sections.
- 2026-10-08 — teams-and-plans: free tier reopened (`FREE_SIGNUP` "1"); the closed tier refused a new account's first task. Source: branch feat/free-signup.
- 2026-10-08 — auth: `passalong login` signs in from the browser (device flow: /v1/device/*, /device page); `--email` keeps the password prompts. Source: branch feat/browser-login.
- 2026-10-08 — guides: the two auto-clean clocks are shown on rows and the guide page, and `keep_forever` (Settings → Clean-up) turns them off. Source: branch feat/retention-countdown.\n
- 2026-10-08 — auth: the CLI keeps several accounts (`login --new`, `accounts`, `use`, `logout`, `--as`, `use_account`); an agent is refused until the person says which. Source: branch feat/accounts.
