"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { createClient } from "@/src/lib/supabase/client";

export default function JoinPage() {
  const [es, setEs] = useState(false);
  const t = (en: string, sp: string) => (es ? sp : en);
  const [supabase] = useState(() => createClient());
  const [code, setCode] = useState("");
  const [employeeNumber, setEmployeeNumber] = useState("");
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [role, setRole] = useState<"owner" | "worker" | null>(null);
  const [message, setMessage] = useState("");
  const [joining, setJoining] = useState(false);
  const [switching, setSwitching] = useState(false);

  useEffect(() => {
    void (async () => {
      const { data } = await supabase.auth.getUser();
      const user = data.user;
      setSignedIn(Boolean(user));
      setEmail(user?.email ?? null);

      if (!user) {
        setRole(null);
        return;
      }

      const [{ data: ownedFarm }, { data: ownerMembership }] =
        await Promise.all([
          supabase
            .from("farms")
            .select("id")
            .eq("owner_user_id", user.id)
            .limit(1)
            .maybeSingle(),
          supabase
            .from("farm_members")
            .select("farm_id")
            .eq("user_id", user.id)
            .eq("role", "owner")
            .limit(1)
            .maybeSingle(),
        ]);

      if (ownedFarm || ownerMembership) {
        setRole("owner");
        return;
      }

      const { data: workerMembership } = await supabase
        .from("farm_members")
        .select("farm_id")
        .eq("user_id", user.id)
        .eq("role", "worker")
        .limit(1)
        .maybeSingle();

      setRole(workerMembership ? "worker" : null);
    })();
  }, [supabase]);

  async function useDifferentAccount() {
    setSwitching(true);
    setMessage("");
    const { error } = await supabase.auth.signOut({ scope: "local" });
    if (error) {
      setMessage(
        t(
          "Unable to sign out this browser session. Please try again.",
          "No se pudo cerrar la sesión. Inténtelo de nuevo.",
        ),
      );
      setSwitching(false);
      return;
    }
    window.location.assign("/login?next=%2Fjoin");
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const normalized = code.trim().toUpperCase();

    if (!/^[A-Z0-9]{6,10}$/.test(normalized)) {
      setMessage(
        t(
          "Enter the complete 6- to 10-character farm join code.",
          "Ingrese el código completo de la finca de 6 a 10 caracteres.",
        ),
      );
      return;
    }

    if (role === "owner") {
      setMessage(
        t(
          "You are signed in as a farm owner. Use a different worker account before joining.",
          "Esta es una cuenta de propietario. Use una cuenta de trabajador para unirse.",
        ),
      );
      return;
    }

    setJoining(true);
    setMessage("");

    try {
      const { error } = await supabase.rpc("join_farm_by_code", {
        p_join_code: normalized,
        p_employee_number: employeeNumber.trim() || null,
      });

      if (error) {
        setMessage(error.message || "Unable to join this farm.");
        return;
      }

      setMessage(
        t(
          "Farm joined successfully. Opening your team workspace...",
          "Se unió a la finca. Abriendo el reloj del trabajador...",
        ),
      );
      window.location.assign("/worker");
    } finally {
      setJoining(false);
    }
  }

  const returnPath = "/join";

  return (
    <main className="container section" lang={es ? "es" : "en"}>
      <button className="btn secondary" onClick={() => setEs(!es)}>
        {es ? "English" : "Español"}
      </button>
      <div className="card" style={{ maxWidth: 620, margin: "20px auto" }}>
        <div className="kicker">
          {t("Join a farm team", "Unirse a una finca")}
        </div>
        <h2>{t("Worker browser setup", "Configuración del trabajador")}</h2>
        <p className="muted">
          {t(
            "Workers can sign in, then enter the complete farm join code from the owner.",
            "Los trabajadores pueden iniciar sesión e ingresar el código completo de la finca proporcionado por el propietario.",
          )}
        </p>

        {signedIn === false && (
          <div className="notice" style={{ marginBottom: 18 }}>
            <strong>{t("Sign in first.", "Inicie sesión primero.")}</strong>
            <p className="small">
              {t(
                "Use your own worker account.",
                "Use su propia cuenta de trabajador.",
              )}
            </p>
            <div className="inline">
              <Link
                className="btn"
                href={`/login?next=${encodeURIComponent(returnPath)}`}
              >
                {t("Sign in", "Iniciar sesión")}
              </Link>
              <Link
                className="btn secondary"
                href={`/signup?next=${encodeURIComponent(returnPath)}`}
              >
                {t("Create worker account", "Crear cuenta de trabajador")}
              </Link>
            </div>
          </div>
        )}

        {signedIn && (
          <div className="notice" style={{ marginBottom: 18 }}>
            <strong>
              {t("Signed in as", "Sesión iniciada como")} {email ?? ""}
            </strong>
            {role === "owner" ? (
              <>
                <p className="small">
                  {t(
                    "This is a farm-owner account. Sign out and use a worker account.",
                    "Esta es una cuenta de propietario. Cierre sesión y use una cuenta de trabajador.",
                  )}
                </p>
                <button
                  className="btn secondary"
                  type="button"
                  onClick={useDifferentAccount}
                  disabled={switching}
                >
                  {switching
                    ? t("Signing out...", "Cerrando sesión...")
                    : t("Use a different account", "Usar otra cuenta")}
                </button>
              </>
            ) : (
              <p className="small">
                {t(
                  "Check that this is the worker account you want to add.",
                  "Verifique que esta sea la cuenta del trabajador que desea agregar.",
                )}
              </p>
            )}
          </div>
        )}

        {signedIn && role !== "owner" && (
          <form className="form" onSubmit={submit}>
            <div className="field">
              <label htmlFor="code">
                {t("Farm join code", "Código de la finca")}
              </label>
              <input
                id="code"
                autoCapitalize="characters"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="4CEC570164"
                maxLength={10}
                required
              />
            </div>
            <div className="field">
              <label htmlFor="employee-number">
                {t(
                  "Employee number (optional)",
                  "Número del empleado (opcional)",
                )}
              </label>
              <input
                id="employee-number"
                value={employeeNumber}
                onChange={(e) => setEmployeeNumber(e.target.value)}
                placeholder="EMP-001"
                maxLength={50}
              />
            </div>
            <button
              className="btn"
              type="submit"
              disabled={joining || signedIn === null}
            >
              {joining
                ? t("Joining farm...", "Uniéndose...")
                : t("Join farm", "Unirse a la finca")}
            </button>
          </form>
        )}

        {message && (
          <p className="notice" style={{ marginTop: 14 }}>
            {message}
          </p>
        )}
      </div>
    </main>
  );
}
