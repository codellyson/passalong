<!--
  Integrations, for people: email, Sentry, PostHog, GitHub Actions and any JSON webhook into work,
  and work events out to an app (apps/api/src/work-events.ts).
  public/llms.txt "Work from email and webhooks" is the same for an agent. The behaviour lives in
  apps/api/src/inbound.ts and receiveEmail / intake / POST /v1/in in apps/api/src/index.ts; if a rule
  changes there, this page and llms.txt change with it.
-->
<script setup lang="ts">
import { APEX } from "#api/hosts";
import { publicPage } from "#shared/pages";

const self = publicPage("/docs/integrations");

usePage({
  title: "Turn email, Sentry and PostHog alerts into work · Passalong",
  description:
    "Forward an email or connect an alert, and each one becomes work with a plain summary, sent to the right person or group.",
  url: `${APEX}${self.path}`,
  image: `${APEX}/og.png`,
  noindex: self.draft,
});

const SENTRY = [
  { name: "issue", note: "Created, or unresolved (it came back). One piece of work per issue." },
  { name: "event_alert", note: "An alert rule fired. Merges with the issue it's about." },
  { name: "error", note: "Every error, if you tick it. Merges by issue: noisy, not a flood." },
  { name: "metric_alert", note: "Warning or critical." },
  {
    name: "everything else",
    note: "Resolved, assigned, comments and the install ping: answered and ignored.",
  },
];

const CURL = `curl -X POST "https://passalong.dev/v1/in/<key>?repo=acme/api" \\
  -H 'content-type: application/json' \\
  -d '{
    "title": "Checkout returns 500",
    "text": "500s since 09:12 on POST /checkout",
    "url": "https://grafana.example.com/d/checkout",
    "id": "checkout-500"
  }'`;

const VERIFY = `// Node: check a Passalong event before trusting it
import { createHmac, timingSafeEqual } from "node:crypto";

function fromPassalong(rawBody, header, secret) {
  const t = Number(/t=(\\d+)/.exec(header)?.[1]);
  const v1 = /v1=([0-9a-f]{64})/.exec(header)?.[1];
  if (!t || !v1 || Math.abs(Date.now() / 1000 - t) > 300) return false;
  const want = createHmac("sha256", secret).update(\`\${t}.\${rawBody}\`).digest("hex");
  return timingSafeEqual(Buffer.from(want), Buffer.from(v1));
}`;

const EVENT = `{
  "event": "handed_in",
  "work": "ab12cd34",
  "status": "ready",
  "team": "t_1a2b3c",
  "url": "https://passalong.dev/hub/w/ab12cd34",
  "at": "2026-11-27T10:00:00.000Z"
}`;

const TOC = [
  { id: "addresses", label: "Your addresses" },
  { id: "email", label: "Email" },
  { id: "sentry", label: "Sentry" },
  { id: "posthog", label: "PostHog" },
  { id: "github", label: "GitHub Actions" },
  { id: "own", label: "Your own code" },
  { id: "repo", label: "Which repo" },
  { id: "events", label: "Events out to your app" },
  { id: "rules", label: "What it won't do" },
];
</script>

