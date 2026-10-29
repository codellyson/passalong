// A project document goes Markdown → editor → Markdown on every save from the hub. These pin that the
// round trip changes nothing a reader sees, and that what the editor cannot hold is never converted.
import assert from "node:assert/strict";
import test from "node:test";
import "./aliases.mjs";

const { markdownToDoc, docToMarkdown } = await import("../app/utils/doc-markdown.ts");
const { renderFolderMarkdown } = await import("../app/utils/folder-markdown.ts");

const roundTrip = (md) => {
  const got = markdownToDoc(md);
  assert.ok("doc" in got, `held: ${got.unheld}`);
  return docToMarkdown(got.doc);
};
const same = (md) =>
  assert.equal(renderFolderMarkdown(roundTrip(md)), renderFolderMarkdown(md), md);

test("headings, emphasis, code, links and breaks come back as they went in", () => {
  same("# Billing app\n\n## Who uses it\n\n### Words we use\n\nPlain text.");
  same("Some **bold**, *italic*, ~~gone~~, `code` and a [link](https://passalong.dev/docs).");
  same("**Bold with *italic inside* and `code`** then [**a strong link**](https://x.dev).");
  same("A line\\\nand the next, kept on its own line.");
  same(
    "Characters that mean something: 2 * 3 = 6, a_b_c, [not a link], \\<b\\>, a | b, ~tilde~, &copy;.",
  );
  same("- 1. looks like a list\n\n# a hash inside: #tag\n\n1986\\. A great year.");
});

test("lists keep their kind, their numbering and their nesting", () => {
  same("- one\n- two\n  - two a\n  - two b\n- three");
  same("3. third\n4. fourth\n   1. nested");
  same("- a item with `code`\n- a [link](https://x.dev)");
});

test("code blocks, quotes, rules and pictures survive", () => {
  same(
    "```ts\nconst a = 1;\n// ``` inside\n```\n\n> Quoted\n>\n> Two paragraphs\n\n---\n\n![Invoice header](/v1/folders/a/assets/b)",
  );
  same("```\n````\n```");
});

test("the second trip is the same as the first: saving twice changes nothing", () => {
  const md = "# T\n\nSome *a* **b** text with 2 * 3.\n\n- x\n  - y\n\n> q";
  const once = roundTrip(md);
  assert.equal(roundTrip(once), once);
});

test("what the editor cannot hold is named, not converted", () => {
  assert.deepEqual(markdownToDoc("| a | b |\n| - | - |\n| 1 | 2 |"), { unheld: "a table" });
  assert.deepEqual(markdownToDoc("- [x] done\n- [ ] not"), { unheld: "a task list" });
  assert.deepEqual(markdownToDoc("Hi <span>x</span>"), { unheld: "HTML" });
  assert.deepEqual(markdownToDoc("Note[^1]\n\n[^1]: Here"), { unheld: "a footnote" });
  assert.deepEqual(markdownToDoc("> [!NOTE]\n> Careful"), { unheld: "an alert" });
  assert.deepEqual(markdownToDoc("Text ![pic](/x.png) inline"), {
    unheld: "a picture inside a line of text",
  });
});

test("an empty document is one empty paragraph, and comes back empty", () => {
  const got = markdownToDoc("");
  assert.deepEqual(got, { doc: { type: "doc", content: [{ type: "paragraph" }] } });
  assert.equal(docToMarkdown(got.doc), "");
});
