import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import rehypeStringify from "rehype-stringify";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified } from "unified";
import { type GhNode, ghRef } from "#shared/link-kind";
import { remarkAlerts } from "#shared/markdown-alerts";

function safeHref(href: string): string | null {
  const value = href.trim();
  if (/^https?:\/\//i.test(value) || /^mailto:/i.test(value)) return value;
  if (/^(?:\.{0,2}\/|#)/.test(value) && !value.startsWith("//")) return value;
  return null;
}

// A private document must not silently load a third-party image when opened.
// Project files require a credential, so Markdown images become links instead.
// `docs` (the project's documents) turns links between its pages into links that open them.
const build = (docs?: DocRef[]) =>
  unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkAlerts)
    .use(docs ? linkDocs(docs) : () => () => {})
    .use(remarkRehype, {
      handlers: {
        image(_state, node) {
          const label = node.alt || "Image";
          const href = safeHref(node.url);
          return href
            ? {
                type: "element",
                tagName: "a",
                properties: { href },
                children: [{ type: "text", value: label }],
              }
            : { type: "text", value: label };
        },
      },
    })
    // remark-rehype already prefixes generated footnote ids. A second prefix would break links.
    // An alert's classes are the only ones added to what GitHub's own schema allows.
    .use(rehypeSanitize, {
      ...defaultSchema,
      clobberPrefix: "",
      attributes: {
        ...defaultSchema.attributes,
        div: [
          ...(defaultSchema.attributes?.div ?? []),
          ["className", /^markdown-alert(-[a-z]+)?$/],
        ],
        p: [...(defaultSchema.attributes?.p ?? []), ["className", "markdown-alert-title"]],
      },
    })
    // After the sanitiser, which would strip the chip's class and mark: what is added here is ours,
    // built from a URL the sanitiser has already let through.
    .use(() => (tree: GhNode) => {
      const visit = (node: GhNode) => {
        node.children = node.children?.map((c) => (c.tagName === "a" ? ghRef(c) : (visit(c), c)));
      };
      visit(tree);
    })
    .use(rehypeStringify);

const markdown = build();

/** A project's document, as a link inside another one may name it. */
export type DocRef = { id: string; name: string };

/** What a link and a document's name share: "payments.md", "Payments" and "payments" alike. */
export const docKey = (s: string) =>
  s
    .trim()
    .toLowerCase()
    .replace(/\.md$/, "")
    .replace(/[-_\s]+/g, " ")
    .trim();

/** The address that opens one of the project's documents in place. */
export const docHref = (id: string) => `?tab=documents&doc=${encodeURIComponent(id)}`;

type MdNode = { type: string; url?: string; children?: MdNode[] };

/**
 * Links between a project's pages (2026-11-07). Agents write them as file names, `[the Payments
 * page](payments.md)`, and documents are named "Payments", so the link went nowhere. A link with
 * no scheme that names one of `docs` opens that document; one that names none is left as its
 * text, since a link to nothing is worse than none. Web, mail and anchor links are untouched.
 */
function linkDocs(docs: DocRef[]) {
  const byKey = new Map(docs.map((d) => [docKey(d.name), d.id]));
  const own = (url: string) => !/^[a-z][a-z0-9+.-]*:/i.test(url) && !/^[/#?]/.test(url);
  const walk = (node: MdNode) => {
    const kids = node.children;
    if (!kids) return;
    for (let i = 0; i < kids.length; i++) {
      const kid = kids[i]!;
      if (kid.type === "link" && kid.url && own(kid.url)) {
        let name = kid.url.split("#")[0] ?? "";
        try {
          name = decodeURIComponent(name);
        } catch {}
        const id = byKey.get(docKey(name.replace(/^\.\//, "")));
        if (id) kid.url = docHref(id);
        else {
          kids.splice(i, 1, ...(kid.children ?? []));
          i += (kid.children?.length ?? 0) - 1;
          continue;
        }
      }
      walk(kid);
    }
  };
  return () => (tree: MdNode) => walk(tree);
}

/**
 * A project document as HTML. With `docs`, the project's documents, links between its pages open
 * them (linkDocs); without, links are drawn as written.
 */
export function renderProjectMarkdown(body: string, docs?: DocRef[]): string {
  return String((docs ? build(docs) : markdown).processSync(body));
}
