---
name: Passalong landing
source: apps/web/app/assets/css/styles.css (:root tokens, light half) and the landing's story card (.story-*)
colors:
  ground: "#ffffff"        # --bg
  card: "#f7f7f6"          # --surface-raised
  surface: "#f1f1ef"       # --surface (marks, status pill)
  ink: "#252522"           # --fg
  muted: "#6e6c68"         # --muted
  line: "#ececea"          # --line
  line-strong: "#dcdbd7"   # --line-strong (card ring)
  coral: "#f2805d"         # --coral (marks, bars; never small text on cream)
  coral-text: "#b8481f"    # --accent (coral words, Done fill, stamps)
  coral-soft: "#fce9e0"    # --accent-soft (reply bubble)
  on-coral: "#ffffff"      # --accent-fg
  ok: "#3a7a2a"            # --ok (ticks)
typography:
  display: { family: "Onest", weight: 500, tracking: "-0.035em" }
  serif-accent: { family: "Newsreader", style: italic, weight: 400 }  # the landing's .turn line
  card-title: { family: "Newsreader", weight: 600, tracking: "-0.015em" }
  body: { family: "Onest", weight: 400 }
  mono: { family: "JetBrains Mono", weight: 400 }
spacing:
  card-radius: 24px
  mark-radius: 8px
  pill-radius: 999px
components:
  card: "background card, 1px line-strong ring, radius 24px, generous padding"
  status-pill: "surface fill, ink 500 text; Done is coral-text fill with on-coral text"
  stamp: "1.5px coral-text outline, radius 8px, coral-text 600 text"
  tick: "ok green stroke, drawn"
---

## Overview

The landing's own world, at frame scale: a white ground, ink type, and coral used sparingly
for what is active or finished. The film's spine is one card, the same card the landing plays, that
fills up as the request moves from arrival to done.

## The Frame

- One focal object per beat: the card's newest row. Everything else in the card is context.
- Captions sit outside the card, bottom-left, in Onest 500 ink with the time in tabular figures.
- Time is always visible: 09:12, 09:20, 11:31, 11:40.

## Composition Rules

- The card holds centre at 16:9 (about 62% of the width) and grows downward as rows land.
- Display type only in the hook and the close; the middle of the film is the product talking.

## Do's and Don'ts

- Do keep coral for the stamps, the Done fill, bars and the "Leave nothing behind." line.
- Do write the customer's words in the serif, so they read as a person's.
- Don't glow, gradient text, or bounce. Ease out, settle, hold.
- Don't make it a slideshow (a fresh card every beat) or a screensaver (motion that says nothing).
- Don't show the live app as if captured; this is the landing's story card, with illustrative people.
