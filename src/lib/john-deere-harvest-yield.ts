import type { EquipmentImportRow } from "@/src/lib/equipment-import";

type DeereMeasurement = {
  value?: unknown;
  unitId?: unknown;
};

type DeereHarvestMeasurement = {
  measurementName?: unknown;
  measurementCategory?: unknown;
  area?: DeereMeasurement | null;
  averageYield?: DeereMeasurement | null;
  averageWetMass?: DeereMeasurement | null;
  averageMoisture?: DeereMeasurement | null;
};

export type DeereHarvestFieldOperation = {
  id?: unknown;
  fieldOperationType?: unknown;
  startDate?: unknown;
  endDate?: unknown;
  cropName?: unknown;
  varieties?: Array<{ name?: unknown }> | null;
  measurementTypes?: DeereHarvestMeasurement[] | null;
  fieldOperationMachines?: Array<{
    vin?: unknown;
    GUID?: unknown;
    erid?: unknown;
  }> | null;
};

function cleanText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function measurementValue(measurement?: DeereMeasurement | null) {
  return measurement ? numberValue(measurement.value) : null;
}

function measurementUnit(measurement?: DeereMeasurement | null) {
  return measurement ? cleanText(measurement.unitId) || null : null;
}

function friendlyDeereUnit(unitId: string | null) {
  if (!unitId) return null;
  const known: Record<string, string> = {
    "[m3]1ha-1": "m3/ha",
    "m3": "m3",
    "t1ha-1": "t/ha",
    "kg1ha-1": "kg/ha",
    "bu1ac-1": "bu/ac",
    "lb1ac-1": "lb/ac",
    "ha": "ha",
    "ac": "ac",
    "prcnt": "%",
  };
  return known[unitId] ?? unitId;
}

function machineLabel(operation: DeereHarvestFieldOperation) {
  const machine = operation.fieldOperationMachines?.[0];
  if (!machine) return null;
  return (
    cleanText(machine.vin) ||
    cleanText(machine.GUID) ||
    cleanText(machine.erid) ||
    null
  );
}

function operationId(operation: DeereHarvestFieldOperation) {
  const id = cleanText(operation.id);
  if (!id) throw new Error("John Deere harvest operation is missing an id.");
  return id;
}

function findHarvestYieldResult(operation: DeereHarvestFieldOperation) {
  return operation.measurementTypes?.find(
    (measurement) =>
      cleanText(measurement.measurementName).toLowerCase() ===
      "harvestyieldresult",
  );
}

function cropLabel(operation: DeereHarvestFieldOperation) {
  const variety = cleanText(operation.varieties?.[0]?.name);
  if (variety) return variety;
  const crop = cleanText(operation.cropName);
  return crop || null;
}

export function deereHarvestYieldResultToEquipmentRow(args: {
  fieldName: string;
  operation: DeereHarvestFieldOperation;
}): EquipmentImportRow | null {
  const fieldName = args.fieldName.trim();
  if (!fieldName) throw new Error("FarmVoice field name is required.");

  const operation = args.operation;
  const id = operationId(operation);
  const measurement = findHarvestYieldResult(operation);
  if (!measurement) return null;

  const averageYield =
    measurementValue(measurement.averageYield) ??
    measurementValue(measurement.averageWetMass);
  const yieldUnit =
    friendlyDeereUnit(measurementUnit(measurement.averageYield)) ??
    friendlyDeereUnit(measurementUnit(measurement.averageWetMass));

  if (averageYield === null) return null;

  const moisture = measurementValue(measurement.averageMoisture);
  const area = measurementValue(measurement.area);

  return {
    source: "John Deere",
    sourceRecordId: `${id}:HarvestYieldResult`,
    machine: machineLabel(operation),
    operation: "Harvest",
    field: fieldName,
    startedAt: cleanText(operation.startDate) || null,
    endedAt: cleanText(operation.endDate) || null,
    product: cropLabel(operation),
    rate: null,
    rateUnit: null,
    area,
    areaUnit: friendlyDeereUnit(measurementUnit(measurement.area)),
    yieldValue: averageYield,
    yieldUnit,
    moisture,
  };
}
