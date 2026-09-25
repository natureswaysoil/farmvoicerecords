# FarmVoice Records
## Installation, setup and feature guide

Nature’s Way Soil & Vermicompost LLC • September 19, 2026

Website: https://farmvoicerecords.com  
Setup and support: natureswaysoil@gmail.com

This guide describes the current application. It separates working features from integrations that are not yet available. FarmVoice Records is a browser-based service: customers do not need ChatGPT, Supabase, a server, or an app-store download.

## 1. What you need

- A phone, tablet or computer with an up-to-date browser.
- An individual email address for each person using the service.
- Internet access for initial sign-in, joining a farm, scheduling, time-clock requests, photo uploads and syncing records.
- Microphone permission for voice notes and location permission for GPS capture.
- Farm Team or Farm Pro for paid crew scheduling, GPS time, job photos and time approvals. Essential is for one user.

Speech recognition depends on the device and browser. If the microphone feature is unavailable, type the note instead. Opening the website does not continuously track a worker’s location.

## 2. Open the app and add a phone shortcut

Start with the regular browser at https://farmvoicerecords.com. Complete sign-in there before relying on a shortcut. A shortcut is convenient access to the website; it does not make the app fully offline.

### iPhone or iPad

1. Open the website in Safari.
2. Open the Share menu and choose **Add to Home Screen**; menu placement varies by software version.
3. Name it **FarmVoice Records** and select **Add**.
4. Use the new icon to open the site. If it opens in a separate browser context and asks you to sign in again, request a fresh link from that context. If the email opens elsewhere, use regular Safari for the sign-in flow.

Apple instructions: https://support.apple.com/en-euro/guide/iphone/iph42ab2f3a7/ios

### Android

1. Open the website in Chrome.
2. Open the three-dot menu and select **Add to home screen**, then **Create shortcut**, where offered.
3. Name it **FarmVoice Records** and add it.
4. Open the shortcut and sign in if requested.

Google instructions: https://support.google.com/chrome/answer/15085120?co=GENIE.Platform%3DAndroid&hl=en-EU

### Desktop or laptop

Open the website in your browser and bookmark it. No software installation is required. You can also bookmark the Records and Team links below.

## 3. Owner setup and the free trial

1. Open https://farmvoicerecords.com/login.
2. Enter the email you intend to keep using for the farm owner account.
3. Select **Email me a sign-in link**.
4. Check your inbox and spam folder. Open the newest email link in the same browser where you requested it.
5. Select **Continue to my farm**. Links expire after 15 minutes and can be used once.
6. Open **Field records** at https://farmvoicerecords.com/records. The farm account is initialized when you enter the working app.
7. Open **Team** at https://farmvoicerecords.com/team to find your worker join code and employee ID.
8. Before inviting everyone, test one record and one employee account using the checklist at the end of this guide.

The advertised trial lasts 14 days and needs no credit card. A paid subscription is created only when you choose a plan and complete checkout. Reuse the same email each time to avoid creating an unrelated account. If existing records do not appear, contact support before starting another farm.

## 4. Add employees to the same farm

### Owner steps

1. Sign in to the correct farm and open the Team page.
2. Find **Worker join code** and select **Copy**.
3. Give the employee the full code and https://farmvoicerecords.com/join.
4. Keep the code within your intended team; possession of a valid code allows a signed-in person to request membership.
5. Check that the employee appears in your team list after joining.

Newly generated codes have 10 characters. Older six-character codes are also accepted. Copy the current code from the owner’s Team page; do not shorten it. Employee IDs and join codes are different: an employee ID identifies one person, while the join code identifies the farm.

### Employee steps

1. Open https://farmvoicerecords.com/join on your own phone or computer.
2. Sign in with your own email, using the newest link in the same browser.
3. Enter the entire farm code supplied by your owner and select **Join farm**.
4. Confirm that the expected farm appears on the Team page.
5. Note your automatically assigned employee number, such as **FP-1005**. You do not enter this number to sign in.
6. Bookmark https://farmvoicerecords.com/team for your daily time clock and assigned shifts.

