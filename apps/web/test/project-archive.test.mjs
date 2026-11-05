// Archive on a project's page, and the way back from it and from Projects (2026-11-05).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const page = read("../app/pages/hub/projects/[id].vue");
const list = read("../app/pages/hub/projects/index.vue");

test("Archive sits with the project's actions for whoever manages it, and says it's archived", () => {
  assert.match(
    page,
    /<button v-if="project\.manage && !project\.archived" class="btn sm"[^>]*@click="setArchived\(true\)">/,
  );
  assert.match(page, /<div v-if="project\.archived"[^>]*>/);
  assert.match(
    page,
    /@click="setArchived\(false\)">\{\{ archiving \? "Unarchiving…" : "Unarchive" \}\}/,
  );
  assert.match(
    page,
    /`\/v1\/projects\/\$\{id\.value\}\/archive`, \{\s*method: on \? "POST" : "DELETE",/,
  );
});

test("Projects lists archived ones on request, even when nothing else is left", () => {
  assert.match(list, /api<\{ projects: ApiProject\[\] \}>\("\/v1\/projects\?archived=1"\)/);
  assert.match(
    list,
    /<section v-if="projectsQ\.isSuccess\.value" class="mt-10 flex flex-col gap-3" aria-labelledby="archived-h">/,
  );
  const after = list.slice(list.lastIndexOf("</template>\n\n"));
  assert.ok(after.includes('aria-labelledby="archived-h"'), "outside the list's own branch");
});
