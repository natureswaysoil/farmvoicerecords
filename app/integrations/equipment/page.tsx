"use client";

import { ChangeEvent, useEffect, useMemo, useState } from "react";

type Farm = { id: string; name: string };

type EquipmentRow = {
  source: string;
  machine: string;
  operation: string;
  field: string;
  startedAt: string;
  endedAt: string;
  product: string;
  rate: string;
  rateUnit: string;
  area: string;
  areaUnit: string;
  yieldValue: string;
  yieldUnit: string;
  moisture: string;
};

const TEMPLATE_HEADERS = [
  "source",
  "machine",
  "operation",
  "field",
  "started_at",
  "ended_at",
  "product",
  "rate",
  "rate_unit",
  "area",
  "area_unit",
  "yield",
  "yield_unit",
  "moisture",
];

const SAMPLE_ROWS: EquipmentRow[] = [
  {
    source: "John Deere",
    machine: "Sprayer 1",
    operation: "Spraying",
    field: "North Field",
    startedAt: "2026-09-18T08:15:00-04:00",
    endedAt: "2026-09-18T09:02:00-04:00",
    product: "Example herbicide",
    rate: "15",
    rateUnit: "gal/ac",
    area: "12.4",
    areaUnit: "ac",
    yieldValue: "",
    yieldUnit: "",
    moisture: "",
  },
  {
    source: "John Deere",
    machine: "Combine 1",
    operation: "Harvest",
    field: "South Field",
    startedAt: "2026-09-28T13:10:00-04:00",
    endedAt: "2026-09-28T15:45:00-04:00",
    product: "",
    rate: "",
    rateUnit: "",
    area: "18.7",
    areaUnit: "ac",
    yieldValue: "176",
    yieldUnit: "bu/ac",
    moisture: "15.2%",
  },
];

function clean(value: string | undefined) {
  return (value ?? "").trim();
}

function parseCsvLine(line: string) {
  const cells: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (quoted && line[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === "," && !quoted) {
      cells.push(cell);
      cell = "";
    } else {
      cell += char;
    }
  }
  cells.push(cell);
  return cells;
}

function parseCsv(text: string): EquipmentRow[] {
  const lines = text
    .replace(/\r/g, "")
    .split("\n")
    .filter((line) => line.trim().length > 0);
  if (lines.length < 2) return [];

  const headers = parseCsvLine(lines[0]).map((header) =>
    header.trim().toLowerCase(),
  );
  const index = (name: string) => headers.indexOf(name);

  return lines.slice(1).map((line) => {
    const cells = parseCsvLine(line);
    const get = (name: string) => {
      const position = index(name);
      return position >= 0 ? clean(cells[position]) : "";
    };
    return {
      source: get("source") || "CSV import",
      machine: get("machine"),
      operation: get("operation"),
      field: get("field"),
      startedAt: get("started_at"),
      endedAt: get("ended_at"),
      product: get("product"),
      rate: get("rate"),
      rateUnit: get("rate_unit"),
      area: get("area"),
      areaUnit: get("area_unit"),
      yieldValue: get("yield"),
      yieldUnit: get("yield_unit"),
      moisture: get("moisture"),
    };
  });
}

function downloadTemplate() {
  const example = [
    "John Deere",
    "Sprayer 1",
    "Spraying",
    "North Field",
    "2026-09-18T08:15:00-04:00",
    "2026-09-18T09:02:00-04:00",
    "Example product",
    "15",
    "gal/ac",
    "12.4",
    "ac",
    "",
    "",
    "",
  ];
  const csv = [TEMPLATE_HEADERS.join(","), example.join(",")].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "farmvoice-equipment-import-template.csv";
  link.click();
  URL.revokeObjectURL(url);
}

