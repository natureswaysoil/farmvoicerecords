# Workflow reliability and Core crew release

This release implements the repository review's principal engineering fixes and product improvements. It is a source-code change; no production database migration, deployment, subscription change, or customer outreach was performed during implementation.

## Customer-visible changes

- Reopen a saved field-record draft, finish it, and correct a confirmed record with a reason. Earlier versions remain available in revision history. Concurrent edits return a conflict instead of overwriting another version.
- A failed device draft no longer blocks later drafts or the cloud record list. Pending drafts can be reopened, backed up, retried, or explicitly discarded. Lost responses remain retryable without duplicating records or silently losing a changed payload.
- Export actual field records to CSV or the browser's Print / Save as PDF dialog. JSON backup remains available. Attachments open through short-lived private links; the PDF report does not embed attachment files.
- Export all approved individual or Core crew time in the selected period, including totals. Periods use the farm timezone and the shift start date. Exports stop on a failed page instead of downloading a partial result.
- Core includes a separate one-phone crew roster and time-entry screen at `/team/crew`. Workers need no login. Owners can authorize existing farm members as supervisors. Submissions use stable IDs, an atomic database function and an offline device queue. Submitted time is immutable: reject and submit a corrected entry. Owner decisions have an audit history. Supervisor GPS describes the recording device, not individual workers.
- Core crew time exports to CSV. Existing individual time clocks retain QuickBooks sync. H-2A workers and workflows remain separate; Core crew entries are not automatically copied to H-2A payroll or QuickBooks.
- English/Spanish signup and login, bilingual crew controls, and clearer pricing/landing-page descriptions. Translation is not comprehensive across every administrative screen.
- A farm storage meter counts object bytes across the three existing private evidence buckets. The default allowance is 100 decimal GB. New uploads above the allowance fail; existing files remain readable. There are no automatic overage charges or invented add-on prices. Additional capacity requires a separate support agreement and an administrative limit change.

## Integrity fixes

- Repair the base schema's invalid function delimiters.
- Break recursive `farms` / `farm_members` SELECT policies using caller-scoped authorization predicates.
- Require new individual time to be pending and unreviewed, stamp owner review decisions, and prevent changing time already syncing or synced to QuickBooks. QuickBooks claims recheck approval and clock times and use the claimed row's values.
- Validate a join code before choosing the farm. Joining another farm preserves the first farm's employee number and selects the joined farm in the worker screen.
- Paginate H-2A audit exports and payroll source loads. Ignore stale payroll requests when changing farms and restrict worksheet source records to the worker's contract.

## Database rollout

Apply to a staging copy first, then use the project's established production release procedure. Back up before migrating. Do not rerun `supabase/schema.sql` against an existing installation: its delimiter correction is for fresh bootstrap installations.

The existing Core, worker-setup, billing, subscription-enforcement and evidence-bucket migrations must already be installed. Apply these new migrations in this order, before serving the new application bundle:

1. `supabase/migrations/20260930010056_review_workflow_integrity.sql`
2. `supabase/migrations/20260930010706_core_crew_records.sql`
3. `supabase/migrations/20260930011259_farm_storage_allowance.sql`

Each file is transactional. The repository contains older migration filenames with repeated date-only versions; reconcile the installation's existing migration history rather than blindly replaying all legacy migrations with `db push`. Do not rename already-applied historical migrations as part of this release.

The storage migration adds a trigger on `storage.objects` and initializes byte totals from existing metadata. Validate the migration account's privileges and actual hosted Supabase Storage upload, replace, delete and signed-download behavior in staging. Byte accounting and quota rejection were tested in PostgreSQL, but that does not establish compatibility with the live project's Storage service or permissions. Existing farms already over 10 GB retain their files; growing their usage is blocked until capacity is resolved. Keep any agreed allowance adjustment administrative; ordinary users cannot edit the usage table.

Smoke-check on staging with owner, supervisor, worker and unrelated-farm accounts:

- Join a second farm, reject an invalid code, and verify employee numbers are unchanged in the first farm.
- Attempt a forged approved time insert and a cross-farm read; both must be denied.
- Save a draft, reopen it, confirm it, amend it with a reason, then inspect the earlier version.
- Queue crew time offline, reload the device, reconnect, review and export it once.
- Open a private attachment. Temporarily lower a test farm's allowance, verify an over-limit upload fails, and restore the allowance.
- Export a period with more than 100 records and compare row counts and hours to the source data.

Application rollback can use the prior bundle while retaining these additive tables and columns. Do not drop revision history, crew records or storage accounting as a routine rollback. Investigate any compatibility issue before changing enforcement triggers.

## Verification performed

- `npm test`: 32 passing tests, including executable PostgreSQL policy/trigger tests, storage accounting, pagination above API row limits, isolated offline retries, record amendments and idempotency.
- `npm run build`: passed, including TypeScript checking.
- `npm run test:e2e`: 6 Chromium browser tests passed against the production build with an isolated Supabase HTTP fixture, including saved-draft editing/history, private file retrieval and offline crew reload/delivery.
- `npm run test:smoke`: 9 running-application smoke tests passed.
- `git diff --check`: clean.

Database tests use PGlite with authentication/Storage fixtures and the relevant real Core migrations. They are not a complete replay of every historical H-2A/cron/extension migration. Browser tests do not call production Supabase, Stripe, QuickBooks or AI services. Real provider integration and production migration checks remain release gates.

## Commercial follow-up

Keep the existing Core and H-2A prices. Choose any paid storage expansion price separately. A farmer pilot should measure first completed record, repeat use, offline delivery failures and export completion before broader promotion. Testimonials, partnerships, outreach and pricing experiments require real customer work; this change does not fabricate or publish those results.
