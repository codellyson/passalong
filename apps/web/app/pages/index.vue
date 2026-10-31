<!--
  The landing page.

  What it does not have any more is a drawn browser window — three traffic-light dots, a fake
  address bar, and a document by a person who does not exist. A picture of software that was never
  photographed is the tell of a template, and it was the loudest thing on the page.

  What replaces it is the artifact itself. Passalong's output is a markdown file, so the page shows
  a markdown file: no chrome, no invented screenshot, nothing claiming to be a photograph of
  anything. The claim underneath it — plain markdown, exportable — is then something the reader has
  already seen rather than something they are asked to believe.

  Everything else is typography and space, which is all this page needs and all its CSP allows: the
  route rule is `noScripts` with `default-src 'none'`, so there is no embed, no third-party font and
  no script here, and there never will be.
-->
<script setup lang="ts">
import { APEX } from "#api/hosts";
import { isPublic } from "#shared/pages";

/** The closer points at the docs once they are written, and not before. */
const docsPublished = isPublic("/docs");

usePage({
  // Long enough to be worth a search result. "Passalong" alone was nine characters, which spends
  // none of the space a result gets and says nothing to somebody who has not heard of it.
  // Under ~60 characters: longer than that and a search result cuts it mid-phrase.
  title: "Passalong — everything your team gets, sorted and closed",
  // Under 125, because previews truncate around there and a sentence cut mid-clause reads as a
  // page that did not think about being shared. This one ends where it means to.
  description:
    "Requests, bugs, alerts and customer emails sorted to the right person. Your agents know the product. Nothing gets dropped.",
  // Absolute, because a crawler resolves nothing. Without it every link to the product unfurled as
  // a bare text row: no image, and `summary` rather than `summary_large_image`, which usePage
  // switches on the moment there is something to show. The apex rather than the serving host, so
  // the legacy host's copy of this page points at the same card and the same canonical.
  image: `${APEX}/og.png`,
  url: `${APEX}/`,
});

// The film and the feature loops play on their own, muted and without controls; someone who asked
// for less motion gets the still frame.
onMounted(() => {
  if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  for (const video of document.querySelectorAll<HTMLVideoElement>(".film video, .ideas video")) {
    video.removeAttribute("autoplay");
    video.pause();
  }
});

/**
 * How to reach sales. The page states no price: what is paid for is the team — the board, who holds
 * what, and the hub — and a free account is enough to try it.
 */
const PRICING = {
  /** Plain mailto: this page runs no script and its CSP allows none, so a form is not an option. */
  contact: "contact@passalong.dev",
};

/**
 * What a search engine is told about the product, as JSON-LD.
 *
 * A data block rather than script: browsers never execute it, so the landing's CSP, which allows no script
 * at all, is untouched — and server/plugins/csp.ts knows not to count it as one.
 *
 * Only what the page itself says. No ratings or reviews: there are none to cite.
 */
const STRUCTURED = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": `${APEX}/#organization`,
      name: "Passalong",
      url: `${APEX}/`,
      logo: `${APEX}/icon-512.png`,
      email: PRICING.contact,
      sameAs: [
        "https://www.npmjs.com/package/passalong",
        "https://github.com/codellyson/passalong",
      ],
    },
    {
      "@type": "WebSite",
      "@id": `${APEX}/#website`,
      name: "Passalong",
      url: `${APEX}/`,
      publisher: { "@id": `${APEX}/#organization` },
    },
    {
      "@type": "SoftwareApplication",
      "@id": `${APEX}/#software`,
      name: "Passalong",
      url: `${APEX}/`,
      description:
        "Keeps a small team's work and what it knows, for people and their agents. Requests, emails, alerts and customer messages are sorted to the right person or group; each project's documents tell any agent about the product; work is taken by one agent at a time and handed in with evidence; customer replies are drafted and sent by a person. A hub, a CLI and an MCP server.",
      applicationCategory: "BusinessApplication",
      operatingSystem: "macOS, Linux, Windows",
      publisher: { "@id": `${APEX}/#organization` },
      offers: [
        {
          "@type": "Offer",
          name: "Free",
          description: "A free account, holding up to 25 pieces of work.",
          price: 0,
          priceCurrency: "USD",
        },
      ],
    },
  ],
};
useHead({ script: [{ type: "application/ld+json", innerHTML: JSON.stringify(STRUCTURED) }] });

/**
 * A number from real use, for the proof line under the specimen — and nothing until there is one.
 * The page states no figure it cannot stand behind: set this from `pnpm metrics` once real
 * use gives one.
 */
const PROOF = null as { figure: string; says: string } | null;
</script>

