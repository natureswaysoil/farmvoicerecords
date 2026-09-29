import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "*.spec.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  use: { baseURL: "http://127.0.0.1:3100", trace: "retain-on-failure" },
  webServer: [
    {
      command: "node tests/e2e/supabase-fixture.mjs",
      url: "http://127.0.0.1:54399",
      reuseExistingServer: !process.env.CI,
    },
    {
      command: "npm run start -- -H 127.0.0.1 -p 3100",
      url: "http://127.0.0.1:3100",
      reuseExistingServer: !process.env.CI,
      env: {
        NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54399",
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "test-public-key",
        NEXT_PUBLIC_SITE_URL: "https://farmvoicerecords.com",
      },
    },
  ],
});
