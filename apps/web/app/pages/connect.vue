<!--
  How to reach Passalong from whatever you already work in.

  There are two rails and the difference is transport, not vendor: anything that can run a local
  process gets the MCP server, and anything that can only call an endpoint gets the HTTP API and
  the OpenAPI document that describes it. Until this page existed the second group had a schema and
  no instructions, which is a page for machines and none for the person setting it up.

  Script-free, like the landing and the guide view — its route rule is `noScripts` with the strict
  CSP. Nothing here is interactive, so nothing here needs to be.
-->
<script setup lang="ts">
usePage({
  title: "Connect Passalong",
  description:
    "Use Passalong from ChatGPT, Gemini, Claude Code, Cursor or any MCP client — what each one can do, and how to set it up.",
});
</script>

<template>
  <main class="wide">
    <header class="hero">
      <AppBrand />
      <h1>Connect it to what you already use.</h1>
      <p class="lede">
        Two ways in, and the difference is how your tool talks rather than whose tool it is.
        Anything that can run a local process gets the MCP server and every tool. Anything that can
        only call an endpoint — ChatGPT, Gemini — reads the API from a document and gets most of
        them.
      </p>
    </header>

    <div class="two">
      <section class="panel">
        <h2>ChatGPT</h2>
        <p>
          ChatGPT connects to APIs, not to local processes, so it reads the OpenAPI document rather
          than running <code>passalong mcp</code>.
        </p>
        <ol>
          <li>In ChatGPT: <b>Explore GPTs → Create → Configure → Create new action</b>.</li>
          <li>
            Choose <b>Import from URL</b> and paste
            <code>https://passalong.dev/v1/openapi.json</code>.
          </li>
          <li>
            Under <b>Authentication</b> pick <b>API Key</b>, auth type <b>Bearer</b>, and paste a
            token from <a href="/hub/settings">your hub</a>. Tokens are named and revocable; mint
            one for this and revoke it if the GPT changes hands.
          </li>
          <li>Ask it <i>“what’s in my passalong inbox?”</i> to check it took.</li>
        </ol>
        <p>
          It can search and read guides, read your inbox and board, publish a guide, open a bug
          report and give a verdict. It cannot attach a screenshot: that endpoint takes raw image
          bytes, which an action has no way to send.
        </p>
      </section>

      <section class="panel">
        <h2>Gemini, and anything else that calls HTTP</h2>
        <p>
          The same document describes the API for Gemini function calling, an internal script, or
          anything that speaks HTTP and a bearer token.
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
          Anything that runs a local MCP server gets all of it, including the two things HTTP
          clients cannot do. <code>passalong setup</code> wires Claude Code for you; elsewhere,
          point your editor at the command <code>passalong</code> with the argument
          <code>mcp</code>.
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
