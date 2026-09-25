# FarmVoice Records

Runnable Next.js reconstruction for **farmvoicerecords.com**, based on the verified current FarmVoice feature guide and live Site projection.

## Implemented in this repository

- Home/marketing page
- Passwordless-login UI boundary
- Farm join-code UI with complete 6–10 character handling
- Pesticide application form
- Browser voice-recognition hook with typed fallback
- GPS capture for pesticide records
- Nationwide federal RUP completeness validator
- Draft vs confirmed save behavior; incomplete RUP records cannot be confirmed
- State-validator extension registry
- Browser-local record persistence and CSV export
- Team scheduling
- GPS clock-in/out
- Manager approval and approved-time CSV export
- Pricing page

## Backend boundary

The current production app is a ChatGPT Site projection. The Site platform does not expose its original source tree through the connected tools, so this is a clean reconstruction rather than a byte-for-byte export.

Cloud authentication, shared farm data, email delivery, photo storage, subscription billing and server-side membership must be connected to a backend before this reconstruction replaces production. They are deliberately not faked.

## Run

```bash
npm install
npm run dev
```

Production:

```bash
npm run build
npm start
```

## RUP validation

`src/compliance/pesticide-record-validation.ts` validates the federal private-applicator RUP recordkeeping baseline and exposes `registerStateValidator()` for verified state rules. The UI says “Federal USDA RUP baseline complete” rather than claiming universal legal compliance.

## Historical production Site

- Site slug: `farmpilot-records`
- Project ID: `appgprj_6aacad1d87f08191b96c0312fab01f54`
- Source version observed: `23`
- Projection revision observed: `47`


## QuickBooks Online integration

Farm owners can connect QuickBooks Online at `/integrations/quickbooks`, map FarmVoice worker accounts to QuickBooks employees, and send completed manager-approved time entries as QuickBooks TimeActivity records. GPS coordinates and detailed pesticide/compliance records remain in FarmVoice.

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
