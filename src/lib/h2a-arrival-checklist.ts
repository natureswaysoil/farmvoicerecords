export type ChecklistStatus =
  | "required_now"
  | "due_later"
  | "complete"
  | "exception";

export type WorkerChecklistContext = {
  arrivalDate?: string | null;
  firstWorkDate?: string | null;
  contractStart?: string | null;
  contractEnd?: string | null;
};

export type ChecklistDefinition = {
  key: string;
  title: string;
  group: string;
  description: string;
  sourceLabel: string;
  sourceUrl: string;
  defaultStatus: ChecklistStatus;
  dueOn?: (context: WorkerChecklistContext) => string | null;
};

const DOL_26 =
  "https://www.dol.gov/agencies/whd/fact-sheets/26-H2A";
const DOL_26B =
  "https://www.dol.gov/agencies/whd/fact-sheets/26b-disclosure-job-order-notice-H-2A";
const DOL_WORKERS =
  "https://www.dol.gov/agencies/whd/workers/h2a";
const DOL_TRAVEL =
  "https://www.dol.gov/agencies/eta/foreign-labor/wages/meals-travel-subsistence";
const USCIS_I9 =
  "https://www.uscis.gov/i-9-central/form-i-9-resources";
const IRS_H2A =
  "https://www.irs.gov/individuals/international-taxpayers/foreign-agricultural-workers";

function addBusinessDays(date: string, days: number) {
  const value = new Date(date + "T12:00:00.000Z");
  let remaining = days;
  while (remaining > 0) {
    value.setUTCDate(value.getUTCDate() + 1);
    const weekday = value.getUTCDay();
    if (weekday !== 0 && weekday !== 6) remaining -= 1;
  }
  return value.toISOString().slice(0, 10);
}

