import { test, expect } from "@playwright/test";
const uid = "11111111-1111-4111-8111-111111111111",
  farm = "33333333-3333-4333-8333-333333333333";
async function signIn(context: import("@playwright/test").BrowserContext) {
  const enc = (v: unknown) =>
    Buffer.from(JSON.stringify(v)).toString("base64url");
  const session = {
    access_token: `${enc({ alg: "HS256", typ: "JWT" })}.${enc({ sub: uid, exp: Math.floor(Date.now() / 1000) + 3600, aud: "authenticated", role: "authenticated" })}.test-signature`,
    refresh_token: "test-refresh",
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    token_type: "bearer",
    user: {
      id: uid,
      aud: "authenticated",
      role: "authenticated",
      email: "fixture@example.invalid",
      app_metadata: {},
      user_metadata: {},
    },
  };
  await context.addInitScript(() =>
    localStorage.setItem(
      "farmvoice:onboarding:v1:11111111-1111-4111-8111-111111111111",
      "complete",
    ),
  );
  await context.addCookies([
    {
      name: "sb-127-auth-token",
      value: "base64-" + enc(session),
      domain: "127.0.0.1",
      path: "/",
    },
  ]);
}
test("public navigation, signup and sample assets", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Farm paperwork without the paperwork.",
  );
  await expect(
    page
      .getByRole("navigation")
      .getByRole("link", { name: "Fields", exact: true }),
  ).toHaveCount(0);
  for (const link of await page
    .getByRole("link", { name: "Start free trial", exact: true })
    .all())
    await expect(link).toHaveAttribute("href", "/signup");
  await page.getByRole("link", { name: "See a sample record" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "spoken note",
  );
  expect(errors).toEqual([]);
});
test("video modal contains focus and restores opener", async ({ page }) => {
  await page.goto("/records");
  const opener = page.getByRole("button", {
    name: "Watch Field records guide",
  });
  await opener.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press("Tab");
    expect(
      await dialog.evaluate((d) => d.contains(document.activeElement)),
    ).toBe(true);
  }
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(opener).toBeFocused();
});
test("suggested fields preserve edits and offline records survive reload", async ({
  page,
  context,
}) => {
  await signIn(context);
  await page.route("**/api/records/extract", (route) =>
    route.fulfill({
      json: {
        suggestions: {
          productName: { value: "Example", evidence: "Example" },
          amountApplied: { value: "2", evidence: "2 gallons" },
          amountUnit: { value: "gallons", evidence: "2 gallons" },
        },
      },
    }),
  );
  await page.goto("/records");
  await expect(
    page.getByRole("heading", { name: "Speak, review and save" }),
  ).toBeVisible();
  await page
    .getByLabel("Product name", { exact: true })
    .fill("My edited product");
  await page
    .getByLabel("Original spoken or typed note")
    .fill("Applied 2 gallons of Example");
  await page.getByRole("button", { name: "Suggest fields from note" }).click();
  await page.getByRole("button", { name: "Apply to empty fields" }).click();
  await expect(page.getByLabel("Product name", { exact: true })).toHaveValue(
    "My edited product",
  );
  await expect(page.getByLabel("Total amount applied")).toHaveValue("2");
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await context.setOffline(true);
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Saved on this device");
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Speak, review and save" }),
  ).toBeVisible();
  await expect(
    page.getByText("1 records waiting on this device"),
  ).toBeVisible();
  let delivered = 0;
  await page.route("**/api/records", (route) => {
    delivered++;
    return route.fulfill({
      json: { id: JSON.parse(route.request().postData()!).id },
    });
  });
  await context.setOffline(false);
  await expect(
    page.getByText("0 records waiting on this device"),
  ).toBeVisible();
  expect(delivered).toBe(1);
});

