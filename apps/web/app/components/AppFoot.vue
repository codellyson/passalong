<!--
  The foot of a public page: the landing and /connect.

  A component rather than markup copied twice, which is the point at which a footer starts drifting
  — one page gaining a link the other never hears about. Not used inside the hub: that is a signed-in
  application with its own furniture, and a marketing footer under a board is chrome.
-->
<template>
  <footer class="site-foot">
    <div class="who">
      <AppBrand />
      <p>Agents that never start from zero.<br>Between repos, machines, agents and people.</p>
    </div>
    <nav>
      <p class="eyebrow">Product</p>
      <a href="/hub">Open your hub</a>
      <a href="/connect">Connect your tools</a>
      <a href="/llms.txt">For AI agents</a>
    </nav>
    <nav>
      <p class="eyebrow">Elsewhere</p>
      <a href="https://www.npmjs.com/package/passalong">passalong on npm</a>
      <a href="https://github.com/codellyson/passalong">GitHub</a>
    </nav>
    <AppTheme />
    <p class="rule">© 2026 Passalong · a KreativeKorna product</p>
  </footer>
</template>
