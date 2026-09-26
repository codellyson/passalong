# Passalong — design brief

**Two screens need an overhaul.**

Passalong hands a finished piece of work from one context to another. Two surfaces carry that: the
**hub**, where you see what you have handed over and what is waiting for you, and the **guide page**,
which is the thing that actually travels. Both work, neither is designed, and both have reached the
point where adding anything makes them worse.

| | |
|---|---|
| **Surfaces** | `/hub` · `/g/:id/:key` |
| **Stack** | Nuxt 4, one stylesheet |
| **Themes** | light + dark |
| **Live** | passalong.dev |
| **Brief date** | 2026-09-06 |

---

## 1. What Passalong is

You solve something non-trivial in one session — a migration, a tricky integration, a fix nobody will
remember the reason for. Passalong turns that into a **transfer guide**: markdown with a fixed shape
(Problem, Solution shape, Decisions and rationale, Steps, Verification, Gotchas) that another repo,
another machine, a coding agent or a teammate can pick up and act on.

It is a developer tool with three faces on one API: a CLI (`passalong share`, `passalong pull`), an
MCP server so an AI agent can publish and consume guides directly, and the hub — the only face a
person looks at. Everything the hub can do, the other two can do as well. That parity is a product
rule, not an accident.

### How a transfer moves

1. **Share** — `passalong share` publishes a guide, optionally addressed to a team or a specific
   teammate.
2. **Land** — it appears in that person's hub as waiting, and they get a notification.
3. **Pull** — `passalong pull <id>` drops it into their working context. Or they open the share link
   and read it.
4. **Verdict** — did it actually work? Two answers only: *works*, or *doesn't work* plus a reason.
   The reason is required and capped at 280 characters.
5. **Promote** — a guide pulled three or more times has stopped being a one-off handoff. It gets
   promoted into a standing reference.

---

## 2. How the board works

The board is the hub's home and the thing most in need of design. It sorts every guide into one of
five buckets. The buckets are defined in SQL on the server, shared with `passalong board` and the
agent-facing tool — the hub renders them, it never derives them. A redesign can change how a bucket
*looks* freely; changing what the buckets *are* is a server change and a bigger conversation.

```
                                            THE RECIPIENT'S HUB
                                        ┌─→  Waiting on you
                                        │    handed to you, not pulled yet
                                        │
                                        │   THE SENDER'S HUB · IN ORDER
                                        ├─→  ① Not working
                                        │       a standing failed verdict
  passalong share ─→ one guide ─────────┤
                     team · @handle     ├─→  ② In flight
                                        │       nobody else has pulled it
                                        │
                                        ├─→  ③ Landed
                                        │       pulled once or twice
                                        │
                                        └─→  ④ Worth keeping
                                                pulled 3 or more times
```

Five buckets, one guide, exactly one card. The sender's four are tested in the order shown and the
first match wins — which is why a guide with a failed verdict never also appears as landed.
**"Someone else" never means you**: pulling your own guide from a second machine is not the transfer
landing. Anything in flight for more than seven days is also flagged *stale*, and an empty bucket
renders nothing at all today.

---

## 3. Who uses it, and what they came for

Two people, one screen — and the hub currently makes almost no distinction between them. That is the
central design problem.

**The person who was handed something.** Opens the hub because they got a notification. They want one
thing: *what is waiting for me, and how do I pull it.* Often they have never used the CLI — an invite
link is a normal way to arrive here, and testers and designers land this way. For them the hub should
be nearly empty of everything except their queue.

**The person who handed something over.** Opens the hub to check whether their work landed. They want
*did anyone pick it up, did it work, and is anything rotting.* This is a monitoring view, and it is
the one that fills up: a guide that nobody pulled for a week, a guide someone said is broken, a guide
pulled so often it should be promoted.

> Both are usually mid-task in a terminal. The hub is a glance, not a destination — it is opened,
> scanned, acted on, and closed. Nobody is going to sit in it.

