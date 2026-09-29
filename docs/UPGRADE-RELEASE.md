# FarmVoice upgrade release

This release contains server audio transcription and note extraction, reviewed pesticide/purchase fields, per-account offline queues, Spanish records/join/worker clock screens, subscriptions, public demos, SEO resources and release checks.

## Deployment order

1. Deploy to a preview using a separate Supabase test project and Stripe sandbox. Never point automated browser fixtures at production.
2. Apply `20260929184308_subscriptions_and_ai_quota.sql` only after the billing configuration below is ready. This starts 14-day trials for existing farms and future farms. Reads/exports and worker clock-out remain available after expiry; farm record and H-2A writes require an active entitlement. Plan checks also run in triggers for security-definer writes. Review existing farms before starting their trial clock.
3. Configure AI Gateway and Stripe in preview and production separately. Run the live-service acceptance steps below before promoting.
4. Deploy app, run smoke/browser checks, enable Vercel Web Analytics in the project dashboard, then verify signup/trial events appear.

The earlier housing confirmation migration is independent. It changes the default to false and rejects unconfirmed new writes. Historical attestations are not rewritten.

## Server configuration

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Existing project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Existing public key |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only billing webhook persistence; never expose to browser |
| `NEXT_PUBLIC_SITE_URL` | Canonical HTTPS origin, also the allowed checkout request origin |
| `STRIPE_RESTRICTED_KEY` | Separate sandbox/live restricted keys with Customer, Checkout, Subscription and Billing Portal permissions |
| `STRIPE_WEBHOOK_SECRET` | Signing secret for `/api/billing/webhook` |
| `STRIPE_CORE_MONTHLY_PRICE_ID` | Core product, USD 49 monthly |
| `STRIPE_CORE_ANNUAL_PRICE_ID` | Same Core product, USD 490 annually |
| `STRIPE_H2A_MONTHLY_PRICE_ID` | Separate H-2A add-on product, USD 149 monthly |
| `STRIPE_H2A_ANNUAL_PRICE_ID` | Same H-2A product, USD 1490 annually |
| `AI_GATEWAY_API_KEY` | Needed locally/non-Vercel; Vercel deployments can use Gateway OIDC credentials |
| `FARMVOICE_EXTRACTION_MODEL` | Optional, defaults `openai/gpt-6.1-sol` |
| `FARMVOICE_TRANSCRIPTION_MODEL` | Optional, defaults `openai/gpt-4o-mini-transcribe` |
| `NEXT_PUBLIC_VIDEO_BASE_URL` | Optional CDN origin; must serve `/videos/farmvoice-{slug}.mp4` for all six guide slugs |

Store secrets as sensitive environment values, with distinct preview/production credentials. No real keys belong in source, logs or browser tests. Node is pinned to 24.x in package.json and CI; set the Vercel project to match.

Configure Stripe Customer Portal for cancellation, payment method changes and approved price variants. Use Core and H-2A as separate products. Enable lifecycle events `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid`, and `invoice.payment_failed`. Checkout success is not an entitlement signal. Webhooks verify signatures and retrieve current subscription state. A per-farm lease serializes updates; failed processing returns 500 for Stripe retry.

Checkout preserves the original trial end when at least two days remain. With fewer than two days remaining, Checkout starts the paid subscription immediately; users can wait until their free trial ends. Stripe Checkout displays the charge before confirmation. The app cannot silently charge an existing customer.

Stripe Tax is not enabled in code: verify active tax registrations and applicable collection obligations before enabling automatic tax. No tax computation is implied by the pricing page.

## Verification

- `npm ci && npm test`: field evidence/validation, account/farm queue isolation, signed webhook integrity, subscription price mapping, Postgres policy/trigger/quota tests.
- Build with the test Supabase URL `http://127.0.0.1:54399` and public key `test-public-key` for local/CI browser fixtures. Set `NEXT_PUBLIC_SITE_URL=https://farmvoicerecords.com`.
- `npm run build`: TypeScript plus production compilation.
- `npx playwright install --with-deps chromium && npm run test:e2e`: public CTAs, modal keyboard containment/restoration, AI suggestion application, offline reload and delivery. AI output and account service are fixtures; this is not a live AI quality or payment test.
- `npm run start -- -H 127.0.0.1 -p 3100` then `npm run test:smoke`: public headings, auth refusals, MP4 signatures, sample PDF/CSV, SEO endpoints, billing origin check.

Live-service acceptance must use a sandbox: record real English and Spanish audio on iPhone Safari and Android Chrome; verify provider transcription/field evidence; confirm missing IDs stay empty; purchase and pesticide save; end a trial; verify paid Core versus H-2A write permissions; perform Checkout, failed payment, renewal, cancellation and duplicate/out-of-order webhook deliveries; check account changes don't sync another account's queue. Confirm all existing farm APIs and SQL RPCs still honor authorization and MFA.

## Offline boundaries

Only static application shells and versioned Next assets are cached. API responses, private evidence, auth endpoints and cloud records are not cached by the service worker. Queued records are separate localStorage entries keyed by user and record ID; a failure preserves the entry, and the server accepts retries of the same saved ID without duplicating it. Users must first open the app online; reopen records online to sync. Audio is not persistently queued: download it before leaving and upload after reconnecting. This is not background synchronization of H-2A/payroll/clock events.

## Public claims and resources

USDA removed 7 CFR Part 110 effective July 11, 2025. The legacy checklist remains a product completeness aid; resource pages link to official state guidance and do not advertise old federal deadlines as universal current law. The sample PDF/CSV/inspector page is clearly fictional. The family-farm story does not invent a founding year. No security certification is claimed.

The existing video files total only a few MB; the reported 280 MB build cache was not demonstrated to be caused by videos. CDN support is configurable. Do not remove bundled assets until every CDN URL has passed range/content-type/MP4 checks. Existing videos describe the earlier screen and should be rerecorded after final UI acceptance.
