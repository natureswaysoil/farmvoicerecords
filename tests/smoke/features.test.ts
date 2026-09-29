import assert from "node:assert/strict";
import test from "node:test";

const baseUrl = process.env.SMOKE_BASE_URL ?? "http://127.0.0.1:3100";

test("public FarmVoice pages render their feature entry points", async () => {
  const pages = [
    ["/", "Speak your farm records"],
    ["/login", "Email and password"],
    ["/signup", "Set your FarmVoice password"],
    ["/billing", "Unlimited workers"],
    ["/help", "Help"],
  ] as const;

  for (const [path, expected] of pages) {
    const response = await fetch(new URL(path, baseUrl), { redirect: "manual" });
    assert.equal(response.status, 200, path);
    const html = await response.text();
    assert.ok(html.includes(expected), `${path} did not contain "${expected}"`);
  }
});

test("unauthenticated farm discovery rejects access", async () => {
  const response = await fetch(new URL("/api/farms/owned", baseUrl));
  assert.equal(response.status, 401);
  const body = await response.json() as { error?: string; farms?: unknown };
  assert.equal(body.error, "Sign in is required.");
  assert.equal(body.farms, undefined);
});

test("unauthenticated owner setup cannot create a farm", async () => {
  const response = await fetch(new URL("/api/farm/ensure-owner", baseUrl), { method: "POST" });
  assert.equal(response.status, 401);
  const body = await response.json() as { error?: string; ok?: boolean };
  assert.equal(body.error, "Sign in is required.");
  assert.notEqual(body.ok, true);
});

test("unauthenticated QuickBooks connection cannot begin OAuth", async () => {
  const response = await fetch(new URL("/api/quickbooks/connect?farmId=other-farm", baseUrl), {
    redirect: "manual",
  });
  assert.equal(response.status, 401);
  assert.equal(response.headers.get("location"), null);
});
