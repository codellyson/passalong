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

## Known gaps

- **Hold history.** A claim is deleted on approve, release and pass, so Progress cannot show a hold that
  ended. Keeping it needs its own table.
- **Quick actions on rows.** Task rows can still Approve without opening the line-by-line review.
- **Agent hand-ins and screenshots.** A person's "it works" needs a screenshot; an agent's hand-in does
  not, deliberately. Revisit if agents start saying things work that do not.
- **Live stream at scale.** It polls D1 every 3 s per open tab. Durable Objects are the step if that
  starts to cost.
- **The unfurl card with the new mark** has not been looked at on the deployed Worker.

## Sources
- [docs/PUBLISH.md](../PUBLISH.md), the PR descriptions for #60–#64
