<!--
  What Passalong collects, why, who else touches it, and what you can ask for.

  Every claim here is one the code keeps, and the place it is kept is named beside the section, so
  a change there is a change here: analytics (apps/api/src/analytics.ts), the reader
  (apps/api/src/reader.ts), push (apps/api/src/webpush.ts), passwords (apps/api/src/auth.ts),
  cookies (auth.ts `pa_session`, app.vue `theme`), payments (apps/api/src/billing.ts).

  Script-free: route rule `/privacy` is `noScripts` with the strict CSP, like /faq.
-->
<script setup lang="ts">
import { APEX } from "#api/hosts";
import { publicPage } from "#shared/pages";

const self = publicPage("/privacy");

usePage({
  title: "Privacy policy · Passalong",
  description:
    "What Passalong collects, why it needs it, who else handles it, and how to see, export or delete yours.",
  url: `${APEX}${self.path}`,
  image: `${APEX}/og.png`,
  noindex: self.draft,
});

const CONTACT = "support@passalong.dev";
</script>

<template>
  <main class="wide landing">
    <AppMasthead />

    <header class="hero">
      <h1>Privacy policy</h1>
      <p class="lede">
        What we collect, why, who else handles it, and how to get yours back or gone. Last changed
        {{ self.updated }}.
      </p>
    </header>

    <div class="rails legal">
      <section>
        <h2>Who we are</h2>
        <div class="say">
          <p>
            Passalong (passalong.dev) keeps a team's work and what it knows, for people and the AI
            agents they use. It is run by <a href="https://kreativekorna.com"><strong>KreativeKorna Concepts</strong></a>, which is
            responsible for the data described here. Write to
            <a :href="`mailto:${CONTACT}`">{{ CONTACT }}</a> about anything on this page.
          </p>
        </div>
      </section>

      <section>
        <h2>What we collect</h2>
        <div class="say">
          <ul>
            <li>
              <strong>Your account:</strong> your email address, handle and display name, and your
              password as a salted hash. We never store the password itself.
            </li>
            <li>
              <strong>What you put in:</strong> work, notes, replies, proof of finished work,
              project documents, and images or screenshots you or your agents attach.
            </li>
            <li>
              <strong>What is sent to your addresses:</strong> emails and webhooks that arrive at
              the addresses Passalong gives your team, such as a customer's message and their email
              address, or an alert from a monitoring tool.
            </li>
            <li>
              <strong>Connections:</strong> the agent tokens you create, the apps you sign in to
              Passalong with (such as Claude or ChatGPT), and the browser push subscriptions you
              turn on. Tokens are stored as hashes.
            </li>
            <li>
              <strong>Billing:</strong> which plan you or your team is on, until when, and the
              subscription's reference. Card details go to our payment provider and never reach us.
            </li>
            <li>
              <strong>Technical:</strong> your IP address is used for a moment to limit how often
              sign-in and similar requests can be made, and is not stored with your account. Our
              host keeps short-lived request logs to run and secure the service. We note which
              client (CLI, MCP or hub) and version made a change.
            </li>
          </ul>
        </div>
      </section>

      <section>
        <h2>What we use it for</h2>
        <div class="say">
          <p>
            To run Passalong: show your work to the people you share it with, tell you and your team
            what happened by email, push and in the hub, take payment for plans, and keep accounts
            secure. We use it because you asked for the service (our contract with you), and for
            security and abuse prevention (our legitimate interest).
          </p>
          <p>
            We do not sell your data, show ads, or use your work to train AI models.
          </p>
        </div>
      </section>

      <section>
        <h2>AI</h2>
        <div class="say">
          <p>
            When a message or note comes in, a small AI model reads its text to suggest a title, a
            summary, a tag and which group should act on it. That text is sent to our AI model
            provider through its API for that purpose only. What the model suggests is checked
            before it is used, and it never rewrites what was said.
          </p>
          <p>
            The agents you connect (Claude, ChatGPT, Codex and others) read and write your work
            because you connected them. What they do with it is governed by your agreement with
            whoever runs them.
          </p>
        </div>
      </section>

      <section>
        <h2>Who else handles it</h2>
        <div class="say">
          <ul>
            <li><strong>Cloudflare:</strong> hosting, the database, file storage, and sending email.</li>
            <li><strong>Bachs:</strong> payments and subscriptions.</li>
            <li><strong>Our AI model provider:</strong> reading incoming text, as above.</li>
            <li>
              <strong>Aptabase:</strong> product analytics, sent from our server, never from your
              browser. Only the names of events go, such as "work finished": never an id, an email,
              a name, a title or an address.
            </li>
            <li>
              <strong>Your browser's push service</strong> (Apple, Google or Mozilla), when you turn
              on notifications. The notification is encrypted so the push service cannot read it.
            </li>
            <li>
              <strong>Have I Been Pwned:</strong> when you set a password, the first five characters
              of its hash are checked against known leaks. The password itself never leaves us.
            </li>
          </ul>
          <p>
            Inside Passalong, work you put in a team is seen by that team. A share link can be read
            by anyone who has it, which is what it is for. We will disclose data if the law requires
            it, and only as much as it requires.
          </p>
        </div>
      </section>

      <section>
        <h2>Your customers' data</h2>
        <div class="say">
          <p>
            When a team uses Passalong for support, the messages its customers send belong to that
            team, which decides what happens to them. We handle them on the team's behalf. A
            customer who wants their data seen or removed should ask the team they wrote to; we will
            help the team do it.
          </p>
        </div>
      </section>

      <section>
        <h2>Cookies</h2>
        <div class="say">
          <p>
            Two, both ours and both needed for the thing you asked for: <code>pa_session</code>
            keeps you signed in for up to 30 days, and <code>theme</code> remembers light or dark.
            No advertising or tracking cookies, and no third-party scripts on our pages.
          </p>
        </div>
      </section>

      <section>
        <h2>How long we keep it</h2>
        <div class="say">
          <p>
            For as long as your account exists. Archived and finished work stays until it or the
            account is deleted, because it is the record your team looks back at. Sign-ins expire
            after 30 days and upload links after ten minutes. When you ask us to delete your
            account, we do so within 30 days, except billing records the law requires us to keep.
          </p>
        </div>
      </section>

      <section>
        <h2>What you can ask for</h2>
        <div class="say">
          <p>
            You can see and change your details in Settings, and export every piece of work you can
            read as markdown with the CLI or the API. To have your account deleted, or to ask what
            we hold about you, write to <a :href="`mailto:${CONTACT}`">{{ CONTACT }}</a> from the
            address on your account.
          </p>
          <p>
            Depending on where you live (for example under the GDPR, the UK GDPR or Nigeria's Data
            Protection Act), you also have the right to object, to restrict how your data is used,
            and to complain to your data protection authority. We would rather hear from you first.
          </p>
        </div>
      </section>

      <section>
        <h2>Where it is kept</h2>
        <div class="say">
          <p>
            Our providers run around the world, so your data may be handled outside your country.
            Where the law asks for safeguards on that, we rely on our providers' standard
            contractual terms.
          </p>
        </div>
      </section>

      <section>
        <h2>Children</h2>
        <div class="say">
          <p>Passalong is for work, and not for anyone under 16.</p>
        </div>
      </section>

      <section>
        <h2>Changes</h2>
        <div class="say">
          <p>
            When this page changes, the date at the top changes. If a change matters to how your
            data is used, we will email account holders before it takes effect.
          </p>
        </div>
      </section>
    </div>

    <AppFoot />
  </main>
</template>
