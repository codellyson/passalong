// A link in a note is read from its URL alone: work here, or what it is on GitHub.
import assert from "node:assert/strict";
import { test } from "node:test";
import * as linkKindModule from "../shared/link-kind.ts";
import { linkKind, workStage } from "../shared/link-kind.ts";

test("work links from every host we serve, and share links, are work", () => {
  assert.deepEqual(linkKind("https://passalong.dev/hub/w/emw26gvq"), {
    kind: "work",
    id: "emw26gvq",
    shared: false,
  });
  assert.deepEqual(linkKind("https://passalong.kreativekorna.com/w/emw26gvq/k3y"), {
    kind: "work",
    id: "emw26gvq",
    shared: true,
  });
  assert.equal(linkKind("http://localhost:3001/hub/w/abc12345", "localhost:3001")?.kind, "work");
  assert.equal(linkKind("http://localhost:3001/hub/w/abc12345"), null);
  assert.equal(linkKind("https://passalong.dev/hub/projects/p1"), null);
  assert.equal(linkKind("https://evil.test/hub/w/abc12345"), null);
});

test("GitHub links say what they are, read from the path", () => {
  const pr = linkKind("https://github.com/khaime-team/website-builder/pull/2800/files");
  assert.deepEqual(pr, {
    kind: "github",
    repo: "khaime-team/website-builder",
    ref: "#2800",
    what: "Pull request",
  });
  assert.equal(linkKind("https://github.com/a/b/issues/7").what, "Issue");
  assert.equal(linkKind("https://github.com/a/b/commit/7f0d83e1234abcd").ref, "7f0d83e");
  assert.equal(linkKind("https://github.com/a/b/actions/runs/99").ref, "run 99");
  assert.equal(linkKind("https://github.com/a/b").what, "Repository");
  assert.equal(linkKind("https://github.com/a/b/blob/main/x.ts"), null);
  assert.equal(linkKind("https://github.com/a"), null);
  assert.equal(linkKind("not a url"), null);
});

test("a work's stage is said the way the board says it", () => {
  assert.equal(workStage({ status: "draft" }), "Draft");
  assert.equal(workStage({ status: "ready", held_by: [{}] }), "In progress");
  assert.equal(workStage({ status: "ready" }), "Ready");
  assert.equal(workStage({ status: "done", outcome: "archived" }), "Archived");
  assert.equal(workStage({ status: "done", outcome: "finished" }), "Done");
});

test("bare work ids are cut out of text; words are not ids", () => {
  const { idParts } = linkKindModule;
  assert.deepEqual(idParts("half of p64kbrdt."), [
    { text: "half of " },
    { text: "p64kbrdt", id: "p64kbrdt" },
    { text: "." },
  ]);
  assert.deepEqual(idParts("feedback websites l1o0abcd"), [{ text: "feedback websites l1o0abcd" }]);
});
