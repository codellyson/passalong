<!--
  How to reach Passalong from whatever you already work in.

  Three rails, and the difference is transport rather than vendor: anything that can run a local
  process gets the MCP server over stdio, anything that adds remote MCP servers gets a URL, and
  anything that speaks HTTP gets the API and the document describing it. They are listed in that
  order because it is the order of how well they work, and the lede says so.

  This page has twice said something untrue about ChatGPT — first steps for the custom-GPT Actions
  flow, which no longer exists, then that there was nothing to paste into the MCP dialog, which
  stopped being true when the endpoint shipped. What stays true is the shape of the answer: what a
  tool can do here is decided by how it talks, not by whose tool it is.

  A third time, the other way round: it went on saying a client that signs in only with OAuth could
  not connect, after the OAuth flow and the hub's connector form had shipped — and it never said
  what Claude's callback URL is, which is the one field that form cannot be filled in without. It
  also counted the tools, and the count went stale. They are described now, not numbered.

  Laid out like the landing: sections separated by space and a hairline rather than four bordered
  cards in a grid. A page where every block is a card has no hierarchy left to spend, and this one
  is a list of alternatives — peers, which read as peers when nothing is boxed.

  Script-free, like the landing and the guide view — its route rule is `noScripts` with the strict
  CSP. Nothing here is interactive, so nothing here needs to be.
-->
<script setup lang="ts">
import { APEX } from "#api/hosts";
import { published } from "#shared/pages";

/** The kinds section links the full format once that page is written, and not before. */
const formatPublished = published("/docs/guide-format");

usePage({
  title: "Set up Passalong in Claude Code, Codex, ChatGPT or Claude",
  description:
    "Use Passalong from Claude Code, Codex, ChatGPT, Claude or any HTTP client — what each one can do, and how to set it up.",
  url: `${APEX}/connect`,
  image: `${APEX}/og.png`,
});

/**
 * The page as a HowTo, for a search engine.
 *
 * Only the three routes in, in the order the page argues for them, and only what the page itself
 * says — a step whose text promises more than the section under it is the kind of markup that gets
 * a site's rich results turned off. Built from one array so the two cannot drift.
 *
 * A data block, not script: browsers never execute `application/ld+json`, so this page's CSP, which
 * allows no script at all, is untouched (server/plugins/csp.ts knows not to count it as one).
 */
const WAYS = [
  {
    name: "Run it locally",
    text:
      "Install the CLI with npm i -g passalong and run passalong setup. It registers the MCP " +
      "server over stdio, the capture skill and the Claude Code hooks. For Codex, run codex mcp " +
      "add passalong -- passalong mcp. This is the best of the three: it knows which repo you " +
      "are in, and it works offline.",
  },
  {
    name: "Point it at a URL",
    text:
      "For an assistant that adds remote MCP servers rather than running one, the hosted server " +
      "is at https://passalong.dev/v1/mcp over Streamable HTTP. Authorise it with OAuth, or with " +
      "a token minted in your hub under Settings.",
  },
  {
    name: "Call the API",
    text:
      "Anything that speaks HTTP can use the API directly. GET https://passalong.dev/v1/openapi.json " +
      "describes it, which is what a function-calling setup or a shell script needs. A " +
      "share link's .md needs no account at all.",
  },
];

useHead({
  script: [
    {
      type: "application/ld+json",
      innerHTML: JSON.stringify({
        "@context": "https://schema.org",
        "@type": "HowTo",
        name: "Connect Passalong to your AI coding assistant",
        description:
          "Three ways to reach Passalong: a local MCP server, the hosted MCP server by URL, or the HTTP API.",
        url: `${APEX}/connect`,
        step: WAYS.map((w, i) => ({
          "@type": "HowToStep",
          position: i + 1,
          name: w.name,
          text: w.text,
          url: `${APEX}/connect`,
        })),
      }),
    },
  ],
});
</script>

<template>
  <main class="wide landing">
    <AppMasthead />

    <header class="hero">
      <h1>
        Connect it to what
        <span class="turn">you already use.</span>
      </h1>
      <p class="lede">
        The difference is how your tool talks rather than whose tool it is. Run a local process and
        you get the MCP server over stdio. Add remote MCP servers and there is one at a URL. Speak
        plain HTTP and there is an API with a document describing it. Same tools underneath, same
        tokens.
      </p>
    </header>

    <div class="rails">
      <section>
        <h2>Run it locally</h2>
        <div class="say">
          <p>
            For Claude Code, Codex and other coding agents, and worth doing where you can: a local
            server works offline, reads and writes
            <code>.passalong/</code> in the repo you are standing in, and knows which repo that is.
            <code>passalong setup</code> wires Claude Code for you, and Codex takes one command.
            Anything else runs the command <code>passalong</code> with the argument
            <code>mcp</code>.
          </p>
          <pre><code>npm i -g passalong
