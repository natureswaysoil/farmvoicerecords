import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyEquipmentOperation,
  normalizeEquipmentImportRow,
  normalizeFieldName,
} from "../src/lib/equipment-import.ts";

test("normalizes field names for equipment matching", () => {
  assert.equal(normalizeFieldName("  North   Field "), "north field");
});

test("classifies common machine operations", () => {
  assert.equal(classifyEquipmentOperation("Spraying corn"), "input");
  assert.equal(classifyEquipmentOperation("Combine harvest"), "harvest");
  assert.equal(classifyEquipmentOperation("Planting"), "planting");
  assert.equal(classifyEquipmentOperation("Disking"), "note");
});

test("normalizes Deere-style spray data and moisture percent", () => {
  const row = normalizeEquipmentImportRow({
    source: "John Deere",
    machine: "Sprayer 1",
    operation: "Spraying",
    field: "North Field",
    startedAt: "2026-09-18T08:15:00-04:00",
    endedAt: "2026-09-18T09:02:00-04:00",
    product: "Example product",
    rate: "15",
    rateUnit: "gal/ac",
    area: "12.4",
    areaUnit: "ac",
    moisture: "15.2%",
  });
  assert.equal(row.rate, 15);
  assert.equal(row.area, 12.4);
  assert.equal(row.moisture, 15.2);
  assert.equal(row.startedAt, "2026-09-18T12:15:00.000Z");
  assert.match(row.fingerprint, /^[a-f0-9]{64}$/);
});

test("rejects invalid time order", () => {
  assert.throws(
    () =>
      normalizeEquipmentImportRow({
        operation: "Harvest",
        field: "South Field",
        startedAt: "2026-09-18T10:00:00-04:00",
        endedAt: "2026-09-18T09:00:00-04:00",
      }),
    /End time cannot be before start time/,
  );
});
