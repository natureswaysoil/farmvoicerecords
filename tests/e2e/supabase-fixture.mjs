// Isolated CI service. Never used in deployed application code.
import { createServer } from "node:http";
const uid = "11111111-1111-4111-8111-111111111111",
  farm = "33333333-3333-4333-8333-333333333333";
const user = {
  id: uid,
  aud: "authenticated",
  role: "authenticated",
  email: "fixture@example.invalid",
  app_metadata: { provider: "email" },
  user_metadata: {},
  created_at: "2026-01-01T00:00:00Z",
};
createServer((req, res) => {
  const u = new URL(req.url, "http://localhost");
  const path = u.pathname;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "*");
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET,POST,PATCH,DELETE,OPTIONS",
  );
  if (req.method === "OPTIONS") {
    res.end();
    return;
  }
  let data = [];
  if (path === "/auth/v1/user") data = user;
  if (path === "/rest/v1/farms")
    data = [{ id: farm, owner_user_id: uid, name: "Test Farm" }];
  if (path === "/rest/v1/farm_members")
    data = [{ farm_id: farm, user_id: uid, role: "owner" }];
  if (
    path === "/rest/v1/rpc/farm_plan_access" ||
    path === "/rest/v1/rpc/consume_record_ai_request"
  )
    data = true;
  if (path === "/rest/v1/farm_billing")
    data = [
      {
        farm_id: farm,
        status: "trialing",
        trial_ends_at: "2099-01-01T00:00:00Z",
        core_enabled: false,
        h2a_enabled: false,
      },
    ];
  if (req.headers.accept?.includes("vnd.pgrst.object") && Array.isArray(data))
    data = data[0] ?? null;
  res.end(JSON.stringify(data));
}).listen(54399, "127.0.0.1");
