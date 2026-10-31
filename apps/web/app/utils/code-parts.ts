/**
 * Inline code as parts, so a line renders `code` as code rather than as backticks. Plain string work
 * with no imports, so it is testable without Nuxt.
 */
export function codeParts(text: string): { code: boolean; text: string }[] {
  return text
    .split(/(`[^`]+`)/)
    .filter(Boolean)
    .map((p) =>
      p.length > 1 && p.startsWith("`") && p.endsWith("`")
        ? { code: true, text: p.slice(1, -1) }
        : { code: false, text: p },
    );
}
