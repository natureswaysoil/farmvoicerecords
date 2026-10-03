# FarmVoice Records

FarmVoice Records is a production Next.js farm recordkeeping and workforce application for **farmvoicerecords.com**.

## Current architecture

- Next.js App Router application deployed on Vercel
- Supabase Auth for FarmVoice user accounts and MFA
- Supabase Postgres with Row Level Security for farm-scoped data
- Private Supabase Storage for Smart Photo Evidence and documents
- Farm and field records with voice/typed entry, GPS capture and CSV export
- Team scheduling, GPS clock-in/out, manager review and payroll preparation
- Federal RUP pesticide record completeness checks with state-rule extension points
- USDA/FSA field-boundary import workflows
- H-2A contracts, workers, daily crew records, housing, transportation, training, recruitment, separation, documents and audit support
- QuickBooks Online OAuth, employee mapping, approved-time sync and diagnostics
- FarmVoice Help Center, first-login onboarding and in-app help assistant
- Resend-backed notification workflows

## Security model

FarmVoice data is scoped by farm. Server-side privileged workflows authenticate the current Supabase user and require an authorized farm membership before accessing farm resources. Multi-farm workflows must use an explicit authorized farm context rather than silently choosing the first membership returned by the database.

Supabase configuration is required through environment variables; the application does not contain fallback project credentials.

## Required Supabase environment variables

```text
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
```

The publishable key is intended for the browser and relies on Supabase Auth and RLS for authorization. Never expose a Supabase service-role or secret key with a `NEXT_PUBLIC_` prefix.

## Run

```bash
npm install
npm test
npm run dev
```

Production:

```bash
npm run build
npm start
```

## Pesticide/RUP validation

`src/compliance/pesticide-record-validation.ts` validates the federal private-applicator RUP recordkeeping baseline and exposes `registerStateValidator()` for verified state rules. FarmVoice does not claim that software validation guarantees regulatory compliance.

## QuickBooks Online integration

Farm owners can connect QuickBooks Online at `/integrations/quickbooks`, map FarmVoice workers to QuickBooks employees, and send completed manager-approved time entries as QuickBooks TimeActivity records. GPS coordinates and detailed pesticide/compliance records remain in FarmVoice.

Required Vercel environment variables:

```text
QBO_CLIENT_ID=
QBO_CLIENT_SECRET=
QBO_TOKEN_ENCRYPTION_KEY=
QBO_REDIRECT_URI=https://farmvoicerecords.com/api/quickbooks/callback
QBO_ENVIRONMENT=production
```

`QBO_TOKEN_ENCRYPTION_KEY` must decode from base64 to exactly 32 random bytes. Keep all QuickBooks credentials server-side; never expose them with a `NEXT_PUBLIC_` prefix.

For an Intuit sandbox, set `QBO_ENVIRONMENT=sandbox` and register the corresponding callback URL in the Intuit developer app.

## Historical note

This repository began as a reconstruction of an earlier FarmVoice Site projection. The README previously described backend services as unconnected. That description is obsolete: the repository now contains the production Supabase, storage, H-2A, QuickBooks, MFA and related backend integrations.


## John Deere Operations Center integration

Farm owners can connect John Deere from `/integrations/equipment`. FarmVoice
stores Deere OAuth credentials encrypted server-side, lets the owner select the
authorized Operations Center organization, matches Deere fields to FarmVoice
fields, and imports the previous seven days of application and harvest field
operations.

The live connector uses:

- `ApplicationRateResult` for actual application rates
- `HarvestYieldResult` for actual harvest yield and moisture
- `Accept-UOM-System: ENGLISH` for U.S. sync requests
- John Deere organization connections/permissions rather than assuming OAuth
  grants access to every organization

Required Vercel environment variables after John Deere approves the application:

```text
JOHN_DEERE_CLIENT_ID=
JOHN_DEERE_CLIENT_SECRET=
JOHN_DEERE_AUTH_URL=
JOHN_DEERE_TOKEN_URL=
JOHN_DEERE_API_BASE_URL=
JOHN_DEERE_TOKEN_ENCRYPTION_KEY=
JOHN_DEERE_REDIRECT_URI=https://farmvoicerecords.com/api/john-deere/callback
JOHN_DEERE_SCOPES=
```

`JOHN_DEERE_TOKEN_ENCRYPTION_KEY` must decode from base64 to exactly 32 random
bytes. OAuth endpoints, API base URL, and approved scopes must come from the
John Deere Developer Portal for FarmVoice's registered application; they are
not hardcoded because they may differ by environment/application approval.
