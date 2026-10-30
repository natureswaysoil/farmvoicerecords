# Production deployment and buyer handover

Reviewed source: main c15246a72c8a727f47170244a51cff3f33ab10a3, October 3, 2026.
This repository is the maintained application source. Historical Site-recovery notes are not a prerequisite for installing it.

## Existing production project

Do not replay `schema.sql`, the bootstrap bundle, or historical migrations against an existing database. Production has separately named historical migration entries; same-day repository filenames also reuse migration version prefixes. Do not rename or repair already-applied history without comparing the hosted schema and migration ledger.

For an existing project that has not received this upgrade, apply only `supabase/migrations/20261003213844_production_readiness_guards.sql`, then deploy the application changes. FarmVoice production received this additive upgrade on October 3, 2026; verify the ledger by name `production_readiness_guards` before applying again. The migration adds a confirmed-record checklist trigger, Deere refresh lease columns/RPC, disconnect-friendly subscription triggers, and the service-role-only notification authorization helper. It preserves stored records and credentials. Deploy migration before application because the Deere server now calls the new RPC. The notification helper preserves the existing Vault secret and cron job.

The record trigger implements the product completeness checklist for pesticide and purchase records, including the legacy spot-treatment option. It permits incomplete drafts. It does not replace current state, WPS, label or employer legal requirements. Invalid confirmed writes return PostgreSQL constraint error 23514. Review existing confirmed rows before applying in another environment; this upgrade does not silently rewrite them.

If rolling back the app, leave additive lease columns/RPC and record validation installed. If the checklist blocks a valid product case, correct the validator; do not bypass RLS. Redeploy a previously known-good app through Vercel. A database restore requires an explicit recovery plan and a tested backup.

## Fresh Supabase installation

1. Create an empty Supabase project. Enable `pgcrypto` (schema `extensions`), `pg_cron` (schema `pg_catalog`), `pg_net` (schema `extensions`) and Supabase Vault. Keep the managed Auth and Storage schemas intact. Use the SQL editor as the project database administrator.
2. Run `node scripts/database-bootstrap.mjs /tmp/farmvoice-bootstrap.sql`. The manifest includes the base schema, QuickBooks schema, every historical migration in dependency order, and explicit core grants. The generator fails when a migration is absent from the manifest or appears twice.
3. Apply the generated SQL only to the empty project. It is a single transaction; duplicate date-only migration prefixes are not passed to `supabase db push`. Keep the generated file and source commit as the fresh-install baseline in the buyer's release records. Later upgrades use new unique CLI-generated migrations and a documented baseline comparison.
4. Configure Supabase Auth site URL, allowed callback/reset URLs, confirmation email delivery and SMTP. Test a new owner and a worker account. Configure separate sandbox projects/keys for previews.
5. Copy `.env.example` into the appropriate local/private environment. Populate server secrets through provider dashboards. QBO and Deere token encryption keys each require 32 random bytes encoded as base64; changing keys requires reauthorization or a controlled re-encryption migration.
6. Configure Stripe products/prices, Billing Portal and webhook URL `/api/billing/webhook`, with the matching live/test signing secret and required server-key permissions. Test trial, checkout, duplicate/reordered webhooks, renewal, payment failure, cancellation and reactivation before accepting paid customers.
7. Deploy the Edge Function and schedule it as described below. Confirm private evidence buckets and object policies; test owner/worker/other-farm access. Upload and download a real photo through the app.
8. Run `npm ci`, `npm test`, `npm run build`, and `npm run test:e2e`. CI uses a local Supabase HTTP fixture. The bootstrap regression uses PGlite with managed Auth/Storage/cron/Vault fixtures and digest substitution; it proves SQL replay/dependencies and application invariants, not hosted extensions, SMTP, OAuth or payment delivery.

## Notification worker

The deployed worker checked the cron secret before this review; the source now includes the same check. It accepts POST with `x-farmvoice-cron-secret`, verifies it through `notification_worker_authorize`, and refuses unauthenticated requests before claiming outbox events or contacting Resend.

Store a random secret in Vault as `farmvoice_notification_cron_secret`. Configure Edge Function secrets `RESEND_API_KEY` and `FARMVOICE_NOTIFICATION_FROM`; Supabase supplies its URL and service-role environment. Deploy with:

```bash
supabase functions deploy notification-worker --no-verify-jwt
```

`--no-verify-jwt` is intentional: custom shared-secret authorization occurs in the handler. Without the header, requests must return 401. A user JWT or publishable key is not a cron secret.

For a fresh project, substitute the actual Edge Function URL below and run as database administrator after creating the Vault secret. Preserve an existing production schedule instead of scheduling a duplicate. The SQL reads the secret at invocation time; do not put its value in source or cron command text.

```sql
select cron.schedule('farmvoice-notification-worker', '*/5 * * * *', $job$
  select net.http_post(
    url := 'https://YOUR_PROJECT.supabase.co/functions/v1/notification-worker',
    headers := jsonb_build_object('Content-Type','application/json',
      'x-farmvoice-cron-secret', (select decrypted_secret from vault.decrypted_secrets
        where name='farmvoice_notification_cron_secret' limit 1)),
    body := '{}'::jsonb, timeout_milliseconds := 60000);
$job$);
```

Test an unauthorized POST, one authorized test notification to an intended recipient, provider failure/retry and duplicate delivery idempotency. Check outbox backlog, failures and stale locks. The five-minute cron schedule is approximately 8,640 invocations per 30-day month even with an empty queue.

## Diagnostics and costs

Billing failures emit `billing_failure` JSON with operation, stage, Stripe event ID/type, provider request ID, code/type/status. Messages, bodies, identities, signatures and credentials are excluded. Search runtime logs by event ID, then use Stripe's event dashboard to verify delivery and replay failures after correcting the cause. The webhook continues to return 500 on processing failure so Stripe retries.

Track FarmVoice separately in Vercel usage, Supabase project usage and AI Gateway credits; team invoices include other apps. Core's 100 GB allowance is per farm, while the hosted included storage quota is shared at organization level. Capacity and egress need explicit budgets. Pricing verification belongs in a private cost report rather than customer billing data in this repository.

## Buyer acceptance gates

Passing CI is necessary, but these require hosted evidence before calling the acquisition fully production-verified:

- Fresh hosted install and restore of database plus private Storage files; daily database backups alone are not evidence of file recovery.
- Owner and worker signup, email confirmation, password reset, MFA for privileged H-2A actions, cross-farm denial and browser logout/cache behavior.
- On-device recording/GPS, offline record/photo queue recovery, confirmed record corrections with revision history, and export of synced records.
- Stripe test-mode purchase/cancel/retry followed by a controlled live transaction/reconciliation.
- Intuit-approved QBO connection, employee mapping, approval/time sync, concurrent refresh and disconnect; Deere app approval, organization access, field mapping, sync and reconnect/disconnect with a real account.
- Transfer/control of GitHub, domain/DNS, Vercel, Supabase, Resend, Stripe, AI Gateway, Intuit and Deere registrations; rotate credentials without losing decryptability.
- Revenue/customer evidence, intellectual-property ownership and current legal wording checked separately. The review did not establish acquisition valuation or verified recurring revenue.