<template>
  <main class="wide landing">
    <AppMasthead />

    <header class="hero">
      <!-- The claim is the page's heading. What the product is lives in the <title> and the meta
           description, which is where a search engine reads it; the small label that carried it
           here said nothing a reader needed. -->
      <h1>
        Get things done fast.
        <span class="turn">Leave nothing behind.</span>
      </h1>
      <p class="lede">
        Customer emails, bug reports, alerts and requests are sorted to the right person or agent the
        moment they arrive, and followed until they’re done, with proof you can check.
      </p>
      <!-- The first step is the install, not the hub: the product is agent first, and a newcomer has
           no hub yet. No copy button — this page runs no script — so the command is set to select
           in one click. -->
      <p class="ways">
        <code class="install"><span>npm i -g passalong &amp;&amp;</span> <span>passalong setup</span></code>
        <a class="quiet" href="/hub">or open your hub</a>
      </p>
      <p class="works">
        Passalong never hosts your agent. Bring your own: Claude Code and Codex on your machine,
        ChatGPT and Claude as a connector, or any other MCP client. <a href="/connect">How to connect</a>
      </p>
    </header>

    <!-- The launch film plays the hero's promise in 35 seconds. It replaced the interactive story that sat here,
         which told a third version of the same request; the feature loops below carry the detail. -->
    <figure class="film">
      <video
        autoplay
        muted
        loop
        playsinline
        preload="metadata"
        poster="/media/passalong-launch-poster.jpg"
        aria-describedby="film-says"
      >
        <source src="/media/passalong-launch.mp4" type="video/mp4" />
      </video>
      <figcaption id="film-says">
        Everything your team gets lands at once and some of it gets dropped;
        Passalong catches all of it, sends each request to the right person or their AI agent, follows
        it until it is done with proof, and leaves what reaches customers to your people.
      </figcaption>
    </figure>

    <p v-if="PROOF" class="proof"><b>{{ PROOF.figure }}</b> {{ PROOF.says }}</p>

    <!--
      The five ideas of docs/LOOP.md §0, told as what happens to one thing that comes in, in order:
      it arrives, it is sorted, the project tells the agent what it needs to know, the work is done
      and shown, and a customer hears back. A register rather than numbered cards: the headings
      carry the order, and every sentence is something the product does today.
    -->
    <section class="ideas" aria-labelledby="ideas-h">
      <h2 id="ideas-h">
        Everything that comes in
        <span class="turn">ends somewhere.</span>
      </h2>
      <article>
        <div class="idea-text">
          <h3>Things come in</h3>
        <p>
          A line in the hub’s box, a forwarded email, a screenshot sent from your phone, an alert
          from a webhook, a customer writing to your support address. Each one becomes work, in one
          place.
        </p>
        </div>
        <video
          class="clip"
          src="/media/features/things-come-in.mp4"
          poster="/media/features/things-come-in.jpg"
          autoplay
          muted
          loop
          playsinline
          preload="metadata"
          aria-label="Five ways in, each turned into the same piece of work"
        ></video>
      </article>
      <article>
        <div class="idea-text">
          <h3>Passalong’s agent sorts it</h3>
        <p>
          It reads each one, pictures included, and gives it a title and a sentence anyone can read.
          It sends it to the person or group who should act, into its project when it can tell, and
          when it is unsure it says what is worth checking.
        </p>
        </div>
        <video
          class="clip"
          src="/media/features/agent-sorts-it.mp4"
          poster="/media/features/agent-sorts-it.jpg"
          autoplay
          muted
          loop
          playsinline
          preload="metadata"
          aria-label="A messy email turned into a titled card, sent to Accounts in the Web app project, with one thing worth checking"
        ></video>
      </article>
      <article>
        <div class="idea-text">
          <h3>Projects remember the product</h3>
        <p>
          One project per product. Its documents say what the product is, who uses it, the words
          your team uses and how it is built, so any agent can read them before it starts. What an
          agent learns goes back into them, and every version is kept.
        </p>
        </div>
        <video
          class="clip"
          src="/media/features/projects-remember.mp4"
          poster="/media/features/projects-remember.jpg"
          autoplay
          muted
          loop
          playsinline
          preload="metadata"
          aria-label="An agent reads the Web app project's documents, writes a line back, and the version goes from 4 to 5"
        ></video>
      </article>
      <article>
        <div class="idea-text">
          <h3>Work gets done, and shown</h3>
        <p>
          One agent holds it at a time. It reports as it goes, asks you when it needs an answer, and
          hands in with evidence: a screenshot, or the command it ran and what came back. Work
          nobody takes, or an agent gone quiet, reaches a person. If it is not right, reopen it with
          a reason the next agent reads first.
        </p>
        </div>
        <video
          class="clip"
          src="/media/features/work-done-shown.mp4"
          poster="/media/features/work-done-shown.jpg"
          autoplay
          muted
          loop
          playsinline
          preload="metadata"
          aria-label="An agent reports, asks a question, gets an answer, and hands in with a screenshot"
        ></video>
      </article>
      <article>
        <div class="idea-text">
          <h3>Customers get one conversation</h3>
        <p>
          A customer’s messages are one thread, and one conversation in their inbox, with a tracking
          number. The agent drafts the reply; a person reads it and presses Send. A customer left
          waiting is flagged before they are forgotten.
        </p>
        </div>
        <video
          class="clip"
          src="/media/features/one-conversation.mp4"
          poster="/media/features/one-conversation.jpg"
          autoplay
          muted
          loop
          playsinline
          preload="metadata"
          aria-label="One thread with a tracking number; a reply the agent drafted is sent by a person, and the waiting flag clears"
        ></video>
      </article>
    </section>

    <!-- Who it is for (PRODUCT.md, Users): three peers, because the product only works when all
         three are in it. -->
    <section class="for" aria-labelledby="for-h">
      <h2 id="for-h">
        For the whole team,
        <span class="turn">terminal or not.</span>
      </h2>
      <div>
        <article>
          <h3>Leads of small teams</h3>
          <p>
            One page in the morning: what needs you, which customers are waiting, what is stuck.
            One board for everyone, people and agents alike.
          </p>
        </article>
        <article>
          <h3>Developers with agents</h3>
          <p>
            Your agents take work, read the project’s documents, report as they go and hand in with
            evidence. Run <code>passalong work</code> and they work through what is ready.
          </p>
        </article>
        <article>
          <h3>Support, marketing, everyone else</h3>
          <p>
            Nothing to install and no terminal. Write in the hub’s box, forward an email, send a
            screenshot from your phone, and answer customers from the hub.
          </p>
        </article>
      </div>
    </section>

    <section class="statement">
      <h2>
        One board for the team.<br>
        <span class="turn">Everyone sees who has what.</span>
      </h2>
      <p>
        Draft, To do, In progress and Done, with To do grouped under who each piece is for. Anyone
        on the team can give work to someone else, stop an agent or reopen what is finished. If a
        second agent reaches for work someone already holds, it’s told who and stops, instead of
        doing it twice.
      </p>
    </section>

    <!-- The questions that decide whether this is worth installing, answered in a sentence or two
         each. Every answer is true of the product today. -->
    <section class="faq" aria-labelledby="faq-h">
      <h2 id="faq-h">Before you install it</h2>
      <dl>
        <div>
          <dt>Does Passalong run my agents?</dt>
          <dd>
            No. Passalong never hosts your agent: yours run where they run now, on your machine and
            in your repos. Passalong’s own agent only sorts what comes in and drafts replies to
            customers.
          </dd>
        </div>
        <div>
          <dt>Why not Linear or GitHub Issues?</dt>
          <dd>
            A ticket waits for a person. Here, what comes in is sorted to someone as it arrives, an
            agent takes the work with the project’s documents to read, and it comes back with the
            evidence.
          </dd>
        </div>
        <div>
          <dt>What if two agents grab the same work?</dt>
          <dd>Only one can take it. The other is told who has it.</dd>
        </div>
        <div>
          <dt>Do my support and marketing people need a terminal?</dt>
          <dd>
            No. They work in the hub: the box, email, a screenshot from their phone, and the
            customer’s thread. Nothing is installed for them.
          </dd>
        </div>
        <div>
          <dt>Does the agent ever write to a customer on its own?</dt>
          <dd>No. It drafts the reply. Nothing reaches a customer until a person presses Send.</dd>
        </div>
        <div>
          <dt>Am I locked in?</dt>
          <dd>Work is plain markdown, and you can export all of it at any time.</dd>
        </div>
      </dl>
    </section>

    <!-- No price on the page: the team plan is a conversation. -->
    <section class="pricing" aria-label="What it costs">
      <h2>
        Free to start.<br>
        <span class="turn">Paid when your team shares the work.</span>
      </h2>
      <p class="note">
        A free account holds up to 25 pieces of work in your hub, so you can watch one move before
        you decide anything.
      </p>

      <!-- One card, and the way to it. -->
      <div class="tiers">
        <article>
          <h3>Team</h3>
          <p class="figure">Talk to us</p>
          <p>
            <b>One subscription covers the whole team.</b> Hand work to a person, to the group that
            does that kind of work, or to anyone’s agents, and answer customers from the same place.
          </p>
          <p class="ask">
            <a class="btn" :href="`mailto:${PRICING.contact}`">Contact sales</a>
          </p>
          <p class="more">A larger team, a procurement process, or a question this does not answer.</p>
        </article>
      </div>
    </section>

    <section class="closer">
      <h2>
        Everything in one place.<br>
        <span class="turn">Nothing left behind.</span>
      </h2>
      <p class="ways">
        <a class="go" href="/hub">Open your hub</a>
        <a class="quiet" href="/connect">or connect your tools</a>
      </p>
      <!-- The install line lives here rather than in a panel of its own. Handing work out takes one
           install; reading what comes back takes nothing at all, and that asymmetry is the product. -->
      <p class="reassure">
        Your agents run where they always have, on your machine and in your repos. Passalong holds
        the work, what your team knows and what came back. Reading a share link needs nothing
        installed.
        <template v-if="docsPublished"><a href="/docs">The docs</a> cover the rest.</template>
      </p>
    </section>

    <AppFoot />
  </main>
</template>
