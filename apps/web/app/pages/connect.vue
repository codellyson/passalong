<!--
  How to reach Passalong from whatever you already work in.

  Two rails, and the difference is transport rather than vendor: anything that can run a local
  process gets the MCP server, and anything that speaks HTTP gets the API and the document
  describing it. Until this page existed the second group had a schema and no instructions, which
  is a page for machines and none for the person setting it up.

  Three now, since the MCP server is served at a URL as well as spoken over stdio. This page has
  twice said something untrue about ChatGPT — first steps for the custom-GPT Actions flow, which
  no longer exists, then that there was nothing to paste into the MCP dialog, which stopped being
  true when the endpoint shipped. What stays true is the shape of the answer: what a tool can do
  here is decided by how it talks, not by whose tool it is.

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
  <main class="wide">
    <header class="hero">
      <AppBrand />
      <h1>Connect it to what you already use.</h1>
      <p class="lede">
        Three ways in, and the difference is how your tool talks rather than whose tool it is.
        Run a local process, and you get the MCP server over stdio. Add remote MCP servers, and
        there is one at a URL. Speak plain HTTP, and there is an API with a document describing
        it. Same tools underneath, same tokens.
      </p>
    </header>

    <div class="two">
      <section class="panel">
        <h2>ChatGPT, and anything that adds remote MCP servers</h2>
        <p>
          Assistants that add outside tools add them as MCP servers reached over a URL. This is
          that URL:
        </p>
        <pre><code>https://passalong.dev/v1/mcp</code></pre>
        <p>
          Paste it as the server URL, and authenticate with a bearer token from
          <a href="/hub/settings">your hub</a> — the same named, revocable token everything else
          here uses. You get the eight tools: search and read guides, your inbox and board, publish
          a guide, file a set of bugs, and say whether something worked.
        </p>
        <p>
          <b>If the client will only authenticate with OAuth</b>, it cannot connect yet. This
          server takes a bearer token and does not run an OAuth flow, and no setting on your end
          changes that.
        </p>
      </section>

      <section class="panel">
        <h2>Gemini, scripts, anything that calls HTTP</h2>
        <p>
          <code>/v1/openapi.json</code> describes the API for Gemini function calling, an internal
          script, or anything that speaks HTTP and a bearer token. Mint one in
          <a href="/hub/settings">your hub</a>; they are named and revocable.
        </p>
        <pre><code>curl -H "authorization: Bearer $TOKEN" \
  https://passalong.dev/v1/inbox</code></pre>
        <p>
          Reading a guide someone shared needs no account at all — the key in the share link is the
          authorization, and appending <code>.md</code> gives you the document.
        </p>
        <pre><code>curl https://passalong.dev/g/&lt;id&gt;/&lt;key&gt;.md</code></pre>
      </section>
    </div>

    <div class="two">
      <section class="panel">
        <h2>Claude Code, Cursor, Zed, Gemini CLI</h2>
        <p>
          These can run the server locally, which is worth doing: a local server works offline,
          reads and writes <code>.passalong/</code> in the repo you are standing in, and knows
          which repo that is. <code>passalong setup</code> wires Claude Code for you; elsewhere,
          point your editor at the command <code>passalong</code> with the argument
          <code>mcp</code>. The URL above works from these too, if you would rather not install
          anything.
        </p>
        <pre><code>npm i -g passalong
passalong login
passalong setup     # Claude Code: skill + MCP server</code></pre>
      </section>

      <section class="panel">
        <h2>Two kinds of guide</h2>
        <p>
          Whatever you connect, tell it to read <code>kind</code> before acting. The two ask for
          opposite things.
        </p>
        <ul>
          <li>
            <b>transfer</b> — finished work to repeat here. Follow its <b>Steps</b>, then run its
            <b>Verification</b> and say whether it held up.
          </li>
          <li>
            <b>bug</b> — a defect to fix. <b>Reproduce</b> shows you the problem and is not a
            procedure to apply; <b>Verification</b> is the behaviour that should have happened. A
            bug report is not broken because you reproduced it.
          </li>
        </ul>
        <p>
          Agents that pull a guide through MCP are told this before they see the document, and the
          document says it too, so a tool that fetched a share link over plain HTTP is not left
          guessing.
        </p>
      </section>
    </div>

    <section class="closer">
      <h2>Everything is one document and one key</h2>
      <p>
        A guide is markdown with frontmatter, a share key is what makes a link work, and
        <code>/v1/openapi.json</code> describes the rest. Nothing here needs a plugin directory or
        an integration to be built for it.
      </p>
      <div class="cta">
        <a class="btn primary lg" href="/hub">Open your hub</a>
        <a class="btn lg" href="/v1/openapi.json">The API document</a>
      </div>
    </section>
  </main>
</template>
