/**
 * Minimal JSON syntax highlighter.
 *
 * CA 4.3 asks for a formatted block with syntax highlighting. Spec item 34
 * settles on fixed colors rather than following the theme, so the palette is
 * hardcoded here. No dependency needed for a flat object of scalars.
 */
import type { ReactNode } from "react";
import { tokenize } from "@/lib/json-tokens";

// Dark enough to stay readable on the light surface, soft enough not to glare.
const TOKEN_CLASSES = {
  key: "text-sky-700",
  string: "text-emerald-700",
  number: "text-amber-700",
  boolean: "text-violet-700",
  null: "text-slate-500",
  punctuation: "text-slate-400",
} as const;

export function JsonBlock({ data }: { data: unknown }) {
  let nodes: ReactNode;
  try {
    nodes = tokenize(data).map((token, index) => (
      <span key={index} className={TOKEN_CLASSES[token.kind]}>
        {token.value}
      </span>
    ));
  } catch {
    // Never let a rendering bug hide the payload.
    nodes = JSON.stringify(data, null, 2);
  }

  return (
    <pre className="overflow-x-auto whitespace-pre-wrap break-words rounded-lg border border-slate-200 bg-slate-50/90 p-4 text-xs leading-relaxed text-slate-700">
      <code>{nodes}</code>
    </pre>
  );
}