---

## 4. The guide page

`/g/:id/:key` renders one guide, read-only. It is the artefact that leaves the product: people paste
the link into Slack, into DMs, into an agent's context. Most readers of a Passalong guide never open
the hub at all — this page *is* Passalong to them, and it has had the least design attention of
anything we ship.

### What is on it

- A header: title, id, status, the repo it came from, the author, the date, the stack it assumes, and
  tags.
- A two-link switch between **Full guide** and **Verify**.
- The guide body — arbitrary markdown, rendered. This is the only place in the product set in a serif.
- A closing block with the command that pulls it into your context.

### The two views are the interesting part

A guide has six canonical sections: **Problem**, **Solution shape**, **Decisions and rationale**,
**Steps**, **Verification**, **Gotchas**. *Full guide* renders them in the author's order. *Verify*
re-orders the document for someone whose only question is "did this actually work?" — it leads with
Problem, Verification and Gotchas, and folds everything else into a single disclosure. It never omits
anything.

Right now those two modes look almost identical, which wastes the one genuinely clever idea on the
page. A reader arriving at the Verify view should know within a second that they are being shown a
shortened, purposeful cut of a longer document.

> There is a warning state here too: a guide with no Verification section gets a line saying so,
> because nothing in it defines what "working" looks like. It currently renders quieter than the body
> text around it.

### The unfurl card

Every guide gets a generated preview image at `/g/:id/:key/og.png`, rendered server-side from the
guide's own metadata. For most people this card *is* the first — and often only — impression of
Passalong, because it is what appears when someone drops the link in a channel. It is in scope, and it
is a real design surface: a fixed 1200×630 frame, two font weights, no photography.

### The gap worth arguing about

A verdict lives in the hub and never reaches the page that travels. Someone can paste you a guide that
a teammate has already marked **not working**, with the reason written down, and the page you open
says nothing about it. The same is true of how many people have pulled it and whether anyone verified
it.

**Design question:** what does provenance look like on a guide page — verified, contested,
well-travelled, untouched? Be aware this one costs more than layout: the share link needs no account
to read, so exposing a verdict on it is a deliberate decision about what a public link reveals, and it
needs a server change. Sketch it; we will scope it.

### What makes it hard

- **No script, at all.** No copy button, no tabs, no client-side collapse. The two views are two URLs.
  The one interactive primitive available is the browser's native disclosure element, which needs no
  JavaScript — the "how it was built" fold already uses it.
- **The content is not ours.** Anything markdown can express will turn up: headings six levels deep,
  long code blocks, tables, blockquotes, nested lists, hard-wrapped terminal output. Design the
  typographic system, not one nice-looking example.
- **Images are allowed here** (any https source), unlike the hub. Guides do contain screenshots and
  nothing styles them today.
- **Long is normal.** These are written to be acted on, not skimmed — assume a substantial document
  and design for orientation within it.

---

## 5. Every screen and state

The whole product is five routes; two of them are in scope. The hub carries almost every state in the
product, and the states are where the current design falls down hardest.

### Routes

| Route | What it is | Runs script? |
|---|---|---|
| `/` | Landing. Leads with a rendered guide rather than describing the product. | No — none at all |
| `/hub` | **In scope.** Sign-in and the hub itself, on one route. Carries almost every state in the product. | Yes |
| `/g/:id/:key` | **In scope.** One guide, read-only, in two views: *Full guide* and *Verify*. The thing that actually travels. | No — none at all |
| `/join/:code` | Invite. Mints an account and claims a handle in the browser. | Yes |
| `/reset` | Password reset. | Yes |

### States the hub has to cover

