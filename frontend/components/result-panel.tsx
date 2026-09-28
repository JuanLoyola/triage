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

/**
 * Distinguish a validation self-correction from a provider retry.
 *
 * Claiming "autocorrección" when every failed attempt was a 503 misrepresents
 * what the harness did. The audit trail shows the real reason, so the banner
 * has to agree with it.
 */
function describeRecovery(result: RunResult): { title: string; detail: string } {
  const attempts = result.attempts ?? [];
  if (attempts.length <= 1) {
    return {
      title: "Ticket validado",
      detail: "El agente produjo un JSON válido en el primer intento.",
    };
  }

  const failures = attempts.filter((log) => !log.succeeded);
  const providerErrors = failures.filter((log) =>
    (log.error ?? "").includes("Error del proveedor"),
  );
  const validationErrors = failures.length - providerErrors.length;

  if (validationErrors === 0) {
    return {
      title: `Ticket validado tras ${attempts.length} intentos`,
      detail:
        `El agente no llegó a producir JSON en los primeros ${failures.length} intentos ` +
        `porque el proveedor falló, no por un error de validación. ` +
        `No hubo autocorrección en esta corrida.`,
    };
  }

  return {
    title: `Ticket validado tras ${attempts.length} intentos`,
    detail:
      `El agente corrigió su propia salida: ${validationErrors} ` +
      `${validationErrors === 1 ? "error de validación" : "errores de validación"} ` +
      `le fueron reinyectados hasta producir un JSON válido` +
      (providerErrors.length > 0
        ? `. Además hubo ${providerErrors.length} ${providerErrors.length === 1 ? "fallo del proveedor" : "fallos del proveedor"}.`
        : "."),
  };
}

function StatusBanner({ result }: { result: RunResult }) {
  if (result.status === "quota_exceeded") {
    return (
      <div
        role="status"
        className="rounded-lg border border-sky-200 bg-sky-50 p-4 text-sm text-sky-900"
      >
        <p className="font-medium">Cuota del free tier agotada</p>
        <p className="mt-1 text-sky-800">
          El harness está funcionando correctamente. El proveedor de Gemini no acepta más
          requests hasta que se resetee el límite. Probá de nuevo en unos minutos.
        </p>
      </div>
    );
  }

  if (result.status === "needs_manual_review") {
    const failures = (result.attempts ?? []).filter((log) => !log.succeeded);
    const allProvider =
      failures.length > 0 &&
      failures.every((log) => (log.error ?? "").includes("Error del proveedor"));

    return (
      <div
        role="alert"
        className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"
      >
        <p className="font-medium">Se agotaron los reintentos</p>
        <p className="mt-1 text-amber-800">
          {allProvider
            ? "Todos los intentos fallaron por error del proveedor, no por un error de validación. El ticket no se guardó."
            : "El ticket requiere revisión manual. El log de fallas está en el audit trail y el ticket no se guardó en la base."}
        </p>
      </div>
    );
  }

  const { title, detail } = describeRecovery(result);
  return (
    <div
      role="status"
      className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900"
    >
      <p className="font-medium">{title}</p>
      <p className="mt-1 text-emerald-800">{detail}</p>
    </div>
  );
}

export function ResultPanel({ result }: { result: RunResult }) {
  return (
    <div className="space-y-5">
      <StatusBanner result={result} />

      {result.ticket ? (
        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="mb-3 text-sm font-medium text-slate-600">Ticket procesado</h2>

          <div className="mb-3 flex flex-wrap items-center gap-2">
            <UrgencyBadge urgency={result.ticket.urgency} />
            <CategoryBadge category={result.ticket.category} />
            <span className="text-xs text-slate-500">
              Escalar a humano: {result.ticket.requires_human_escalation ? "Sí" : "No"}
            </span>
          </div>

          <p className="text-sm leading-relaxed text-slate-800">{result.ticket.summary}</p>

          {result.ticket.extracted_amount !== null ? (
            <p className="mt-3 text-sm text-slate-500">
              Monto extraído:{" "}
              <span className="font-medium tabular-nums text-slate-800">
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
        <h2 className="mb-2 text-sm font-medium text-slate-600">JSON estricto</h2>
        <JsonBlock data={result.ticket ?? { status: result.status, error: result.error }} />
      </section>
    </div>
  );
}
