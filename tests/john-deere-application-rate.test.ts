import assert from "node:assert/strict";
import test from "node:test";
import { normalizeEquipmentImportRow } from "../src/lib/equipment-import.ts";
import { deereApplicationRateResultToEquipmentRows } from "../src/lib/john-deere-application-rate.ts";

const applicationOperation = {
  id: "90db4bd8-29fb-4756-8cba-1811b6f0c937",
  fieldOperationType: "application",
  startDate: "2017-11-29T17:29:13.693Z",
  endDate: "2017-11-29T17:42:13.905Z",
  products: [
    {
      guid: "57d16d1a-0df9-4615-b0b1-7b347d0f22bb",
      productId: "61cb3844",
      name: "Atrazine",
    },
  ],
  measurementTypes: [
    {
      measurementName: "ApplicationRateResult",
      measurementCategory: "Result",
      applicationProductTotals: [
        {
          productId: "61cb3844",
          name: "Atrazine",
          appliedArea: { value: 19.21, unitId: "ha" },
          averageMaterial: { value: 1.46, unitId: "l1ha-1" },
          productTotals: [
            {
              productId: "57d16d1a-0df9-4615-b0b1-7b347d0f22bb",
              name: "Atrazine",
              brand: "---",
              carrier: false,
              totalMaterial: { value: 28.1, unitId: "l" },
              averageMaterial: { value: 1.46, unitId: "l1ha-1" },
            },
          ],
        },
      ],
    },
  ],
  fieldOperationMachines: [
    {
      vin: "1N04045RJC0000106",
      GUID: "75967f0e-96c6-83e4-6bec-d6b5c868720b",
    },
  ],
};

test("maps Deere ApplicationRateResult into a FarmVoice equipment import row", () => {
  const rows = deereApplicationRateResultToEquipmentRows({
    fieldName: "North Field",
    operation: applicationOperation,
  });

  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0], {
    source: "John Deere",
    sourceRecordId:
      "90db4bd8-29fb-4756-8cba-1811b6f0c937:ApplicationRateResult:57d16d1a-0df9-4615-b0b1-7b347d0f22bb",
    machine: "1N04045RJC0000106",
    operation: "Application",
    field: "North Field",
    startedAt: "2017-11-29T17:29:13.693Z",
    endedAt: "2017-11-29T17:42:13.905Z",
    product: "Atrazine",
    rate: 1.46,
    rateUnit: "L/ha",
    area: 19.21,
    areaUnit: "ha",
    yieldValue: null,
    yieldUnit: null,
    moisture: null,
  });
});

test("uses the actual result measurement, not ApplicationRateTarget", () => {
  const rows = deereApplicationRateResultToEquipmentRows({
    fieldName: "North Field",
    operation: {
      ...applicationOperation,
      measurementTypes: [
        {
          measurementName: "ApplicationRateTarget",
          applicationProductTotals: [
            {
              name: "Atrazine",
              averageMaterial: { value: 2.5, unitId: "l1ha-1" },
              area: { value: 20, unitId: "ha" },
            },
          ],
        },
        ...applicationOperation.measurementTypes,
      ],
    },
  });

  assert.equal(rows[0]?.rate, 1.46);
});

test("creates one FarmVoice row per Deere product total", () => {
  const rows = deereApplicationRateResultToEquipmentRows({
    fieldName: "East Field",
    operation: {
      ...applicationOperation,
      measurementTypes: [
        {
          measurementName: "ApplicationRateResult",
          applicationProductTotals: [
            {
              name: "Tank mix",
              appliedArea: { value: 10, unitId: "ac" },
              productTotals: [
                {
                  productId: "p1",
                  name: "Product A",
                  averageMaterial: { value: 12, unitId: "fl_oz1ac-1" },
                },
                {
                  productId: "p2",
                  name: "Product B",
                  averageMaterial: { value: 1.5, unitId: "pt1ac-1" },
                },
              ],
            },
          ],
        },
      ],
    },
  });

  assert.equal(rows.length, 2);
  assert.equal(rows[0]?.product, "Product A");
  assert.equal(rows[0]?.rateUnit, "fl oz/ac");
  assert.equal(rows[1]?.product, "Product B");
  assert.equal(rows[1]?.rateUnit, "pt/ac");
  assert.notEqual(rows[0]?.sourceRecordId, rows[1]?.sourceRecordId);
});

test("Deere application rows pass FarmVoice import normalization", () => {
  const [row] = deereApplicationRateResultToEquipmentRows({
    fieldName: "North Field",
    operation: applicationOperation,
  });
  const normalized = normalizeEquipmentImportRow(row!);

  assert.equal(normalized.source, "John Deere");
  assert.equal(normalized.fieldKey, "north field");
  assert.equal(normalized.product, "Atrazine");
  assert.equal(normalized.rate, 1.46);
  assert.equal(normalized.rateUnit, "L/ha");
  assert.equal(normalized.area, 19.21);
  assert.match(normalized.fingerprint, /^[a-f0-9]{64}$/);
});

test("returns no rows when ApplicationRateResult is absent", () => {
  const rows = deereApplicationRateResultToEquipmentRows({
    fieldName: "North Field",
    operation: {
      id: "op-1",
      measurementTypes: [{ measurementName: "ApplicationRateTarget" }],
    },
  });
  assert.deepEqual(rows, []);
});
