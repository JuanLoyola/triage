"use client";

import React from "react";
import gsap from "gsap";
import { HowItWorks } from "@/components/how-it-works";
import { ResultPanel } from "@/components/result-panel";
import { TriageForm } from "@/components/triage-form";
import { sessionHeaders } from "@/lib/session";
import type { RunResult } from "@/lib/types";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000";

interface Quota {
  limit: number;
  used: number;
  remaining: number;
  global_remaining: number;
}

/** Honour the OS reduced-motion setting: no tweens, no motion. */
function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function Dashboard() {
  const root = React.useRef<HTMLDivElement>(null);
  const resultRef = React.useRef<HTMLDivElement>(null);

  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [result, setResult] = React.useState<RunResult | null>(null);
  const [networkError, setNetworkError] = React.useState<string | null>(null);
  const [backendDown, setBackendDown] = React.useState(false);
  const [quota, setQuota] = React.useState<Quota | null>(null);
  // Bumped after a successful run to remount TriageForm with clean state.
  const [formKey, setFormKey] = React.useState(0);

  const loadQuota = React.useCallback(async () => {
    try {
      const response = await fetch(`${API_URL}/api/quota`, { headers: sessionHeaders() });
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

  // Entrance: stagger the stacked sections once, on mount.
  React.useEffect(() => {
    if (!root.current || prefersReducedMotion()) return;

    // `revert: true` so the inline styles GSAP sets are undone on unmount.
    const ctx = gsap.context(() => {
      gsap.from("[data-animate='section']", {
        opacity: 0,
        y: 18,
        duration: 0.55,
        ease: "power2.out",
        stagger: 0.09,
      });
    }, root);

    return () => ctx.revert();
  }, []);

  // The result panel is the payoff, so it gets its own entrance each time.
  React.useEffect(() => {
    const node = resultRef.current;
    if (!result || prefersReducedMotion() || !node) return;

    const ctx = gsap.context(() => {
      gsap.from(node, {
        opacity: 0,
        y: 22,
        duration: 0.5,
        ease: "power2.out",
      });
      gsap.from(node.querySelectorAll("[data-animate='block']"), {
        opacity: 0,
        y: 14,
        duration: 0.4,
        ease: "power2.out",
        stagger: 0.08,
        delay: 0.08,
      });
      // The urgency dot pulses once to draw the eye without looping.
      gsap.fromTo(
        node.querySelectorAll("[data-animate='dot']"),
        { scale: 0.6, opacity: 0.4 },
        { scale: 1, opacity: 1, duration: 0.45, ease: "back.out(2)", stagger: 0.05 },
      );
    }, node);

    return () => ctx.revert();
  }, [result]);

  async function handleSubmit(message: string, channel: string, maxRetries: number) {
    setIsSubmitting(true);
    setNetworkError(null);

    try {
      const response = await fetch(`${API_URL}/api/triage`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...sessionHeaders() },
        body: JSON.stringify({ customer_message: message, channel, max_retries: maxRetries }),
      });

      if (!response.ok) {
        const detail = await response.json().catch(() => null);
        const raw = typeof detail?.detail === "string" ? detail.detail : response.statusText;

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
    <div ref={root} className="mx-auto max-w-3xl px-4 py-10 sm:py-14">
      <header className="mb-6" data-animate="section">
        <h1 className="text-2xl font-semibold text-slate-800">Triage de Tickets</h1>
        <p className="mt-1.5 text-sm text-slate-600">
          Clasificación automática con bucle de autocorrección y validación estricta.
        </p>
      </header>

      <div data-animate="section">
        <HowItWorks />
      </div>

      {quota ? (
        <div
          data-animate="section"
          className={`mb-6 rounded-lg border p-4 text-sm ${
            exhausted
              ? "border-amber-200 bg-amber-50/90 text-amber-900"
              : "border-slate-200 bg-white/80 text-slate-700 backdrop-blur-sm"
          }`}
        >
          <p className="font-medium">
            Te quedan {quota.remaining} de {quota.limit} ejecuciones hoy
          </p>
          <p className="mt-1 text-slate-600">
            {exhausted
              ? "Se agotaron las ejecuciones de esta sesión. Se reinician a medianoche, o abrí otra pestaña para seguir probando."
              : "El límite es por sesión de navegador, así que no se comparte entre visitantes. Si sólo querés ver cómo funciona, usá un preset. Si querés ver la autocorrección en acción, escribí tu propio mensaje, que es más probable que el modelo se equivoque."}
          </p>
          {quota.global_remaining <= 20 ? (
            <p className="mt-2 text-xs text-amber-700">
              La demo completa tiene {quota.global_remaining} ejecuciones disponibles hoy. La
              cuota del free tier de Gemini es compartida y finita.
            </p>
          ) : null}
        </div>
      ) : null}

      {backendDown ? (
        <div
          role="alert"
          data-animate="section"
          className="mb-6 rounded-lg border border-amber-200 bg-amber-50/90 p-4 text-sm text-amber-900"
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
        <section
          data-animate="section"
          className="rounded-xl border border-slate-200 bg-white/85 p-5 backdrop-blur-sm sm:p-6"
        >
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

        {result ? (
          <div ref={resultRef}>
            <ResultPanel result={result} />
          </div>
        ) : null}
      </div>
    </div>
  );
}
