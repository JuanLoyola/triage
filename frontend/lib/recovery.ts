/**
 * How to describe the outcome of a triage run.
 *
 * Extracted from the component because this is the logic worth testing: it
 * decides whether the UI claims the agent self-corrected. Getting it wrong means
 * telling a visitor "autocorrección" when every attempt was a provider outage,
 * which is a visible lie in the audit trail.
 */

export type RunStatus = "success" | "needs_manual_review" | "quota_exceeded";

export interface AttemptLike {
  attempt: number;
  succeeded: boolean;
  error: string | null;
}

/** Provider failures are not self-correction: the model never got to be wrong. */
const PROVIDER_ERROR_MARKER = "Error del proveedor";

export function isProviderError(error: string | null | undefined): boolean {
  return (error ?? "").includes(PROVIDER_ERROR_MARKER);
}

export interface RecoverySummary {
  title: string;
  detail: string;
}

export function describeRecovery(attempts: AttemptLike[]): RecoverySummary {
  if (attempts.length <= 1) {
    return {
      title: "Ticket validado",
      detail: "El agente produjo un JSON válido en el primer intento.",
    };
  }

  const failures = attempts.filter((log) => !log.succeeded);
  const providerErrors = failures.filter((log) => isProviderError(log.error));
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

/** True when every failed attempt was the provider, not the model. */
export function allFailuresAreProvider(attempts: AttemptLike[]): boolean {
  const failures = attempts.filter((log) => !log.succeeded);
  return failures.length > 0 && failures.every((log) => isProviderError(log.error));
}

export function needsManualReviewCopy(attempts: AttemptLike[]): string {
  return allFailuresAreProvider(attempts)
    ? "Todos los intentos fallaron por error del proveedor, no por un error de validación. El ticket no se guardó."
    : "El ticket requiere revisión manual. El log de fallas está en el audit trail y el ticket no se guardó en la base.";
}
