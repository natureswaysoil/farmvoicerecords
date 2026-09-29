import assert from "node:assert/strict";
import test from "node:test";
const base = process.env.SMOKE_BASE_URL ?? "http://127.0.0.1:3100";
test("SEO and sample assets are delivered", async () => {
  for (const [path, expected] of [
    ["/robots.txt", "Sitemap:"],
    ["/sitemap.xml", "/resources/pesticide-records/nc"],
    ["/llms.txt", "# FarmVoice"],
    ["/demo", "Fictional example"],
    ["/security", "account security"],
    ["/resources/pesticide-records/ca", "California"],
    ["/samples/h2a-payroll.csv", "FICTIONAL EXAMPLE"],
  ] as const) {
    const r = await fetch(base + path);
    assert.equal(r.status, 200, path);
    assert.ok((await r.text()).includes(expected), path);
  }
  const pdf = await fetch(base + "/samples/pesticide-record.pdf");
  assert.equal(pdf.status, 200);
  assert.match(pdf.headers.get("content-type") ?? "", /application\/pdf/);
  assert.equal(
    Buffer.from(await pdf.arrayBuffer())
      .subarray(0, 5)
      .toString(),
    "%PDF-",
  );
  const home = await (await fetch(base)).text();
  assert.ok(home.includes("og:image"));
  const pricing = await (await fetch(base + "/billing")).text();
  assert.ok(pricing.includes("Pricing and subscriptions"));
  assert.notEqual(
    home.match(/<title>(.*?)<\/title>/)?.[1],
    pricing.match(/<title>(.*?)<\/title>/)?.[1],
  );
});
test("new record services require authentication and reject cross-origin billing", async () => {
  for (const [path, body] of [
    [
      "/api/records/extract",
      {
        farmId: "33333333-3333-4333-8333-333333333333",
        note: "Applied two gallons",
        type: "pesticide",
      },
    ],
    [
      "/api/records",
      {
        id: "44444444-4444-4444-8444-444444444444",
        farmId: "33333333-3333-4333-8333-333333333333",
        userId: "11111111-1111-4111-8111-111111111111",
        type: "purchase",
        status: "draft",
        createdAt: new Date().toISOString(),
        fieldId: null,
        payload: {},
      },
    ],
  ] as const) {
    const r = await fetch(base + path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    assert.equal(r.status, 401, path);
  }
  const billing = await fetch(base + "/api/billing/checkout", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "https://untrusted.invalid",
    },
    body: "{}",
  });
  assert.equal(billing.status, 403);
  const webhook = await fetch(base + "/api/billing/webhook", {
    method: "POST",
    body: "{}",
  });
  assert.ok([400, 503].includes(webhook.status));
});
