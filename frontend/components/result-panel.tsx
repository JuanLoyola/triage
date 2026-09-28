/**
 * Result panel: the processed ticket (CA 4.1), the final JSON (CA 4.3), and the
 * audit trail (CA 4.2).
 *
 * Renders all three terminal states. The quota state is informational, not an
 * error: the harness worked, the provider is out of free-tier quota.
 */
import { CategoryBadge, UrgencyBadge } from "@/components/badges";
import { JsonBlock } from "@/components/json-block";
import { AuditTrail } from "@/components/audit-trail";
import type { RunResult } from "@/lib/types";

function StatusBanner({ result }: { result: RunResult }) {
  if (result.status === "quota_exceeded") {
    return (
      <div
        role="status"
        className="rounded-lg bg-sky-500/10 p-4 text-sm text-sky-200 ring-1 ring-sky-500/30"
      >
        <p className="font-medium">Cuota del free tier agotada</p>
        <p className="mt-1 text-sky-200/80">
          El harness está funcionando correctamente. El proveedor de Gemini no acepta más
          requests hasta que se resetee el límite. Probá de nuevo en unos minutos.
        </p>
      </div>
    );
  }

  if (result.status === "needs_manual_review") {
    return (
      <div
        role="alert"
        className="rounded-lg bg-amber-500/10 p-4 text-sm text-amber-200 ring-1 ring-amber-500/30"
      >
        <p className="font-medium">Se agotaron los reintentos</p>
        <p className="mt-1 text-amber-200/80">
          El ticket requiere revisión manual. El log de fallas está en el audit trail y el
          ticket no se guardó en la base.
        </p>
      </div>
    );
  }

  return (
    <div
      role="status"
      className="rounded-lg bg-emerald-500/10 p-4 text-sm text-emerald-200 ring-1 ring-emerald-500/30"
    >
      <p className="font-medium">
        Ticket validado
        {result.attempts.length > 1
          ? ` tras ${result.attempts.length} intentos (autocorrección)`
          : " en el primer intento"}
      </p>
    </div>
  );
}

export function ResultPanel({ result }: { result: RunResult }) {
  return (
    <div className="space-y-5">
      <StatusBanner result={result} />

      {result.ticket ? (
        <section className="rounded-lg bg-slate-900/40 p-4 ring-1 ring-slate-800">
          <h2 className="mb-3 text-sm font-medium text-slate-300">Ticket procesado</h2>

          <div className="mb-3 flex flex-wrap items-center gap-2">
            <UrgencyBadge urgency={result.ticket.urgency} />
            <CategoryBadge category={result.ticket.category} />
            <span className="text-xs text-slate-500">
              Escalar a humano: {result.ticket.requires_human_escalation ? "Sí" : "No"}
            </span>
          </div>

          <p className="text-sm leading-relaxed text-slate-200">{result.ticket.summary}</p>

          {result.ticket.extracted_amount !== null ? (
            <p className="mt-3 text-sm text-slate-400">
              Monto extraído:{" "}
              <span className="font-medium tabular-nums text-slate-200">
                ${result.ticket.extracted_amount.toFixed(2)}
              </span>
            </p>
          ) : null}
        </section>
      ) : null}

      <AuditTrail result={result} />

      {/* CA 4.3: the strict JSON is always shown, even for failed runs, so the
          evaluator can see what the model actually produced. */}
      <section>
        <h2 className="mb-2 text-sm font-medium text-slate-300">JSON estricto</h2>
        <JsonBlock data={result.ticket ?? { status: result.status, error: result.error }} />
      </section>
    </div>
  );
}
