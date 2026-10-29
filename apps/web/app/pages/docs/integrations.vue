<!--
  Integrations, for people: turning email, Sentry, PostHog and any JSON webhook into work.
  public/llms.txt "Work from email and webhooks" is the same material written for an agent.

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
  title: "Passalong integrations — email, Sentry and PostHog into work",
  description:
    "Turn errors from Sentry and PostHog, emails, customer mail and your own webhooks into Passalong work an AI coding agent can take.",
  url: `${APEX}${self.path}`,
  image: `${APEX}/og.png`,
  noindex: self.draft,
});

/** The two email addresses, and the one webhook URL. */
const ADDRESSES = [
  {
    name: "key+new@",
    note: "Anything: an alert, a forwarded email, a screenshot shared from a phone. The reader names it and sends it to the right group.",
  },
  {
    name: "key+support@",
    note: "Your customers. Anyone may write; each request gets a tracking number, and you answer from the work in the hub.",
  },
  {
    name: "/v1/in/key",
    note: "The webhook URL, for Sentry, PostHog and your own code. Sorted the same way as email.",
  },
];

/** What a Sentry webhook makes work from, and what it ignores. */
const SENTRY = [
  {
    name: "issue",
    note: "Created, or unresolved (it came back). One piece of work per Sentry issue.",
  },
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

const CURL = `curl -X POST "https://passalong.dev/v1/in/<key>?repo=acme/api" \\
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
        Point Sentry, PostHog, an email or your own code at Passalong and each one becomes a piece
        of work, with what was sent quoted in it. The reader gives it a title, a summary and a label
        such as bug, and sends it to the group that should act. It arrives Ready, so whoever it is
        for can take it at once.
      </p>
    </header>

    <div class="rails">
      <section>
        <h2>Your addresses</h2>
        <div class="say">
          <p>
            In the hub, open <b>Settings → Integrations</b> and choose <b>Get your addresses</b>. You
            get one key, written three ways: <code>key+new@in.passalong.dev</code>,
            <code>key+support@in.passalong.dev</code> and the webhook URL
            <code>https://passalong.dev/v1/in/key</code>. To put what arrives on a team's board, name
            the team: <code>key+new+team@…</code> or <code>…/v1/in/key?team=team</code>, with
            <code>&amp;to=@handle</code> or <code>#group</code> if you like; the hub's copies already
            carry the team you are in.
          </p>
          <dl class="kinds">
            <template v-for="k in ADDRESSES" :key="k.name">
              <dt>{{ k.name }}</dt>
              <dd>{{ k.note }}</dd>
            </template>
          </dl>
          <p>
            Mail to the bare <code>key@</code>, or any other <code>+word</code>, is dropped.
            <b>New addresses</b> replaces the key, and every old address and URL stops working at
            once.
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
            A sender's first email to <code>+new</code> makes nothing. It appears under
            <b>Asking to email you work</b>, with a notification, until you allow or block it. Mail
            from your own confirmed address is allowed from the start. Nothing is ever bounced.
          </p>
          <p>
            <code>+support</code> is different, on purpose: it is where your customers write, so
            every sender is let in. Forward your support inbox to it. Each customer gets an email
            with a tracking number, and a reply carrying it joins the same request. Nothing goes
            back to a customer until a person presses Send.
          </p>
        </div>
      </section>

      <section>
        <h2>Sentry</h2>
        <div class="say">
          <p>
            In Sentry, open <b>Settings → Developer Settings → Custom Integrations</b> and create an
            <b>Internal Integration</b>. Paste your webhook URL as its <b>Webhook URL</b>. Under
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
            The work quotes the issue's title, level, culprit, project and link. Ignored events
            still get a 200, because Sentry turns off a webhook that keeps failing.
          </p>
        </div>
      </section>

      <section>
        <h2>PostHog</h2>
        <div class="say">
          <p>
            In PostHog, open <b>Error tracking → Configuration → Alerting</b>, add an
            <b>HTTP Webhook</b> for issues created, paste your webhook URL and leave the body as it is.
            Use <b>Test function</b>, then <b>Create &amp; enable</b>. A destination that sends
            <code>$exception</code> events works the same way. One PostHog issue stays one piece of work.
          </p>
        </div>
      </section>

      <section>
        <h2>Your own code</h2>
        <div class="say">
          <p>
            POST JSON to a URL. Only <code>title</code> is required. Send the same <code>id</code>
            again and it adds to the open work instead of making a new one; without an
            <code>id</code>, the same title with different numbers counts as the same thing.
          </p>
          <pre><code>{{ CURL }}</code></pre>
          <p>
            An unknown key answers 404, a body that is not JSON 400, and anything over 1 MB
            413.
          </p>
        </div>
      </section>

      <section>
        <h2>Which repo it is for</h2>
        <div class="say">
          <p>
            An agent asking for work with no id is only offered work for the repo it is in, so work
            needs one before an agent finds it on its own. Add <code>?repo=owner/repo</code> to the
            URL — one Sentry or PostHog project per repo — and what it sends arrives pointed at it.
            Otherwise choose the repo on the work's page, which suggests the repos your work and
            agents already use. Add <code>?team=&lt;slug&gt;</code> to put what arrives on that
            team's board; without it, it is yours alone. Work with no repo is still taken when an
            agent is given its id.
          </p>
        </div>
      </section>

      <section>
        <h2>What it will and will not do</h2>
        <div class="say">
          <ul>
            <li>
              What was sent is quoted into the work by code, as evidence, never as instructions.
            </li>
            <li>
              Repeats add to the open work: a count, and at most one note an hour on its thread.
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