export const WORKER_ARRIVAL_CHECKLIST: ChecklistDefinition[] = [
  {
    key: "work_contract_disclosed",
    title: "Work contract / certified job order provided",
    group: "Job order & worker rights",
    description:
      "Record when the worker received the work contract or certified job order and the language used. For an H-2A worker abroad, this disclosure is generally due no later than the visa-application stage.",
    sourceLabel: "DOL Fact Sheets #26 and #26B",
    sourceUrl: DOL_26B,
    defaultStatus: "required_now",
  },
  {
    key: "wage_terms_reviewed",
    title: "Wage, pay frequency and piece-rate terms reviewed",
    group: "Job order & worker rights",
    description:
      "Confirm the wage terms that appear in the certified job order were reviewed with the worker.",
    sourceLabel: "DOL Fact Sheet #26",
    sourceUrl: DOL_26,
    defaultStatus: "required_now",
  },
  {
    key: "deductions_disclosed",
    title: "Non-required deductions disclosed",
    group: "Job order & worker rights",
    description:
      "Confirm any deductions not required by law were disclosed in writing as required by the job order.",
    sourceLabel: "DOL H-2A Worker Rights",
    sourceUrl: DOL_WORKERS,
    defaultStatus: "required_now",
  },
  {
    key: "worker_rights_notice",
    title: "Worker-rights information provided",
    group: "Job order & worker rights",
    description:
      "Record the worker-rights information provided and the language used. This does not replace the separate workplace poster requirement.",
    sourceLabel: "DOL Fact Sheet #26B",
    sourceUrl: DOL_26B,
    defaultStatus: "required_now",
  },
  {
    key: "i9_section1",
    title: "Official Form I-9 Section 1 completed",
    group: "Employment authorization",
    description:
      "Track completion of the official Form I-9. FarmVoice does not replace Form I-9.",
    sourceLabel: "USCIS Form I-9 instructions",
    sourceUrl: USCIS_I9,
    defaultStatus: "required_now",
    dueOn: (context) => context.firstWorkDate ?? null,
  },
  {
    key: "i9_section2",
    title: "Official Form I-9 Section 2 completed",
    group: "Employment authorization",
    description:
      "Track employer/authorized-representative completion. Do not require a specific document; the worker chooses acceptable documentation.",
    sourceLabel: "USCIS Form I-9 instructions",
    sourceUrl: USCIS_I9,
    defaultStatus: "required_now",
    dueOn: (context) =>
      context.firstWorkDate ? addBusinessDays(context.firstWorkDate, 3) : null,
  },
  {
    key: "work_authorization_dates",
    title: "Work-authorization period recorded",
    group: "Employment authorization",
    description:
      "Record the authorized work period and expiration alert used by FarmVoice.",
    sourceLabel: "USCIS Form I-9 resources",
    sourceUrl: USCIS_I9,
    defaultStatus: "required_now",
  },
  {
    key: "tin_ssn_status",
    title: "SSN/TIN status recorded",
    group: "Payroll & tax",
    description:
      "Record whether a valid taxpayer identification number is on file, pending or unavailable so payroll reporting can be reviewed.",
    sourceLabel: "IRS H-2A agricultural worker guidance",
    sourceUrl: IRS_H2A,
    defaultStatus: "due_later",
  },
  {
    key: "federal_withholding_election",
    title: "Federal withholding election recorded",
    group: "Payroll & tax",
    description:
      "Record whether there is no voluntary federal withholding or a voluntary Form W-4 agreement. H-2A agricultural wages are generally not subject to mandatory federal income-tax withholding unless backup withholding applies.",
    sourceLabel: "IRS H-2A agricultural worker guidance",
    sourceUrl: IRS_H2A,
    defaultStatus: "required_now",
  },
  {
    key: "payroll_setup",
    title: "Payroll profile and payday setup reviewed",
    group: "Payroll & tax",
    description:
      "Confirm payroll setup reflects the certified job-order wage and pay frequency.",
    sourceLabel: "DOL H-2A Worker Rights",
    sourceUrl: DOL_WORKERS,
    defaultStatus: "required_now",
  },
  {
    key: "housing_assignment",
    title: "Housing assignment recorded",
    group: "Housing & daily transportation",
    description:
      "If employer-provided H-2A housing applies, record the certified housing assignment and move-in date.",
    sourceLabel: "DOL H-2A Worker Rights",
    sourceUrl: DOL_WORKERS,
    defaultStatus: "required_now",
  },
  {
    key: "housing_no_charge",
    title: "No-charge housing confirmed",
    group: "Housing & daily transportation",
    description:
      "Confirm employer-provided housing is furnished without charge when required by the H-2A job order.",
    sourceLabel: "DOL H-2A Worker Rights",
    sourceUrl: DOL_WORKERS,
    defaultStatus: "required_now",
  },
  {
    key: "housing_rules",
    title: "Housing rules/orientation documented",
    group: "Housing & daily transportation",
    description:
      "Record housing orientation or rules provided to the worker and the language used.",
    sourceLabel: "FarmVoice operational control",
    sourceUrl: DOL_WORKERS,
    defaultStatus: "required_now",
  },
  {
    key: "daily_transportation",
    title: "Daily housing-to-worksite transportation arranged",
    group: "Housing & daily transportation",
    description:
      "Confirm the no-cost daily transportation arrangement required when employer-provided housing applies.",
    sourceLabel: "DOL H-2A Worker Rights",
    sourceUrl: DOL_WORKERS,
    defaultStatus: "required_now",
  },
  {
    key: "inbound_costs_recorded",
    title: "Inbound transportation, meals and lodging costs recorded",
    group: "Travel & prohibited fees",
    description:
      "Record worker-paid inbound travel, subsistence and necessary lodging costs so reimbursement obligations can be reviewed.",
    sourceLabel: "DOL travel/subsistence guidance",
    sourceUrl: DOL_TRAVEL,
    defaultStatus: "required_now",
  },
  {
    key: "recruitment_fee_interview",
    title: "Recruitment / job-access fee interview completed",
    group: "Travel & prohibited fees",
    description:
      "Ask whether the worker paid a recruiter or other prohibited job-access/certification-related fee and document the response.",
    sourceLabel: "DOL H-2A Worker Rights",
    sourceUrl: DOL_WORKERS,
    defaultStatus: "required_now",
  },
  {
    key: "fee_reimbursement_review",
    title: "Prohibited-fee reimbursement reviewed",
    group: "Travel & prohibited fees",
    description:
      "If the worker reports prohibited fees, document the employer review and reimbursement action.",
    sourceLabel: "DOL H-2A Worker Rights",
    sourceUrl: DOL_WORKERS,
    defaultStatus: "due_later",
  },
  {
    key: "inbound_reimbursement_50pct",
    title: "50% inbound reimbursement checkpoint scheduled",
    group: "Travel & prohibited fees",
    description:
      "Track the H-2A inbound transportation and subsistence reimbursement checkpoint when the worker completes 50% of the contract period.",
    sourceLabel: "DOL travel/subsistence guidance",
    sourceUrl: DOL_TRAVEL,
    defaultStatus: "due_later",
  },
  {
    key: "workers_comp",
    title: "Workers’ compensation coverage confirmed",
    group: "Employment conditions",
    description:
      "Confirm applicable workers’ compensation coverage is in place for the H-2A employment.",
    sourceLabel: "DOL H-2A Worker Rights",
    sourceUrl: DOL_WORKERS,
    defaultStatus: "required_now",
  },
  {
    key: "tools_equipment",
    title: "Required tools, supplies and equipment available at no cost",
    group: "Employment conditions",
    description:
      "Confirm employer-provided required tools, supplies and equipment are available without charge to the worker.",
    sourceLabel: "DOL H-2A Worker Rights",
    sourceUrl: DOL_WORKERS,
    defaultStatus: "required_now",
  },
  {
    key: "meal_arrangement",
    title: "Meal / kitchen arrangement confirmed",
    group: "Employment conditions",
    description:
      "Confirm the meal or cooking-facility arrangement matches the certified job order.",
    sourceLabel: "DOL Fact Sheet #26",
    sourceUrl: DOL_26,
    defaultStatus: "required_now",
  },
  {
    key: "safety_orientation",
    title: "Safety / job orientation recorded",
    group: "Orientation",
    description:
      "Record relevant safety/job orientation, date, instructor and language.",
    sourceLabel: "FarmVoice operational control",
    sourceUrl: DOL_WORKERS,
    defaultStatus: "required_now",
  },
  {
    key: "emergency_contact",
    title: "Emergency contact recorded",
    group: "Orientation",
    description:
      "Record the worker’s emergency contact information in the roster.",
    sourceLabel: "FarmVoice operational control",
    sourceUrl: DOL_WORKERS,
    defaultStatus: "required_now",
  },
  {
    key: "first_work_date",
    title: "Actual first work date recorded",
    group: "Orientation",
    description:
      "Record the actual first day of work used for I-9 timing, payroll and contract tracking.",
    sourceLabel: "USCIS Form I-9 instructions",
    sourceUrl: USCIS_I9,
    defaultStatus: "required_now",
    dueOn: (context) => context.firstWorkDate ?? context.contractStart ?? null,
  },
  {
    key: "three_fourths_tracking",
    title: "Three-fourths guarantee tracking initialized",
    group: "Ongoing H-2A controls",
    description:
      "Confirm FarmVoice is tracking hours offered and worked against the job order for later three-fourths review.",
    sourceLabel: "DOL H-2A Worker Rights",
    sourceUrl: DOL_WORKERS,
    defaultStatus: "due_later",
  },
];

