import assert from "node:assert/strict";
import { test } from "node:test";
import { workPreview } from "../src/work-preview.ts";

test("work rows choose the first available document image", () => {
  const shots = [
    { id: "proof123", name: "Later proof" },
    { id: "screen123", name: "Order screen" },
  ];
  assert.deepEqual(workPreview(["foreign1", "screen123"], shots), {
    url: "/v1/shots/screen123",
    alt: "Order screen",
  });
});

test("work rows fall back to proof, then to no image", () => {
  assert.deepEqual(workPreview([], [{ id: "proof123", name: "" }]), {
    url: "/v1/shots/proof123",
    alt: "Image",
  });
  assert.equal(workPreview(["foreign1"], []), null);
});
