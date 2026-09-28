/**
 * Urgency badge.
 *
 * The color is never the only signal: the urgency label is always rendered as
 * text, so it works for screen readers and for colorblind users (spec
 * section 13, accessibility).
 *
 * On a light background the text has to carry the meaning, so each tint pairs a
 * 50-level background with a 700-level text, which stays above AA.
 */

type UrgencyTone = {
  chip: string;
  dot: string;
};

const STYLES: Record<string, UrgencyTone> = {
  Crítica: { chip: "bg-red-50 text-red-700 ring-1 ring-red-200", dot: "bg-red-500" },
  Alta: { chip: "bg-orange-50 text-orange-700 ring-1 ring-orange-200", dot: "bg-orange-500" },
  Media: { chip: "bg-amber-50 text-amber-800 ring-1 ring-amber-200", dot: "bg-amber-500" },
  Baja: { chip: "bg-slate-100 text-slate-600 ring-1 ring-slate-200", dot: "bg-slate-400" },
};

export function UrgencyBadge({ urgency }: { urgency: string }) {
  const style = STYLES[urgency] ?? STYLES.Baja;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${style.chip}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} aria-hidden="true" />
      {urgency}
    </span>
  );
}

const CATEGORY_TONES: Record<string, string> = {
  Facturación: "bg-violet-50 text-violet-700 ring-1 ring-violet-200",
  Técnico: "bg-sky-50 text-sky-700 ring-1 ring-sky-200",
  Cuenta: "bg-teal-50 text-teal-700 ring-1 ring-teal-200",
  Sugerencia: "bg-pink-50 text-pink-700 ring-1 ring-pink-200",
};

export function CategoryBadge({ category }: { category: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${
        CATEGORY_TONES[category] ?? "bg-slate-100 text-slate-600 ring-1 ring-slate-200"
      }`}
    >
      {category}
    </span>
  );
}
