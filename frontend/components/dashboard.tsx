"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { ResultPanel } from "@/components/result-panel";
import { TriageForm } from "@/components/triage-form";
import type { RunResult } from "@/lib/types";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000";

interface Props {
  email: string | null;
  isAdmin: boolean;
}

export function Dashboard({ email, isAdmin }: Props) {
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [result, setResult] = React.useState<RunResult | null>(null);
  const [networkError, setNetworkError] = React.useState<string | null>(null);
  const [showAll, setShowAll] = React.useState(false);

  const [backendDown, setBackendDown] = React.useState(false);
  // Bumped after a successful run to remount TriageForm with clean state.
  const [formKey, setFormKey] = React.useState(0);
  const router = useRouter();

  // Surface a dead backend up front instead of letting the operator fill in the
  // form and only then fail.
  React.useEffect(() => {
    let cancelled = false;

    async function checkBackend() {
      try {
        const response = await fetch(`${API_URL}/health`);
        if (!cancelled) setBackendDown(!response.ok);
      } catch {
        if (!cancelled) setBackendDown(true);
      }
    }

    void checkBackend();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSignOut() {
    const { createClient } = await import("@/lib/supabase/client");
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
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer_message: message,
          channel,
          max_retries: maxRetries,
        }),
      });

      if (!response.ok) {
        // Distinguish the causes instead of collapsing them into one message.
        const detail = await response.json().catch(() => null);
        const message =
          typeof detail?.detail === "string"
            ? detail.detail
            : `El backend respondió ${response.status} ${response.statusText}.`;
        setNetworkError(message);
        return;
      }

      const data = (await response.json()) as RunResult;
      setResult(data);

      // FR-24: remount the form to clear it, only on a successful run.
      if (data.status === "success") setFormKey((key) => key + 1);
    } catch (error) {
      // E-1: the backend is unreachable. Name the URL so the cause is obvious.
      setNetworkError(
        `No pudimos conectar con el backend en ${API_URL}. ` +
          `¿Está corriendo uvicorn? (${error instanceof Error ? error.message : "error desconocido"})`,
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:py-14">
      <header className="mb-8 flex items-start justify-between gap-4">
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

      {isAdmin ? (
        <div className="mb-6 flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2">
          <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-600">
            <input
              type="checkbox"
              checked={showAll}
              onChange={(event) => setShowAll(event.target.checked)}
              className="h-3.5 w-3.5 rounded accent-sky-700"
            />
            mis ejecuciones / todas
          </label>
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
          />
        </section>

        {result ? <ResultPanel result={result} /> : null}
      </div>
    </div>
  );
}
