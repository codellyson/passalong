// Transactional mail through Brevo's REST API. Optional: without BREVO_API_KEY nothing is sent
// and the caller carries on (the inbox still shows the handoff). EMAIL_FROM must be a verified
// sender or domain in Brevo.

export type MailEnv = { BREVO_API_KEY?: string; EMAIL_FROM?: string };

async function send(env: MailEnv, to: string, subject: string, text: string): Promise<boolean> {
  if (!env.BREVO_API_KEY || !to) return false;
  const from = env.EMAIL_FROM || "no-reply@passalong.kreativekorna.com";
  try {
    const res = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "api-key": env.BREVO_API_KEY, "content-type": "application/json" },
      body: JSON.stringify({
        sender: { email: from, name: "Passalong" },
        to: [{ email: to }],
        subject,
        textContent: text,
      }),
    });
    if (!res.ok) console.error("brevo", res.status, await res.text());
    return res.ok;
  } catch (e) {
    console.error("brevo", e);
    return false;
  }
}

export function sendHandoff(
  env: MailEnv,
  o: { to: string; fromHandle: string; title: string; id: string; url: string; team: string },
) {
  return send(
    env,
    o.to,
    `@${o.fromHandle} passed you a guide: ${o.title}`,
    [
      `@${o.fromHandle} handed off "${o.title}" to you in ${o.team}.`,
      "",
      "Pull it into the repo where you'll implement it:",
      `  passalong pull ${o.id}`,
      "",
      `Or read it first: ${o.url}`,
      "",
      "Mark it done when it lands: passalong done " + o.id,
    ].join("\n"),
  );
}

export function sendInvite(env: MailEnv, o: { to: string; team: string; by: string; url: string }) {
  return send(
    env,
    o.to,
    `Join ${o.team} on Passalong`,
    [
      `${o.by} invited you to the ${o.team} team on Passalong.`,
      "",
      "If you don't have the CLI yet:",
      "  npm i -g passalong && passalong setup && passalong login",
      "",
      "Then join:",
      `  passalong team join ${o.url}`,
    ].join("\n"),
  );
}
