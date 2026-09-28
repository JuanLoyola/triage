"use client";

import React from "react";
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

  async function handleSignOut() {
    const { createClient } = await import("@/lib/supabase/client");
    await createClient().auth.signOut();
    window.location.href = "/login";
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
        const detail = await response.json().catch(() => null);
        setNetworkError(
          (detail?.detail as string) ?? "No pudimos procesar el mensaje.",
        );
        return;
      }

      setResult((await response.json()) as RunResult);
    } catch {
      // E-1: network failure between frontend and backend.
      setNetworkError("No pudimos procesar el mensaje.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:py-14">
      <header className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-100">Triage de Tickets</h1>
          <p className="mt-1.5 text-sm text-slate-400">
            Clasificación automática con bucle de autocorrección y validación estricta.
          </p>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-1.5">
          {email ? <span className="text-xs text-slate-500">{email}</span> : null}
          <button
            type="button"
            onClick={handleSignOut}
            className="text-xs text-slate-400 underline-offset-4 hover:text-slate-200 hover:underline"
          >
            Salir
          </button>
        </div>
      </header>

      {isAdmin ? (
        <div className="mb-6 flex items-center gap-3 rounded-lg bg-slate-900/40 px-3 py-2 ring-1 ring-slate-800">
          <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-400">
            <input
              type="checkbox"
              checked={showAll}
              onChange={(event) => setShowAll(event.target.checked)}
              className="h-3.5 w-3.5 rounded accent-sky-500"
            />
            mis ejecuciones / todas
          </label>
        </div>
      ) : null}

      <div className="space-y-8">
        <section className="rounded-xl bg-slate-900/60 p-5 ring-1 ring-slate-800 sm:p-6">
          <TriageForm
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
