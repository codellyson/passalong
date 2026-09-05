// An invite code to the name of the team it invites you to. That is all the join page needs from
// the server, and all a stranger holding the code can learn — which they can already, since the
// code is the link they were sent.
//
// apps/api answers this inline inside its `/join/:code` route. Here the page is rendered by Nuxt
// and the lookup is its own endpoint, so it works for a client-side visit too.
import { db } from "../../utils/d1";

export default defineEventHandler(async (event) => {
  const code = getRouterParam(event, "code");
  if (!code) throw createError({ statusCode: 400, statusMessage: "no code" });

  const invite = await db(event)
    .prepare("SELECT i.code, t.name FROM invite i JOIN team t ON t.id = i.team_id WHERE i.code = ?")
    .bind(code)
    .first<{ code: string; name: string }>();

  if (!invite) throw createError({ statusCode: 404, statusMessage: "no such invite" });
  return { code: invite.code, team: invite.name };
});
