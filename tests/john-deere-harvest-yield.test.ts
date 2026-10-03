import assert from "node:assert/strict";
import test from "node:test";
import { normalizeEquipmentImportRow } from "../src/lib/equipment-import.ts";
import { deereHarvestYieldResultToEquipmentRow } from "../src/lib/john-deere-harvest-yield.ts";

const harvestOperation = {
  id: "d965c64c-b447-4932-9bff-066d0ec6c893",
  fieldOperationType: "harvest",
  startDate: "2017-10-27T08:59:58.548Z",
  endDate: "2017-10-27T09:40:32.915Z",
  cropName: "CORN_WET",
  varieties: [{ name: "CORNVAR-001" }],
  measurementTypes: [
    {
      measurementName: "HarvestYieldResult",
      measurementCategory: "Result",
      area: { value: 3.81, unitId: "ha" },
      averageYield: { value: 13.04, unitId: "[m3]1ha-1" },
      averageMoisture: { value: 16.93, unitId: "prcnt" },
      averageWetMass: { value: 9.62, unitId: "t1ha-1" },
    },
  ],
  fieldOperationMachines: [
    {
      vin: "1H0S770SVH9999999",
      GUID: "88710e04-9fb4-beaa-4259-7a9e14b53f8a",
    },
  ],
};

test("maps Deere HarvestYieldResult into a FarmVoice equipment row", () => {
  const row = deereHarvestYieldResultToEquipmentRow({
    fieldName: "South Field",
    operation: harvestOperation,
  });

  assert.deepEqual(row, {
    source: "John Deere",
    sourceRecordId:
      "d965c64c-b447-4932-9bff-066d0ec6c893:HarvestYieldResult",
    machine: "1H0S770SVH9999999",
    operation: "Harvest",
    field: "South Field",
    startedAt: "2017-10-27T08:59:58.548Z",
    endedAt: "2017-10-27T09:40:32.915Z",
    product: "CORNVAR-001",
    rate: null,
    rateUnit: null,
    area: 3.81,
    areaUnit: "ha",
    yieldValue: 13.04,
    yieldUnit: "m3/ha",
    moisture: 16.93,
  });
});

test("prefers Deere averageYield over wet-mass fallback", () => {
  const row = deereHarvestYieldResultToEquipmentRow({
    fieldName: "South Field",
    operation: harvestOperation,
  });

  assert.equal(row?.yieldValue, 13.04);
  assert.equal(row?.yieldUnit, "m3/ha");
});

test("supports Deere English bushels-per-acre yield units", () => {
  const row = deereHarvestYieldResultToEquipmentRow({
    fieldName: "Corn Field",
    operation: {
      ...harvestOperation,
      measurementTypes: [
        {
          measurementName: "HarvestYieldResult",
          area: { value: 12.4, unitId: "ac" },
          averageYield: { value: 176.4, unitId: "bu1ac-1" },
          averageMoisture: { value: 15.2, unitId: "prcnt" },
        },
      ],
    },
  });

  assert.equal(row?.yieldValue, 176.4);
  assert.equal(row?.yieldUnit, "bu/ac");
  assert.equal(row?.area, 12.4);
  assert.equal(row?.areaUnit, "ac");
  assert.equal(row?.moisture, 15.2);
});

test("falls back to wet-mass yield when averageYield is absent", () => {
  const row = deereHarvestYieldResultToEquipmentRow({
    fieldName: "Wheat Field",
    operation: {
      ...harvestOperation,
      varieties: [],
      cropName: "WHEAT",
      measurementTypes: [
        {
          measurementName: "HarvestYieldResult",
          area: { value: 4.1, unitId: "ha" },
          averageWetMass: { value: 7.8, unitId: "t1ha-1" },
          averageMoisture: { value: 13.5, unitId: "prcnt" },
        },
      ],
    },
  });

  assert.equal(row?.product, "WHEAT");
  assert.equal(row?.yieldValue, 7.8);
  assert.equal(row?.yieldUnit, "t/ha");
});

test("Deere harvest rows pass FarmVoice import normalization", () => {
  const row = deereHarvestYieldResultToEquipmentRow({
    fieldName: "South Field",
    operation: harvestOperation,
  });
  assert.ok(row);

  const normalized = normalizeEquipmentImportRow(row!);
  assert.equal(normalized.source, "John Deere");
  assert.equal(normalized.fieldKey, "south field");
  assert.equal(normalized.yieldValue, 13.04);
  assert.equal(normalized.moisture, 16.93);
  assert.match(normalized.fingerprint, /^[a-f0-9]{64}$/);
});

test("returns null when HarvestYieldResult is absent", () => {
  const row = deereHarvestYieldResultToEquipmentRow({
    fieldName: "South Field",
    operation: {
      id: "op-1",
      measurementTypes: [{ measurementName: "HarvestMoistureResult" }],
    },
  });
  assert.equal(row, null);
});
