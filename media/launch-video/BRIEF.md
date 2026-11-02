---
workflow: general-video
flow: automation
storyboard: yes
message: "Everything that comes in gets done fast, and nothing is left behind"
destination: embed
aspect: 1920x1080
language: en
length: 62s
angle: narrative
audience: "leads of small mixed teams, developers with AI agents, support and marketing people"
---

## Intent

The Passalong 1.0 launch film, for launch day, the 1.0 blog post and social. One customer request
followed end to end, so the hero line is shown rather than said: Kemi's email arrives, Passalong's
agent sorts it to the Billing app for #billing with its reason and a tracking number, Bola's agent
takes it, reads the project's documents and finds the second charge in the retry job, hands it in
with proof ("pnpm test billing: 42 passed", refund issued), and Leo sends the agent-drafted reply.
The status moves New → Sorted → In progress → Handed in → Done. It ends on the hero: "Get things
done fast." / "Leave nothing behind." and passalong.dev.

## Assets

- ../../apps/web/public/favicon.svg — the Passalong mark, for the end card.
- ../../apps/web/public/fonts/ — Onest and Newsreader, the landing's type.
- ../../apps/web/app/components/LandingStory.vue — the landing's interactive version of the same story; reuse its card anatomy.

## Customizations

- Silent: no voiceover and no music. Short on-screen captions name each beat ("09:12 · An email comes in"), outside the card, so it plays muted in feeds.
- Count-up on "42 passed" as the proof moment.
- A second cut at 1:1 (1080x1080) reusing the scenes, each beat zoomed to its row so text reads on a phone.

## Notes

- Visual world is the landing's: white ground #ffffff, raised card #f7f7f6, surface #f1f1ef, ink #252522, muted #6e6c68, line #ececea, coral #f2805d, coral text #b8481f, ok green #3a7a2a; rounded 24px raised card with a 1px ring.
- Kemi, Bola and Leo are illustrative, not real customers or staff. No screenshots of the live app, no site capture.
- Product vocabulary: work, project, document, file. Never "guide".
- The product-launch-video workflow could not install (HyperFrames CLI: "can't check skills freshness (GitHub manifest unreachable)"); general-video runs the brief.
