# Source recovery status

## What was found

The active FarmVoice Records project exists as a ChatGPT Site projection in the user's Library.

Observed metadata:

- project_id: `appgprj_6aacad1d87f08191b96c0312fab01f54`
- slug: `farmpilot-records`
- source_version_number: `23`
- projection_revision: `47`
- status: `active`
- access_mode: `public`

## Export limitation

The connected Files tooling can read the rendered Site projection but cannot materialize/download the original Site source. An attempted source materialization returns that materialization is unavailable for Site projections.

Therefore, copying the rendered page text or deployed JavaScript and calling it the original source would be misleading. The original source should be exported from the Site authoring environment if/when that capability is available, then committed into this repository.

## Migration checklist

1. Export the original ChatGPT Site source tree.
2. Add it at the repository root without changing behavior.
3. Identify the pesticide record save/confirm boundary.
4. Import `validatePesticideRecord` and block only confirmed RUP saves that fail validation; allow incomplete records to remain drafts where the product supports drafts.
5. Map the app's existing fields to `PesticideRecord`.
6. Store the farm/application state code so state validators can be applied.
7. Add verified state modules incrementally rather than guessing state law.
8. Run regression tests for login, join code, voice capture, GPS capture, queue/sync, scheduling, time clock, photos, approvals, record CSV and approved-time CSV.
