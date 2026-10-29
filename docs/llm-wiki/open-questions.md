# Open questions

What is undecided or unfinished, and whose call it is. Move an item out when it is settled — into the
page it belongs to, and into [decisions.md](decisions.md).

## Waiting on the author

- **Push in production.** Set `VAPID_PRIVATE_KEY` (secret), `VAPID_PUBLIC_KEY` and `VAPID_SUBJECT`
  on the web Worker. Until then Settings says push is not set up. Delivery has not yet run on the
  deployed Worker.
- **Publish the blog.** Edit the first post, then `draft: false` on it and on `/blog`, plus a line in
  `public/llms.txt`.
- **Publish (the feature)** — five decisions in [docs/PUBLISH.md](../PUBLISH.md) §14: the page's
  address, pricing, solo pages, whether the task's author gets a say, and the name.

- **Finishing with proof** — [docs/REVIEW.md](../REVIEW.md) (direction agreed 2026-10-15): no review
  stage. Finishing needs proof a person can look at and goes straight to Done; Reopen undoes it, and
  asking someone to check is a follow-up addressed to them. Open in §9: recordings, what backend proof
  looks like, and who hears about a reopen.

- **The loop** — [docs/LOOP.md](../LOOP.md) §0 build order. Step 1, one thing: work, is built
  (2026-10-29). Next: the agent tidies the board (closes finished work, archives abandoned work,
  judges hand-ins, and the proof gate goes), then onboarding, then projects as the home of all work.
- **Cutover for one thing, work** — migrate production (0061, 0062) behind a Time Travel bookmark,
  deploy, publish passalong 0.22.0, then raise `MIN_CLIENT` to 0.22.0 ([docs/DEPLOY.md](../DEPLOY.md)).
  Until then installed CLIs call routes and tools that are gone.

## Known gaps

- **Hold history on Progress.** The thread keeps every hold (`task_event`), but the work page's
  Progress is built from live claims and still loses a hold once it ended.
- **Agents cannot put work in a project.** Linking work to a folder is the hub's alone since
  `link_folder_guide` went; it waits for work to live in its project (LOOP.md step 4).
- **Old words outside the product.** The `/learn` articles still teach kinds and sections.
- **Live stream at scale.** It polls D1 every 3 s per open tab. Durable Objects are the step if that
  starts to cost.
- **The unfurl card with the new mark** has not been looked at on the deployed Worker.

## Sources
- [docs/PUBLISH.md](../PUBLISH.md), the PR descriptions for #60–#64
- [docs/REVIEW.md](../REVIEW.md)
- [docs/LOOP.md](../LOOP.md), [docs/WORK.md](../WORK.md)
