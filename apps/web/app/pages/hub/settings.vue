<!--
  The plumbing: who you are, who you are in a team with, and the credentials the CLI and the MCP
  servers authenticate with. All of it is real, and none of it is touched more than twice a year.

  Three sections, each a label and a blurb beside its controls. The label column is what lets the
  page be scanned for the section you came for rather than read from the top — the panels this
  replaced all looked alike and all announced themselves at the same size.
-->
<script setup lang="ts">
usePage({
  title: "Settings · Passalong",
  description: "Your handle, your teams and your API tokens.",
  noindex: true,
});

const section = "grid gap-x-8 gap-y-4 border-t border-line py-6 md:grid-cols-[11rem_1fr]";
const label = "m-0 font-ui text-base font-semibold text-fg";
const blurb = "mt-1 mb-0 font-ui text-sm text-muted";
</script>

<template>
  <HubShell heading="Settings">
    <template #sub>Your handle, your teams, and the tokens that sign the CLI in.</template>

    <!-- A token-only account cannot sign in from any other browser. That is a state, not a
         setting, so it stays above the sections rather than inside one. -->
    <HubClaim />

    <section :class="section">
      <div>
        <h2 :class="label">Identity</h2>
        <p :class="blurb">Your handle is how a teammate addresses a transfer to you.</p>
      </div>
      <HubIdentity bare />
    </section>

    <section :class="section">
      <div>
        <h2 :class="label">Teams</h2>
        <p :class="blurb">Guides are addressed to a team. Invite someone with a link.</p>
      </div>
      <HubTeamList />
    </section>

    <section :class="section">
      <div>
        <h2 :class="label">API tokens</h2>
        <p :class="blurb">
          For <code class="font-code">passalong login</code> and MCP servers. Your password never
          goes near the CLI.
        </p>
      </div>
      <HubTokens />
    </section>

    <!-- Its own section, not a third child of the one above: that grid is a label column and a
         content column, so anything appended to it lands in the 11rem label column and is crushed
         there. Connectors sit next to tokens because they answer the same question — what else can
         act as me — and differ in who holds the credential and how far it reaches. -->
    <section :class="section">
      <div>
        <h2 :class="label">Connectors</h2>
        <p :class="blurb">
          For an assistant that adds Passalong as a remote MCP server. It gets a credential of its
          own rather than one of your tokens.
        </p>
      </div>
      <HubConnectors />
    </section>
  </HubShell>
</template>
