import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import ts from "typescript";
import {
  recordRequestSchema,
  purchaseProblems,
  gpsSchema,
} from "../src/lib/records/schema.ts";
const user = "11111111-1111-4111-8111-111111111111",
  farm = "33333333-3333-4333-8333-333333333333",
  id = "77777777-7777-4777-8777-777777777777";
const createdAt = "2026-09-29T12:00:00+00:00";
const body = {
  id,
  userId: user,
  farmId: farm,
  createdAt,
  type: "purchase",
  status: "draft",
  fieldId: null,
  expectedRevision: 1,
  payload: { item: "New seed" },
};
async function fixture(
  options: {
    race?: boolean;
    expired?: boolean;
    revision?: number;
    owner?: boolean;
    existingPayload?: Record<string, unknown>;
  } = {},
) {
  let existing: any = {
    id,
    created_by: user,
    farm_id: farm,
    revision: options.revision ?? 1,
    updated_by: user,
    created_at: createdAt,
    record_type: "purchase",
    status: "draft",
    field_id: null,
    payload: options.existingPayload ?? {
      item: "Old seed",
      recordCreatedAt: createdAt,
    },
  };
  let writes = 0;
  const supabase = {
    from() {
      let update: unknown = null;
      return {
        select() {
          return this;
        },
        eq() {
          return this;
        },
        update(value: unknown) {
          update = value;
          return this;
        },
        async maybeSingle() {
          if (update) {
            writes++;
            if (options.race) return { data: null, error: null };
            existing = {
              ...existing,
              ...update,
              revision: existing.revision + 1,
            };
          }
          return { data: existing, error: null };
        },
      };
    },
  };
  class AccessError extends Error {
    status: number;
    constructor(
      message: string,
      status: number,
    ) {
      super(message);
      this.status = status;
    }
  }
  const exports: Record<string, any> = {};
  const context = vm.createContext({
    exports,
    Response,
    require(path: string) {
      if (path.includes("access-server"))
        return {
          authorizeFarm: async () => ({
            supabase,
            user: {
              id:
                options.owner === false
                  ? "22222222-2222-4222-8222-222222222222"
                  : user,
            },
            farm: { role: options.owner === false ? "worker" : "owner" },
          }),
          requirePlan: async () => {
            if (options.expired) throw new AccessError("Expired", 402);
          },
          AccessError,
          apiError: (e: AccessError) =>
            Response.json({ error: e.message }, { status: e.status }),
        };
      if (path.includes("schema"))
        return { recordRequestSchema, purchaseProblems, gpsSchema };
      return {};
    },
  });
  const source = await readFile(
    new URL("../app/api/records/route.ts", import.meta.url),
    "utf8",
  );
  vm.runInContext(
    ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText,
    context,
  );
  return {
    call: (method: string, data: unknown) =>
      exports[method](
        new Request("https://farm.test/api/records", {
          method,
          body: JSON.stringify(data),
        }),
      ),
    writes: () => writes,
  };
}
test("PATCH accepts database timestamps, applies revision checks and recognizes lost responses", async () => {
  const f = await fixture();
  const response = await f.call("PATCH", body);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).revision, 2);
  assert.equal(f.writes(), 1);
  const retry = await f.call("PATCH", body);
  assert.equal(retry.status, 200);
  assert.equal(f.writes(), 1);
  assert.equal(
    (await f.call("PATCH", { ...body, payload: { item: "Concurrent change" } }))
      .status,
    409,
  );
  const race = await fixture({ race: true });
  assert.equal((await race.call("PATCH", body)).status, 409);
});
test("delivered amendments remain retryable after expiry but new edits and other accounts cannot write", async () => {
  const f = await fixture({
    expired: true,
    revision: 2,
    existingPayload: { item: "New seed", recordCreatedAt: createdAt },
  });
  assert.equal((await f.call("PATCH", body)).status, 200);
  assert.equal(f.writes(), 0);
  const expired = await fixture({ expired: true });
  assert.equal((await expired.call("PATCH", body)).status, 402);
  const other = await fixture({ owner: false });
  assert.equal((await other.call("PATCH", body)).status, 403);
  assert.equal(other.writes(), 0);
});
test("POST retries cannot silently discard a different payload under an existing ID", async () => {
  const f = await fixture();
  const { expectedRevision, ...post } = body;
  assert.equal((await f.call("POST", post)).status, 409);
  assert.equal(
    (await f.call("POST", { ...post, payload: { item: "Old seed" } })).status,
    200,
  );
  assert.equal(f.writes(), 0);
});
