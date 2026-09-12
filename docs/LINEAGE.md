# Passalong — guide lineage (`parent_id`)

**Status:** built — column, frontmatter, write path, read fields, children endpoint, hub row. **Date:** 2026-09-11, finished 2026-09-12.

A guide that descends from another guide. B pulls A's guide, implements it, learns three things on
the way, and publishes those as a guide whose parent is A's — so the original accumulates what it
turned into, and a reader arriving at it later gets the follow-ups with it.

This is not a comment thread. Nothing here adds free-form replies to a guide; see §7.

---

## 1. Why a guide and not a message

The unit Passalong moves is a guide, because a guide is a thing an agent can act on. A reply is
prose nobody can execute. The whole value of a follow-up — "this worked but the migration step
needs a flag on Postgres 16" — is that it is *itself* pullable, verifiable, and addressable to
somebody. Hang it off the parent as a child guide and it keeps all of that. Write it as a comment
and it keeps none of it.

The schema already argues this. `migrations/0006_reports.sql` makes the same call for bug reports:

> The question this answers is whether one issue can be pulled and verified on its own, and the
> answer is yes — so an issue *is* a guide.

Lineage is that sentence applied to transfers instead of bugs.

## 2. What it is not

`report_id` already exists and is not this. A report is a **set** — six bugs filed together, flat,
siblings of each other, created by one act of filing, and the parent is a `report` row that is not
itself a guide. Lineage is a **chain** — a guide that came after another guide, published by a
different person at a different time, where the parent is an ordinary guide with its own verdicts
and pulls.

They are orthogonal. An issue in a report can have a child; a child can have children. Keep both
columns; do not overload `report_id`.

## 3. The column

```sql
-- M15: a guide that came out of another guide.
ALTER TABLE guide ADD COLUMN parent_id TEXT NOT NULL DEFAULT '';
CREATE INDEX guide_parent ON guide(parent_id, created);
```

Denormalized from the child's own frontmatter, exactly as `report`, `area` and `severity` are —
that is the rule `0006` states and the reason a guide filed from the browser is byte-for-byte the
same document as one filed by the CLI.

No foreign key, matching `report_id` and `team_id`. A parent can be deleted by its author while
children written against it survive; see §6.

## 4. Frontmatter

One new field, `parent`, holding a guide id.

- `packages/passalong/src/guide.js` — add `"parent"` to `META_ORDER`. It belongs with the transfer
  fields near `kind`, **not** in the `report`/`area`/`severity` group, which is commented "Bug
  reports only".
- `apps/api/src/guide.ts` — add `parent?: string` to `Meta` with a doc comment pointing at the
  migration, mirroring the existing `report` field.
- `validate()` — refuse a self-parent. Do **not** refuse a `parent` that fails `ID_RE`: the field
  name was not reserved until now, so a guide written before lineage may carry one meaning
  something else, and a guide shared then has to still re-share today (the rule the `STATUSES`
  comment states). A value that is not an id is not a typo, it is not lineage.

## 5. Server

### Publish — `PUT /v1/guides/:id`

Resolve `meta.parent` the way `report` is resolved in the same function, then add `parent_id` to
the insert column list and to the `ON CONFLICT DO UPDATE SET` clause. Three rules:

1. **The parent must be readable by the publisher.** Reuse `readableGuide`. Anything else lets
   somebody attach a child to a guide they cannot see and learn its title back out of `summaries()`.
2. **A guide may not be its own parent**, and a parent may not already be a descendant of the child.
   Walk up with a depth cap (§6) and refuse with 400 rather than writing a cycle.
3. **A parent that does not resolve is dropped to `''`, not an error** — including one that is not
   a valid id at all. A guide pulled from a team you have since left has to keep publishing, and a
   pre-lineage `parent:` meaning something else must not make its author's own document
   unpublishable. A dropped parent costs lineage that does not apply; a refused publish costs the
   transfer. A self-parent is still a 400: there is no reading of it that is not a mistake.

### Read — a child count on the row

