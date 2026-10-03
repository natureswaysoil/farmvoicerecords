import type { EquipmentImportRow } from "@/src/lib/equipment-import";

type DeereMeasurement = {
  value?: unknown;
  unitId?: unknown;
};

type DeereProductTotal = {
  productId?: unknown;
  name?: unknown;
  brand?: unknown;
  carrier?: unknown;
  totalMaterial?: DeereMeasurement | null;
  averageMaterial?: DeereMeasurement | null;
};

type DeereApplicationProductTotal = {
  productId?: unknown;
  name?: unknown;
  area?: DeereMeasurement | null;
  appliedArea?: DeereMeasurement | null;
  averageMaterial?: DeereMeasurement | null;
  totalMaterial?: DeereMeasurement | null;
  productTotals?: DeereProductTotal[] | null;
};

type DeereFieldOperationMeasurement = {
  measurementName?: unknown;
  measurementCategory?: unknown;
  applicationProductTotals?: DeereApplicationProductTotal[] | null;
};

export type DeereFieldOperation = {
  id?: unknown;
  fieldOperationType?: unknown;
  startDate?: unknown;
  endDate?: unknown;
  products?: Array<{
    productId?: unknown;
    guid?: unknown;
    name?: unknown;
    tankMix?: unknown;
  }> | null;
  measurementTypes?: DeereFieldOperationMeasurement[] | null;
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
    "l1ha-1": "L/ha",
    "ml1ha-1": "mL/ha",
    "kg1ha-1": "kg/ha",
    "g1ha-1": "g/ha",
    "gal1ac-1": "gal/ac",
    "qt1ac-1": "qt/ac",
    "pt1ac-1": "pt/ac",
    "fl_oz1ac-1": "fl oz/ac",
    ha: "ha",
    ac: "ac",
    l: "L",
    gal: "gal",
    kg: "kg",
    lb: "lb",
  };
  return known[unitId] ?? unitId;
}

function machineLabel(operation: DeereFieldOperation) {
  const machine = operation.fieldOperationMachines?.[0];
  if (!machine) return null;
  return (
    cleanText(machine.vin) ||
    cleanText(machine.GUID) ||
    cleanText(machine.erid) ||
    null
  );
}

function operationId(operation: DeereFieldOperation) {
  const id = cleanText(operation.id);
  if (!id) throw new Error("John Deere field operation is missing an id.");
  return id;
}

function findApplicationRateResult(operation: DeereFieldOperation) {
  return operation.measurementTypes?.find(
    (measurement) =>
      cleanText(measurement.measurementName).toLowerCase() ===
      "applicationrateresult",
  );
}

function findProductName(
  operation: DeereFieldOperation,
  applicationTotal: DeereApplicationProductTotal,
  productTotal?: DeereProductTotal,
) {
  const nestedName = cleanText(productTotal?.name);
  if (nestedName) return nestedName;

  const totalName = cleanText(applicationTotal.name);
  if (totalName) return totalName;

  const nestedId = cleanText(productTotal?.productId);
  const applicationId = cleanText(applicationTotal.productId);
  const matched = operation.products?.find((product) => {
    const productId = cleanText(product.productId);
    const guid = cleanText(product.guid);
    return [nestedId, applicationId].some(
      (candidate) => candidate && (candidate === productId || candidate === guid),
    );
  });
  return cleanText(matched?.name) || "John Deere application product";
}

function productKey(
  applicationTotal: DeereApplicationProductTotal,
  productTotal?: DeereProductTotal,
  index = 0,
) {
  return (
    cleanText(productTotal?.productId) ||
    cleanText(applicationTotal.productId) ||
    cleanText(productTotal?.name) ||
    cleanText(applicationTotal.name) ||
    String(index + 1)
  );
}

function chooseRate(
  applicationTotal: DeereApplicationProductTotal,
  productTotal?: DeereProductTotal,
) {
  const measurement =
    productTotal?.averageMaterial ?? applicationTotal.averageMaterial ?? null;
  return {
    value: measurementValue(measurement),
    unit: friendlyDeereUnit(measurementUnit(measurement)),
  };
}

function chooseArea(applicationTotal: DeereApplicationProductTotal) {
  const measurement = applicationTotal.appliedArea ?? applicationTotal.area ?? null;
  return {
    value: measurementValue(measurement),
    unit: friendlyDeereUnit(measurementUnit(measurement)),
  };
}

export function deereApplicationRateResultToEquipmentRows(args: {
  fieldName: string;
  operation: DeereFieldOperation;
}): EquipmentImportRow[] {
  const fieldName = args.fieldName.trim();
  if (!fieldName) throw new Error("FarmVoice field name is required.");

  const operation = args.operation;
  const id = operationId(operation);
  const measurement = findApplicationRateResult(operation);
  if (!measurement) return [];

  const applicationTotals = measurement.applicationProductTotals ?? [];
  const rows: EquipmentImportRow[] = [];

  applicationTotals.forEach((applicationTotal, applicationIndex) => {
    const nestedTotals = applicationTotal.productTotals?.length
      ? applicationTotal.productTotals
      : [undefined];

    nestedTotals.forEach((productTotal, productIndex) => {
      const rate = chooseRate(applicationTotal, productTotal);
      const area = chooseArea(applicationTotal);

      if (rate.value === null && area.value === null) return;

      const key = productKey(
        applicationTotal,
        productTotal,
        applicationIndex * 1000 + productIndex,
      );

      rows.push({
        source: "John Deere",
        sourceRecordId: `${id}:ApplicationRateResult:${key}`,
        machine: machineLabel(operation),
        operation: "Application",
        field: fieldName,
        startedAt: cleanText(operation.startDate) || null,
        endedAt: cleanText(operation.endDate) || null,
        product: findProductName(operation, applicationTotal, productTotal),
        rate: rate.value,
        rateUnit: rate.unit,
        area: area.value,
        areaUnit: area.unit,
        yieldValue: null,
        yieldUnit: null,
        moisture: null,
      });
    });
  });

  return rows;
}
