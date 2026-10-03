import assert from "node:assert/strict";
import test from "node:test";
import {
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
