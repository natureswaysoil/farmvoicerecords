import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { netDuration } from "../src/lib/quickbooks-time.ts";

test("QuickBooks route exports account and crew time, deducting crew breaks without time overrides", async () => {
  const ts = await import("typescript");
  const sent: Array<{ endpoint: string; body: Record<string, any> }> = [];
  const completed: string[] = [];
  const entries: Record<string, any> = {
    time_entries: {
      id: "individual",
      worker_user_id: "user",
      clock_in: "2026-09-30T08:00:00Z",
      clock_out: "2026-09-30T16:00:00Z",
      qbo_sync_status: "not_synced",
    },
    crew_time_entries: {
      id: "crew",
      worker_id: "worker",
      clock_in: "2026-09-30T08:00:00Z",
      clock_out: "2026-09-30T16:00:00Z",
      break_minutes: 45,
      qbo_sync_status: "not_synced",
    },
  };
  const supabase = {
    from(table: string) {
      let update: Record<string, unknown> | undefined;
      const query: any = {
        select() {
          return this;
        },
        eq() {
          return this;
        },
        is() {
          return this;
        },
        lt() {
          return this;
        },
        not() {
          return this;
        },
        in() {
          return this;
        },
        order() {
          return this;
        },
        update(value: Record<string, unknown>) {
          update = value;
          return this;
        },
        single() {
          return this;
        },
        maybeSingle() {
          return this;
        },
        then(resolve: (value: unknown) => void) {
          let data: unknown = null;
          if (update) {
            if (update.qbo_sync_status === "syncing")
              data = { ...entries[table], ...update };
            if (update.qbo_sync_status === "synced") completed.push(table);
          } else if (table === "farms") data = { timezone: "UTC" };
          else if (table === "quickbooks_employee_mappings")
            data = [{ worker_user_id: "user", quickbooks_employee_id: "101" }];
          else if (table === "quickbooks_crew_mappings")
            data = [{ worker_id: "worker", quickbooks_employee_id: "102" }];
          else data = [entries[table]];
          resolve({ data, error: null });
        },
      };
      return query;
    },
  };
  const exports: Record<string, any> = {};
  const context = vm.createContext({
    exports,
    Response,
    require(path: string) {
      if (path === "next/server") return { NextResponse: Response };
      if (path.endsWith("quickbooks-time")) return { netDuration };
      if (path.endsWith("quickbooks-server"))
        return {
          getValidQuickBooksAccessToken: async () => ({
            supabase,
            farmId: "farm",
            accessToken: "test",
            connection: { realm_id: "realm" },
          }),
          logQuickBooksError: async () => {
            throw new Error("Unexpected sync failure");
          },
        };
      if (path.endsWith("quickbooks"))
        return {
          isQuickBooksApiError: () => false,
          qboRequest: async (
            _realm: string,
            _token: string,
            endpoint: string,
            options: { body: string },
          ) => {
            sent.push({ endpoint, body: JSON.parse(options.body) });
            return {
              data: { TimeActivity: { Id: String(sent.length) } },
              intuitTid: "test",
            };
          },
        };
      throw new Error(`Unexpected import ${path}`);
    },
  });
  const source = await readFile(
    new URL("../app/api/quickbooks/sync/route.ts", import.meta.url),
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
  const response = await exports.POST(
    new Request("https://farm.test/api/quickbooks/sync", {
      method: "POST",
      body: "{}",
    }),
  );
  assert.equal(response.status, 200);
  assert.equal((await response.json()).synced, 2);
  assert.deepEqual(completed, ["time_entries", "crew_time_entries"]);
  assert.equal(sent[0].body.Hours, 8);
  assert.equal(sent[1].body.Hours, 7);
  assert.equal(sent[1].body.Minutes, 15);
  assert.equal(sent[1].body.EmployeeRef.value, "102");
  assert.match(sent[1].endpoint, /requestid=crew-crew/);
  for (const { body } of sent) {
    assert.equal(body.StartTime, undefined);
    assert.equal(body.EndTime, undefined);
  }
});
