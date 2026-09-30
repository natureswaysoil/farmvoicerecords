import test from "node:test";
import assert from "node:assert/strict";
import { collectPages, csvCell, hoursBetween } from "../src/lib/pagination.ts";
import { recordsCsv, recordPacket } from "../src/lib/records/export.ts";
test("exports include all rows even when server page cap is below requested size", async () => {
  const rows = Array.from({ length: 1234 }, (_, id) => ({ id }));
  const all = await collectPages(async (from, to) => ({
    data: rows.slice(from, Math.min(to + 1, from + 100)),
    error: null,
  }));
  assert.deepEqual(all, rows);
  await assert.rejects(
    () =>
      collectPages(async (from) => ({
        data: from ? null : [{ id: 1 }],
        error: from ? new Error("offline") : null,
      })),
    /offline/,
  );
});
test("export totals account for breaks and escape untrusted spreadsheet/HTML data", () => {
  assert.equal(
    hoursBetween("2026-09-30T08:00:00Z", "2026-09-30T16:00:00Z", 30),
    7.5,
  );
  assert.equal(csvCell("=cmd()"), '"\'=cmd()"');
  const rows = [
    {
      id: "one",
      record_type: "purchase",
      status: "confirmed",
      created_at: "2026-09-30",
      payload: { item: "<script>alert(1)</script>", cost: "=SUM(A1)" },
    },
  ];
  assert.ok(recordsCsv(rows).includes("'=SUM(A1)"));
  assert.ok(!recordPacket(rows).includes("<script>"));
  assert.ok(recordPacket(rows).includes("&lt;script&gt;"));
});