Do not share the owner’s login. Employees do not individually purchase a plan to join an existing farm; their membership uses a seat in the farm’s plan. The owner counts toward the user limit. Switching away from a farm that already has records, team members or billing may require support so data is preserved.

## 5. Record pesticide applications by voice

1. Open **Field records** and select **Pesticide application**.
2. Tap **Start recording** and allow microphone access.
3. Allow location access when asked if you want recording GPS attached.
4. Describe what happened. Include the application date, product, quantity and unit, field, acres, applicator, EPA registration number, start/end times, restricted-entry interval and costs when known.
5. Tap **Stop recording**. Review the organized fields against your original spoken note. You can also select **Organize record** after typing or correcting the note.
6. Correct every missing or incorrect value. Automatic extraction can miss details even when they were spoken.
7. Review the recording location and confirm the **Field / treated area**. Check the field-review checkbox before saving a pesticide record.
8. Select **Confirm & save** when the listed required fields are complete, or **Save draft** when details are still missing.
9. Confirm that the queued record syncs and appears in Recent records.

Example of a voice note—not an application recommendation:

> Today I applied [product] to North Field. I used [quantity and unit] on [acres]. The applicator was [name]. EPA registration number [number]. Started at [time], finished at [time]. Restricted-entry interval [label value]. Product cost [amount] per [unit].

Use the actual product label and your actual application details. Completeness checks do not certify regulatory compliance or invent missing information.

### What recording GPS means

- Starting a voice note requests one GPS reading, subject to browser permission.
- The record can retain latitude, longitude, estimated accuracy in meters, and capture date/time.
- The review screen and recent records provide a map link.
- **Retry / capture GPS** requests another reading; **Remove location** removes it from the current draft.
- If access is denied or GPS fails, continue recording and identify the field manually.
- GPS identifies where you made the note, not necessarily where pesticide was applied. It does not map field boundaries, prove treatment coverage or continuously track movement.
- Waiting for the GPS result before saving ensures the location can be attached. A record saved before capture finishes may have no GPS.

## 6. Record input purchases and costs

1. Select **Input purchase** on the Records page.
2. Speak or type the product, quantity, unit, cost per unit and any additional cost information.
3. Select **Organize record** if needed.
4. Review the extracted quantity, unit cost and total. Check additional charges against the original note; do not assume every charge was recognized.
5. Save and confirm that the record syncs.

Example: “Bought twenty bags of fertilizer for eighteen dollars and fifty cents each, plus twenty-five dollars delivery.” Check whether delivery is reflected in the total before relying on the record. Original notes remain part of the saved record and export.

The app also displays cost per acre when acres are present. It does not currently provide a full accounting ledger, inventory system or purchase-order workflow.

## 7. Schedule workers and set a jobsite radius

Owner access is required for scheduling.

1. Open the Team page and find **Weekly scheduling**.
2. Choose the worker, enter the job and field, and set start/end times.
3. For location comparison, enter jobsite latitude and longitude together. Alternatively, choose **Use my location** while physically at the intended jobsite.
4. Set a radius in meters. The form starts at 200 meters; the server’s minimum is 25 meters.
5. Leave both coordinate fields blank when you do not want a radius check.
6. Select **Schedule shift** and check the calendar.
7. Ask the employee to open their Team page and verify the assignment and times.

The owner sees the current week’s calendar; workers see their own upcoming assigned shifts. Creating a shift triggers an email notification attempt. The Team page shows an upcoming-shift reminder. These are not a guaranteed timed SMS, push-notification or recurring email reminder service. Confirm critical assignments directly if an email does not arrive. Check displayed times carefully; emailed times may differ from the device’s local display.

## 8. Employee time clock and photos

1. Open https://farmvoicerecords.com/team.
2. Choose the assigned shift. If working outside a scheduled shift, use **Unscheduled work** and enter the job or field.
3. Add an optional note.
4. Tap **Clock in with GPS** and allow location access. Wait for the confirmation.
5. During the active shift, use **Attach job photo** to take or select a picture. Wait for the upload confirmation.
6. At the end of work, tap **Clock out with GPS** and wait for confirmation.
7. Review your recorded entry and approval status.