| State | When | Designed today? |
|---|---|---|
| Signed out | Three modes on one card: sign in, create account, forgot password. Plus a folded "other ways in" — invite link, API token. | Adequate |
| No handle yet | An account that has never claimed one. Nothing can be addressed to you until you do. | A form, unstyled as a state |
| Token-only account | Created by the CLI or an invite — has no password, so it exists only on this machine. | A second, near-identical form |
| No team, no guides | The default outcome of a self-serve signup. The hub is genuinely empty and must not dead-end. | One centred paragraph |
| Full board | The normal case. Any subset of five buckets; empty buckets vanish, so the grid reflows constantly. | No |
| Scope switch | Everything / mine / one team. A team scope adds a members panel. | No |
| Editing identity | Handle, name, email — inline, with a "handle is taken" error next to the field. | Partly |
| Filter finds nothing | Search plus a status filter over the full list. | One line of text |
| New API token | Shown exactly once, then never again. | Barely |
| Free-tier limit | 25 active synced guides. The 26th share fails server-side. | No — surfaces as a raw error string |
| Request error | Any failed call. One red line at an arbitrary place on the page. | No |
| Signed out mid-session | A 401 drops you back to the sign-in screen with no explanation. | No |
| No JavaScript | Every form here submits through script, so the page cannot function. It points at the CLI instead. | One sentence |

---

## 6. What a guide carries

Design against these, not against placeholder rows. A single guide row in the list currently renders
up to eleven of these facts at once, and that is most of why it is unreadable.

| Field | Example | Notes |
|---|---|---|
| `title` | Wire Turnstile into the signup form without breaking SSR hydration | Free text. Routinely long — assume 80+ characters. |
| `id` | `a1b2c3` | 6–12 chars. Needed verbatim: `passalong pull a1b2c3`. |
| `status` | `published` | published · consumed · promoted. Most are "published". |
| `team` / `to` / `from` | kreative-korna / @bo | Direction depends on whether it is yours. Either "to" or "from", never both. |
| `source_context` | `codellyson/passalong` | The repo it came out of. Can be long. |
| `created` | 4h ago | Relative until 30 days, then a date. |
| `pulls` | 3 | Drives promotion at 3. |
| `pulled_by` | @bo 4h ago | Only shown to the owner. |
| `verdict` | not working — @bo: the flag it tells you to set does not exist on this version | ok / not ok, plus who and a note ≤ 280 chars. The single most important fact on a row, currently the least visible. |
| `stack_assumptions` | nuxt 4, cloudflare workers | What the guide assumes about your codebase. 0–6 items. |
| `tags` | `#turnstile #auth` | 0–8 items. |
| `stale` | true | In flight for over 7 days. A warning, not a status. |

**Actions available on one row.** Open · copy pull command · copy link · works · doesn't work · done ·
promote · reopen · remove. Up to eight are visible at once depending on whether the guide is yours and
what state it is in. All nine are currently rendered as the same ghost button.

---

## 7. What is wrong

Not a bug list — those have been fixed. These are the design decisions underneath them, and they are
what a redesign has to answer.

> **Baseline note.** A triage pass has already landed: the board rows no longer collapse, the token
> rows align, activity lines wrap correctly, statuses are no longer all painted in the accent, and a
> handful of copy bugs are gone. That work fixed the breakage. It did not design anything, and every
> item below survives it.

### Nothing tells you what needs you — *hierarchy*

The board's five buckets are five identical cards in a grid. "Not working" — someone tried your work
and it failed — sits in the same box, at the same size, with the same weight as "Worth keeping", which
is a compliment. A person who opens the hub for four seconds should already know whether anything is
on fire.

**Design question:** what is the visual difference between a queue that is waiting on you, a queue
that is waiting on someone else, and a shelf of things that are simply going well?

### Every action looks equally likely — *hierarchy*

Up to eight actions per guide, seven guides on screen: that is a wall of forty-odd identical ghost
buttons, with the destructive ones ("doesn't work", "remove") indicated only on hover. Nothing signals
that on a guide handed *to* you the answer is almost always "copy pull", and on one you sent it is
almost always "nothing, just look".

