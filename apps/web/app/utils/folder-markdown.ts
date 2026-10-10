import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import rehypeStringify from "rehype-stringify";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified } from "unified";

function safeHref(href: string): string | null {
  const value = href.trim();
  if (/^https?:\/\//i.test(value) || /^mailto:/i.test(value)) return value;
  if (/^(?:\.{0,2}\/|#)/.test(value) && !value.startsWith("//")) return value;
  return null;
}

// A private document must not silently load a third-party image when opened.
// Folder assets require a credential, so Markdown images become links instead.
const markdown = unified()
  .use(remarkParse)
  .use(remarkGfm)
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
  .use(rehypeSanitize, { ...defaultSchema, clobberPrefix: "" })
  .use(rehypeStringify);

export function renderFolderMarkdown(body: string): string {
  return String(markdown.processSync(body));
}
