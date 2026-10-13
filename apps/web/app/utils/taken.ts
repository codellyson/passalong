/**
 * A message as one line, for the places that quote what an agent or a person last said.
 *
 * Imports nothing, so it runs under `node --test` without Nuxt.
 */
/** Pictures and files said as what they are, whitespace collapsed. */
export const plain = (t: string) =>
  t
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "[image]")
    .replace(/\[([^\]]*)\]\([^)]*\/v1\/attachments\/[^)]*\)/g, "[file: $1]")
    .replace(/\s+/g, " ")
    .trim();