passalong login
passalong setup                           # Claude Code: skill, MCP server and hooks
codex mcp add passalong -- passalong mcp  # Codex</code></pre>
        </div>
      </section>

      <section>
        <h2>Point it at a URL</h2>
        <div class="say">
          <p>
            Claude, ChatGPT and any assistant with MCP connectors add outside tools as MCP
            servers reached over a URL. Paste
            this as the server URL. You get every tool that does not need a working directory: take
            work, report progress, hand it in or pass it, see your work as a live board where the app
            can draw one, search and read guides,
            your inbox, board and log, publish a guide, and file a set of bugs with their
            screenshots.
          </p>
          <pre><code>https://passalong.dev/v1/mcp</code></pre>
          <!-- Written once, for whichever assistant you use. It read as a Claude page with ChatGPT
               as an afterthought, when every one of them connects the same way. -->
          <p>
            In the assistant you use, open its connector settings, add a custom connector and paste
            that address. If it asks how to sign in, choose OAuth. It opens Passalong and asks you
            to approve, and that is the whole setup — unless the app asks for a client ID, as
            ChatGPT does. Make that in <a href="/hub/settings#apps">your hub</a>, without a secret,
            and paste it back.
          </p>
          <p>
            You can see every app you have approved, and disconnect it, under Connectors in
            <a href="/hub/settings">your hub's settings</a>.
          </p>
          <p>
            <b>Apps that send a header</b> can skip approving and use a token from
            <a href="/hub/settings">your hub</a> — the same named, revocable token the CLI and the
            API use.
          </p>
          <details>
            <summary>Set up a connector manually</summary>
            <p>
              Only for an app that asks you for a client ID instead of taking the address. In
              <a href="/hub/settings">your hub's settings</a>, open "Set up a connector manually",
              give it the app's callback address, and paste the client ID it gives you back into
              the app. Leave "This app keeps a secret" off unless the app demands one.
            </p>
            <p>Claude's callback address, if you set Claude up this way, is:</p>
            <pre><code>https://claude.ai/api/mcp/auth_callback</code></pre>
          </details>
        </div>
      </section>

      <!-- Per assistant, because this is the one thing that does differ by vendor: MCP has no
           standard file input yet, so how an image reaches a tool depends on the client. Each
           route below was checked working before it was written here. -->
      <section id="screenshots">
        <h2>Attach the screenshot</h2>
        <div class="say">
          <p>
            Attach the image in your chat and ask for the bug to be filed with it. The screenshot
            goes into the guide itself, under Problem, so whoever opens the link sees it. How the
            file gets there depends on the assistant.
          </p>
          <p>
            <b>ChatGPT</b> hands the file to Passalong itself. Attach it in ChatGPT on the web; the
            mobile apps send a reference the server cannot download.
          </p>
          <p>
            <b>Claude</b> sends the file from its code sandbox to a one-time upload link. Allow
            <code>passalong.dev</code> in the network settings for Claude's code execution, or the
            sandbox cannot reach it and the upload fails.
          </p>
          <p>
            <b>Claude Code, Codex and other local setups</b> read the image from disk: give the
            agent the file's path.
          </p>
          <p>
            <b>Scripts</b> send the raw bytes with a token, or ask for an upload link and send them
            there with no token at all. The link works once and expires in ten minutes.
          </p>
          <pre><code>curl -H "authorization: Bearer $TOKEN" \
  -H "content-type: image/png" --data-binary @shot.png \
  https://passalong.dev/v1/shots</code></pre>
          <p>
            Either way the answer includes the markdown line that points at the image. Put it in the
            guide, and publishing keeps the file for as long as the guide exists.
          </p>
        </div>
      </section>

      <section>
        <h2>Call the API</h2>
        <div class="say">
          <p>
            <code>/v1/openapi.json</code> describes the API for function calling, an
            internal script, or anything that speaks HTTP and a bearer token. Mint one in
            <a href="/hub/settings">your hub</a>; they are named and revocable.
          </p>
          <pre><code>curl -H "authorization: Bearer $TOKEN" \
  https://passalong.dev/v1/inbox</code></pre>
          <p>
            Reading a guide someone shared needs no account at all — the key in the share link is
            the authorization, and appending <code>.md</code> gives you the document.
          </p>
          <pre><code>curl https://passalong.dev/g/&lt;id&gt;/&lt;key&gt;.md</code></pre>
        </div>
      </section>
    </div>

    <section class="statement">
      <h2>
        A task says do this.
        <span class="turn">A bug says fix this.</span>
      </h2>
      <p>
        Whatever you connect, tell it to read <code>kind</code> before acting — each asks for
        something different, and an agent that confuses them will carefully reproduce a defect and
        report success. Every kind is worked with the same four calls: <b>take</b> it,
        <b>progress</b> at each milestone, <b>hand_in</b> when done, or <b>pass</b> with the reason.
      </p>
      <dl class="kinds">
        <dt>task</dt>
        <dd>
          Work nobody has done yet, and the default. Reach its <b>Goal</b> within its
          <b>Constraints</b>, leave <b>Out of scope</b> alone, and hand in a write-up of how each line
          of <b>Acceptance</b> was checked. Its author approves it or sends it back.
        </dd>
        <dt>transfer</dt>
        <dd>
          Finished work to repeat here. Follow its <b>Steps</b>, run its <b>Verification</b>, and
          hand in whether it held up.
        </dd>
        <dt>bug</dt>
        <dd>
          A defect to fix. <b>Reproduce</b> shows you the problem and is not a procedure to apply;
          <b>Verification</b> is the behaviour that should have happened. A bug report is not broken
          because you reproduced it.
        </dd>
      </dl>
      <p class="caveat">
        Agents that pull a guide through MCP are told this before they see the document, and the
        document says it too — so a tool that fetched a share link over plain HTTP is not left
        guessing.
      </p>
      <p v-if="formatPublished" class="caveat">
        Every field and heading, and what a receiving agent does with each, is in
        <a href="/docs/guide-format">the guide format</a>.
      </p>
    </section>

    <section class="closer">
      <h2>
        Everything here is one document
        <span class="turn">and one key.</span>
      </h2>
      <p class="ways">
        <a class="go" href="/hub">Open your hub</a>
        <a class="quiet" href="/v1/openapi.json">or read the API document</a>
      </p>
      <p class="reassure">
        A guide is markdown with frontmatter, and a share key is what makes a link work. No plugin
        directory, no integration to wait for.
      </p>
    </section>

    <AppFoot />
  </main>
</template>
