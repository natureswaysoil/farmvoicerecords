// Nationwide restricted-use pesticide (RUP) recordkeeping validation
// Federal baseline: 7 U.S.C. § 136i-1 and USDA AMS pesticide recordkeeping guidance.
//
// IMPORTANT:
// - Validates the federal private-applicator RUP baseline.
// - States may require additional fields, longer retention, or additional categories.
// - Run validatePesticideRecord() at the persistence boundary and block confirmed
//   saves when complete === false.
// - Add verified state-specific validators through STATE_VALIDATORS.

export interface PesticideRecord {
  applicatorName?: string;
  certificationNumber?: string;
  productName?: string;
  epaRegNumber?: string;
  amountApplied?: number | string;
  amountUnit?: string;
  cropOrSite?: string;
  fieldLocation?: string;
  areaTreated?: number | string;
  areaUnit?: string;
  applicationDate?: string;
  state?: string;
  isRestrictedUse: boolean;
  isSpotTreatment?: boolean;
  isGreenhouseOrNursery?: boolean;
  stateFields?: Record<string, unknown>;
}

export interface ValidationIssue {
  field: string;
  label: string;
  source: "federal" | "state";
  message: string;
}

export interface ValidationResult {
  complete: boolean;
  missingFields: string[];
  requiredFields: string[];
  issues: ValidationIssue[];
  federalComplete: boolean;
  stateComplete: boolean;
  federalSpotTreatmentUsed: boolean;
}

type FieldRequirement = {
  key: keyof PesticideRecord;
  label: string;
};

export type StateValidator = (record: PesticideRecord) => ValidationIssue[];

const FEDERAL_FULL_APPLICATION_FIELDS: FieldRequirement[] = [
  { key: "applicatorName", label: "Applicator name" },
  { key: "certificationNumber", label: "Certification number" },
  { key: "productName", label: "Brand or product name" },
  { key: "epaRegNumber", label: "EPA registration number" },
  { key: "amountApplied", label: "Total amount applied" },
  { key: "amountUnit", label: "Amount unit" },
  { key: "cropOrSite", label: "Crop, commodity, or site treated" },
  { key: "fieldLocation", label: "Field location" },
  { key: "areaTreated", label: "Size of area treated" },
  { key: "areaUnit", label: "Area unit" },
  { key: "applicationDate", label: "Date of application" },
];

const FEDERAL_SPOT_TREATMENT_FIELDS: FieldRequirement[] = [
  { key: "productName", label: "Brand or product name" },
  { key: "epaRegNumber", label: "EPA registration number" },
  { key: "amountApplied", label: "Total amount applied" },
  { key: "amountUnit", label: "Amount unit" },
  { key: "fieldLocation", label: "Spot application location" },
  { key: "applicationDate", label: "Date of application" },
];

function hasValue(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (typeof value === "number") return Number.isFinite(value);
  return true;
}

function numericValue(value: number | string | undefined): number | null {
  if (value === undefined) return null;
  const parsed = typeof value === "number" ? value : Number(value.trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeUnit(unit?: string): string {
  return unit?.trim().toLowerCase() ?? "";
}

function areaInAcres(record: PesticideRecord): number | null {
  const value = numericValue(record.areaTreated);
  if (value === null || value < 0) return null;

  switch (normalizeUnit(record.areaUnit)) {
    case "acre":
    case "acres":
    case "ac":
      return value;
    case "sq ft":
    case "sqft":
    case "square foot":
    case "square feet":
    case "ft2":
    case "ft^2":
      return value / 43560;
    case "sq yd":
    case "sqyd":
    case "square yard":
    case "square yards":
    case "yd2":
    case "yd^2":
      return value / 4840;
    case "hectare":
    case "hectares":
    case "ha":
      return value * 2.4710538147;
    default:
      return null;
  }
}

export function qualifiesForFederalSpotTreatment(record: PesticideRecord): boolean {
  if (!record.isRestrictedUse || !record.isSpotTreatment || record.isGreenhouseOrNursery) {
    return false;
  }

  const acres = areaInAcres(record);
  return acres !== null && acres < 0.1;
}

function validSpotLocation(value?: string): boolean {
  if (!value) return false;
  return /^spot (application|treatment)\b.+/i.test(value.trim());
}

function validateFederal(record: PesticideRecord): {
  issues: ValidationIssue[];
  requiredFields: string[];
  spotTreatmentUsed: boolean;
} {
  if (!record.isRestrictedUse) {
    return { issues: [], requiredFields: [], spotTreatmentUsed: false };
  }

  const spotTreatmentUsed = qualifiesForFederalSpotTreatment(record);
  const fieldSet = spotTreatmentUsed
    ? FEDERAL_SPOT_TREATMENT_FIELDS
    : FEDERAL_FULL_APPLICATION_FIELDS;

  const issues: ValidationIssue[] = fieldSet
    .filter((field) => !hasValue(record[field.key]))
    .map((field) => ({
      field: String(field.key),
      label: field.label,
      source: "federal" as const,
      message: `${field.label} is required for this restricted-use pesticide record.`,
    }));

  if (spotTreatmentUsed && !validSpotLocation(record.fieldLocation)) {
    issues.push({
      field: "fieldLocation",
      label: "Spot application location",
      source: "federal",
      message:
        'For a federal spot-treatment record, enter "Spot application" or "Spot treatment" followed by a brief location description.',
    });
  }

  if (record.isSpotTreatment && !spotTreatmentUsed) {
    issues.push({
      field: "isSpotTreatment",
      label: "Spot treatment qualification",
      source: "federal",
      message:
        "This application does not qualify for the federal spot-treatment shortcut. Complete the full RUP record.",
    });
  }

  return {
    issues,
    requiredFields: fieldSet.map((field) => field.label),
    spotTreatmentUsed,
  };
}

export const STATE_VALIDATORS: Partial<Record<string, StateValidator>> = {};

export function registerStateValidator(state: string, validator: StateValidator): void {
  STATE_VALIDATORS[state.trim().toUpperCase()] = validator;
}

function validateState(record: PesticideRecord): ValidationIssue[] {
  const state = record.state?.trim().toUpperCase();
  if (!state) return [];
  const validator = STATE_VALIDATORS[state];
  return validator ? validator(record) : [];
}

export function validatePesticideRecord(record: PesticideRecord): ValidationResult {
  const federal = validateFederal(record);
  const stateIssues = validateState(record);
  const issues = [...federal.issues, ...stateIssues];

  return {
    complete: federal.issues.length === 0 && stateIssues.length === 0,
    missingFields: issues.map((issue) => issue.label),
    requiredFields: federal.requiredFields,
    issues,
    federalComplete: federal.issues.length === 0,
    stateComplete: stateIssues.length === 0,
    federalSpotTreatmentUsed: federal.spotTreatmentUsed,
  };
}

export function assertPesticideRecordComplete(record: PesticideRecord): void {
  const result = validatePesticideRecord(record);
  if (!result.complete) throw new PesticideRecordIncompleteError(result);
}

export class PesticideRecordIncompleteError extends Error {
  readonly result: ValidationResult;
  readonly missingFields: string[];

  constructor(result: ValidationResult) {
    super(`Pesticide record is missing required fields: ${result.missingFields.join(", ")}`);
    this.name = "PesticideRecordIncompleteError";
    this.result = result;
    this.missingFields = result.missingFields;
  }
}
