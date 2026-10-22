# FarmVoice Defense — prototype and feasibility plan

**Status:** Concept only; no government customer, authority to operate (ATO), or procurement award is claimed.

## Purpose
An installation-focused accountability and operations platform that connects supervisor-approved duty status, emergency muster, maintenance/work-order tracking, and optional exercise attendance. It does **not** replace ATAK, IPPS-A, ADPAAS, or military command-and-control systems.

## Decision
Keep the current FarmVoice agricultural application untouched. Use a separately deployed codebase, database, identity configuration, domains, telemetry, secrets, billing, and support process for any later defense product. This prototype lives in `prototypes/farmvoice-defense/index.html` and is intentionally unconnected to the production app.

## Existing capabilities that may be reusable *after review*
- Team scheduling, worker roles, manager approvals
- GPS-supported time and event records, configurable check-in concepts
- Audit and attachment workflows
- Report exports
- Farm-scoped Supabase RLS patterns as architectural inspiration, **not** as a verified defense-ready security boundary

## MVP acceptance criteria
1. Personnel roster and approved organizational units with explicit access scopes.
2. Duty status and attendance with consent/policy support, correction history, and supervisor review.
3. Authorized emergency muster activation and acknowledgement with a clear **unknown** state (never infer that missing GPS means a person is unsafe).
4. Non-sensitive maintenance work-order assignment, completion evidence, review, and exports.
5. Security event/audit logs and retention/deletion policies.
6. Separate operator/admin permissions and least privilege.
7. No live location ingestion by default. Evaluate only for authorized contexts with user notification and anti-stalking controls.
8. Offline behavior documented, including clock skew, conflicts, and queued events.
9. Tests for tenant isolation, denied authorization, data minimization, and false muster status.
10. Accessibility, incident response, backup and restoration test plans.

## Deferred
- Continuous location or tactical tracking; ATAK/TAK interoperability; classified/CUI processing; mapping combat units; external military identity federation; live government integrations.
- No assumption of FedRAMP, CMMC, NIST compliance, DoD authorization, or compliant hosting.
- No live enrollment, emergency dispatch, or alerting before a security/operations review.

## Build phases
**Phase 0:** Interview potential installation maintenance and emergency-management users; identify exact functional gaps and purchasing path.

**Phase 1:** Isolated clickable demonstration with synthetic records (this branch).

**Phase 2:** Independent authenticated MVP with test tenants, explicit roles, roster, muster and work orders; encrypted test data, auditability and comprehensive automated tests.

**Phase 3:** Third-party security architecture review; determine data classification, contract requirements and an appropriate approved hosting/ATO path before any government data.

**Phase 4:** Authorized limited pilot with documented success metrics: muster completion time, work-order latency, record correction rates, operator workload, and security incidents.

## SBIR alignment
Do not describe the FY2027 Release 1 counter-drone or other technical topics as a match without agency topic-specific confirmation. Seek a software-focused solicitation or a paying installation pilot. Separate entity eligibility, security authorization, and topic fit.

## Run the demonstration
Open `prototypes/farmvoice-defense/index.html` locally in a browser; no install, account, database or network is required. Changing tabs and the simulated muster counter are session-only. No data is stored or transmitted.

## Non-goals and safeguards
The prototype must not present real service members, precise locations, weapons, deployment movements, classified material, or command functions. Do not deploy to a production defense or government environment.