`summaries()` already does exactly this shape for reports: collect the distinct ids across all rows,
one `IN (...)` query, map back. Add the mirror of it:

```sql
SELECT parent_id, COUNT(*) AS n FROM guide
 WHERE parent_id IN (...) AND status <> 'draft' GROUP BY parent_id
```

and emit `parent` (the id), `parent_title` (resolved by name — "follows Migrating the worker", not
eight characters), and `children` (the count). The report arm's comment applies verbatim and should
be echoed: a row that descends from a guide says so by name, not by id.

### Read — the tree

`GET /v1/guides/:id/children` returning one level, newest first, through `summaries()` so a child
row carries its own verdicts and acks. One level, not a recursive tree: the caller can walk it, and
a recursive CTE returning a hundred descendants of a popular guide is a response nobody renders.

Authorization is `readableGuide` on the parent, then the existing scope rules on each child. A
child published into a team the viewer is not in does not appear.

## 6. Depth, cycles, deletion

- **Cycle prevention** at publish, per §5.2.
- **Depth cap of 8.** Not a storage limit — a rendering one. Past that the chain is a history
  nobody reads, and the cap is what stops the cycle walk being unbounded.
- **Deleting a parent orphans its children; it does not delete them.** `DELETE /v1/guides/:id` is
  author-only and a child belongs to somebody else. Set the survivors' `parent_id = ''` in the same
  batch as the delete, so the column never points at a row that is gone. The child keeps `parent:`
  in its own markdown, which is the honest record: it *did* come from something.

## 7. What this deliberately does not add

No replies, no reactions, no comments. The verdict route says `One line, not a thread` and the ack
route says `It is one line, not a thread`, and both stay true after this ships — lineage adds
guides, not messages.

The reason is mechanical, not aesthetic. `verdict` is `ON CONFLICT(guide_id, account_id) DO UPDATE`
— one standing verdict per person — and the board's `failing` and `landed` buckets are built on
that uniqueness. A reply box gives the real answer somewhere to live that the board cannot read,
and the board goes quiet while the guide looks busy.

## 8. Surfaces

Parity is a product rule, so all three faces or none.

- **CLI** — `passalong share --follows <id|link>`, and `passalong pull` writes `parent:` through
  untouched.
- **MCP** — `publish_guide` takes `parent` on both servers. Locally it goes through `share()`; over
  HTTP it rides beside the markdown and the route writes it into the frontmatter, so a model never
  edits YAML to record where its work came from.
- **Hub** — a row says "follows *Title*" and how many follow-ups it has, both scoped to what you can
  read. `GET /v1/guides/:id/children` returns one level.
- **Not the public guide page, deliberately.** An earlier draft of this spec put descendants below
  Gotchas on `/g/:id/:key`. That page is authorised by the share key alone — there is no account —
  and a follow-up's visibility is its team. Listing children there, or showing a parent's title,
  would hand team-private guides to anyone holding one link. The child's own `parent:` id stays in
  its markdown, which is what the key already shows.

## 9. Board and counts

`parent_id` changes no bucket. `PULLED_BY_OTHERS`, `IN_FLIGHT` and `FAILING` are untouched, and a
child is an ordinary guide that appears in them on its own merits.

One thing to decide before building the hub half: a guide with children is, by definition, work that
travelled — which is closer to what `pulls` was always reaching for than `pulls` is. Not a reason to
change the board now, but if a "worth keeping" bucket ever returns, descendant count is the better
test than pull count. Note it and leave the board alone.

## 10. Order of work

1. Migration + `parent_id` on the upsert. Nothing reads it yet.
2. Frontmatter field, both sides. Round-trips through publish and pull.
3. `parent`/`parent_title`/`children` in `summaries()`.
4. `GET /v1/guides/:id/children`.
5. CLI `--follows`, MCP `parent`.
6. Hub rendering.

Steps 1 and 2 are shippable alone: a guide can record where it came from before anything displays
it, and the data starts accumulating before the feature exists.
