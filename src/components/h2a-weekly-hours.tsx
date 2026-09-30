"use client";
import { useState } from "react";
import { weeklyHours, formatMinutes, type HoursRow } from "@/src/lib/h2a-hours";
export default function H2aWeeklyHours({
  rows,
  names,
}: {
  rows: HoursRow[];
  names: Map<string, string>;
}) {
  const [weekStarts, setWeekStarts] = useState(1);
  const weeks = weeklyHours(rows, weekStarts);
  return (
    <section aria-label="Weekly hour totals">
      <h3>Automatic weekly totals</h3>
      <label>
        Week starts{" "}
        <select
          value={weekStarts}
          onChange={(e) => setWeekStarts(Number(e.target.value))}
        >
          {[
            "Sunday",
            "Monday",
            "Tuesday",
            "Wednesday",
            "Thursday",
            "Friday",
            "Saturday",
          ].map((day, i) => (
            <option value={i} key={day}>
              {day}
            </option>
          ))}
        </select>
      </label>
      <p className="small">
        Paid rest breaks stay in paid hours. Only recorded unpaid meals are
        deducted. These totals include pending entries; approval is shown
        separately. Weeks at a selected pay-period boundary may be partial.
      </p>
      {weeks.length ? (
        <div style={{ overflowX: "auto" }}>
          <table className="table">
            <thead>
              <tr>
                <th>Week beginning</th>
                <th>Worker</th>
                <th>Paid hours</th>
                <th>Paid rest minutes</th>
                <th>Unpaid meal minutes</th>
                <th>Pending days</th>
              </tr>
            </thead>
            <tbody>
              {weeks.map((w) => (
                <tr key={w.workerId + w.week}>
                  <td>{w.week}</td>
                  <td>{names.get(w.workerId) ?? w.workerId}</td>
                  <td>
                    {(w.minutes / 60).toFixed(2)} hours ({formatMinutes(w.minutes)})
                    {w.legacy ? " *" : ""}
                  </td>
                  <td>{w.paid}</td>
                  <td>{w.unpaid}</td>
                  <td>{w.pending}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p>No daily entries in this selection.</p>
      )}
      {weeks.some((w) => w.legacy > 0) && (
        <p className="small">
          * Older entries use previously recorded hours; missing break details
          are not inferred.
        </p>
      )}
    </section>
  );
}
