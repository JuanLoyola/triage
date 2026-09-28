/**
 * Audit trail panel (CA 4.2).
 *
 * An accordion, closed by default (spec item 33). Each failed attempt shows the
 * exact validation error; the successful one shows the total response time.
 */
import { AttemptLog, type RunResult } from "@/lib/types";

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
          style={{ backgroundColor: log.succeeded ? "#22c55e" : "#eab308" }}
          aria-hidden="true"
        />
        {!isLast && <span className="mt-1 w-px flex-1 bg-slate-800" aria-hidden="true" />}
      </div>

      <div className="min-w-0 flex-1 pb-5">
        <p className="text-sm font-medium text-slate-200">
          {log.succeeded ? `Intento #${log.attempt}: exitoso` : `Intento #${log.attempt}: falló`}
        </p>

        {log.error ? (
          <pre className="mt-1.5 overflow-x-auto whitespace-pre-wrap rounded bg-yellow-500/5 p-2.5 text-xs leading-relaxed text-yellow-200/90 ring-1 ring-yellow-500/20">
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
    <details className="group rounded-lg bg-slate-900/40 ring-1 ring-slate-800">
      <summary className="flex cursor-pointer items-center justify-between px-4 py-3 text-sm font-medium text-slate-200 hover:bg-slate-900/70">
        <span>
          Audit trail
          <span className="ml-2 font-normal text-slate-500">
            {attempts.length} {attempts.length === 1 ? "intento" : "intentos"}
          </span>
        </span>
        <span
          className="text-slate-500 transition-transform group-open:rotate-180"
          aria-hidden="true"
        >
          ▾
        </span>
      </summary>

      <div className="border-t border-slate-800 px-4 py-4">
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
            <p className="text-xs text-slate-500">
              Tiempo total de respuesta: {formatMs(result.total_ms)}
            </p>
          </>
        )}
      </div>
    </details>
  );
}
