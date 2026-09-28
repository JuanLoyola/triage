/**
 * Audit trail panel (CA 4.2).
 *
 * An accordion, closed by default (spec item 33). Each failed attempt shows the
 * exact validation error; the successful one shows the total response time.
 */
import { ChevronDown, History, Timer } from "lucide-react";
import type { AttemptLog, RunResult } from "@/lib/types";

function formatMs(ms: number | null): string {
  if (ms === null) return "—";
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

function AttemptRow({ log, isLast }: { log: AttemptLog; isLast: boolean }) {
  return (
    <li className="flex gap-3">
      <div className="flex flex-col items-center">
        <span
          className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full"
          style={{ backgroundColor: log.succeeded ? "#16a34a" : "#d97706" }}
          aria-hidden="true"
        />
        {!isLast && <span className="mt-1 w-px flex-1 bg-slate-200" aria-hidden="true" />}
      </div>

      <div className="min-w-0 flex-1 pb-5">
        <p className="text-sm font-medium text-slate-700">
          {log.succeeded ? `Intento #${log.attempt}: exitoso` : `Intento #${log.attempt}: falló`}
        </p>

        {log.error ? (
          <pre className="mt-1.5 overflow-x-auto whitespace-pre-wrap break-words rounded border border-amber-200 bg-amber-50 p-2.5 text-xs leading-relaxed text-amber-900">
            {log.error}
          </pre>
        ) : null}
      </div>
    </li>
  );
}

export function AuditTrail({ result }: { result: RunResult }) {
  const attempts = result.attempts ?? [];

  return (
    <details className="group overflow-hidden rounded-lg border border-slate-200 bg-white/85 backdrop-blur-sm">
      <summary className="flex cursor-pointer items-center justify-between px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50">
        <span className="flex items-center gap-2">
          <History aria-hidden="true" className="h-4 w-4 text-slate-400" />
          Audit trail
          <span className="font-normal text-slate-500">
            {attempts.length} {attempts.length === 1 ? "intento" : "intentos"}
          </span>
        </span>
        <ChevronDown
          aria-hidden="true"
          className="h-4 w-4 text-slate-400 transition-transform group-open:rotate-180"
        />
      </summary>

      <div className="border-t border-slate-200 px-4 py-4">
        {attempts.length === 0 ? (
          <p className="text-sm text-slate-500">Sin intentos registrados.</p>
        ) : (
          <>
            <ol className="space-y-0">
              {attempts.map((log, index) => (
                <AttemptRow
                  key={`${log.attempt}-${index}`}
                  log={log}
                  isLast={index === attempts.length - 1}
                />
              ))}
            </ol>
            <p className="flex items-center gap-1.5 text-xs text-slate-500">
              <Timer aria-hidden="true" className="h-3.5 w-3.5" />
              Tiempo total de respuesta: {formatMs(result.total_ms)}
            </p>
          </>
        )}
      </div>
    </details>
  );
}