**Design question:** what is the one action per row, and where does the rest go — a secondary tier, an
overflow, or off the row entirely?

### State is carried by words, not by form — *hierarchy*

"published", "consumed", "promoted", "not picked up", "3 pulls", "not working —" are all set as
running text at roughly one weight. A board is meant to be scanned; this one has to be read. There is
no encoding — no severity stripe, no pill, no shape — that survives peripheral vision.

### Eleven facts with no grouping — *structure*

A guide row runs its metadata as one long inline sequence: id, direction, team, handle, repo, age,
pull count, who pulled it, the verdict, the stack it assumes, then tags. On a narrow window it wraps
into a paragraph of grey.

**Design question:** which of these belong on a collapsed row at all, and which belong only on an
expanded one or on the guide page itself?

### Your work and your account plumbing share one scroll — *information architecture*

API tokens, team membership, invite links, your handle and email, and the guide list are all sections
of one flat page. API tokens — a thing you touch twice a year — had a full panel sitting between the
activity feed and the guide list.

**Design question:** is there a settings surface, and if so what stays on the hub? Note that adding
routes is cheap; adding API endpoints is not.

### A reading column doing a dashboard's job — *structure*

The hub inherited the 46rem measure that is right for reading a guide and wrong for a board. Widening
it helped, but it left the real question open: this is the only surface in the product that is scanned
rather than read, and it has never been laid out as one.

### Four flows run through browser dialogs — *structure*

Giving a failing verdict, naming a team, naming an API token and confirming a removal all use native
`prompt()` and `confirm()`. The verdict one is the worst: it is the highest-value moment in the
product — someone telling you your guide does not work — and it happens in an unstyled OS dialog.

**Constraint to respect:** a verdict is deliberately *not* a comment thread. Two answers and one note,
capped. Design the moment, not a discussion.

### A guide's six sections all look the same — *hierarchy*

The shape of a transfer guide — Problem, Solution shape, Decisions and rationale, Steps, Verification,
Gotchas — is the entire product idea, and on the page it is six identical level-two headings. Steps
you follow, Gotchas you must not miss and Decisions you can skip are set the same way, so the reader
has to parse the document to find out what kind of thing each part is.

**Design question:** should the canonical sections be typeset as themselves — with the caveat that a
guide may contain sections nobody planned for, and those must still render sensibly.

### The activity feed competes with the board — *information architecture*

Twelve lines of "@bo pulled…", "@bo handed you…" sit directly under the board, in a panel the same
weight as everything else, largely restating what the board already shows. Its sentences are written
by the server so that the hub, the CLI and the agent tool all say the same thing — the wording is
fixed, but how much of it belongs on this screen is not.

---

## 8. Hard constraints

These are not preferences. Two of them are the reason the product is safe to use at all, and a design
that assumes otherwise cannot be built.

> **Guide pages run no JavaScript, ever.** A guide is markdown a stranger wrote, rendered for other
> people to read. The only thing making that safe is a content-security policy that permits no script
> at all on `/` and `/g/**`. Nothing on a guide page may become interactive — the two views are
> separate links, not a toggle, for exactly this reason.

> **No inline styles and no third-party assets.** The policy is `style-src 'self'; font-src 'self'`.
> Every style lives in one stylesheet served from our own origin. Fonts are self-hosted — a Google
> Fonts link or any CDN will be blocked by the browser, silently. Today's two variable faces total
> about 80KB; a new face has to be self-hosted and subset, and there is not room for many.

- **Two stylesheets, one built file.** `styles.css` is the product's stylesheet — ~1,280 lines, no
  component CSS, ordered so the cascade reads top to bottom. `tailwind.css` is the entry point: it
  imports `styles.css` into a cascade layer, then Tailwind v4's utilities into a later one, and
  bridges colour, type, radius, font and shadow to the custom properties already in `styles.css` so
  a token still has one definition. Tailwind's preflight is deliberately not imported — it would
  reset the element defaults every surface here relies on. Two consequences worth knowing: the
  layering is what lets a utility override a rule in `styles.css` (unlayered CSS outranks layered
  CSS whatever the source order), and the build still emits a single hashed file from our own
  origin, so `style-src 'self'` is unaffected. The board, the guide list, settings and the guide
  page's chrome are built from utilities; the guide *body*, the shared button and menu recipes and
  every other surface are classes in `styles.css`.
