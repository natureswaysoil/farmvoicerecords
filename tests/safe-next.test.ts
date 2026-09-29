import assert from "node:assert/strict";
import test from "node:test";
import { safeNextPath } from "../src/lib/safe-next.ts";

const origin = "https://farmvoicerecords.com";

test("sign-in return path stays on the same site", () => {
  assert.equal(safeNextPath("/h2a/housing?tab=inspections", origin), "/h2a/housing?tab=inspections");
  assert.equal(safeNextPath(null, origin), "/records");
});

test("sign-in return path rejects off-site destinations", () => {
  for (const destination of [
    "https://example.com/steal",
    "//example.com/steal",
    "https://farmvoicerecords.com@example.com/steal",
  ]) {
    assert.equal(safeNextPath(destination, origin), "/records");
  }
});
