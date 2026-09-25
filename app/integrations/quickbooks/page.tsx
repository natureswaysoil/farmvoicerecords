"use client";

import { useEffect, useMemo, useState } from "react";

type Worker = { user_id: string; employee_number: string | null; role: string };
type Employee = { Id: string; DisplayName: string };
type Mapping = {
  worker_user_id: string;
  quickbooks_employee_id: string;
  quickbooks_employee_name: string | null;
};
type Status = {
  connected: boolean;
  companyName: string | null;
  workers: Worker[];
  mappings: Mapping[];
  quickBooksEmployees: Employee[];
  error?: string;
};

export default function QuickBooksIntegrationPage() {
  const [status, setStatus] = useState<Status | null>(null);
  const [message, setMessage] = useState("Loading QuickBooks integration...");
  const [syncing, setSyncing] = useState(false);

  async function load() {
    const response = await fetch("/api/quickbooks/status", { cache: "no-store" });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error ?? "Unable to load QuickBooks.");
    setStatus(body);
    setMessage("");
  }

  useEffect(() => {
    load().catch((error) => setMessage(error instanceof Error ? error.message : "Unable to load QuickBooks."));
  }, []);

  const mappingsByWorker = useMemo(
    () => new Map((status?.mappings ?? []).map((mapping) => [mapping.worker_user_id, mapping])),
    [status]
  );

  async function saveMapping(workerUserId: string, employeeId: string) {
    const employee = status?.quickBooksEmployees.find((item) => item.Id === employeeId);
    const response = await fetch("/api/quickbooks/status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        workerUserId,
        quickbooksEmployeeId: employeeId,
        quickbooksEmployeeName: employee?.DisplayName ?? "",
      }),
    });
    const body = await response.json();
    if (!response.ok) return setMessage(body.error ?? "Unable to save mapping.");
    setMessage("Employee mapping saved.");
    await load();
  }

  async function syncApprovedTime() {
    setSyncing(true);
    setMessage("Sending approved time to QuickBooks...");
    try {
      const response = await fetch("/api/quickbooks/sync", { method: "POST" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "QuickBooks sync failed.");
      setMessage(
        `QuickBooks sync complete: ${body.synced} sent, ${body.skipped.length} skipped, ${body.failed.length} failed.`
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "QuickBooks sync failed.");
    } finally {
      setSyncing(false);
    }
  }

  return (
    <main className="container section stack">
      <div>
        <div className="kicker">Accounting integration</div>
        <h2>QuickBooks</h2>
        <p className="muted">
          Connect the farm's QuickBooks company, match FarmVoice workers to QuickBooks employees,
          then send only completed and manager-approved time.
        </p>
      </div>

      <section className="card stack">
        <div className="inline" style={{ justifyContent: "space-between" }}>
          <div>
            <h3>Connection</h3>
            <p className="muted" style={{ marginBottom: 0 }}>
              {status?.connected
                ? `Connected to ${status.companyName ?? "QuickBooks Online"}`
                : "QuickBooks is not connected yet."}
            </p>
          </div>
          <a className="btn" href="/api/quickbooks/connect">
            {status?.connected ? "Reconnect QuickBooks" : "Connect QuickBooks"}
          </a>
        </div>
      </section>

      {status?.connected && (
        <>
          <section className="card stack">
            <div>
              <h3>Employee matching</h3>
              <p className="muted">
                Each FarmVoice worker must be matched once to the correct QuickBooks employee.
              </p>
            </div>
            {status.workers.length ? (
              <table className="table">
                <thead>
                  <tr>
                    <th>FarmVoice worker</th>
                    <th>QuickBooks employee</th>
                  </tr>
                </thead>
                <tbody>
                  {status.workers.map((worker) => {
                    const current = mappingsByWorker.get(worker.user_id);
                    return (
                      <tr key={worker.user_id}>
                        <td>{worker.employee_number ?? worker.user_id.slice(0, 8)}</td>
                        <td>
                          <select
                            value={current?.quickbooks_employee_id ?? ""}
                            onChange={(event) => saveMapping(worker.user_id, event.target.value)}
                          >
                            <option value="">Select employee</option>
                            {status.quickBooksEmployees.map((employee) => (
                              <option key={employee.Id} value={employee.Id}>
                                {employee.DisplayName}
                              </option>
                            ))}
                          </select>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <p className="muted">No worker accounts are attached to this farm yet.</p>
            )}
          </section>

          <section className="card stack">
            <h3>Approved payroll time</h3>
            <p className="muted">
              FarmVoice keeps GPS and detailed field records here. QuickBooks receives only approved
              employee time, work date, job/field description and duration.
            </p>
            <div>
              <button className="btn" disabled={syncing} onClick={syncApprovedTime}>
                {syncing ? "Sending..." : "Send approved time to QuickBooks"}
              </button>
            </div>
          </section>
        </>
      )}

      {message && <div className="notice">{message}</div>}
    </main>
  );
}
