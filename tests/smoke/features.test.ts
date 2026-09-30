import assert from "node:assert/strict";
import test from "node:test";

const baseUrl = process.env.SMOKE_BASE_URL ?? "http://127.0.0.1:3100";

test("public FarmVoice pages render their feature entry points", async () => {
  const pages = [
    ["/", "Less paperwork. More time for your farm."],
    ["/login", "Email and password"],
    ["/signup", "Set your FarmVoice password"],
    ["/billing", "Unlimited workers"],
    ["/help", "Watch a feature walkthrough"],
  ] as const;

  for (const [path, expected] of pages) {
    const response = await fetch(new URL(path, baseUrl), {
      redirect: "manual",
    });
    assert.equal(response.status, 200, path);
    const html = await response.text();
    assert.ok(html.includes(expected), `${path} did not contain "${expected}"`);
  }
});

test("unauthenticated farm discovery rejects access", async () => {
  const response = await fetch(new URL("/api/farms/owned", baseUrl));
  assert.equal(response.status, 401);
  const body = (await response.json()) as { error?: string; farms?: unknown };
  assert.equal(body.error, "Sign in is required.");
  assert.equal(body.farms, undefined);
});

test("unauthenticated owner setup cannot create a farm", async () => {
  const response = await fetch(new URL("/api/farm/ensure-owner", baseUrl), {
    method: "POST",
  });
  assert.equal(response.status, 401);
  const body = (await response.json()) as { error?: string; ok?: boolean };
  assert.equal(body.error, "Sign in is required.");
  assert.notEqual(body.ok, true);
});

test("unauthenticated QuickBooks connection cannot begin OAuth", async () => {
  const response = await fetch(
    new URL("/api/quickbooks/connect?farmId=other-farm", baseUrl),
    {
      redirect: "manual",
    },
  );
  assert.equal(response.status, 401);
  assert.equal(response.headers.get("location"), null);
});

test("all public video guides are delivered as MP4s", async () => {
  const guides = ["records", "fields", "team", "h2a", "housing", "quickbooks"];

  for (const guide of guides) {
    const path = `/videos/farmvoice-${guide}.mp4`;
    const response = await fetch(new URL(path, baseUrl), {
      headers: { Range: "bytes=0-31" },
      redirect: "manual",
    });
    assert.ok(
      response.status === 206 || response.status === 200,
      `${path}: HTTP ${response.status}`,
    );
    assert.match(
      response.headers.get("content-type") ?? "",
      /^video\/mp4\b/i,
      path,
    );

    const bytes = new Uint8Array(await response.arrayBuffer());
    assert.ok(bytes.length >= 12, `${path} is too short`);
    assert.equal(
      new TextDecoder().decode(bytes.slice(4, 8)),
      "ftyp",
      `${path} is not an MP4`,
    );
  }
});

test("unauthenticated QuickBooks errors request returns 401", async () => {
  const response = await fetch(new URL("/api/quickbooks/errors", baseUrl));
  assert.equal(response.status, 401);
});

test("production does not expose the QuickBooks error test route", async () => {
  const response = await fetch(
    new URL("/api/quickbooks/test-error-handling", baseUrl),
    { method: "POST" },
  );
  assert.equal(response.status, 404);
});