Time is captured at clock-in/out; it is not continuous GPS tracking. GPS failure can still allow a time entry with location unavailable. A jobsite radius provides an inside/outside comparison, not an automatic prohibition on working outside the radius. The current table shows the clock-in location indicator. Photos are attached to time entries; pesticide-record photo attachments are not currently a separate feature. A time entry has one stored photo reference, rather than a multi-photo gallery.

## 9. Owner review and payroll preparation

1. Open the Team page and find **Manager review / Scheduled versus actual hours**.
2. Review completed entries, worker IDs, jobs, scheduled hours, actual elapsed hours, GPS indicators and photos.
3. Approve or reject completed entries using the review buttons.
4. Select **Download approved-time CSV**.
5. Open the file in your spreadsheet or payroll workflow and verify the totals before use.

Only approved, completed entries are included in the payroll export. Times are exported in UTC: convert them to your payroll timezone. Hours are elapsed time; breaks, overtime, wage rates and payroll taxes are not calculated automatically.

**QuickBooks:** Farm owners can connect QuickBooks Online from the QuickBooks page, match each FarmVoice worker to the correct QuickBooks employee, set the farm payroll timezone, and send completed manager-approved time entries to QuickBooks. FarmVoice retains the detailed GPS and field records. The approved-time CSV remains available as a fallback. Review the transferred entries in QuickBooks before running payroll.

The current permission model has owner and worker roles. The owner performs manager tasks; a separate delegated manager role is not implemented.

## 10. Saving, syncing and downloading records

Successfully synced records are stored online and available after signing into the same farm. Unfinished notes and queued saves are stored in the browser on the device where they were created.

### Limited offline use

1. Open Records while connected before heading into an area without service.
2. Keep the page available. Typed notes and queued record saves can be retained locally.
3. Reconnect and select **Sync queued record(s)** if needed; reconnecting can also trigger syncing.
4. Confirm the queue clears and the record appears online before clearing browser data or changing devices.

Voice recognition may need internet. Sign-in, team joining, scheduling, the time clock and photo uploads are not promised to work offline. This is not a fully offline application.

### Download farm records

1. Open Records.
2. Optionally choose **Export from** and **Export through** dates.
3. Select **Download records**.
4. Save the CSV and open it in a spreadsheet application.

Exports include all matching synced records, not just the five displayed in the recent-records panel. Columns include application/purchase details, costs, original transcript, status, owner identifier, creation time and recording GPS/time/accuracy when available. Device-only queued records must sync first. Downloads are initiated by the user; automatic downloading after every voice note is not currently implemented.

## 11. Plans and billing

Listed website prices as reviewed September 19, 2026; checkout controls the final amount and any applicable tax.

| Plan | Listed monthly price | Total users | Main purpose |
| --- | ---: | ---: | --- |
| Essential | $19 | 1 | Voice pesticide/input records, review and record CSV exports |
| Farm Team | $49 | Up to 10 | Essential features plus scheduling, GPS time, job photos, approvals and time CSV |
| Farm Pro | $89 | Up to 30 | Farm Team features for a larger crew; advertised priority onboarding/support |

Recording GPS is part of field records; crew GPS time features are separate. Open https://farmvoicerecords.com/billing to review plan options. Billing should identify Nature’s Way Soil & Vermicompost LLC. If subscription management does not open, contact support rather than starting a second subscription. Trial cutoff enforcement and billing-portal readiness require an owner launch review; do not assume every billing workflow has been verified end to end.

## 12. Feature inventory

