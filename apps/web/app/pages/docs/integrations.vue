<!--
  Integrations, for people: turning email, Sentry, PostHog and any JSON webhook into guides.
  public/llms.txt "Guides from email and webhooks" is the same material written for an agent.

  The behaviour is defined in apps/api/src/inbound.ts (what each sender is read as) and
  receiveEmail / intake / POST /v1/in in apps/api/src/index.ts; if a rule changes there, this page
  and llms.txt change with it.

  Script-free: route rule `/docs/**` is `noScripts` with the strict CSP.
-->
<script setup lang="ts">
import { APEX } from "#api/hosts";
import { publicPage } from "#shared/pages";

const self = publicPage("/docs/integrations");

usePage({
  title: "Passalong integrations — email, Sentry and PostHog into tasks and bugs",
  description:
    "Turn errors from Sentry and PostHog, emails and your own webhooks into Passalong tasks, bugs and transfers an AI coding agent can take.",
  url: `${APEX}${self.path}`,
  image: `${APEX}/og.png`,
  noindex: self.draft,
});

/** What each address or URL makes. The kind is in the address, because it is never guessed. */
const KINDS = [
  {
    name: "+task  /task",
    note: "Work to do. Arrives as a Draft, and an agent can take it once you mark it Ready.",
  },
  { name: "+bug  /bug", note: "A defect to fix. The usual one for errors and alerts." },
  { name: "+transfer  /transfer", note: "Context to hand over. Never merged with another." },
];

/** What a Sentry webhook makes a guide from, and what it ignores. */
const SENTRY = [
  { name: "issue", note: "Created, or unresolved (it came back). One guide per Sentry issue." },
  { name: "event_alert", note: "An alert rule fired. Merges with the issue it is about." },
  {
    name: "error",
    note: "Every error, if you tick it. Merges by issue, so it is noisy but not a flood.",
  },
  { name: "metric_alert", note: "Warning or critical." },
  {
    name: "everything else",
    note: "Resolved, assigned, comments and the installation ping are answered and ignored.",
  },
];

const CURL = `curl -X POST "https://passalong.dev/v1/in/<key>/task?repo=acme/api" \\
  -H 'content-type: application/json' \\
  -d '{
    "title": "Checkout returns 500",
    "text": "500s since 09:12 on POST /checkout",
    "url": "https://grafana.example.com/d/checkout",
    "id": "checkout-500"
  }'`;
</script>

<template>
  <main class="wide landing">
    <AppMasthead />

    <header class="hero">
      <h1>
        Errors, alerts and email,
        <span class="turn">arriving as work an agent can take.</span>
      </h1>
      <p class="lede">
        Point Sentry, PostHog, an email or your own code at Passalong and each one becomes a guide:
        a task, a bug or a transfer, with what was sent quoted in it. Tasks wait as Drafts until a
        person marks them Ready, so nothing reaches an agent that nobody chose.
      </p>
    </header>

    <div class="rails">
      <section>
        <h2>Your addresses</h2>
        <div class="say">
          <p>
            In the hub, open <b>Settings → Integrations</b> and choose <b>Get your addresses</b>. You
            get one key, written two ways: email addresses like
            <code>key+bug@in.passalong.dev</code> and webhook URLs like
            <code>https://passalong.dev/v1/in/key/bug</code>. The end of each says what it makes.
            To put what arrives on a team's board, name the team: <code>key+bug+team@…</code> or
            <code>…/v1/in/key/bug?team=team</code>; the hub's copies already carry the team you are in.
          </p>
          <dl class="kinds">
            <template v-for="k in KINDS" :key="k.name">
              <dt>{{ k.name }}</dt>
              <dd>{{ k.note }}</dd>
            </template>
          </dl>
          <p>
            Mail to the bare <code>key@</code> states no kind and is dropped. <b>New addresses</b>
            replaces the key, and every old address and URL stops working at once.
          </p>
        </div>
      </section>

      <section>
        <h2>Email</h2>
        <div class="say">
          <p>
            Give an address to anything that sends email — an uptime monitor, a form, a colleague — or
            add it as a BCC where your backend sends mail. To pass on one email, forward it from your
            own address. For mail you cannot change, forward it from Gmail: add the address under
            <b>Settings → Forwarding</b>; Gmail's confirmation code shows up in Integrations as a
            sender, and a filter does the rest.
          </p>
          <p>
            A sender's first email makes nothing. It appears under <b>Asking to email you guides</b>,
            with a notification, until you allow or block it. Mail from your own confirmed address
            is allowed from the start. Nothing is ever bounced.
          </p>
        </div>
      </section>

      <section>
        <h2>Sentry</h2>
        <div class="say">
          <p>
            In Sentry, open <b>Settings → Developer Settings → Custom Integrations</b> and create an
            <b>Internal Integration</b>. Paste your Bug URL as its <b>Webhook URL</b>. Under
            <b>Webhooks</b>, tick <b>issue</b> for every new issue, or turn on <b>Alert Rule
            Action</b> and add the integration to an alert rule to send only what the rule picks.
          </p>
          <dl class="kinds">
            <template v-for="s in SENTRY" :key="s.name">
              <dt>{{ s.name }}</dt>
              <dd>{{ s.note }}</dd>
            </template>
          </dl>
          <p>
            The guide quotes the issue's title, level, culprit, project and link. Ignored events
            still get a 200, because Sentry turns off a webhook that keeps failing.
          </p>
        </div>
      </section>

      <section>
        <h2>PostHog</h2>
        <div class="say">
          <p>
            In PostHog, open <b>Error tracking → Configuration → Alerting</b>, add an
            <b>HTTP Webhook</b> for issues created, paste your Bug URL and leave the body as it is.
            Use <b>Test function</b>, then <b>Create &amp; enable</b>. A destination that sends
            <code>$exception</code> events works the same way. One PostHog issue stays one guide.
          </p>
        </div>
      </section>

      <section>
        <h2>Your own code</h2>
        <div class="say">
          <p>
            POST JSON to a URL. Only <code>title</code> is required. Send the same <code>id</code>
            again and it adds to the open guide instead of making a new one; without an
            <code>id</code>, the same title with different numbers counts as the same thing.
          </p>
          <pre><code>{{ CURL }}</code></pre>
          <p>
            An unknown key or kind answers 404, a body that is not JSON 400, and anything over 1 MB
            413.
          </p>
        </div>
      </section>

      <section>
        <h2>Which repo a task is for</h2>
        <div class="say">
          <p>
            An agent asking for work with no id is only offered tasks for the repo it is in, so a
            task needs one before an agent finds it on its own. Add <code>?repo=owner/repo</code> to
            a task URL — one Sentry or PostHog project per repo — and its tasks arrive pointed at it.
            Otherwise choose the repo when you mark the task Ready: its page suggests the repos your
            tasks and agents already use. Add <code>?team=&lt;slug&gt;</code> to any URL to put what
            arrives on that team's board; without it, it is yours alone. A task with no repo is still taken when an agent is given
            its id.
          </p>
        </div>
      </section>

      <section>
        <h2>What it will and will not do</h2>
        <div class="say">
          <ul>
            <li>
              What was sent is quoted as evidence, never as instructions, and it cannot add a
              <code>Steps</code> section of its own.
            </li>
            <li>
              Repeats of a task or a bug add to the open one: a count, and at most one note an hour
              on its thread. A transfer is always new.
            </li>
            <li>
              The key in the address is the credential. Sentry's request signature is not checked
              yet; replace the key if one leaks.
            </li>
          </ul>
        </div>
      </section>
    </div>

    <AppFoot />
  </main>
</template>
