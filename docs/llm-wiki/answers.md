# Answers

What the reader says back to the author. Each is a **row**, not a status: it belongs to the reader,
it can be negative, several people can each give one, and it never goes in the markdown — the
document is the author's, the answer is a fact about the transfer of it.

| Answer | Route | Means |
| --- | --- | --- |
| **Ack** | `PUT /v1/guides/:id/ack {taken, note}` | The first word back: "I'm on it", or "not me" — and a pass **requires a note**, since "no" without "why" leaves the sender where silence did. Taking it in the browser holds it, like an agent's take. |
| **Verdict** | `PUT /v1/guides/:id/verdict {ok, note, detail}` | Does it actually work? A failing verdict needs a reason; a passing one needs a screenshot (see [evidence-and-proof.md](evidence-and-proof.md)). One standing verdict per person per guide. |
| **Pull** | `GET /v1/guides/:id`, `/g/:id/:key.md` | Somebody opened it. The only GET in the API with a side effect, on purpose: it is the event the author most needs. |

## Receipts

A browser-only reader never pulls, so a verdict or an archive by a non-author also writes a pull row
(`via` = `verdict` or `web`) — otherwise a guide read and verified still showed as never delivered.
These receipts are not someone opening it, and the hub's Progress leaves them out.

## Nothing a non-author does happens in silence

Pull, verdict, ack, archive and un-archive each notify the author (see
[notifications.md](notifications.md)); a pinning test walks every route a non-owner can reach.

## Sources
- `apps/api/src/index.ts`: `recordVerdict`, `recordPull`, `recordReceipt`, ack and verdict routes
- Migrations 0004 (verdicts), 0013 (acks), 0030 (verdict detail)
- [AGENTS.md](../../AGENTS.md): "An ack is the reader's first word back", "Verdicts", "Receipt is not only pull", "Nothing a non-author does happens in silence"
