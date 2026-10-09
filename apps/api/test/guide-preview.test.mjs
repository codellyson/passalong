import assert from "node:assert/strict";
import { test } from "node:test";
import { guidePreview } from "../src/guide-preview.ts";

test("guide rows choose the first available document image", () => {
  const shots = [
    { id: "proof123", name: "Later proof" },
    { id: "screen123", name: "Order screen" },
  ];
  assert.deepEqual(guidePreview(["foreign1", "screen123"], shots), {
    url: "/v1/shots/screen123",
    alt: "Order screen",
  });
});

test("guide rows fall back to proof, then to no image", () => {
  assert.deepEqual(guidePreview([], [{ id: "proof123", name: "" }]), {
    url: "/v1/shots/proof123",
    alt: "Guide image",
  });
  assert.equal(guidePreview(["foreign1"], []), null);
});