export const FARM_READINESS_CHECKLIST: ChecklistDefinition[] = [
  {
    key: "certified_job_order",
    title: "Certified job order / work contract on file",
    group: "Job order",
    description:
      "Keep the certified job order/work-contract record available for disclosure and review.",
    sourceLabel: "DOL Fact Sheet #26",
    sourceUrl: DOL_26,
    defaultStatus: "required_now",
  },
  {
    key: "rights_poster_english",
    title: "H-2A worker-rights poster posted in English",
    group: "Worker notices",
    description:
      "Post and maintain the current DOL H-2A worker-rights poster in a conspicuous place.",
    sourceLabel: "DOL Fact Sheet #26B",
    sourceUrl: DOL_26B,
    defaultStatus: "required_now",
  },
  {
    key: "rights_poster_other_languages",
    title: "Additional worker-rights poster language reviewed",
    group: "Worker notices",
    description:
      "Where a significant portion of workers are not fluent in English, review whether an available DOL translation must also be posted.",
    sourceLabel: "DOL Fact Sheet #26B",
    sourceUrl: DOL_26B,
    defaultStatus: "required_now",
  },
  {
    key: "housing_certification",
    title: "Housing certification / inspection current",
    group: "Housing",
    description:
      "Confirm required employer-provided housing has current inspection/certification records before occupancy.",
    sourceLabel: "DOL H-2A Worker Rights",
    sourceUrl: DOL_WORKERS,
    defaultStatus: "required_now",
  },
  {
    key: "workers_comp_current",
    title: "Workers’ compensation coverage current",
    group: "Insurance",
    description:
      "Verify applicable workers’ compensation coverage for the job-order period.",
    sourceLabel: "DOL H-2A Worker Rights",
    sourceUrl: DOL_WORKERS,
    defaultStatus: "required_now",
  },
  {
    key: "daily_transport_plan",
    title: "Daily transportation plan ready",
    group: "Transportation",
    description:
      "Confirm a no-cost housing-to-worksite transportation plan where required.",
    sourceLabel: "DOL H-2A Worker Rights",
    sourceUrl: DOL_WORKERS,
    defaultStatus: "required_now",
  },
  {
    key: "wage_rate_verified",
    title: "Job-order wage rate verified",
    group: "Payroll",
    description:
      "Verify configured payroll rates against the certified job order and current applicable wage requirements before payroll starts.",
    sourceLabel: "DOL Fact Sheet #26",
    sourceUrl: DOL_26,
    defaultStatus: "required_now",
  },
  {
    key: "pay_statement_setup",
    title: "Pay-statement fields and pay frequency ready",
    group: "Payroll",
    description:
      "Confirm payroll can produce the required itemized wage statement information and agreed pay frequency.",
    sourceLabel: "DOL H-2A Worker Rights",
    sourceUrl: DOL_WORKERS,
    defaultStatus: "required_now",
  },
  {
    key: "recruiter_fee_controls",
    title: "Recruiter / prohibited-fee controls documented",
    group: "Recruitment",
    description:
      "Keep employer/agent controls documenting that prohibited recruitment and certification costs are not shifted to workers.",
    sourceLabel: "DOL H-2A Worker Rights",
    sourceUrl: DOL_WORKERS,
    defaultStatus: "required_now",
  },
  {
    key: "meal_arrangement_ready",
    title: "Meal or cooking-facility arrangement ready",
    group: "Housing & meals",
    description:
      "Confirm the arrangement matches the certified job order before workers arrive.",
    sourceLabel: "DOL Fact Sheet #26",
    sourceUrl: DOL_26,
    defaultStatus: "required_now",
  },
  {
    key: "record_retention_process",
    title: "H-2A record-retention process ready",
    group: "Records",
    description:
      "Confirm the farm has a process to retain required H-2A records and supporting evidence.",
    sourceLabel: "DOL H-2A recordkeeping guidance",
    sourceUrl: "https://www.dol.gov/agencies/whd/fact-sheets/26c-records-retention-requirements-H-2A",
    defaultStatus: "required_now",
  },
];

export const CHECKLIST_VERSION = "federal-2026-v1";

export function suggestedDueOn(
  definition: ChecklistDefinition,
  context: WorkerChecklistContext,
) {
  return definition.dueOn?.(context) ?? null;
}

export function checklistProgress(
  definitions: ChecklistDefinition[],
  rows: Array<{ item_key: string; status: ChecklistStatus }>,
) {
  const byKey = new Map(rows.map((row) => [row.item_key, row.status]));
  let complete = 0;
  let attention = 0;
  for (const item of definitions) {
    const status = byKey.get(item.key) ?? item.defaultStatus;
    if (status === "complete" || status === "exception") complete += 1;
    else attention += 1;
  }
  return {
    complete,
    attention,
    total: definitions.length,
    percent: definitions.length
      ? Math.round((complete / definitions.length) * 100)
      : 0,
  };
}
