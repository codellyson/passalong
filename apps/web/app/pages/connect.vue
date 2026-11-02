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

  Script-free, like the landing and the share page — its route rule is `noScripts` with the strict
  CSP. Nothing here is interactive, so nothing here needs to be.
-->
<script setup lang="ts">
import { APEX } from "#api/hosts";
import { isPublic } from "#shared/pages";

/** The closing section links the full format once that page is live, and not before. */
const formatPublished = isPublic("/docs/work-format");

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
            server knows which repo you are standing in, keeps what this worktree holds in its
            <code>.passalong/</code>, and runs a hand-in's checks there.
            <code>passalong setup</code> wires Claude Code for you, and Codex takes one command.
            Anything else runs the command <code>passalong</code> with the argument
            <code>mcp</code>.
          </p>
          <pre><code>npm i -g passalong
passalong login

# Claude Code: skill, MCP server, hooks
passalong setup

# Codex
codex mcp add passalong -- passalong mcp</code></pre>
          <p>
            Step by step: <a href="/learn/setup-claude-code">Claude Code</a>,
            <a href="/learn/setup-codex">Codex</a>.
          </p>
        </div>
      </section>

      <section>
        <h2>Point it at a URL</h2>
        <div class="say">
          <p>
            Claude, ChatGPT and any assistant with MCP connectors add outside tools as MCP
            servers reached over a URL. Paste
            this as the server URL. You get every tool but the one that switches accounts on a
            machine: take work, report progress, ask, hand it in or pass it, write work down, find
            it — drawn as a live board where the app can draw one — and read and write a project's
            documents and files, screenshots included.
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
            Step by step: <a href="/learn/setup-chatgpt">ChatGPT</a>,
            <a href="/learn/setup-claude">Claude</a>.
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
            Attach the image in your chat and ask for the work to be written down with it. The
            screenshot goes into the work itself, so whoever opens the link sees it. How the file
            gets there depends on the assistant.
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
            work, and saving it keeps the file for as long as the work exists.
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
  https://passalong.dev/v1/tasks</code></pre>
          <p>
            Reading work someone shared needs no account at all — the key in the share link is
            the authorisation, and appending <code>.md</code> gives you the document.
          </p>
          <pre><code>curl https://passalong.dev/w/&lt;id&gt;/&lt;key&gt;.md</code></pre>
        </div>
      </section>
    </div>

    <section class="statement">
      <h2>
        Work says what to do.
        <span class="turn">Documents say what to know.</span>
      </h2>
      <p>
        Whatever you connect works with the same few calls. A piece of work has no kinds or required
        sections: the agent reads it and works out what done means.
      </p>
      <dl class="kinds">
        <dt>work</dt>
        <dd>
          Something someone must still do. <b>take</b> it, <b>progress</b> at each milestone,
          <b>ask</b> when it needs a person's answer, <b>hand_in</b> with the evidence when it is
          done, or <b>pass</b> it back with the reason. A finished piece of work that is not right is
          reopened with why.
        </dd>
        <dt>project</dt>
        <dd>
          A place for one product or body of work. Its <b>documents</b> are what to know: a README
          saying what it is and how it is built, a page per area, a Log of what changed. Agents read
          them when they take work and update them when they hand it in.
        </dd>
        <dt>file</dt>
        <dd>A picture or other file, on a piece of work or in a project.</dd>
      </dl>
      <p v-if="formatPublished" class="caveat">
        Every field, and what a receiving agent does with each, is in
        <a href="/docs/work-format">the work format</a>.
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
        Work is markdown with frontmatter, and a share key is what makes a link work. No plugin
        directory, no integration to wait for.
      </p>
    </section>

    <AppFoot />
  </main>
</template>
