# Answers

What comes back to whoever sent work. The reader's old answers — the ack ("on it" / "not me") and
the verdict ("it works" / "it does not") — are gone from every surface, and their routes went with
migration 0061: taking is holding it, and finishing is final ([work-lifecycle.md](work-lifecycle.md)).

## The thread

Everything said about a piece of work is a line in `task_event`, rendered by the hub as a chat
(`HubThread`): taken, progress, handed in, passed, released, reopened, asked, replied, noted, and a
support request's customer and answered lines. `thread()` reads that one table. Migration 0062 moved
old verdicts in (a passing one as a hand-in, unless one was already there; a failing one as a reopen
with its reason) and old acks (a take or a pass), so history from before reads the same.

Two rows outlive the answers they came from, each for one job:
- **`verdict`** — `complete()` keeps what a hand-in showed as a standing verdict after its claim
  goes; the work page leads a finished piece of work with it as "Finished with".
- **`ack`** — a decline (`pass` on work you don't hold) writes one, which keeps the work off the
  decliner's list; it also writes a `passed` thread line, which is what everyone reads.

## Pulls and receipts

| | Route | Means |
| --- | --- | --- |
| **Pull** | `GET /v1/guides/:id`, `/g/:id/:key.md` | Somebody opened it. The only GET with a side effect, on purpose. `?peek=1` and `/context` record none. |
| **Receipt** | archive by a non-author | A browser-only reader never pulls, so archiving also writes a pull row (`via` = `web`), and old verdicts wrote `via` = `verdict`. The hub's Progress leaves these out. |

## Nothing a non-author does happens in silence

Pull, archive and un-archive each notify the author (see [notifications.md](notifications.md)); a
pinning test walks every route a non-owner can reach.

## Sources
- `apps/api/src/claims.ts` (`thread`, `complete`), `apps/api/src/index.ts` (`recordPull`, `recordReceipt`, `recordDecline`)
- Migrations 0004 (verdicts), 0013 (acks), 0037 (task_event), 0062 (one thread)
- [AGENTS.md](../../AGENTS.md): "task_event", "Receipt is not only pull", "Nothing a non-author does happens in silence"
