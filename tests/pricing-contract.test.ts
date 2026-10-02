import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const root = new URL("../", import.meta.url);

test("active pricing copy matches the Core and H-2A offer", async () => {
  const [billing, help, storage, guide] = await Promise.all([
    readFile(new URL("app/billing/page.tsx", root), "utf8"),
    readFile(new URL("src/lib/help-content.ts", root), "utf8"),
    readFile(new URL("src/components/storage-usage.tsx", root), "utf8"),
    readFile(new URL("docs/FarmVoice_Records_Setup_and_Features.md", root), "utf8"),
  ]);

  for (const text of [billing, help, guide]) {
    assert.match(text, /\$49/);
    assert.match(text, /\$149/);
  }
  assert.match(billing, /100 GB/);
  assert.match(help, /100 GB/);
  assert.match(storage, /100 GB included per farm/);
  assert.match(guide, /100 GB/);
  assert.doesNotMatch(guide, /Farm Team or Farm Pro/);
  assert.doesNotMatch(guide, /Essential is for one user/);
});
