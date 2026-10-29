/**
 * What to say to your agent, for everything a person used to type into a form here.
 *
 * Passalong is agent first: work is written down by the agent that has the context, over MCP or the
 * CLI, or by Passalong's own agent from the box in the hub. So where the hub once offered a form, it
 * offers the sentence to paste into Claude Code (or any agent with the Passalong tools), and the
 * agent does the writing.
 *
 * Imports nothing, so it runs under `node --test` without Nuxt.
 */
export const ASKS = {
  /** One piece of work, written by the agent that has the context. */
  work: "Add this to Passalong: <what needs doing>",
  /** A larger goal, split by the agent into pieces of work, left as drafts to read first. */
  plan: "Plan this into Passalong work: <the goal>",
} as const;

/**
 * One piece of work addressed to a team. Work written without a team is private to whoever wrote it,
 * so the team has to be in the sentence: "add this" alone would put it where only they can see it.
 */
export const teamAsk = (team: string) =>
  `Add this to Passalong for the team ${team}: <what needs doing>`;

/** A project's work, named by id as well as title, and addressed to its team when it has one. */
export const projectAsk = (project: { id: string; title: string; team?: string }) => {
  const team = project.team ? ` for the team ${project.team}` : "";
  return `Add this to Passalong${team}: <what needs doing>. It belongs in the Passalong project "${project.title}" (${project.id}).`;
};

/** A new project, made and written up by the agent that knows the product. */
export const newProjectAsk = (team?: string) =>
  `Make a Passalong project for <the product or repo>${team ? ` for the team ${team}` : ""}, and write its README: what it is, who uses it, the words we use for things and how it is built.`;

/** A project's first documents, written by an agent that can read the product. */
export const readmeAsk = (project: { id: string; title: string }) =>
  `Write the README for the Passalong project "${project.title}" (${project.id}): what the product is, who uses it, the words we use for things and how it is built. Then add a page for each area someone working on it needs to know, and a Log page.`;

/** Installing the tool and signing it in, in the order they have to be run. */
export const CONNECT = ["npm i -g passalong", "passalong login", "passalong setup"] as const;
