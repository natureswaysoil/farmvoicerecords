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
    "recordkeeping",
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
