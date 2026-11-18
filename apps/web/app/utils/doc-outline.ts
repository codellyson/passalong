// An "On this page" list for a rendered document: each h2 and h3 gets an id to link to.
export interface OutlineItem {
  id: string;
  label: string;
  level: 2 | 3;
}

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  "#39": "'",
  "#x27": "'",
};

function plain(inner: string): string {
  return inner
    .replace(/<[^>]*>/g, "")
    .replace(/&(amp|lt|gt|quot|#39|#x27);/g, (_, e: string) => ENTITIES[e] ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Runs on HTML that is already sanitised. Ids are only `sec-` and [a-z0-9-]: the prefix keeps a
 * heading's words from naming a global (DOM clobbering) on pages that run script.
 */
export function outline(html: string): { html: string; items: OutlineItem[] } {
  const items: OutlineItem[] = [];
  const used = new Map<string, number>();
  const out = html.replace(
    /<h([23])((?:\s[^>]*)?)>([\s\S]*?)<\/h\1>/g,
    (whole, lvl: string, attrs: string, inner: string) => {
      if (/\sid=/.test(attrs)) return whole;
      const label = plain(inner);
      if (!label) return whole;
      const slug =
        label
          .toLowerCase()
          .normalize("NFKD")
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-+|-+$/g, "")
          .slice(0, 60) || "section";
      const seen = used.get(slug) ?? 0;
      used.set(slug, seen + 1);
      const id = `sec-${slug}${seen ? `-${seen + 1}` : ""}`;
      items.push({ id, label, level: lvl === "2" ? 2 : 3 });
      return `<h${lvl}${attrs} id="${id}">${inner}</h${lvl}>`;
    },
  );
  return { html: out, items };
}
