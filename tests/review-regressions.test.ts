import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { purchaseProblems } from "../src/lib/records/schema.ts";

test("purchase quantities must be finite and positive", () => {
  for (const quantity of ["Infinity", "-Infinity", "1e999", "NaN", "0", "-1"])
    assert.ok(purchaseProblems({ quantity }).includes("positive quantity"));
  assert.ok(!purchaseProblems({ quantity: "2.5" }).includes("positive quantity"));
});
test("configured tour iframe origin is allowed by CSP", async () => {
  process.env.NEXT_PUBLIC_FARMVOICE_TOUR_VIDEO_URL = "https://tour.example.com/embed/123";
  const { default: config } = await import("../next.config.ts");
  const headers = await config.headers!();
  const csp = headers[0].headers.find(h => h.key === "Content-Security-Policy")!.value;
  assert.ok(csp.split(";").find(d => d.trim().startsWith("frame-src"))!.includes("https://tour.example.com"));
  assert.ok(!csp.includes("https://tour.example.com/embed"));
});
test("offline cache bounds old chunks while preserving current shell assets", async () => {
  const keys = Array.from({length: 150}, (_, i) => ({url: `https://farm.test/_next/static/old-${i}.js`}));
  keys.push({url: "https://farm.test/_next/static/current.js"});
  const deleted: string[] = [];
  const cache = {
    match: async () => new Response('<script src="/_next/static/current.js"></script>'),
    keys: async () => keys,
    delete: async (request: {url: string}) => { deleted.push(request.url); return true; },
  };
  const context = vm.createContext({self: {location: {origin: "https://farm.test"}, addEventListener() {}}, URL, Response});
  vm.runInContext(await readFile(new URL("../public/sw.js", import.meta.url), "utf8"), context);
  context.cache = cache;
  await vm.runInContext("pruneAssets(cache)", context);
  assert.equal(deleted.length, 50);
  assert.ok(!deleted.includes("https://farm.test/_next/static/current.js"));
});
test("concurrent identical record deliveries both succeed", async () => {
  const ts = await import("typescript");
  const record = {id: "record", farmId: "farm", userId: "owner", status: "draft", type: "purchase", payload: {}, createdAt: "2026-09-29T00:00:00Z"};
  let reads = 0, inserts = 0;
  const supabase = {from() {return {
    select() {return this;}, eq() {return this;},
    async maybeSingle() {
      const firstLookup = ++reads <= 2;
      await Promise.resolve();
      return {error: null, data: firstLookup ? null : {id: record.id, farm_id: "farm", created_by: "owner"}};
    },
    async insert() {return {error: ++inserts === 1 ? null : {code: "23505"}};},
  };}};
  class AccessError extends Error {status: number; constructor(message: string, status: number) {super(message); this.status = status;}}
  const exports: Record<string, any> = {};
  const context = vm.createContext({exports, Response, require(path: string) {
    if (path.includes("access-server")) return {authorizeFarm: async () => ({supabase, user: {id: "owner"}}), requirePlan: async () => {}, AccessError, apiError: (error: AccessError) => Response.json({}, {status: error.status})};
    if (path.includes("schema")) return {recordRequestSchema: {safeParse: () => ({success: true, data: record})}};
    return {};
  }});
  const source = await readFile(new URL("../app/api/records/route.ts", import.meta.url), "utf8");
  vm.runInContext(ts.transpileModule(source, {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022}}).outputText, context);
  const request = () => new Request("https://farm.test/api/records", {method: "POST", body: "{}"});
  const responses = await Promise.all([exports.POST(request()), exports.POST(request())]);
  assert.deepEqual(responses.map(response => response.status), [200, 200]);
  assert.equal(inserts, 2);
});
