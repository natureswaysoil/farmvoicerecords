import assert from "node:assert/strict";
import test from "node:test";
import {
  buildJohnDeereOrganizationAccessUrl,
  deereLink,
  johnDeereConfigured,
  johnDeereTokenExpiry,
} from "../src/lib/john-deere.ts";

test("finds Deere HAL links by rel", () => {
  const value = deereLink(
    {
      links: [
        { rel: "self", uri: "https://example.test/self" },
        { rel: "nextPage", uri: "https://example.test/next" },
      ],
    },
    "nextPage",
  );
  assert.equal(value, "https://example.test/next");
});

test("returns null when a Deere HAL link is absent", () => {
  assert.equal(deereLink({ links: [] }, "connections"), null);
});

test("reports connector unconfigured without required Deere secrets", () => {
  const names = [
    "JOHN_DEERE_CLIENT_ID",
    "JOHN_DEERE_CLIENT_SECRET",
    "JOHN_DEERE_AUTH_URL",
    "JOHN_DEERE_TOKEN_URL",
    "JOHN_DEERE_API_BASE_URL",
    "JOHN_DEERE_TOKEN_ENCRYPTION_KEY",
  ] as const;
  const saved = new Map(names.map((name) => [name, process.env[name]]));

  for (const name of names) delete process.env[name];
  assert.equal(johnDeereConfigured(), false);

  for (const [name, value] of saved) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

test("John Deere token expiry subtracts a safety window", () => {
  const before = Date.now();
  const expires = new Date(johnDeereTokenExpiry(3600)).getTime();
  const after = Date.now();
  assert.ok(expires >= before + 3539_000);
  assert.ok(expires <= after + 3541_000);
});


test("builds Deere organization selection URL from configured client and redirect", () => {
  const oldClient = process.env.JOHN_DEERE_CLIENT_ID;
  const oldRedirect = process.env.JOHN_DEERE_REDIRECT_URI;
  process.env.JOHN_DEERE_CLIENT_ID = "client-123";
  process.env.JOHN_DEERE_REDIRECT_URI =
    "https://farmvoicerecords.com/api/integrations/john-deere/callback";

  try {
    const url = new URL(buildJohnDeereOrganizationAccessUrl());
    assert.equal(url.origin, "https://connections.deere.com");
    assert.equal(
      url.pathname,
      "/connections/client-123/select-organizations",
    );
    assert.equal(
      url.searchParams.get("redirect_uri"),
      "https://farmvoicerecords.com/api/integrations/john-deere/callback",
    );
  } finally {
    if (oldClient === undefined) delete process.env.JOHN_DEERE_CLIENT_ID;
    else process.env.JOHN_DEERE_CLIENT_ID = oldClient;
    if (oldRedirect === undefined) delete process.env.JOHN_DEERE_REDIRECT_URI;
    else process.env.JOHN_DEERE_REDIRECT_URI = oldRedirect;
  }
});
