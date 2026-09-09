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

  Laid out like the landing: sections separated by space and a hairline rather than four bordered
  cards in a grid. A page where every block is a card has no hierarchy left to spend, and this one
  is a list of alternatives — peers, which read as peers when nothing is boxed.

  Script-free, like the landing and the guide view — its route rule is `noScripts` with the strict
  CSP. Nothing here is interactive, so nothing here needs to be.
-->
<script setup lang="ts">
usePage({
  title: "Connect Passalong",
  description:
    "Use Passalong from Claude Code, Cursor, Gemini or any HTTP client — what each one can do, and how to set it up.",
});
</script>

<template>
  <main class="wide landing">
    <nav class="masthead">
      <AppBrand />
      <a class="btn" href="/hub">Sign in</a>
    </nav>

    <header class="hero">
      <p class="eyebrow">Three ways in</p>
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
        <p class="eyebrow">Claude Code · Cursor · Zed · Gemini CLI</p>
        <h2>Run it locally</h2>
        <div class="say">
          <p>
            Worth doing where you can: a local server works offline, reads and writes
            <code>.passalong/</code> in the repo you are standing in, and knows which repo that is.
            <code>passalong setup</code> wires Claude Code for you; elsewhere, point your editor at
            the command <code>passalong</code> with the argument <code>mcp</code>.
          </p>
          <pre><code>npm i -g passalong
passalong login
passalong setup     # Claude Code: skill + MCP server</code></pre>
        </div>
      </section>

      <section>
        <p class="eyebrow">ChatGPT · anything that adds remote MCP servers</p>
        <h2>Point it at a URL</h2>
        <div class="say">
          <p>
            Assistants that add outside tools add them as MCP servers reached over a URL. Paste
            this as the server URL and authenticate with a bearer token from
            <a href="/hub/settings">your hub</a> — the same named, revocable token everything else
            here uses. You get nine tools: search and read guides, your inbox and board, publish a
            guide, file a set of bugs, say whether you are taking one, and say whether it worked.
          </p>
          <pre><code>https://passalong.dev/v1/mcp</code></pre>
          <p class="caveat">
            <b>If the client will only authenticate with OAuth</b>, it cannot connect yet. This
            server takes a bearer token and does not run an OAuth flow, and no setting on your end
            changes that.
          </p>
        </div>
      </section>

      <section>
        <p class="eyebrow">Gemini · scripts · anything that calls HTTP</p>
        <h2>Call the API</h2>
        <div class="say">
          <p>
            <code>/v1/openapi.json</code> describes the API for Gemini function calling, an
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
        A transfer says do this.
        <span class="turn">A bug says fix this.</span>
      </h2>
      <p>
        Whatever you connect, tell it to read <code>kind</code> before acting — the two ask for
        opposite things, and an agent that confuses them will carefully reproduce a defect and
        report success.
      </p>
      <dl class="kinds">
        <dt>transfer</dt>
        <dd>
          Finished work to repeat here. Follow its <b>Steps</b>, run its <b>Verification</b>, and
          say whether it held up.
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
    </section>

    <section class="closer">
      <p class="eyebrow">Nothing to be built for it</p>
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