export default function EquipmentIntegrationPage() {
  const [farms, setFarms] = useState<Farm[]>([]);
  const [farmId, setFarmId] = useState("");
  const [rows, setRows] = useState<EquipmentRow[]>(SAMPLE_ROWS);
  const [message, setMessage] = useState("Loading farm access...");
  const [fileName, setFileName] = useState("");
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    fetch("/api/farms/owned", { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error ?? "Unable to load farms.");
        const owned = (body.farms ?? []) as Farm[];
        setFarms(owned);
        if (owned.length === 1) setFarmId(owned[0].id);
        setMessage(
          owned.length > 1
            ? "Select the farm that should receive equipment data."
            : "",
        );
      })
      .catch((error) =>
        setMessage(
          error instanceof Error ? error.message : "Unable to load farms.",
        ),
      );
  }, []);

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const parsed = parseCsv(await file.text());
    setRows(parsed);
    setMessage(
      parsed.length
        ? `${parsed.length} equipment record${parsed.length === 1 ? "" : "s"} ready for review. Nothing has been saved yet.`
        : "No data rows were found. Use the FarmVoice template and try again.",
    );
  }

  async function importReviewedRecords() {
    if (!farmId || !rows.length) return;
    setImporting(true);
    setMessage("Importing reviewed equipment records...");
    try {
      const response = await fetch("/api/equipment/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ farmId, rows }),
      });
      const body = await response.json();
      if (!response.ok) {
        const issueText = Array.isArray(body.issues)
          ? " " + body.issues.slice(0, 3).map((issue: { row: number; field?: string; error: string }) =>
              `Row ${issue.row}${issue.field ? ` (${issue.field})` : ""}: ${issue.error}`,
            ).join(" ")
          : "";
        throw new Error((body.error ?? "Equipment import failed.") + issueText);
      }
      setMessage(
        `Imported ${body.imported} equipment record${body.imported === 1 ? "" : "s"} into FarmVoice field history.` +
          (body.skippedDuplicates ? ` ${body.skippedDuplicates} duplicate${body.skippedDuplicates === 1 ? "" : "s"} skipped.` : ""),
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Equipment import failed.");
    } finally {
      setImporting(false);
    }
  }

  const summary = useMemo(() => {
    const applications = rows.filter((row) =>
      /spray|apply|application|fertiliz/i.test(row.operation),
    ).length;
    const harvests = rows.filter((row) =>
      /harvest|combine/i.test(row.operation),
    ).length;
    const acres = rows.reduce((total, row) => {
      const value = Number.parseFloat(row.area);
      return Number.isFinite(value) ? total + value : total;
    }, 0);
    return { applications, harvests, acres };
  }, [rows]);

  return (
    <main className="container section stack">
      <div>
        <div className="kicker">Equipment integration</div>
        <h2>Equipment data</h2>
        <p className="muted">
          Bring machine records into FarmVoice so field history can include what
          was applied, the application rate, acres covered, harvest results and
          yield such as bushels per acre.
        </p>
      </div>

      {farms.length > 1 && (
        <section className="card stack">
          <div className="field">
            <label htmlFor="equipment-farm">Farm</label>
            <select
              id="equipment-farm"
              value={farmId}
              onChange={(event) => setFarmId(event.target.value)}
            >
              <option value="">Select a farm</option>
              {farms.map((farm) => (
                <option key={farm.id} value={farm.id}>
                  {farm.name}
                </option>
              ))}
            </select>
          </div>
        </section>
      )}

      <section className="grid-2">
        <article className="card stack">
          <div>
            <span className="badge">Primary connector</span>
            <h3 style={{ marginTop: 12 }}>John Deere Operations Center</h3>
            <p className="muted">
              FarmVoice is being prepared to request each farmer's permission
              and then read organization, equipment, field-operation and work
              result data for that farmer's account.
            </p>
          </div>
          <div className="notice">
            <strong>API connection status:</strong> developer access setup.
            The interface is ready for OAuth and live synchronization after
            John Deere approves the required API products.
          </div>
          <div className="inline">
            <button className="btn" type="button" disabled>
              Connect John Deere
            </button>
            <span className="muted small">Enabled after API credentials are approved.</span>
          </div>
        </article>

        <article className="card stack">
          <div>
            <span className="badge">Works now</span>
            <h3 style={{ marginTop: 12 }}>Import machine CSV</h3>
            <p className="muted">
              Use the FarmVoice template for exports from Deere or another farm
              system. Review the rows before they are saved to farm records.
            </p>
          </div>
          <div className="inline">
            <label className="btn secondary" htmlFor="equipment-csv">
              Choose CSV
            </label>
            <input
              id="equipment-csv"
              type="file"
              accept=".csv,text/csv"
              onChange={handleFile}
              style={{ display: "none" }}
            />
            <button className="btn secondary" type="button" onClick={downloadTemplate}>
              Download template
            </button>
          </div>
          {fileName && <p className="small muted">Selected: {fileName}</p>}
        </article>
      </section>

      <section className="card stack">
        <div>
          <h3>What FarmVoice will capture</h3>
          <p className="muted">
            The same normalized fields can be filled by an API connection or by
            an imported file.
          </p>
        </div>
        <div className="grid-3">
          <div>
            <strong>Application records</strong>
            <p className="muted small">
              Product, rate, rate unit, acres, machine, field and start/end time.
            </p>
          </div>
          <div>
            <strong>Harvest and yield</strong>
            <p className="muted small">
              Harvested acres, yield value, bushels per acre, moisture, machine
              and field.
            </p>
          </div>
          <div>
            <strong>Field work</strong>
            <p className="muted small">
              Planting, tillage and other work results tied back to the FarmVoice
              field history.
            </p>
          </div>
        </div>
      </section>

      <section className="grid-3">
        <div className="card">
          <div className="stat">{rows.length}</div>
          <div className="muted">records in review</div>
        </div>
        <div className="card">
          <div className="stat">{summary.applications}</div>
          <div className="muted">application records</div>
        </div>
        <div className="card">
          <div className="stat">{summary.harvests}</div>
          <div className="muted">
            harvest records · {summary.acres.toFixed(1)} total reported acres
          </div>
        </div>
      </section>

      <section className="card stack">
        <div className="inline" style={{ justifyContent: "space-between" }}>
          <div>
            <h3>Review imported equipment records</h3>
            <p className="muted" style={{ marginBottom: 0 }}>
              Verify the field, operation and measurements before importing.
            </p>
          </div>
          <button
            className="btn"
            type="button"
            disabled={!farmId || rows.length === 0 || importing}
            onClick={importReviewedRecords}
          >
            {importing ? "Importing..." : "Import reviewed records"}
          </button>
        </div>

        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Source</th>
                <th>Machine</th>
                <th>Operation</th>
                <th>Field</th>
                <th>Product / rate</th>
                <th>Area</th>
                <th>Yield</th>
                <th>Moisture</th>
              </tr>
            </thead>
            <tbody>
              {rows.length ? (
                rows.map((row, index) => (
                  <tr key={`${row.machine}-${row.startedAt}-${index}`}>
                    <td>{row.source || "—"}</td>
                    <td>{row.machine || "—"}</td>
                    <td>{row.operation || "—"}</td>
                    <td>{row.field || "—"}</td>
                    <td>
                      {row.product || row.rate
                        ? [row.product, [row.rate, row.rateUnit].filter(Boolean).join(" ")]
                            .filter(Boolean)
                            .join(" · ")
                        : "—"}
                    </td>
                    <td>{[row.area, row.areaUnit].filter(Boolean).join(" ") || "—"}</td>
                    <td>
                      {[row.yieldValue, row.yieldUnit].filter(Boolean).join(" ") || "—"}
                    </td>
                    <td>{row.moisture || "—"}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={8} className="muted">
                    No equipment records loaded.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card stack">
        <h3>Connection design</h3>
        <ol className="list">
          <li>Farm owner chooses the farm in FarmVoice.</li>
          <li>Farmer authorizes FarmVoice with the equipment provider.</li>
          <li>FarmVoice imports only the organizations and machine data the farmer approved.</li>
          <li>Imported field names are matched to FarmVoice fields before records are saved.</li>
          <li>Application and harvest records become part of field history and reporting.</li>
        </ol>
      </section>

      {message && <div className="notice">{message}</div>}
    </main>
  );
}
