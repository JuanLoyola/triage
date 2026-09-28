/**
 * Result panel: the processed ticket (CA 4.1), the final JSON (CA 4.3), and the
 * audit trail (CA 4.2).
 *
 * Renders all three terminal states. The quota state is informational, not an
 * error: the harness worked, the provider is out of free-tier quota.
 */
import {
  Banknote,
  Braces,
  CheckCircle2,
  CircleAlert,
  FileText,
  UserCheck,
  UserX,
} from "lucide-react";
import { CategoryBadge, UrgencyBadge } from "@/components/badges";
import { JsonBlock } from "@/components/json-block";
import { AuditTrail } from "@/components/audit-trail";
import { describeRecovery, needsManualReviewCopy } from "@/lib/recovery";
import type { RunResult } from "@/lib/types";

function StatusBanner({ result }: { result: RunResult }) {
  if (result.status === "quota_exceeded") {
    return (
      <div
        role="status"
        className="flex gap-3 rounded-lg border border-sky-200 bg-sky-50 p-4 text-sm text-sky-900"
      >
        <CircleAlert aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
        <div>
          <p className="font-medium">Cuota del free tier agotada</p>
          <p className="mt-1 text-sky-800">
            El harness está funcionando correctamente. El proveedor de Gemini no acepta más
            requests hasta que se resetee el límite. Probá de nuevo en unos minutos.
          </p>
        </div>
      </div>
    );
  }

  if (result.status === "needs_manual_review") {
    return (
      <div
        role="alert"
        className="flex gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"
      >
        <CircleAlert aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
        <div>
          <p className="font-medium">Se agotaron los reintentos</p>
          <p className="mt-1 text-amber-800">
            {needsManualReviewCopy(result.attempts ?? [])}
          </p>
        </div>
      </div>
    );
  }

  const { title, detail } = describeRecovery(result.attempts ?? []);
  return (
    <div
      role="status"
      className="flex gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900"
    >
      <CheckCircle2 aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
      <div>
        <p className="font-medium">{title}</p>
        <p className="mt-1 text-emerald-800">{detail}</p>
      </div>
    </div>
  );
}

export function ResultPanel({ result }: { result: RunResult }) {
  return (
    <div className="space-y-5">
      <div data-animate="block">
        <StatusBanner result={result} />
      </div>

      {result.ticket ? (
        <section
          data-animate="block"
          className="rounded-lg border border-slate-200 bg-white/85 p-4 backdrop-blur-sm"
        >
          <h2 className="mb-3 flex items-center gap-1.5 text-sm font-medium text-slate-600">
            <FileText aria-hidden="true" className="h-4 w-4 text-slate-400" />
            Ticket procesado
          </h2>

          <div className="mb-3 flex flex-wrap items-center gap-2">
            <UrgencyBadge urgency={result.ticket.urgency} />
            <CategoryBadge category={result.ticket.category} />
            <span className="flex items-center gap-1 text-xs text-slate-500">
              {result.ticket.requires_human_escalation ? (
                <UserCheck aria-hidden="true" className="h-3.5 w-3.5 text-amber-600" />
              ) : (
                <UserX aria-hidden="true" className="h-3.5 w-3.5 text-slate-400" />
              )}
              Escalar a humano: {result.ticket.requires_human_escalation ? "Sí" : "No"}
            </span>
          </div>

          <p className="text-sm leading-relaxed text-slate-800">{result.ticket.summary}</p>

          {result.ticket.extracted_amount !== null ? (
            <p className="mt-3 flex items-center gap-1.5 text-sm text-slate-500">
              <Banknote aria-hidden="true" className="h-4 w-4 text-slate-400" />
              Monto extraído:{" "}
              <span className="font-medium tabular-nums text-slate-800">
                ${result.ticket.extracted_amount.toFixed(2)}
              </span>
            </p>
          ) : null}
        </section>
      ) : null}

      <div data-animate="block">
        <AuditTrail result={result} />
      </div>

      {/* CA 4.3: the strict JSON is always shown, even for failed runs, so the
          evaluator can see what the model actually produced. */}
      <section data-animate="block">
        <h2 className="mb-2 flex items-center gap-1.5 text-sm font-medium text-slate-600">
          <Braces aria-hidden="true" className="h-4 w-4 text-slate-400" />
          JSON estricto
        </h2>
        <JsonBlock data={result.ticket ?? { status: result.status, error: result.error }} />
      </section>
    </div>
  );
}
