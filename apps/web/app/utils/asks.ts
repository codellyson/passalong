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

/**
 * New work made from a folder, so the sentence names the folder by id as well as by title. A team
 * folder's work goes to that team, or only its author could see it in the folder.
 */
export const folderAsk = (folder: { id: string; title: string; team?: string }) => {
  const team = folder.team ? ` for the team ${folder.team}` : "";
  return `Add this to Passalong${team}: <what needs doing>. It belongs in the Passalong folder "${folder.title}" (${folder.id}).`;
};

/** Installing the tool and signing it in, in the order they have to be run. */
export const CONNECT = ["npm i -g passalong", "passalong login", "passalong setup"] as const;
