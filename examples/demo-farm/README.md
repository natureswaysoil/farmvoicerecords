# FarmVoice fictional demo farm

All names, activities, purchases and quantities in this pack are fictional. Use it for training, screenshots and controlled tests, never as genuine farm evidence or an actual payroll submission.

## Contents

- `demo-farm.json`: structured fixture data for a North Carolina farm, three fields, six draft purchase/pesticide records, three crew workers and 15 crew time entries; one illustrative H-2A contract, two fictional H-2A workers and ten unapproved daily entries; English and Spanish voice prompts.
- `demo-packet.html`: printable sample packet. Open in a browser and print/save as PDF.
- `fields.csv`, `crew-hours.csv`, `h2a-daily.csv`: review copies. These are not QuickBooks import files or a supported one-click FarmVoice import format.

The crew total is 108.75 hours over five days: Alex 36.25, Casey 37.5, Jordan 35. The H-2A sample totals 72.5 worked hours and 80 offered hours across two workers and five days. These are separate sample rosters; do not combine them as actual payroll.

Pesticide records are deliberately incomplete drafts. No registration numbers, applicator certifications, application rates, GPS evidence, immigration documents, wage determinations or inspection certificates have been invented. No server receipt timestamp has been fabricated. All sample shifts await review and no QuickBooks mappings are included.

## Use in FarmVoice

The live database currently enforces one owned farm per account. The owner's existing real farm was not modified. To load these samples without mixing fictional and real records, use a separate demo owner account or an isolated staging database. Create that demo farm normally, then enter the samples through the app. This pack does not create accounts, alter subscriptions or bypass trial restrictions.

Fixture activity dates are September 21–25, 2026. When replaying after the 30-day capture window, use fresh demonstration dates, update the spoken prompts and record capture times together, and retain the DEMO labels. Do not weaken timestamp validation to load an old fixture.

For voice testing, read the prompts aloud into the actual recorder. The expected purchase values are in the corresponding sample records; DEMO markers and explanatory notes are fixture annotations, not expected extracted fields. Confirm that missing pesticide data remains blank and that saved rows get real server receipt times after the receipt migration is deployed.

For payroll testing, connect only a QuickBooks sandbox and map only fictional sandbox employees. Approve and sync the sample eight-hour shift with a 45-minute break: expected duration is 7 hours 15 minutes. No live accounting connection or payment should be created by opening these files.

Seed data cannot verify signup, audio processing, Stripe checkout or webhook delivery. Those acceptance tests still require real authenticated service access and Stripe sandbox/test credentials. The printable sample can be shown as a labeled demo; it is not the requested real-farm homepage proof point.
