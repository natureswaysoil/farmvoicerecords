import assert from "node:assert/strict";
import test from "node:test";
import {
  assertPesticideRecordComplete,
  PesticideRecordIncompleteError,
  validatePesticideRecord,
  type PesticideRecord,
} from "../src/compliance/pesticide-record-validation.ts";

const completeRecord: PesticideRecord = {
  isRestrictedUse: true,
  applicatorName: "Test Applicator",
  certificationNumber: "NC-123",
  productName: "Test product",
  epaRegNumber: "123-456",
  amountApplied: 2,
  amountUnit: "gallons",
  cropOrSite: "Pasture",
  fieldLocation: "North field",
  areaTreated: 1,
  areaUnit: "acres",
  applicationDate: "2026-09-28",
  recordCreatedAt: "2026-09-29T12:00:00Z",
};

test("complete restricted-use record can be confirmed", () => {
  assert.equal(validatePesticideRecord(completeRecord).complete, true);
  assert.doesNotThrow(() => assertPesticideRecordComplete(completeRecord));
});

test("incomplete restricted-use record is blocked at confirmation", () => {
  const record = { ...completeRecord, epaRegNumber: "" };
  const result = validatePesticideRecord(record);
  assert.equal(result.complete, false);
  assert.ok(result.missingFields.includes("EPA registration number"));
  assert.throws(
    () => assertPesticideRecordComplete(record),
    (error: unknown) => error instanceof PesticideRecordIncompleteError &&
      error.missingFields.includes("EPA registration number")
  );
});

test("invalid amounts and calendar dates block confirmation", () => {
  const result = validatePesticideRecord({
    ...completeRecord,
    amountApplied: 0,
    applicationDate: "2026-02-30",
  });
  assert.equal(result.complete, false);
  assert.ok(result.issues.some((issue) => issue.field === "amountApplied" && issue.kind === "invalid"));
  assert.ok(result.issues.some((issue) => issue.field === "applicationDate" && issue.kind === "invalid"));
});

test("spot-treatment shortcut applies only below one tenth acre", () => {
  const spot = {
    ...completeRecord,
    isSpotTreatment: true,
    areaTreated: 0.05,
    fieldLocation: "Spot treatment: north fence line",
    applicatorName: "",
    certificationNumber: "",
    cropOrSite: "",
  };
  const small = validatePesticideRecord(spot);
  assert.equal(small.federalSpotTreatmentUsed, true);
  assert.equal(small.complete, true);

  const large = validatePesticideRecord({ ...spot, areaTreated: 0.1 });
  assert.equal(large.federalSpotTreatmentUsed, false);
  assert.equal(large.complete, false);
});

test("late entry is flagged for review without discarding an otherwise complete record", () => {
  const result = validatePesticideRecord({
    ...completeRecord,
    applicationDate: "2026-09-01",
  });
  assert.equal(result.recordEntryOverdue, true);
  assert.equal(result.complete, true);
  assert.ok(result.issues.some((issue) => issue.kind === "timing"));
});
