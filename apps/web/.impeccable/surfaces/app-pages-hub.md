---
version: 1
slug: "app-pages-hub"
primary_target: "app/pages/hub"
related_targets: ["app/components/hub"]
---

# Hub (signed-in app), Passalong 1.0

Scope: every signed-in hub screen (`/hub/**`), Operate mode. First surface: Needs you (`/hub`, the lead's first screen). Then, in order: project (Documents, Work, History), Work board, Support, the box, Settings (trimmed), Onboarding.

Audience: a lead or founder at a laptop first thing in the morning asking "what needs me?"; support and marketing people and developers work in the same screens. Nothing reads as an engineering tool. Maturity bar named by the user: Notion, Intercom/Front, Attio/Height.

Constraints: the existing palette is kept by the user (cream, ink, coral; 2026-10-29); every built behaviour stays; share pages stay script-free; Send to a customer stays a person's. Anti-goals: counter dashboards, sideways-scrolling boards as the main view, decoration, airport or blueprint costume, serif in app chrome.

## Direction contract

THESIS: The hub is a register of what moved and who must act, where coral means one thing only — changed since you last looked — held until seen. It refuses the category default: soft cards of grey text under a strip of small top links, and a dashboard of counters.

OWN-WORLD: Passalong's cream ground, ink and coral, kept; the twist is a drawing set's discipline. A solid ink sidebar shell; each project owns one line colour shown as a mark wherever it appears; rows carry a compact strip of labelled cells (project · with · state · age) in small-caps labels over values with tabular figures; one-pixel rules instead of shadows; square-ish geometry (radius 2–4px, no pills); a precise grotesque for chrome, no serif in the app.

STORY: The lead opens Needs you, sees ranked what waits on them (a customer 26h, an agent's question, untaken work, a stuck agent), sees coral on what changed overnight (work the agent closed, a document it updated), acts or undoes in one click, and moves into a project or triage mode.

FIRST VIEWPORT: Left, a 240px ink sidebar: Passalong mark, Needs you (current, count), Projects list with colour marks and open counts, Work, Support, New (primary), account at foot. Main: "Needs you" heading with a one-line summary ("4 waiting on you · 3 customers · 2 changed since yesterday"), then a ranked register of rows: coral change mark at left edge where changed, title, one-line summary, the fact strip, one action. Right column 320px: Customers waiting (longest first) and "Closed by the agent" with Reopen.

FORM: Drawing Set (candidate 7 of the grounded list), fused with the user-pinned palette; raises kept from the declined hand: rows restyle in place (split-flap), one colour per project (transit diagram), triage mode one item at a time (vertical feed), one-pixel rules and no pills (centre-rail). seed:2f0225778a9ff58d

SIGNATURE: the coral change mark — a 3px coral bar at a row's left edge plus a "Changed" label naming what changed; it persists until the row is opened, and the sidebar shows a coral dot on any project with unseen changes.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
