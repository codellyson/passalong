// A project opens on its Work: what is being done there is what someone opening a project came to
// see. Documents was first and was where it opened; a link naming one document still opens there.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const page = readFileSync(new URL("../app/pages/hub/projects/[id].vue", import.meta.url), "utf8");

test("a project's tabs are Work, Documents, History; it opens on Documents once it has a README", () => {
  const tabs = [...page.matchAll(/\{ key: "(\w+)", label: "(\w+)" \}/g)].map((m) => m[1]);
  assert.deepEqual(tabs, ["work", "documents", "history"], "Work first");
  const chosen = page.slice(page.indexOf("const tab = computed("));
  assert.match(
    chosen.slice(0, chosen.indexOf(");\n") + 3),
    /route\.query\.doc\s*\?\s*"documents"[\s\S]*hasReadme\.value\s*\?\s*"documents"\s*:\s*"work"/,
    "with no tab: a link to a document opens Documents, a project with a README opens Documents, the rest Work",
  );
});