<template>
  <main class="wide landing docs">
    <AppMasthead />
    <DocsNav />

    <header class="hero">
      <h1>
        Errors, alerts and email,
        <span class="turn">arriving as work an agent can take.</span>
      </h1>
      <p class="dlede">
        Each one arrives Ready, quoted in full, with a title, a summary and a label, sent to the group that should act.
      </p>
    </header>

    <DocsPage :toc="TOC">
      <section id="addresses">
        <h2>Your addresses</h2>
        <ol class="dsteps">
          <li>In the hub, open <b>Settings → Integrations</b> and choose <b>Get your addresses</b>.</li>
          <li>You get one key, written two ways:</li>
        </ol>
        <ul class="drows">
          <li>
            <code>key+new@in.passalong.dev</code>
            <span>Anything: an alert, a forwarded email, a screenshot from a phone.</span>
          </li>
          <li>
            <code>https://passalong.dev/v1/in/key</code>
            <span>The webhook URL, for Sentry, PostHog, GitHub Actions and your own code.</span>
          </li>
        </ul>
        <p>
          For a team's board, name it: <code>key+new+team@…</code> or <code>…?team=team</code>, plus
          <code>&amp;to=@handle</code> or <code>#group</code>. The hub's copies already carry your team.
        </p>
        <p class="dnote">
          Mail to the bare <code>key@</code> or any other <code>+word</code> is dropped. <b>New addresses</b> replaces the
          key, and the old ones stop working at once.
        </p>
      </section>

      <section id="email">
        <h2>Email</h2>
        <p>
          Give the address to anything that sends email, BCC it from your backend, or forward one email from your own
          address. For mail you can't change, add it under Gmail's <b>Settings → Forwarding</b>; the confirmation code
          shows up in Integrations as a sender.
        </p>
        <p>
          A new sender's first email makes nothing: it waits under <b>Asking to email you work</b> until you allow or
          block it. Your own confirmed address is allowed from the start, and nothing is ever bounced.
        </p>
      </section>

      <section id="sentry">
        <h2>Sentry</h2>
        <ol class="dsteps">
          <li><b>Settings → Developer Settings → Custom Integrations</b>, then create an <b>Internal Integration</b>.</li>
          <li>Paste your webhook URL as its <b>Webhook URL</b>.</li>
          <li>Under <b>Webhooks</b>, tick <b>issue</b>, or turn on <b>Alert Rule Action</b> and add it to an alert rule.</li>
        </ol>
        <ul class="drows narrow">
          <li v-for="s in SENTRY" :key="s.name">
            <code>{{ s.name }}</code>
            <span>{{ s.note }}</span>
          </li>
        </ul>
        <p>Ignored events still get a 200, because Sentry turns off a webhook that keeps failing.</p>
      </section>

      <section id="posthog">
        <h2>PostHog</h2>
        <ol class="dsteps">
          <li><b>Error tracking → Configuration → Alerting</b>, add an <b>HTTP Webhook</b> for issues created.</li>
          <li>Paste your webhook URL and leave the body as it is.</li>
          <li><b>Test function</b>, then <b>Create &amp; enable</b>.</li>
        </ol>
        <p>A destination sending <code>$exception</code> events works too. One PostHog issue stays one piece of work.</p>
      </section>

      <section id="github">
        <h2>GitHub Actions</h2>
        <ol class="dsteps">
          <li>In the repo's or organisation's <b>Settings → Webhooks</b>, add a webhook.</li>
          <li>Payload URL: your webhook URL. Content type: <b>application/json</b>.</li>
          <li>Events: only <b>Workflow runs</b>.</li>
        </ol>
        <p>
          A run on the default branch that fails, times out or can't start becomes work for that repo. The same failure
          again adds to it. Pull requests, forks, green and cancelled runs make nothing.
        </p>
      </section>

      <section id="own">
        <h2>Your own code</h2>
        <p>
          POST JSON. Only <code>title</code> is required. Send the same <code>id</code> again and it adds to the open work
          instead of making new work; without an <code>id</code>, the same title with different numbers counts as the
          same thing.
        </p>
        <LandingCode kind="paste" label="Terminal" :code="CURL" />
        <p>An unknown key answers 404, a body that isn't JSON 400, and anything over 1 MB 413.</p>
      </section>

      <section id="repo">
        <h2>Which repo it's for</h2>
        <p>
          An agent asking for work without an id is only offered work for its own repo. Add
          <code>?repo=owner/repo</code> to the URL, or choose the repo on the work's page. Work with no repo is still
          taken when an agent is given its id.
        </p>
      </section>

      <section id="events">
        <h2>Events out to your app</h2>
        <p>
          A team's owner can add an app as a channel (Settings, the team, <b>New channel</b>, <b>An app</b>). The app is
          sent every move on the team's work: <code>taken</code>, <code>progress</code>, <code>asked</code>,
          <code>handed_in</code>, <code>passed</code>, <code>released</code>, <code>replied</code>, <code>done</code>,
          <code>reopened</code> and <code>status</code>. Each post carries ids and status only; read the rest with
          <code>GET /v1/work/:id</code> and your own token.
        </p>
        <LandingCode kind="paste" label="What your app receives" :code="EVENT" />
        <p>
          Each post has a <code>Passalong-Event</code> header and a <code>Passalong-Signature</code> header,
          <code>t=&lt;unix seconds&gt;,v1=&lt;hex&gt;</code>: an HMAC-SHA256 of <code>t.body</code> with the secret shown
          once when the app was added. Check it, and refuse anything more than five minutes old.
        </p>
        <LandingCode kind="paste" label="Node" :code="VERIFY" />
        <p>
          Work the reader finishes on its own is not sent yet, so read the work again after <code>handed_in</code>.
        </p>
      </section>

      <section id="rules">
        <h2>What it won't do</h2>
        <ul class="drows narrow">
          <li><code>Instructions</code><span>What was sent is quoted as evidence, never followed as instructions.</span></li>
          <li><code>Floods</code><span>Repeats add to the open work: a count, and at most one note an hour.</span></li>
          <li>
            <code>Signatures</code
            ><span>The key in the address is the credential; Sentry's signature isn't checked yet. Replace the key if one leaks.</span>
          </li>
        </ul>
      </section>
    </DocsPage>

    <AppFoot />
  </main>
</template>
