import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("homepage presents the full FarmVoice workflow and current pricing", async () => {
  const source = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  for (const phrase of [
    "Farm paperwork without the paperwork.",
    "Voice-first records",
    "Pesticide records",
    "Farm Map",
    "Crew scheduling & time",
    "Payroll & QuickBooks",
    "Ask FarmVoice",
    "Inspection packages",
    "Incoming-worker onboarding checklist",
    "Farm-level H-2A readiness checklist",
    "Housing properties, assignments, inspections",
    "Core $49/month",
    "+$149/month per farm",
    "100 GB included",
    "Unlimited workers",
  ]) assert.equal(source.includes(phrase), true, phrase);

  for (const href of [
    "/signup",
    "/demo",
    "/records",
    "/team",
    "/map",
    "/ask-farmvoice",
    "/inspection-package",
    "/integrations/quickbooks",
    "/h2a",
    "/h2a/arrival",
    "/billing",
  ]) assert.equal(source.includes(`"${href}"`), true, href);
});

test("homepage keeps compliance claims appropriately qualified", async () => {
  const source = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(source, /does not certify legal\s+compliance/);
  assert.doesNotMatch(source, /guarantee compliance/i);
  assert.doesNotMatch(source, /fully compliant/i);
});