| Feature | Current scope |
| --- | --- |
| Email sign-in | Passwordless, browser-bound, single-use emailed links |
| Multi-user farm | Owner and workers join one farm using a code |
| Unique worker IDs | Assigned automatically; included in approved-time exports |
| Voice-to-text | Browser-dependent transcription with typed-note fallback |
| Pesticide records | Reviewed application fields, draft/confirmed status and original note |
| Input costs | Quantities, units, unit cost, total cost and cost-per-acre display |
| Recording GPS | Coordinates, timestamp, accuracy and map link; optional permission |
| Weekly scheduling | Owner assigns workers, jobs, fields and shift times |
| GPS time clock | Location captured at clock-in and clock-out when available |
| Optional radius | Compares location to a configured jobsite center/radius |
| Hours comparison | Scheduled versus actual elapsed hours |
| Photos | Job photo attached to a time entry |
| Approval workflow | Owner approves/rejects completed time entries |
| Reminders | On-page upcoming-shift reminder and shift-creation email attempt |
| Farm record export | Date-filtered CSV including synced recording GPS fields |
| Time export | Approved, completed time CSV; UTC timestamps |
| Offline support | Device-local record drafts and save queue, with later sync |
| Cloud storage | Farm data online after sync; job photos in file storage |

Not currently provided: native app-store installation; full offline operation; full payroll processing or tax calculation; continuous employee tracking; automatic field-boundary recognition; guaranteed timed SMS/push reminders; pesticide-record photo galleries; automatic record downloads; a separate manager role; or a verified general workflow for editing/deleting saved records. QuickBooks Online transfer requires the farm owner to connect and map employees first. Contact support for corrections to saved records.

## 13. Troubleshooting

| Symptom | What to do |
| --- | --- |
| Email link fails | Request a fresh link and open only the newest one in the same browser. Links expire after 15 minutes. Do not share sign-in links. |
| Join code not found | Clear the input and paste the complete code copied from the owner’s Team page. Check every character. If it still fails, send support the visible error and farm name. |
| Microphone unavailable | Allow microphone permission in browser/site settings. If unsupported, type the note. |
| GPS denied or inaccurate | Allow location permission, check device location services, move somewhere with a clearer signal and choose Retry / capture GPS. Use the accuracy estimate and confirm the field manually. |
| Save button disabled | Stop recording first. For pesticide records, review the treated field and check its confirmation box. |
| Record stays a draft | Fill the missing required fields; do not invent application details just to clear the warnings. |
| Record missing on another device | Check the original device’s queue and sync it. Verify you are signed into the same farm. |
| Crew feature unavailable | Check the farm plan; paid crew features require Farm Team or Farm Pro. |
| Employee cannot join | Check user limits and whether the employee already belongs to another farm. |
| Billing management fails | Email support. Avoid creating another paid subscription as a workaround. |
| Page looks outdated | Sync outstanding work first, then refresh or reopen the current website link. Do not clear browser data while unsynced records remain. |

Support: natureswaysoil@gmail.com. Include your account email, farm name, device/browser, page address and the error text. Never include a sign-in token or payment-card details.

## 14. First-day acceptance checklist

- [ ] Owner signs in using email and sees the expected farm.
- [ ] One employee joins using their own email and the complete code.
- [ ] Owner and employee have different employee IDs.
- [ ] A voice note transcribes on the actual phone being used.
- [ ] GPS appears with time and accuracy, and its map opens correctly.
- [ ] A note can still be saved when GPS is unavailable.
- [ ] Worker confirms the treated field and saves a reviewed test record.
- [ ] Record syncs and its GPS columns appear in a downloaded CSV.
- [ ] Owner creates a test shift; employee sees it and verifies the times.
- [ ] Employee clocks in, attaches a photo and clocks out.
- [ ] Owner approves the entry and verifies the exported hours/timezone.
- [ ] If QuickBooks is used, owner connects a test company, maps one employee, sets the payroll timezone and verifies one approved time entry appears correctly in QuickBooks.
- [ ] Billing plan, cancellation route and support contact are checked before onboarding paying customers.

Save/export logic and location validation were checked during development. Actual microphone behavior, phone GPS permissions, email delivery and the complete customer onboarding/billing experience still need testing on the devices and accounts you intend to use. Website copy may contain older instructions; current email sign-in instructions in this guide supersede references to signing in through ChatGPT.