/**
 * Urgency badge.
 *
 * The color is never the only signal: the urgency label is always rendered as
 * text, so it works for screen readers and for colorblind users (spec
 * section 13, accessibility).
 */
import type { Urgency } from "@/lib/types";

const STYLES: Record<Urgency, { badge: string; dot: string }> = {
  Crítica: {
    badge: "bg-red-500/15 text-red-300 ring-1 ring-red-500/40",
    dot: "bg-red-500",
  },
  Alta: {
    badge: "bg-orange-500/15 text-orange-300 ring-1 ring-orange-500/40",
    dot: "bg-orange-500",
  },
  Media: {
    badge: "bg-yellow-500/15 text-yellow-300 ring-1 ring-yellow-500/40",
    dot: "bg-yellow-500",
  },
  Baja: {
    badge: "bg-slate-500/15 text-slate-300 ring-1 ring-slate-500/40",
    dot: "bg-slate-500",
  },
};

export function UrgencyBadge({ urgency }: { urgency: Urgency }) {
  const style = STYLES[urgency];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${style.badge}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} aria-hidden="true" />
      {urgency}
    </span>
  );
}

const CATEGORY_STYLES: Record<string, string> = {
  Facturación: "bg-violet-500/15 text-violet-300 ring-1 ring-violet-500/40",
  Técnico: "bg-sky-500/15 text-sky-300 ring-1 ring-sky-500/40",
  Cuenta: "bg-teal-500/15 text-teal-300 ring-1 ring-teal-500/40",
  Sugerencia: "bg-fuchsia-500/15 text-fuchsia-300 ring-1 ring-fuchsia-500/40",
};

export function CategoryBadge({ category }: { category: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${
        CATEGORY_STYLES[category] ?? "bg-slate-500/15 text-slate-300 ring-1 ring-slate-500/40"
      }`}
    >
      {category}
    </span>
  );
}
