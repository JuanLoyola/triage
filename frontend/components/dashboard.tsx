"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { ResultPanel } from "@/components/result-panel";
import { TriageForm } from "@/components/triage-form";
import { createClient } from "@/lib/supabase/client";
import type { RunResult } from "@/lib/types";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000";

interface Props {
  email: string | null;
}

/** GET /api/quota needs the caller's session token. */
async function authHeaders(): Promise<Record<string, string>> {
  const supabase = createClient();
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

interface Quota {
  limit: number;
  used: number;
  remaining: number;
}

export function Dashboard({ email }: Props) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [result, setResult] = React.useState<RunResult | null>(null);
  const [networkError, setNetworkError] = React.useState<string | null>(null);
  const [backendDown, setBackendDown] = React.useState(false);
  // Bumped after a successful run to remount TriageForm with clean state.
  const [formKey, setFormKey] = React.useState(0);
  const [quota, setQuota] = React.useState<Quota | null>(null);

  const loadQuota = React.useCallback(async () => {
    try {
      const response = await fetch(`${API_URL}/api/quota`, {
        headers: await authHeaders(),
      });
      if (response.ok) setQuota((await response.json()) as Quota);
    } catch {
      // The banner below already reports a dead backend.
    }
  }, []);

  // Surface a dead backend up front, and read the daily allowance on mount.
  React.useEffect(() => {
    let cancelled = false;

    async function boot() {
      try {
        const response = await fetch(`${API_URL}/health`);
        if (!cancelled) setBackendDown(!response.ok);
      } catch {
        if (!cancelled) setBackendDown(true);
      }
      void loadQuota();
    }

    void boot();
    return () => {
      cancelled = true;
    };
  }, [loadQuota]);

  async function handleSignOut() {
    await createClient().auth.signOut();
    router.push("/login");
    router.refresh();
  }

  async function handleSubmit(message: string, channel: string, maxRetries: number) {
    setIsSubmitting(true);
    setNetworkError(null);

    try {
      const response = await fetch(`${API_URL}/api/triage`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authHeaders()) },
        body: JSON.stringify({
          customer_message: message,
          channel,
          max_retries: maxRetries,
        }),
      });

      if (!response.ok) {
        const detail = await response.json().catch(() => null);
        const raw =
          typeof detail?.detail === "string" ? detail.detail : response.statusText;

        // 429 is the daily cap, which the quota banner already explains.
        if (response.status === 429) {
          setNetworkError(raw);
          void loadQuota();
          return;
        }

        setNetworkError(`El backend respondió ${response.status}: ${raw}`);
        return;
      }

      const data = (await response.json()) as RunResult;
      setResult(data);
      if (data.runs_remaining !== null && quota) {
        setQuota({ ...quota, remaining: data.runs_remaining, used: quota.used + 1 });
      }

      // FR-24: remount the form to clear it, only on a successful run.
      if (data.status === "success") setFormKey((key) => key + 1);
    } catch (error) {
      setNetworkError(
        `No pudimos conectar con el backend en ${API_URL}. ` +
          `¿Está corriendo uvicorn? (${error instanceof Error ? error.message : "error desconocido"})`,
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  const exhausted = quota !== null && quota.remaining <= 0;

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:py-14">
      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-800">Triage de Tickets</h1>
          <p className="mt-1.5 text-sm text-slate-600">
            Clasificación automática con bucle de autocorrección y validación estricta.
          </p>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-1.5">
          {email ? <span className="text-xs text-slate-500">{email}</span> : null}
          <button
            type="button"
            onClick={handleSignOut}
            className="text-xs text-slate-500 underline-offset-4 hover:text-slate-700 hover:underline"
          >
            Salir
          </button>
        </div>
      </header>

      {quota ? (
        <div
          className={`mb-6 rounded-lg border p-4 text-sm ${
            exhausted
              ? "border-amber-200 bg-amber-50 text-amber-900"
              : "border-slate-200 bg-white text-slate-700"
          }`}
        >
          <p className="font-medium">
            Te quedan {quota.remaining} de {quota.limit} ejecuciones hoy
          </p>
          <p className="mt-1 text-slate-600">
            {exhausted
              ? "Se reinician a medianoche. Cada ejecución consume cuota del free tier de Gemini, que es compartida entre todos los usuarios."
              : "Cada ejecución consume cuota del free tier de Gemini, que es compartida. Si sólo querés ver cómo funciona, usá un preset. Si querés ver la autocorrección, escribí tu propio mensaje: es más probable que el modelo se equivoque."}
          </p>
        </div>
      ) : null}

      {backendDown ? (
        <div
          role="alert"
          className="mb-6 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"
        >
          <p className="font-medium">El backend no está corriendo</p>
          <p className="mt-1 text-amber-800">
            El dashboard no puede procesar mensajes hasta que uvicorn esté arriba.{" "}
            <code className="text-xs">cd backend</code> y{" "}
            <code className="text-xs">.\.venv\Scripts\python.exe -m uvicorn app.main:app --port 8000</code>
          </p>
        </div>
      ) : null}

      <div className="space-y-8">
        <section className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6">
          <TriageForm
            key={formKey}
            isSubmitting={isSubmitting}
            onSubmit={handleSubmit}
            onDismissResult={() => setResult(null)}
            result={result}
            networkError={networkError}
            isExhausted={exhausted}
          />
        </section>

        {result ? <ResultPanel result={result} /> : null}
      </div>
    </div>
  );
}
