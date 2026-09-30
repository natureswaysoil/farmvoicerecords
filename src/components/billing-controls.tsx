"use client";
import StorageUsage from "@/src/components/storage-usage";
import { useEffect, useState } from "react";
import { createClient } from "@/src/lib/supabase/client";
import { getNamedFarmContexts, type FarmContext } from "@/src/lib/farm-cloud";
import { track } from "@vercel/analytics";
export default function BillingControls() {
  const [farms, setFarms] = useState<FarmContext[]>([]),
    [farmId, setFarmId] = useState("");
  const [interval, setInterval] = useState("monthly"),
    [h2a, setH2a] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  useEffect(() => {
    void getNamedFarmContexts(createClient())
      .then((rows) => {
        const owned = rows.filter((r) => r.role === "owner");
        setFarms(owned);
        setFarmId(owned[0]?.farmId ?? "");
      })
      .catch((error) =>
        setMessage(
          error instanceof Error
            ? error.message
            : "Could not load farm access.",
        ),
      );
  }, []);
  useEffect(() => {
    if (!farmId) return;
    let active = true;
    void createClient()
      .from("farm_billing")
      .select("trial_ends_at,status,core_enabled,h2a_enabled")
      .eq("farm_id", farmId)
      .single()
      .then(({ data, error }) => {
        if (!active) return;
        setMessage(
          error
            ? "Billing setup is not yet available."
            : `Status: ${data.status}. Initial trial ends ${new Date(data.trial_ends_at).toLocaleDateString()}. Paid Core: ${data.core_enabled ? "yes" : "no"}. H-2A: ${data.h2a_enabled ? "yes" : "no"}.`,
        );
      });
    return () => {
      active = false;
    };
  }, [farmId]);
  async function open(action: "checkout" | "portal") {
    setBusy(true);
    try {
      const response = await fetch(`/api/billing/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ farmId, interval, h2a }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      if (action === "checkout") track("checkout_started", { interval, h2a });
      window.location.assign(result.url);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Unable to open billing.");
      setBusy(false);
    }
  }
  if (!farms.length) return message ? <p role="status">{message}</p> : null;
  return (
    <section className="card form">
      <h2>Manage your farm plan</h2>
      <StorageUsage farmId={farmId} />
      <label>
        Farm
        <select value={farmId} onChange={(e) => setFarmId(e.target.value)}>
          {farms.map((f) => (
            <option key={f.farmId} value={f.farmId}>
              {f.farmName ?? f.farmId}
            </option>
          ))}
        </select>
      </label>
      <label>
        Billing period
        <select value={interval} onChange={(e) => setInterval(e.target.value)}>
          <option value="monthly">Monthly</option>
          <option value="annual">Annual — two months free</option>
        </select>
      </label>
      <label className="inline">
        <input
          type="checkbox"
          checked={h2a}
          onChange={(e) => setH2a(e.target.checked)}
        />
        Add H-2A workforce and housing
      </label>
      <p>
        Total: ${interval === "monthly" ? (h2a ? 198 : 49) : h2a ? 1980 : 490} /{" "}
        {interval === "monthly" ? "month" : "year"}, before applicable taxes.
      </p>
      <div className="inline">
        <button
          className="btn"
          disabled={busy}
          onClick={() => void open("checkout")}
        >
          Choose subscription
        </button>
        <button
          className="btn secondary"
          disabled={busy}
          onClick={() => void open("portal")}
        >
          Manage billing
        </button>
      </div>
      <p role="status">{message}</p>
      <p>
        If fewer than two trial days remain, choosing a subscription starts paid
        billing immediately. You can wait until your trial ends.
      </p>
      <p>
        Checkout confirmation does not activate access by itself. Your plan
        updates after Stripe confirms the subscription.
      </p>
    </section>
  );
}
