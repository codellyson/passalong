# Answers

What comes back to whoever sent work. Taking is holding it, and finishing is final
([work-lifecycle.md](work-lifecycle.md)); there is no separate reply a reader sends to say "on it"
or "it works".

## The thread

Everything said about a piece of work is a line in `task_event`, rendered by the hub as a chat
(`HubThread`): taken, progress, handed in, passed, released, reopened, asked, replied, noted, and a
support request's customer and answered lines. `thread()` reads that one table.

Two things beside the thread, each for one job:
- **`proof`** — `complete()` keeps what a hand-in showed as a standing proof after its claim
  goes; the work page leads a finished piece of work with it as "Finished with".
- **Not for me** — `pass` on work you don't hold writes a `passed` thread line with the reason,
  which keeps the work off your list and is what everyone reads.

## Pulls and receipts

| | Route | Means |
| --- | --- | --- |
| **Pull** | `GET /v1/work/:id`, `/w/:id/:key.md` | Somebody opened it. The only GET with a side effect, on purpose. `?peek=1` and `/context` record none. |
| **Receipt** | archive by a non-author | A browser-only reader never pulls, so archiving also writes a pull row (`via` = `web`). The hub's Progress leaves these out. |

## Nothing a non-author does happens in silence

Pull, archive and un-archive each notify the author (see [notifications.md](notifications.md)); a
pinning test walks every route a non-owner can reach.

## Sources
- `apps/api/src/claims.ts` (`thread`, `complete`), `apps/api/src/index.ts` (`recordPull`, `recordReceipt`, `recordDecline`)
- Migrations 0037 (task_event), 0068 (`proof`)
- [AGENTS.md](../../AGENTS.md): "task_event", "Nothing a non-author does happens in silence"
