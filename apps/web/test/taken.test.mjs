import assert from "node:assert/strict";
import { test } from "node:test";
import { plain } from "../app/utils/taken.ts";

test("a message is one line, with pictures and files said as what they are", () => {
  assert.equal(
    plain(
      "see this\n![a](https://p.dev/v1/shots/abc123xyz)\n[orders.csv](https://p.dev/v1/attachments/def456uvw)",
    ),
    "see this [image] [file: orders.csv]",
  );
});
