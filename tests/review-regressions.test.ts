import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { validCaptureTime } from "../src/lib/records/receipt.ts";
import { purchaseProblems } from "../src/lib/records/schema.ts";
import { collectChunkedPages } from "../src/lib/pagination.ts";

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
  const record = {id: "record", farmId: "farm", userId: "owner", status: "draft", type: "purchase", payload: {}, createdAt: new Date().toISOString()};
  let reads = 0, inserts = 0;
  const supabase = {from() {return {
    select() {return this;}, eq() {return this;},
    async maybeSingle() {
      const firstLookup = ++reads <= 2;
      await Promise.resolve();
      return {error: null, data: firstLookup ? null : {id: record.id, farm_id: "farm", created_by: "owner",record_type:record.type,status:record.status,payload:{recordCreatedAt:record.createdAt},field_id:null}};
    },
    async insert() {return {error: ++inserts === 1 ? null : {code: "23505"}};},
  };}};
  class AccessError extends Error {status: number; constructor(message: string, status: number) {super(message); this.status = status;}}
  const exports: Record<string, any> = {};
  const context = vm.createContext({exports, Response, require(path: string) {
    if (path.includes("access-server")) return {authorizeFarm: async () => ({supabase, user: {id: "owner"}}), requirePlan: async () => {}, AccessError, apiError: (error: AccessError) => Response.json({}, {status: error.status})};
    if (path.includes("receipt")) return {validCaptureTime};
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


test("offline field shells can be proactively cached after client navigation", async () => {
  const [sw, register] = await Promise.all([
    readFile(new URL("../public/sw.js", import.meta.url), "utf8"),
    readFile(new URL("../app/pwa-register.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(sw, /CACHE_SHELL/);
  assert.match(sw, /addEventListener\("message"/);
  assert.match(register, /postMessage\(\{ type: "CACHE_SHELL", path: pathname \}\)/);
  for (const path of ["/fields","/team","/worker","/h2a","/h2a/housing"])
    assert.ok(register.includes(`"${path}"`));
});

test("H-2A cache and recent-record cache include the account id", async () => {
  const [h2a, records] = await Promise.all([
    readFile(new URL("../app/h2a/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/records/page.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(h2a, /farmvoice-h2a-cache:\$\{userId\}:\$\{farmId\}/);
  assert.doesNotMatch(h2a, /farmvoice-h2a-cache:\$\{farmId\}/);
  assert.match(records, /farmvoice-recent-records:\$\{current\.userId\}:\$\{current\.farmId\}/);
});

test("offline H-2A daily rows use UUID ids that evidence can reference", async () => {
  const h2a = await readFile(new URL("../app/h2a/page.tsx", import.meta.url), "utf8");
  assert.match(h2a, /id: existing\?\.id \?\? crypto\.randomUUID\(\)/);
  assert.doesNotMatch(h2a, /id: `offline-/);
});

test("oversized evidence is rejected before offline fallback", async () => {
  const source = await readFile(new URL("../src/components/smart-photo-evidence.tsx", import.meta.url), "utf8");
  const sizeGuard = source.indexOf("file.size > 10 * 1024 * 1024");
  const tryBlock = source.indexOf("try {", sizeGuard);
  const offlineBranch = source.indexOf("if (!navigator.onLine)", sizeGuard);
  assert.ok(sizeGuard >= 0);
  assert.ok(tryBlock > sizeGuard);
  assert.ok(offlineBranch > tryBlock);
});

test("evidence synchronization and remapping share one account/farm mutex", async () => {
  const source = await readFile(new URL("../src/lib/evidence-offline.ts", import.meta.url), "utf8");
  assert.match(source, /const operationTails = new Map/);
  assert.match(source, /function withEvidenceSerialization/);
  assert.match(source, /return withEvidenceSerialization\([\s\S]*remapQueuedEvidenceRecordIdWithinLock/);
  assert.match(source, /return withEvidenceSerialization\([\s\S]*runEvidenceSync/);
});


test("Ask FarmVoice validates real dates and pages complete datasets", async () => {
  const source = await readFile(new URL("../app/api/ask-farmvoice/route.ts", import.meta.url), "utf8");
  assert.match(source, /parsed\.toISOString\(\)\.slice\(0, 10\) === value/);
  assert.match(source, /collectPages/);
  assert.doesNotMatch(source, /\.limit\((500|2000|5000|200)\)/);
  assert.match(source, /recordkeeping review, not a legal or compliance determination/);
});

test("inspection package uses hardened CSV, complete pagination, printable warning and accessible dates", async () => {
  const source = await readFile(new URL("../app/inspection-package/page.tsx", import.meta.url), "utf8");
  assert.match(source, /collectChunkedPages, collectPages, csvCell/);
  assert.doesNotMatch(source, /function csvCell/);
  assert.doesNotMatch(source, /\.limit\(1000\)/);
  assert.match(source, /<strong>Important:<\/strong> FarmVoice does not certify/);
  assert.match(source, /htmlFor="package-start"/);
  assert.match(source, /id="package-start"/);
  assert.match(source, /htmlFor="package-end"/);
  assert.match(source, /id="package-end"/);
});

test("legacy H-2A v1 queues remain discoverable for migration", async () => {
  const source = await readFile(new URL("../src/lib/h2a-offline.ts", import.meta.url), "utf8");
  assert.match(source, /farmvoice-h2a-daily-v1/);
  assert.match(source, /migrateLegacyBatches/);
  assert.match(source, /crypto\.randomUUID\(\)/);
});

test("H-2A reconciliation skips only identical ids with identical payloads and batches inserts", async () => {
  const source = await readFile(new URL("../src/lib/h2a-offline.ts", import.meta.url), "utf8");
  assert.match(source, /if \(serverId===row\.id && sameMutablePayload\(existing,row\)\) continue/);
  assert.match(source, /\.in\("worker_id",workerIds\)/);
  assert.match(source, /\.in\("work_date",workDates\)/);
  assert.match(source, /\.insert\(inserts\)/);
  assert.match(source, /Offline reconciliation after reconnect/);
});


test("H-2A follow-up repairs invalid ids, compares payloads, and includes break fields", async () => {
  const source = await readFile(new URL("../src/lib/h2a-offline.ts", import.meta.url), "utf8");
  assert.match(source, /uuidPattern/);
  assert.match(source, /evidenceRemaps/);
  assert.match(source, /sameMutablePayload/);
  assert.match(source, /"shift_minutes"/);
  assert.match(source, /"paid_break_minutes"/);
  assert.match(source, /if \(serverId===row\.id && sameMutablePayload\(existing,row\)\) continue/);
});

test("inspection evidence chunking bounds ids and collects every page", async () => {
  const ids = Array.from({length:205},(_,i)=>`record-${i}`);
  const seen = new Map<string,string[]>();
  const rows = await collectChunkedPages(
    ids,
    async (chunk,from,to) => {
      assert.ok(chunk.length <= 100);
      const signature = chunk.join(",");
      if (!seen.has(signature)) seen.set(signature,[...chunk]);
      return {
        data: chunk.slice(from,to+1).map((record_id)=>({record_id})),
        error: null,
      };
    },
    100,
    37,
  );
  assert.equal(seen.size,3);
  assert.deepEqual([...seen.values()].map((chunk)=>chunk.length),[100,100,5]);
  assert.equal(rows.length,205);
  assert.deepEqual(rows.map((row)=>row.record_id),ids);
});

test("inspection package applies selected ids through the tested chunk helper", async () => {
  const source = await readFile(new URL("../app/inspection-package/page.tsx", import.meta.url), "utf8");
  assert.match(source, /collectChunkedPages<Evidence, string>/);
  assert.match(source, /\.in\("record_id", ids\)/);
  assert.doesNotMatch(source, /allEvidence/);
});


test("H-2A reconnect holds the shared evidence mutex through reconciliation", async () => {
  const source = await readFile(new URL("../app/h2a/page.tsx", import.meta.url), "utf8");
  assert.match(source, /withEvidenceSerialization/);
  assert.match(source, /syncH2aDailyBatches\([\s\S]*remapQueuedEvidenceRecordIdWithinLock/);
  assert.match(source, /saveH2aDailyRows\([\s\S]*remapQueuedEvidenceRecordIdWithinLock/);
});
