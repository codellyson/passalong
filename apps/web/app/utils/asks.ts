/**
 * What to say to your agent, for everything a person used to type into a form here.
 *
 * Passalong is agent first: guides are written by the agent that has the context, over MCP or the
 * CLI, never in a browser form. The hub reads, reviews and decides. So where it once offered a
 * form, it offers the sentence to paste into Claude Code (or any agent with the Passalong tools),
 * and the agent does the writing.
 *
 * Imports nothing, so it runs under `node --test` without Nuxt.
 */
export const ASKS = {
  /** One task, written by the agent in the repo it is for. Lands as a draft to read. */
  task: "Add a Passalong task: <what needs doing>",
  /** A larger goal, split by the agent into tasks with their order (plan_tasks). */
  plan: "Plan this into Passalong tasks: <the goal>",
  /** Finished work, written up for someone else to repeat (publish_guide). */
  handoff: "Pass this along",
} as const;

/**
 * One bug, filed by the agent that found it, addressed to a team. A guide published without a team
 * is private to whoever wrote it, so the team has to be in the sentence: "file a bug" alone would
 * put it where only the person filing can see it.
 */
export const bugAsk = (team: string) =>
  `File this as a Passalong bug for the team ${team}: <what is broken>`;

/** The same for a task. */
export const teamTaskAsk = (team: string) =>
  `Add a Passalong task for the team ${team}: <what needs doing>`;

/** Installing the tool and signing it in, in the order they have to be run. */
export const CONNECT = ["npm i -g passalong", "passalong login", "passalong setup"] as const;

/** More context on a guide, added by the agent that just did the work. */
export const followUpAsk = (id: string) =>
  `Add a Passalong follow-up to guide ${id} with what we learned`;
