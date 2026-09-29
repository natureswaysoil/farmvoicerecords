import assert from "node:assert/strict";
import test from "node:test";
import {
  extractionSchema,
  supportedSuggestions,
  fillEmptyFields,
  purchaseProblems,
} from "../src/lib/records/schema.ts";
import {
  queueRecord,
  queuedRecords,
  syncRecords,
} from "../src/lib/records/offline.ts";
test("suggestions require source evidence and cannot make legal declarations", () => {
  const fields = Object.fromEntries(
    Object.keys(extractionSchema.shape).map((k) => [
      k,
      { value: null, evidence: null },
    ]),
  );
  const parsed = extractionSchema.parse({
    ...fields,
    productName: { value: "Example", evidence: "Example" },
    epaRegNumber: { value: "999-123", evidence: "not said" },
  });
  assert.deepEqual(
    supportedSuggestions("Applied Example", parsed, "pesticide"),
    { productName: { value: "Example", evidence: "Example" } },
  );
  assert.deepEqual(
    fillEmptyFields(
      { productName: "My edit", isRestrictedUse: false },
      {
        productName: { value: "AI", evidence: "AI" },
        amountApplied: { value: "2", evidence: "2" },
        isRestrictedUse: { value: "true", evidence: "true" },
      },
    ),
    { productName: "My edit", amountApplied: "2", isRestrictedUse: false },
  );
});
test("Spanish evidence and purchase validation", () => {
  const fields = Object.fromEntries(
    Object.keys(extractionSchema.shape).map((k) => [
      k,
      { value: null, evidence: null },
    ]),
  );
  const parsed = extractionSchema.parse({
    ...fields,
    vendor: { value: "Cooperativa", evidence: "Cooperativa" },
  });
  assert.equal(
    supportedSuggestions("Compré semillas en Cooperativa", parsed, "purchase")
      .vendor.value,
    "Cooperativa",
  );
  assert.ok(
    purchaseProblems({
      vendor: "A",
      item: "Seed",
      purchaseDate: "2026-02-30",
      quantity: "2",
      unit: "bags",
      totalCost: "-1",
    }).length,
  );
  assert.deepEqual(
    purchaseProblems({
      vendor: "A",
      item: "Seed",
      purchaseDate: "2026-02-28",
      quantity: "2",
      unit: "bags",
      totalCost: "25",
    }),
    [],
  );
});
test("offline queue isolates accounts/farms, retains failures, and retries identical IDs", async () => {
  const memory = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      get length() {
        return memory.size;
      },
      key: (i: number) => [...memory.keys()][i] ?? null,
      getItem: (k: string) => memory.get(k) ?? null,
      setItem: (k: string, v: string) => memory.set(k, v),
      removeItem: (k: string) => memory.delete(k),
    },
  });
  const userId = "11111111-1111-4111-8111-111111111111",
    other = "22222222-2222-4222-8222-222222222222",
    farmId = "33333333-3333-4333-8333-333333333333";
  const row = {
    id: crypto.randomUUID(),
    userId,
    farmId,
    type: "purchase" as const,
    status: "draft" as const,
    createdAt: new Date().toISOString(),
    fieldId: null,
    payload: { item: "Seed" },
  };
  queueRecord(row);
  queueRecord({ ...row, id: crypto.randomUUID(), userId: other });
  queueRecord({ ...row, id: crypto.randomUUID(), farmId: other });
  const original = globalThis.fetch;
  let ids: string[] = [];
  globalThis.fetch = async (_url, init) => {
    ids.push(JSON.parse(String(init?.body)).id);
    return Response.json({ error: "Expired" }, { status: 402 });
  };
  try {
    await assert.rejects(() => syncRecords(userId, farmId), /Expired/);
    assert.equal(queuedRecords(userId).length, 2);
    globalThis.fetch = async (_url, init) => {
      ids.push(JSON.parse(String(init?.body)).id);
      return Response.json({ id: row.id });
    };
    assert.equal(await syncRecords(userId, farmId), 1);
    assert.deepEqual(ids, [row.id, row.id]);
    assert.equal(queuedRecords(userId).length, 1);
    assert.equal(queuedRecords(other).length, 1);
  } finally {
    globalThis.fetch = original;
  }
});
