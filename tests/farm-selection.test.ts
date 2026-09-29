import assert from "node:assert/strict";
import test from "node:test";
import { selectAuthorizedFarmId } from "../src/lib/farm-selection.ts";

test("single owner farm resolves without an explicit farm id", () => {
  assert.equal(selectAuthorizedFarmId([{ farm_id: "farm-a" }]), "farm-a");
});

test("explicit farm id resolves when the owner belongs to that farm", () => {
  assert.equal(
    selectAuthorizedFarmId([{ farm_id: "farm-a" }, { farm_id: "farm-b" }], "farm-b"),
    "farm-b"
  );
});

test("multiple owner farms require an explicit selection", () => {
  assert.throws(
    () => selectAuthorizedFarmId([{ farm_id: "farm-a" }, { farm_id: "farm-b" }]),
    /Multiple farms are available/
  );
});

test("cross-farm selection is rejected", () => {
  assert.throws(
    () => selectAuthorizedFarmId([{ farm_id: "farm-a" }], "farm-b"),
    /do not have owner access/
  );
});

test("a user with no owner membership is rejected", () => {
  assert.throws(() => selectAuthorizedFarmId([]), /Farm owner access is required/);
});
