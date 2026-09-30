# Production readiness corrections — September 30, 2026

This change addresses record receipt integrity, crew payroll export, storage allowance, privacy disclosures, and state resource discoverability. It does not establish that the deployed voice and billing integrations work.

## Deployment order

1. Apply `supabase/migrations/20260930205744_record_receipt_and_crew_billing.sql` before deploying this application revision. Test on a staging database first. The migration is transactional and requires the existing crew and storage migrations.
2. Deploy the application. Verify authenticated record creation, owner QuickBooks settings, CSV/print exports and storage usage against the migrated database.
3. Keep the additive migration if rolling back application code. Never remove receipt evidence or QuickBooks IDs to make a rollback easier.

New records get an immutable server receipt timestamp even when inserted directly through the database API. Capture timestamps must be between 30 days ago and five minutes ahead. Existing records retain unknown receipt times, explicitly labeled in exports. Receipt time is evidence of server delivery; it does not establish the truth of the application date or independently certify regulatory compliance. Older offline records stay on the device when rejected and require support review.

QuickBooks owners can map crew workers as well as account holders. Approved entries from both tables use the existing sync claim/retry flow. Crew exports send net Hours and Minutes after deducting breaks and omit StartTime/EndTime. Already synced or syncing crew entries cannot be re-reviewed; submitted durations and breaks remain immutable. Corrections to exported payroll require reconciliation in QuickBooks.

The included allowance is 10 decimal GB. The migration reduces the prior default 100 GB allowances, preserves other customized limits, and deletes no files. Farms above their allowance cannot grow stored usage. Additional capacity billing is not implemented: a price and a billing-to-quota entitlement rule must be chosen before selling an add-on.

Privacy disclosures now explain that deleting a login does not automatically delete shared farm records; support reviews deletion and retention obligations. Signup, the inspector demo, and all state resources are included in the sitemap. New state resources cover TX, IA, IL, WA, MI, MN and NE and point to official agencies without claiming state approval.

## Required hosted acceptance test — not yet completed

Use an isolated staging deployment/database and Stripe sandbox or test mode, with its own matching prices, API key and webhook signing secret. Do not switch production to test credentials. A local build using placeholder public Supabase configuration cannot validate any service credentials.

1. Sign up with a controlled mailbox, complete verification, and create a farm. Confirm the authenticated owner and farm membership.
2. Record a genuine voice note. Confirm a successful voice request, populated fields and a saved database record. Inspect device capture and server receipt times; export CSV and the printable packet.
3. Start checkout for each module using test prices and a Stripe test payment method. Confirm the signed webhook succeeds, the correct subscription and customer are stored, and access changes for that module. Verify cancellation and duplicate webhook delivery without duplicate entitlements.
4. Map a crew worker in a QuickBooks sandbox, approve an eight-hour entry with a 45-minute break, and verify one TimeActivity for 7 hours 15 minutes. Retry and confirm no duplicate. Verify account-holder time still syncs.
5. Check hosted Storage upload, replace and delete accounting. Confirm the 10 GB allowance and rejection of over-limit uploads without deleting existing files.

Production inspection during this review found two users, zero farm records and zero Stripe customer IDs in farm billing. This is insufficient evidence of a working end-to-end flow. No successful live signup/voice/Stripe test has been observed. Deployment configuration access, sandbox credentials and authenticated test access are still needed. The reported webhook failure must be diagnosed from the actual event and server logs; neither a missing secret nor a processing error has been established here.

Only after acceptance succeeds, export an owner-approved real farm record packet, remove personal or sensitive details as needed, and publish it as homepage evidence. No real packet was supplied or fabricated in this change.

## Automated verification

The test suite covers receipt forgery, capture boundaries, immutable receipt time, legacy exports, database quota defaults, crew review/sync safeguards and farm isolation. A mocked route regression exercises both payroll sources and verifies crew break deductions and omission of start/end timestamps. These tests do not substitute for the hosted acceptance test above.

## H-2A break entry and weekly totals

Also apply `20260930213305_h2a_breaks_weekly_hours.sql` before deploying the updated H-2A pages. New daily entries record total shift hours including breaks, paid rest minutes, and actual unpaid meal minutes. Meals default to zero; the database computes paid hours from shift minutes minus unpaid meals. Paid rest stays included. Submit workers with different durations separately. Existing manual hours remain unchanged and their missing break details are not inferred.

The crew page and selected pay-period worksheet group paid hours by worker and selectable week-start day (Monday initially). Totals include pending records and display pending counts; they do not establish payroll approval or calculate overtime entitlement. Pay-period boundary weeks may be partial. Weekly totals are derived on screen, not stored as separate editable totals. The pay worksheet uses the same net duration with no second break deduction. Existing RLS and record review restrictions remain; break/duration edits during approval or after approval are explicitly rejected.

Verify in staging: submit an eight-hour shift with 30 paid rest minutes and 45 unpaid meal minutes; expect 7.25 paid hours. Five such entries should show 36.25 hours for the week. Change worker, dates, and week-start day and confirm totals update. Verify older manual entries retain their hours.
