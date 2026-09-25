"use client";

import { useEffect, useMemo, useState } from "react";

type Worker = { user_id: string; employee_number: string | null; role: string };
type Employee = { Id: string; DisplayName: string };
type Mapping = {
  worker_user_id: string;
  quickbooks_employee_id: string;
  quickbooks_employee_name: string | null;
};
type ErrorLog = {
  id: string;
  occurred_at: string;
  operation: string;
  endpoint: string | null;
  http_status: number | null;
  intuit_tid: string | null;
  error_code: string | null;
  error_message: string;
  reconnect_required: boolean;
};

type Status = {
  connected: boolean;
  companyName: string | null;
  timezone: string;
  reconnectRequired: boolean;
  lastAuthError: string | null;
  lastIntuitTid: string | null;
  lastApiAt: string | null;
  workers: Worker[];
  mappings: Mapping[];
  quickBooksEmployees: Employee[];
  error?: string;
};

export default function QuickBooksIntegrationPage() {
  const [status, setStatus] = useState<Status | null>(null);
  const [message, setMessage] = useState("Loading QuickBooks integration...");
  const [syncing, setSyncing] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [timezone, setTimezone] = useState("");
  const [errorLogs, setErrorLogs] = useState<ErrorLog[]>([]);
  const [loadingErrors, setLoadingErrors] = useState(false);

  async function load() {
    const response = await fetch("/api/quickbooks/status", { cache: "no-store" });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error ?? "Unable to load QuickBooks.");
    setStatus(body);
    setTimezone(body.timezone ?? "UTC");
    setMessage("");
  }

  useEffect(() => {
    load().catch((error) => setMessage(error instanceof Error ? error.message : "Unable to load QuickBooks."));
  }, []);

  async function loadErrorLogs() {
    setLoadingErrors(true);
    try {
      const response = await fetch("/api/quickbooks/errors", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Unable to load QuickBooks error logs.");
      setErrorLogs(body.errors ?? []);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to load QuickBooks error logs.");
    } finally {
      setLoadingErrors(false);
    }
  }

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


  async function saveTimezone() {
    const response = await fetch("/api/quickbooks/status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ timezone }),
    });
    const body = await response.json();
    if (!response.ok) return setMessage(body.error ?? "Unable to save payroll timezone.");
    setMessage("Payroll timezone saved.");
    await load();
  }

  async function disconnectQuickBooks() {
    if (!window.confirm("Disconnect QuickBooks from this farm? Future FarmVoice syncs will stop until you reconnect.")) {
      return;
    }

    setDisconnecting(true);
    setMessage("Disconnecting QuickBooks...");
    try {
      const response = await fetch("/api/quickbooks/disconnect", { method: "POST" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Unable to disconnect QuickBooks.");
      setMessage("QuickBooks disconnected. Existing records already sent to QuickBooks are unchanged.");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to disconnect QuickBooks.");
    } finally {
      setDisconnecting(false);
    }
  }

  async function syncApprovedTime() {
    setSyncing(true);
    setMessage("Sending approved time to QuickBooks...");
    try {
      const response = await fetch("/api/quickbooks/sync", { method: "POST" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "QuickBooks sync failed.");
      if (body.reconnectRequired) {
        setMessage("QuickBooks authorization needs attention. Reconnect QuickBooks before syncing again.");
      } else {
        setMessage(
          `QuickBooks sync complete: ${body.synced} sent, ${body.skipped.length} skipped, ${body.failed.length} failed.`
        );
      }
      await load();
      await loadErrorLogs();
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
                ? status.reconnectRequired
                  ? `Reconnect required for ${status.companyName ?? "QuickBooks Online"}`
                  : `Connected to ${status.companyName ?? "QuickBooks Online"}`
                : "QuickBooks is not connected yet."}
            </p>
            {status?.reconnectRequired && (
              <p className="notice" style={{ marginTop: 12 }}>
                QuickBooks authorization has expired or become invalid. Reconnect QuickBooks before sending more time.
                {status.lastIntuitTid ? <> Intuit request ID: <code>{status.lastIntuitTid}</code>.</> : null}
              </p>
            )}
          </div>
          <div className="inline">
            <a className="btn" href="/api/quickbooks/connect">
              {status?.connected || status?.reconnectRequired ? "Reconnect QuickBooks" : "Connect QuickBooks"}
            </a>
            {status?.connected && (
              <button className="btn secondary" disabled={disconnecting} onClick={disconnectQuickBooks}>
                {disconnecting ? "Disconnecting..." : "Disconnect QuickBooks"}
              </button>
            )}
          </div>
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
            <h3>Payroll timezone</h3>
            <p className="muted">
              QuickBooks uses this timezone to determine each work date. Use an IANA timezone such as America/New_York.
            </p>
            <div className="inline">
              <input
                value={timezone}
                onChange={(event) => setTimezone(event.target.value)}
                placeholder="America/New_York"
                style={{ minWidth: 260 }}
              />
              <button className="btn secondary" onClick={saveTimezone}>Save timezone</button>
              <button
                className="btn secondary"
                onClick={() => setTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone)}
              >
                Use this device
              </button>
            </div>
          </section>

          <section className="card stack">
            <h3>Approved payroll time</h3>
            <p className="muted">
              FarmVoice keeps GPS and detailed field records here. QuickBooks receives only approved
              employee time, work date, job/field description and duration.
            </p>
            <div>
              <button className="btn" disabled={syncing || Boolean(status?.reconnectRequired)} onClick={syncApprovedTime}>
                {syncing ? "Sending..." : "Send approved time to QuickBooks"}
              </button>
            </div>
          </section>

          <section className="card stack">
            <div className="inline" style={{ justifyContent: "space-between" }}>
              <div>
                <h3>QuickBooks troubleshooting</h3>
                <p className="muted">
                  FarmVoice stores recent QuickBooks errors and Intuit request IDs for support. Tokens and secrets are not included.
                </p>
              </div>
              <button className="btn secondary" onClick={loadErrorLogs} disabled={loadingErrors}>
                {loadingErrors ? "Loading..." : "Load recent errors"}
              </button>
            </div>
            {status?.lastApiAt && (
              <p className="muted">
                Last QuickBooks API activity: {new Date(status.lastApiAt).toLocaleString()}
                {status.lastIntuitTid ? <> · Intuit request ID: <code>{status.lastIntuitTid}</code></> : null}
              </p>
            )}
            {errorLogs.length > 0 && (
              <table className="table">
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Operation</th>
                    <th>Status</th>
                    <th>Intuit request ID</th>
                    <th>Error</th>
                  </tr>
                </thead>
                <tbody>
                  {errorLogs.map((item) => (
                    <tr key={item.id}>
                      <td>{new Date(item.occurred_at).toLocaleString()}</td>
                      <td>{item.operation}</td>
                      <td>{item.http_status ?? "—"}</td>
                      <td><code>{item.intuit_tid ?? "—"}</code></td>
                      <td>{item.error_message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <p>
              <a href="/support">Contact FarmVoice support</a>
            </p>
          </section>
        </>
      )}

      {message && <div className="notice">{message}</div>}
    </main>
  );
}
