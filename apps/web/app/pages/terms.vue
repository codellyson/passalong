<!--
  The terms of using Passalong. The plans and limits stated here are the ones the code enforces:
  prices from the FAQ, the free limit from FREE_SYNC_LIMIT (wrangler.jsonc), a lapsed team taking
  no new work from acceptsNewWork() in apps/api/src/quota.ts. Change one, change this.

  Script-free: route rule `/terms` is `noScripts` with the strict CSP, like /faq.
-->
<script setup lang="ts">
import { APEX } from "#api/hosts";
import { publicPage } from "#shared/pages";

const self = publicPage("/terms");

usePage({
  title: "Terms of service · Passalong",
  description:
    "The terms of using Passalong: your account, your work, plans and payment, and what each of us is responsible for.",
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
      <h1>Terms of service</h1>
      <p class="lede">
        The agreement between you and Passalong when you use it. Last changed {{ self.updated }}.
      </p>
    </header>

    <div class="rails legal">
      <section>
        <h2>The agreement</h2>
        <div class="say">
          <p>
            These terms are between you and <a href="https://kreativekorna.com"><strong>KreativeKorna Concepts</strong></a> ("we"), which
            runs Passalong at passalong.dev. By creating an account or using Passalong you agree to
            them, and to how we handle data as our <a href="/privacy">privacy policy</a> says. If
            you use Passalong for an organisation, you agree for it and confirm you may.
          </p>
          <p>
            The <code>passalong</code> CLI and MCP server published on npm are open source under
            their own licence. These terms cover the hosted service.
          </p>
        </div>
      </section>

      <section>
        <h2>Your account</h2>
        <div class="say">
          <ul>
            <li>You must be at least 16, and give us an email address that is yours.</li>
            <li>Keep your password and agent tokens secret. Anything done with them is done by you.</li>
            <li>
              The agents you connect act for you. You are responsible for what they send, take and
              hand in, as if you had done it yourself.
            </li>
          </ul>
        </div>
      </section>

      <section>
        <h2>Your work</h2>
        <div class="say">
          <p>
            What you put in Passalong stays yours. You give us permission to store it, process it
            and show it to the people and agents you share it with, only so that Passalong can work,
            including having an AI model read incoming messages as the privacy policy describes.
          </p>
          <p>
            A share link can be read by anyone who has it. Work in a team is seen by that team, and
            the team's admins manage its members, its settings and its plan.
          </p>
        </div>
      </section>

      <section>
        <h2>What you may not do</h2>
        <div class="say">
          <ul>
            <li>Put in anything unlawful, or anything you have no right to share.</li>
            <li>Use Passalong to send spam, including through the replies it sends to customers.</li>
            <li>Upload malware, or try to get into accounts, teams or work that are not yours.</li>
            <li>Get around plan limits or rate limits, or overload the service on purpose.</li>
            <li>Resell the hosted service without our written agreement.</li>
          </ul>
        </div>
      </section>

      <section>
        <h2>AI makes mistakes</h2>
        <div class="say">
          <p>
            Titles, summaries and routing suggested by the AI model, and the work your agents do,
            can be wrong. Check what matters before you rely on it.
          </p>
        </div>
      </section>

      <section>
        <h2>Plans and payment</h2>
        <div class="say">
          <ul>
            <li>
              The free plan keeps up to 25 pieces of your Ready work at a time. Work in a team on a
              paid plan is covered by that team's plan and does not count. We may change free
              limits, and will tell you before we lower yours.
            </li>
            <li>
              Solo is $5 a month for one person. Team is $20 a month for a team of up to ten people.
              Payment is taken by our payment provider, Bachs, and plans renew each month until
              cancelled.
            </li>
            <li>
              You can cancel at any time. The plan runs to the end of the month you paid for and
              does not renew. We do not refund part-months, except where the law says we must.
            </li>
            <li>
              A plan we give you for free ends on the date we gave it until, unless you then choose
              a paid plan.
            </li>
            <li>
              When a team's plan ends, everything already in the team stays readable and can still
              be answered, but the team takes no new work until a plan is chosen again.
            </li>
            <li>We will tell you at least 30 days before a price you pay goes up.</li>
          </ul>
        </div>
      </section>

      <section>
        <h2>Ending</h2>
        <div class="say">
          <p>
            You can stop using Passalong at any time, and ask us to delete your account. We may
            suspend or close an account that breaks these terms, telling you why unless the law or
            the risk to others stops us. Before we close an account for any reason other than abuse,
            we will give you a chance to export your work.
          </p>
        </div>
      </section>

      <section>
        <h2>The service as it is</h2>
        <div class="say">
          <p>
            We work to keep Passalong running and your work safe, but we provide it as it is,
            without promises that it will always be available or free of errors. Keep your own
            copies of anything you cannot afford to lose; the export is there for that.
          </p>
          <p>
            As far as the law allows, we are not liable for indirect or consequential losses, such
            as lost profit or lost data, and our total liability to you is limited to what you paid
            us in the 12 months before the claim, or $50 if that is more. Nothing here limits
            liability the law does not allow us to limit.
          </p>
          <p>
            If your use of Passalong in breach of these terms leads to a claim against us, you will
            cover our reasonable costs of it.
          </p>
        </div>
      </section>

      <section>
        <h2>Changes</h2>
        <div class="say">
          <p>
            When these terms change, the date at the top changes. For a change that matters, we
            will email account holders at least 30 days before it takes effect. Using Passalong
            after that means you accept the new terms.
          </p>
        </div>
      </section>

      <section>
        <h2>Law and contact</h2>
        <div class="say">
          <p>
            These terms are governed by the laws of the Federal Republic of Nigeria, and its
            courts settle any dispute we cannot resolve together. If you are a consumer, you keep
            the protections of the country you live in. Questions go to
            <a :href="`mailto:${CONTACT}`">{{ CONTACT }}</a>.
          </p>
        </div>
      </section>
    </div>

    <AppFoot />
  </main>
</template>