- **Light and dark, both first-class**, driven by system preference. There is no toggle today.
- **Board buckets are server-defined.** Five of them, one guide in exactly one. Redesign them freely;
  redefining them is an API change.
- **Activity sentences are server-rendered** so the hub, the CLI and the agent tool report
  identically. Their wording is a server change.
- **The hub has no editor and will not get one.** Guides are created by `passalong share` from
  wherever the work happened.
- **Parity.** Anything the hub can do, the CLI and the agent-facing tool can do. A hub-only feature
  that needs its own endpoint is a second product.
- **The only interactive primitive on a guide page** is the browser's native disclosure element.
  Anything else that opens, closes, copies or switches needs script, and cannot exist there.
- **Images differ by surface.** A guide page may load images from any https origin, so guides can
  carry screenshots. The hub may load them only from our own origin.
- **Guide pages are noindex** and the share key in the URL is the secret. Nothing may leak a guide
  into a search index.

---

## 9. Already decided — please don't relitigate

Each of these looks like an oversight and is not. They are worth knowing before you sketch, because
they close off the obvious moves.

- **A verdict is two answers and one note.** "Doesn't work" must carry a reason; the reason is capped
  at 280 characters specifically so it cannot become a comment thread. Only the person who received a
  guide may give a verdict.
- **The sign-in screen offers three doors in a deliberate order.** An account is not the product, a
  team is — so a fresh self-serve signup lands in a genuinely empty hub. The invite link is the only
  path that leads somewhere immediately, and the signup copy says outright that it will be empty until
  someone hands you something. Don't design a slicker signup that dead-ends.
- **Joining happens in the browser.** The person opening an invite is often someone who has never used
  the CLI, so `/join/:code` mints the account, claims the handle and accepts the invite without a
  terminal.
- **The two guide views must never drop content.** "Verify" leads with Problem, Verification and
  Gotchas and folds everything else away — it never omits it.

---

## 10. The system today

There is a token system already — a 4px spacing scale, a type scale, a two-theme palette. It is
competent and under-used. Treat it as a starting point to keep, extend or replace on purpose; see the
open questions on how much latitude you have.

### Palette

| Token | Light | Dark |
|---|---|---|
| `bg` | `#ffffff` | `#111111` |
| `surface` | `#f4f4f4` | `#1b1b1b` |
| `surface-raised` | `#ffffff` | `#191919` |
| `fg` | `#1a1a1a` | `#eaeaea` |
| `muted` | `#6a6a6a` | `#9a9a9a` |
| `line` | `#e4e4e4` | `#2c2c2c` |
| `line-strong` | `#cbcbcb` | `#414141` |
| `accent` | `#b5451b` | `#f08a5b` |
| `accent-soft` | `#f7e7de` | `#33241c` |
| `danger` | `#ab2f21` | `#e0705e` |

> Note the gap: `accent` and `danger` are ten degrees of hue apart in both themes. There is
> effectively **no semantic colour system** — no distinct warning, no distinct success — which is a
> large part of why a broken transfer and a healthy one look alike.

### Type scale

| Token | Value | Used for |
|---|---|---|
| `--t-display` | clamp(2.25rem → 3.5rem) | landing hero only |
| `--t-h1` | clamp(1.75rem → 2.25rem) | |
| `--t-h2` | 1.3125rem | |
| `--t-h3` | 1.0625rem | every panel heading in the hub |
| `--t-body` | 1.0625rem | |
| `--t-sm` | 0.875rem | all metadata, all buttons |
| `--t-xs` | 0.8125rem | tags, chips |

