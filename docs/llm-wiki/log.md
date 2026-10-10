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
- 2026-10-09 — hub: the scope picker now covers every work list and activity; counts wait for those lists, and failures are shown. Source: apps/api/src/claims.ts, notify.ts and apps/web/app/composables/useHub.ts.
- 2026-10-09 — work lifecycle: older repo-scoped task claims remain the lock and can be reviewed by the author. Source: apps/api/src/claims.ts.
- 2026-10-09 — hub: guide rows show a compact card for the first stored image in the guide or its evidence. Source: apps/api/src/index.ts and apps/web/app/components/hub/GuideThumbnail.vue.
- 2026-10-09 — hub: team admins can select teammates' guide and task rows for supported management actions. Source: apps/api/src/index.ts, apps/web/app/components/hub/SelectBox.vue and TaskTable.vue.
- 2026-10-09 — folders: added one-level project context with versioned Markdown, private assets, linked guides and MCP access; hub and surfaces updated. Source: apps/api/migrations/0046_folders.sql, apps/api/src/folders.ts, apps/web/app/pages/hub/folders/, and both MCP servers.
- 2026-10-09 — folders: both MCP servers and the public agent guide now explain when and how to create and reuse folders, including team scope and versioned edits. Source: apps/api/src/mcp-http.ts, packages/passalong/src/mcp.js, apps/web/public/llms.txt.
- 2026-10-09 — folders: creation now starts from a short agent request in the hub; agents can add local, attached or sandbox-held assets to a folder without a browser upload form. Source: apps/web/app/pages/hub/folders/index.vue, apps/api/src/index.ts, apps/api/src/mcp-http.ts, packages/passalong/src/mcp.js.
- 2026-10-09 — surfaces: aligned the installed capture skill and public agent text with explicit guide kinds, short transfers, hand-ins and agent-created folders; recorded the staged npm release path. Source: packages/passalong/skill/SKILL.md, apps/web/public/llms.txt, docs/llm-wiki/surfaces.md.
- 2026-10-09 — surfaces: prepared the 0.16.0 minimum CLI gate so older installed MCP agents are told to reinstall and restart after that version becomes npm latest. Source: apps/api/src/clients.ts, AGENTS.md, docs/llm-wiki/surfaces.md.
- 2026-10-10 — folders: put existing folders first in the hub list and changed the detail view to a document sidebar and rendered reading pane, with assets and linked guides retained below. Source: apps/web/app/pages/hub/folders/, apps/web/app/utils/folder-markdown.ts.
- 2026-10-10 — folders: document reading now uses sanitized remark GFM with tables, task lists and footnotes; Markdown images remain links. Source: apps/web/app/utils/folder-markdown.ts, apps/web/app/pages/hub/folders/[id].vue.
- 2026-10-10 — folders: added nested folders, group colors and bulk selection for recolor, move and delete; both MCP surfaces can create and reorganize folders at any depth. Source: apps/api/migrations/0047_folder_hierarchy.sql, apps/api/src/folders.ts, apps/web/app/pages/hub/folders/, apps/api/src/mcp-http.ts, packages/passalong/src/mcp.js.
- 2026-10-10 — folders: the hub list became a collapsed tree with one rail per level, the detail page an outline sidebar used for empty folders too, and bulk move a single "Move to…" menu; the move rules moved to `folder-tree.ts` and gained tests against real SQLite. Source: apps/web/app/pages/hub/folders/, apps/api/src/folder-tree.ts, apps/api/test/folder-tree.test.mjs.
- 2026-10-10 — rendering: guide pages, the blog and learn pages moved from `marked` to the remark + GFM pipeline folders already used, and all four gained GitHub alerts (`shared/markdown-alerts.ts`) and working footnotes. Source: apps/web/server/utils/guide-html.ts, apps/web/server/utils/blog.ts, apps/web/shared/markdown-alerts.ts, apps/web/app/utils/folder-markdown.ts, apps/web/test/guide-html.test.mjs.
- 2026-10-10 — folders: linked guides now appear in the folder outline with their kind badge, and "+ New guide" copies an ask that makes a task, bug or handoff straight into the folder. Source: apps/web/app/pages/hub/folders/[id].vue, apps/web/app/utils/asks.ts.
- 2026-10-10 — agents: both MCP servers and llms.txt now say how to put a guide of any kind, new or existing, in a folder (publish to the folder's team, then `link_folder_guide`), and llms.txt names the markdown guide pages render, alerts and footnotes included. Source: apps/api/src/mcp-http.ts, packages/passalong/src/mcp.js, apps/web/public/llms.txt.
