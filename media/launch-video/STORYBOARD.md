---
format: 1920x1080
duration: 62s
message: "Everything that comes in gets done fast, and nothing is left behind"
arc: Hook → Comes in → Kemi hears back → Sorted → The team sees it → Taken → Working → Proof → Sent → Closed → The promise
audience: leads of small mixed teams, developers with AI agents, support and marketing people
mode: collaborative
concept: The journey
---

## Concept (v4)

One continuous world, one camera. A thin ink line runs left to right across a white ground: the
route every request takes. Kemi's email is a physical object, an envelope-card, that travels along
it, stopping at each station, where it is changed by what happens there. The camera pans right
with it the whole way and never cuts; the film ends by pulling back to show the whole route behind
it, every station passed.

Two things are pinned in the corners from the first frame to the last, the film's hero props: the
clock (top left, 09:12 → 11:40, ticking forward at each station) and the status (top right,
New → Sorted → In progress → Handed in → Done). Each station is named in big type as the camera
reaches it, so it reads on mute without captions.

Motion vocabulary, kept small: travel (ease-in-out along the line), stamp (scale 1.6 → 1 with a
rotate settle), unfold (clip-path), count-up, stroke-draw. One direction: everything moves right;
only the tracking number flies back left, to Kemi.

Bans: no cards-in-a-grid, no UI screenshots, no glow, no bounce, no cut until the end card.

## Changes for the 60s cut

- "Make it longer, the experience needs to be detailed" (the author), after "jampacked": more beats, each
  with the same room, not more inside each beat. Eleven beats at about 62s, one camera along nine
  stations: Comes in (4–10s), Kemi hears back (10–15), Sorted (15–21), The team sees it (21–27), Taken
  (27–33), Working (33–39), Proof (39–45), Sent (45–51), Closed (51–55), then the promise (55–62).
- The lower third ("who's on it", added after the user's note on the empty band) names who is working
  at every station — Passalong's agent, Leo of the support team, the AI agent — and types what they do.
- The frame-by-frame blocks below describe the 35s cut and are kept as history; index.html is the truth.

## Changes after the first build

- "Everything feels jampacked" (the author). One idea per station: the reason line, the flying ticket, the documents label, the working sweep, the third proof line and the five-stop route at the close are cut. Each station gets about five seconds; the film is 35s. The close is the number, then the two lines, then the mark, with room around each.

## Changes from v4

- Business-friendly (the author): no developer terms on screen. "Billing team" not "#billing"; "An AI agent… read how your billing works, found the duplicate charge" not the retry job; proof is a checklist (refunded, receipt attached, fix checked), not a test count; the film's one number is the time from email to answer, 2h 28m, counted up at the pull-back. No real email screenshots: a designed envelope, illustrative people.

## Changes from v3

- The v1–v3 concept was one card growing; it read as UI filling up rather than a film (the author:
  "a bunch of cards"). Replaced by the journey: a full-frame world with a moving camera and the
  email as a travelling object.

## Frame 1 — 09:12

- scene: White ground; "09:12." huge in Onest (time in coral); the envelope slides in from the left edge onto the ink line and the camera begins to move
- duration: 3s
- poster: 2.2s
- transition_in: cut
- status: animated
- src: index.html
- motion: type settle; envelope travel-in from left; camera pan begins

The clock is the first thing seen and it never leaves: the film is the time between 09:12 and 11:40.

## Frame 2 — Comes in

- scene: Station 1, "Comes in" in big type above the line; the envelope opens to show Kemi's words large in the serif: "I was charged twice for October. Can you refund one?"; status pill "New"
- duration: 3.5s
- poster: 2.5s
- transition_in: same world (camera pans)
- status: animated
- src: index.html
- motion: unfold (clip-path) of the envelope; status pop

What would otherwise sit unread in an inbox, in her own words.

## Frame 3 — Sorted

- scene: Station 2, "Sorted"; a big coral stamp slams onto the envelope: "Billing team"; the agent's reason as one small line ("A duplicate charge, so billing"); a ticket "R-K7Q2M9" peels off and flies back left toward Kemi; status "Sorted"; clock still 09:12
- duration: 4s
- poster: 2.8s
- transition_in: same world
- status: animated
- src: index.html
- motion: stamp (scale + rotate settle); ticket peel and fly left

Nobody had to read it to route it, and no time passed. The only thing moving left in the film: the
customer told, at once.

## Frame 4 — Taken

- scene: Station 3, "Taken"; the Billing app's project mark with its stack of documents; an AI agent (an ink avatar) arrives from above, the Billing app's documents fan open under it, one line: "Read how your billing works. Found the duplicate charge."; status "In progress"; clock 09:20
- duration: 4s
- poster: 2.8s
- transition_in: same world
- status: animated
- src: index.html
- motion: avatar drop with settle; document fan; working sweep along the line

Projects and their documents in one gesture: the agent reads the product before it touches it.

## Frame 5 — Proof

- scene: Station 4, "Proof"; three lines tick in turn, each with a drawn tick: "Duplicate charge refunded", "Receipt attached", "Fix checked"; status "Handed in"; clock 11:31
- duration: 4.5s
- poster: 3.4s
- transition_in: same world
- status: animated
- src: index.html
- motion: stroke-draw ticks, staggered; the line under the station fills green

Shown, not said: what was done, in words a business uses.

## Frame 6 — Sent

- scene: Station 5, "Sent"; the envelope turns into the reply ("Hi Kemi, sorry about that. We've refunded the second charge…"), "Read and sent by Leo, support team" stamped under it; it flies right out of frame; status pops to coral "Done"; clock 11:40
- duration: 4s
- poster: 2.6s
- transition_in: same world
- status: animated
- src: index.html
- motion: unfold to reply; send (travel right, off-frame); status fill

The loop closes with a person, and the thing leaves the frame: nothing is left behind.

## Frame 7 — Get things done fast. Leave nothing behind.

- scene: The camera pulls back: the whole route in one view, five stations ticked, the line drawn through; the clock's 09:12 → 11:40 resolves into a big count-up, "2h 28m · email to answer"; the props fade; "Get things done fast." (Onest, ink) / "Leave nothing behind." (Newsreader italic, coral) settle centre; the mark and passalong.dev beneath; held still for the last 2s
- duration: 7s
- poster: 4.5s
- transition_in: same world (pull back)
- status: animated
- src: index.html
- motion: camera scale-out; stations tick in sequence; count-up 0h 00m → 2h 28m; type settle; hold

The promise, said once, over the route that proves it.
