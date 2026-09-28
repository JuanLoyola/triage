/**
 * One-paragraph explanation of what the app does and what to try.
 *
 * A visitor lands here from a portfolio link with no context, so this has to
 * answer two questions in a few seconds: what is this, and what do I press.
 */
import { Bot, MessageSquareText, RefreshCw, type LucideIcon } from "lucide-react";

const STEPS: { title: string; body: string; icon: LucideIcon }[] = [
  {
    title: "Pegá el mensaje",
    body: "El texto que te mandó un cliente, tal cual. Si no tenés uno a mano, usá un preset.",
    icon: MessageSquareText,
  },
  {
    title: "El agente lo clasifica",
    body: "Extrae categoría, urgencia, monto y si necesita escalamiento humano, en un JSON estricto.",
    icon: Bot,
  },
  {
    title: "Se corrige solo",
    body: "Si la salida no es válida, el agente ve el error exacto y reintenta. Si no lo logra, el ticket queda para revisión manual y no se guarda.",
    icon: RefreshCw,
  },
];

export function HowItWorks() {
  return (
    <section className="mb-8 rounded-xl border border-slate-200 bg-white/60 p-5">
      <p className="text-sm leading-relaxed text-slate-600">
        Un agente de IA lee el mensaje crudo de un cliente y lo convierte en un ticket
        estructurado:{" "}
        <span className="font-medium text-slate-800">categoría</span>,{" "}
        <span className="font-medium text-slate-800">urgencia</span>,{" "}
        <span className="font-medium text-slate-800">monto</span> y si{" "}
        <span className="font-medium text-slate-800">requiere atención humana</span>. Lo
        interesante es que su salida se valida contra un esquema estricto, y si falla el
        agente se entera del error exacto y se corrige sin intervención humana.
      </p>

      <ol className="mt-4 grid gap-3 sm:grid-cols-3">
        {STEPS.map((step, index) => {
          const Icon = step.icon;
          return (
            <li key={step.title} className="rounded-lg bg-slate-50/80 p-3">
              <p className="flex items-center gap-2 text-sm font-medium text-slate-800">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-sky-100 text-sky-800">
                  <Icon aria-hidden="true" className="h-3.5 w-3.5" strokeWidth={2.25} />
                </span>
                <span className="text-xs font-semibold tabular-nums text-slate-400">
                  {index + 1}.
                </span>
                {step.title}
              </p>
              <p className="mt-1.5 text-xs leading-relaxed text-slate-600">{step.body}</p>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