test("saved drafts reopen, update the same record, show history and retrieve evidence", async ({
  page,
  context,
}) => {
  await signIn(context);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const id = "77777777-7777-4777-8777-777777777777";
  let record = {
    id,
    farm_id: farm,
    created_by: uid,
    record_type: "purchase",
    status: "draft",
    created_at: "2026-09-29T12:00:00+00:00",
    revision: 1,
    field_id: null,
    payload: {
      item: "Old seed",
      vendor: "Cooperative",
      quantity: "2",
      unit: "bags",
      totalCost: "50",
      purchaseDate: "2026-09-29",
    },
  };
  await page.route("**/rest/v1/farm_records?**", (route) =>
    route.fulfill({
      json: route.request().headers().accept?.includes("vnd.pgrst.object")
        ? record
        : [record],
    }),
  );
  await page.route("**/api/records", async (route) => {
    expect(route.request().method()).toBe("PATCH");
    const body = JSON.parse(route.request().postData()!);
    expect(body.id).toBe(id);
    expect(body.expectedRevision).toBe(1);
    record = {
      ...record,
      status: body.status,
      payload: body.payload,
      revision: 2,
    };
    await route.fulfill({ json: { id, revision: 2 } });
  });
  await page.route("**/rest/v1/farm_record_revisions?**", (route) =>
    route.fulfill({
      json: [
        {
          record_id: id,
          revision: 1,
          snapshot: { payload: { item: "Old seed" } },
          reason: null,
          changed_at: "2026-09-30T12:00:00Z",
        },
      ],
    }),
  );
  await page.route("**/rest/v1/farm_photo_evidence?**", (route) =>
    route.fulfill({
      json:
        Number(new URL(route.request().url()).searchParams.get("offset") ?? 0) >
        0
          ? []
          : [
              {
                id: "photo",
                file_name: "receipt.pdf",
                captured_at: "2026-09-29T12:00:00Z",
                captured_by: uid,
                storage_bucket: "farm-photo-evidence",
                storage_path: `${farm}/${id}/receipt.pdf`,
              },
            ],
    }),
  );
  await page.route("**/storage/v1/object/sign/**", (route) =>
    route.fulfill({
      json: {
        signedURL: `/object/sign/farm-photo-evidence/${farm}/${id}/receipt.pdf?token=fixture`,
      },
    }),
  );
  await page.goto("/records");
  await page.locator("summary").filter({ hasText: "purchase · draft" }).click();
  await page.getByRole("button", { name: "Finish draft", exact: true }).click();
  await expect(page.getByLabel("Item purchased", { exact: true })).toHaveValue(
    "Old seed",
  );
  await page
    .getByLabel("Item purchased", { exact: true })
    .fill("Corrected seed");
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Saved to your farm");
  await expect(page.getByText("Corrected seed", { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "Revision history", exact: true })
    .click();
  await page.locator("summary").filter({ hasText: "v1" }).click();
  await expect(
    page.locator("pre").filter({ hasText: "Old seed" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "View files", exact: true }).click();
  const popup = context.waitForEvent("page");
  await page.getByRole("button", { name: "receipt.pdf", exact: true }).click();
  const opened = await popup;
  await expect(opened).toHaveURL(/receipt\.pdf\?token=fixture/);
  await opened.close();
  expect(errors).toEqual([]);
});

test("one-phone crew batches survive offline reload and deliver stable IDs", async ({
  page,
  context,
}) => {
  await signIn(context);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/rest/v1/crew_workers?**", (route) =>
    route.fulfill({
      json:
        Number(new URL(route.request().url()).searchParams.get("offset") ?? 0) >
        0
          ? []
          : [
              {
                id: "77777777-7777-4777-8777-777777777777",
                name: "Ana",
                employee_number: "C001",
                active: true,
              },
            ],
    }),
  );
  const delivered: string[] = [];
  await page.route("**/rest/v1/rpc/submit_crew_time", (route) => {
    const body = JSON.parse(route.request().postData()!);
    expect(body.p_farm_id).toBe(farm);
    expect(body.p_entries[0].break_minutes).toBe(30);
    delivered.push(body.p_entries[0].id);
    return route.fulfill({ json: 1 });
  });
  await page.goto("/team/crew");
  await expect(
    page.getByRole("checkbox", { name: "Ana · C001" }),
  ).toBeVisible();
  await page.getByRole("checkbox", { name: "Ana · C001" }).check();
  await page.getByLabel("Start", { exact: true }).fill("2026-09-29T08:00");
  await page.getByLabel("End", { exact: true }).fill("2026-09-29T16:00");
  await page.getByLabel("Unpaid break minutes", { exact: true }).fill("30");
  await page.getByLabel("Job", { exact: true }).fill("Harvest");
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await context.setOffline(true);
  await page.getByRole("button", { name: "Save crew time for review" }).click();
  await expect(
    page.getByText("1 crew batches waiting on this device"),
  ).toBeVisible();
  const queuedId = await page.evaluate(() => {
    const key = Object.keys(localStorage).find((k) =>
      k.startsWith("farmvoice-crew-v1:"),
    )!;
    return JSON.parse(localStorage.getItem(key)!).entries[0].id;
  });
  await page.reload();
  await expect(
    page.getByText("1 crew batches waiting on this device"),
  ).toBeVisible();
  await context.setOffline(false);
  await expect(
    page.getByText("0 crew batches waiting on this device"),
  ).toBeVisible();
  expect(delivered).toEqual([queuedId]);
  expect(errors).toEqual([]);
});

test("Spanish signup is available and preference survives navigation", async ({
  page,
}) => {
  await page.goto("/signup");
  await page.getByRole("button", { name: "Español", exact: true }).click();
  await expect(
    page.getByLabel("Correo electrónico", { exact: true }),
  ).toBeVisible();
  await page.goto("/login");
  await expect(
    page.getByLabel("Correo electrónico", { exact: true }),
  ).toBeVisible();
});