Two self-hosted variable faces: **Onest** for the interface and **Newsreader** for guide
prose only. A monospace stack is used for ids, commands and tags but is not self-hosted — it falls
back to the system.

### Spacing — 4px base

`--s-1` 4px · `--s-2` 8px · `--s-3` 12px · `--s-4` 16px · `--s-5` 24px · `--s-6` 32px · `--s-7` 48px ·
`--s-8` 64px · `--s-9` 96px

Radii: `0.375rem` · `0.625rem` · `1rem` · pill.

---

## 11. What we need

In priority order across both surfaces. If the engagement only covers the first three, that is still
the bulk of the value.

**P1 — The board.** What a queue card is. How "waiting on you", "not working" and "worth keeping" read
differently at a glance. What happens as buckets appear and vanish. What the one action on a card is.

**P2 — The guide list.** A dense, scannable row carrying up to eleven facts and eight actions —
including what gets demoted off the row. Plus the filter and search bar above it.

**P3 — A hierarchy system.** Button tiers, a semantic colour set separate from the brand accent, and a
status/severity language that works in both themes. This is the piece everything else depends on, and
it has to hold across both surfaces.

**P4 — The guide page.** A reading system for arbitrary markdown: the six canonical sections, code,
tables, images, and orientation within a long document. Plus a Verify view that is visibly a different
cut of the same guide, and the no-Verification warning.

**P5 — The unfurl card.** 1200×630, generated per guide from its metadata. The first impression of
Passalong for almost everyone who meets it in a channel.

**P6 — The thirteen states.** Empty, first-run, error, limit-reached, signed-out-mid-session.
First-run especially: a new account with no team is the most common way someone first sees this
screen, and it is currently a paragraph.

**P7 — Responsive behaviour.** 360px through 1440px, and both themes at each. Not a phone app — but it
must not fall apart on one.

**P8 — The verdict moment.** Replacing the browser dialog. Two answers, one capped note, and nothing
more.

**P9 — Provenance on a guide page.** Verified, contested, well-travelled, untouched — as a sketch.
Costs a server change, so we will scope it from what you propose.

**Out of scope for now** — sign-in, the landing page, the invite and reset screens. They inherit
whatever system comes out of the above.

### How to hand it over

Figma, with colour and spacing named to match CSS custom properties — the implementation is a single
stylesheet driven by tokens, so a design whose values map cleanly onto token names lands in a day
instead of a week. Redlines are not needed. What *is* needed is the state coverage: a beautiful full
board and no empty state is not a usable handoff.

---

## 12. Open questions

Answer these before kickoff — each one changes the shape of the work.

- **How much brand latitude is there?** Is the warm rust-and-Instrument-Sans identity fixed, with the
  work being layout, hierarchy and states inside it — or is the visual identity itself in scope? The
  brief above is written to support either, but the answer roughly doubles or halves the engagement.
- **How far does provenance go on a public link?** A share link needs no account to read. Showing "@bo
  says this doesn't work" on it exposes a teammate's judgement to anyone holding the URL. We think
  some signal belongs there; where the line sits is a decision we should make together once we can see
  it.
- **Does anyone use this on a phone?** The honest guess is no — it is a developer tool opened next to
  a terminal. If that is right, mobile is a "must not break" rather than a designed experience, and
  the effort goes into the desktop board instead.
- **Is a settings surface acceptable?** Moving tokens, identity and team administration off the hub
  means a new route. Cheap to build, but it splits a product that has so far been one screen.
- **A theme toggle, or stay with system preference?** Today the theme follows the OS with no override.
  Adding one is a small amount of script, which the hub is already allowed to run.
- **Is there budget for a self-hosted monospace?** Ids, commands and tags are set in mono today and
  fall back to whatever the system has, so they render differently on every machine. A subset face
  would cost roughly 20–30KB.
