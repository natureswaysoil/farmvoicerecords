# FarmVoice Records

Repository seed for **farmvoicerecords.com**.

## Current production application

The current production application is a ChatGPT Site projection:

- Site slug: `farmpilot-records`
- Project ID: `appgprj_6aacad1d87f08191b96c0312fab01f54`
- Source version observed: `23`
- Projection revision observed: `47`
- Live site: `https://farmpilot-records.james-jones-1857.chatgpt.site`
- Public domain: `https://farmvoicerecords.com`

The ChatGPT Site system currently exposes the rendered Site projection and documentation through the connected Library, but does **not** expose the original source tree as downloadable files. For that reason, this repository does not claim to contain the original Site source code.

## What is preserved here

- `docs/FarmVoice_Records_Setup_and_Features.md` — verified current feature/setup guide.
- `src/compliance/pesticide-record-validation.ts` — nationwide federal RUP baseline validator with a state-extension layer.
- `SOURCE_RECOVERY.md` — source recovery and migration notes.

## Compliance integration

At the pesticide-record persistence boundary:

```ts
const result = validatePesticideRecord(record);

if (record.isRestrictedUse && !result.complete) {
  // Keep as draft or block confirmed save.
  // Surface result.issues to the user.
}
```

Do not describe this as universal legal compliance. The validator enforces the federal private-applicator RUP baseline and provides hooks for verified state requirements.
