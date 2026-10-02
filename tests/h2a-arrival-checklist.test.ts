import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  CHECKLIST_VERSION,
  FARM_READINESS_CHECKLIST,
  WORKER_ARRIVAL_CHECKLIST,
  checklistProgress,
  suggestedDueOn,
} from "../src/lib/h2a-arrival-checklist.ts";

test("H-2A arrival checklist includes the full worker and farm readiness sets", () => {
  assert.equal(CHECKLIST_VERSION, "federal-2026-v1");
  assert.equal(WORKER_ARRIVAL_CHECKLIST.length, 25);
  assert.equal(FARM_READINESS_CHECKLIST.length, 11);
  assert.equal(
    new Set(WORKER_ARRIVAL_CHECKLIST.map((item) => item.key)).size,
    WORKER_ARRIVAL_CHECKLIST.length,
  );
  assert.equal(
    new Set(FARM_READINESS_CHECKLIST.map((item) => item.key)).size,
    FARM_READINESS_CHECKLIST.length,
  );
});

test("I-9 Section 2 suggested deadline is three business days after first work", () => {
  const definition = WORKER_ARRIVAL_CHECKLIST.find(
    (item) => item.key === "i9_section2",
  );
  assert.ok(definition);
  assert.equal(
    suggestedDueOn(definition!, {
      firstWorkDate: "2026-10-02",
      contractStart: "2026-10-01",
      contractEnd: "2026-12-31",
    }),
    "2026-10-07",
  );
});

test("inbound reimbursement checkpoint uses the middle of the contract period", () => {
  const definition = WORKER_ARRIVAL_CHECKLIST.find(
    (item) => item.key === "inbound_reimbursement_50pct",
  );
  assert.ok(definition);
  assert.equal(
    suggestedDueOn(definition!, {
      contractStart: "2026-10-01",
      contractEnd: "2026-10-31",
    }),
    "2026-10-16",
  );
});

test("checklist progress treats complete and documented exceptions as reviewed", () => {
  const definitions = WORKER_ARRIVAL_CHECKLIST.slice(0, 4);
  const progress = checklistProgress(definitions, [
    { item_key: definitions[0].key, status: "complete" },
    { item_key: definitions[1].key, status: "exception" },
  ]);
  assert.equal(progress.total, 4);
  assert.equal(progress.complete, 2);
  assert.equal(progress.attention, 2);
  assert.equal(progress.percent, 50);
});

test("federal checklist sources are official agency URLs", () => {
  for (const item of [
    ...WORKER_ARRIVAL_CHECKLIST,
    ...FARM_READINESS_CHECKLIST,
  ]) {
    assert.match(
      item.sourceUrl,
      /^https:\/\/(www\.)?(dol\.gov|uscis\.gov|irs\.gov)\//,
      item.key,
    );
  }
});

test("arrival checklist migration enforces admin RLS, audit and evidence targets", async () => {
  const source = await readFile(
    new URL(
      "../supabase/migrations/20261002174500_h2a_arrival_checklists.sql",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(source, /enable row level security/);
  assert.match(source, /h2a arrival checklist admin manage/);
  assert.match(source, /h2a readiness checklist admin manage/);
  assert.match(source, /private\.h2a_has_role\(farm_id,array\['h2a_admin'\]\)/);
  assert.match(source, /h2a_worker_arrival_checklist_audit/);
  assert.match(source, /h2a_farm_readiness_checklist_audit/);
  assert.match(source, /require_farm_write_plan/);
  assert.match(source, /h2a_worker_arrival_seed/);
  assert.match(source, /h2a_contract_readiness_seed/);
  assert.match(source, /where w\.worker_type='h2a'/);
  assert.match(source, /on delete set null \(contract_id\)/);
  assert.match(source, /p_record_type='arrival_checklist'/);
  assert.match(source, /p_record_type='readiness_checklist'/);
});

test("arrival workspace is linked, cached and keeps the I-9 disclaimer", async () => {
  const [dashboard, page, pwa, sw, ask] = await Promise.all([
    readFile(new URL("../app/h2a/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/h2a/arrival/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/pwa-register.tsx", import.meta.url), "utf8"),
    readFile(new URL("../public/sw.js", import.meta.url), "utf8"),
    readFile(new URL("../app/api/ask-farmvoice/route.ts", import.meta.url), "utf8"),
  ]);
  assert.match(dashboard, /href="\/h2a\/arrival"/);
  assert.match(page, /does\s+not replace Form I-9/);
  assert.match(page, /Exception \/ not applicable/);
  assert.match(page, /SmartPhotoEvidence/);
  assert.match(pwa, /"\/h2a\/arrival"/);
  assert.match(sw, /"\/h2a\/arrival"/);
  assert.match(ask, /h2a_worker_arrival_checklist/);
  assert.match(ask, /h2a_farm_readiness_checklist/);
});


test("arrival workspace never falls back to a non-H-2A worker", async () => {
  const source = await readFile(
    new URL("../app/h2a/arrival/page.tsx", import.meta.url),
    "utf8",
  );
  assert.match(
    source,
    /nextWorkers\.find\(\(worker\) => worker\.worker_type === "h2a"\) \?\?\s*null/,
  );
  assert.doesNotMatch(source, /nextWorkers\[0\]/);
  assert.doesNotMatch(source, /ensureWorkerChecklist/);
  assert.doesNotMatch(source, /ensureReadinessChecklist/);
});

test("editing a completed checklist row preserves its original completion actor and timestamp", async () => {
  const source = await readFile(
    new URL("../app/h2a/arrival/page.tsx", import.meta.url),
    "utf8",
  );
  assert.match(source, /const wasCompleted =/);
  assert.match(source, /const enteringCompletion = completed && !wasCompleted/);
  assert.match(source, /: row\.completed_at/);
  assert.match(source, /: row\.completed_by/);
});

test("checklist migration provisions all existing and future H-2A workers and contracts", async () => {
  const source = await readFile(
    new URL(
      "../supabase/migrations/20261002174500_h2a_arrival_checklists.sql",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(source, /after insert or update of worker_type,contract_id,first_work_date on public\.h2a_workers/);
  assert.match(source, /after insert on public\.h2a_contracts/);
  assert.match(source, /insert into public\.h2a_worker_arrival_checklist/);
  assert.match(source, /insert into public\.h2a_farm_readiness_checklist/);
  assert.match(source, /cross join unnest\(array\[/);
});
