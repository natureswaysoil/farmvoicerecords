"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/src/lib/supabase/client";
export default function StorageUsage({ farmId }: { farmId: string }) {
  const [usage, setUsage] = useState<{
      used_bytes: number;
      limit_bytes: number;
    } | null>(null),
    [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    setUsage(null);
    setFailed(false);
    void createClient()
      .rpc("farm_storage_status", { p_farm_id: farmId })
      .then(({ data, error }) => {
        if (active) {
          setFailed(Boolean(error));
          if (!error && data?.[0]) setUsage(data[0]);
        }
      });
    return () => {
      active = false;
    };
  }, [farmId]);
  return (
    <section className="notice">
      <strong>Farm storage</strong>
      {usage ? (
        <>
          <p>
            {(usage.used_bytes / 1e9).toFixed(2)} GB used of{" "}
            {(usage.limit_bytes / 1e9).toFixed(0)} GB
          </p>
          <progress
            aria-label="Farm storage used"
            max={Number(usage.limit_bytes)}
            value={Number(usage.used_bytes)}
          />
          {usage.used_bytes >= usage.limit_bytes * 0.9 && (
            <p>
              Storage is nearly full. Contact support before uploading more
              large files.
            </p>
          )}
        </>
      ) : (
        <p>
          {failed
            ? "Usage could not be loaded. Contact support if this continues."
            : "Loading usage…"}
        </p>
      )}
      <p className="small">
        10 GB included per farm (1 GB = 1 billion bytes). Uploads pause at your
        allowance; existing files stay available. Additional capacity requires
        an agreed plan through{" "}
        <a href="mailto:james@farmvoicerecords.com">support</a>. No automatic
        overage charges.
      </p>
    </section>
  );
}
