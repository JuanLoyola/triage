/**
 * Minimal JSON syntax highlighter.
 *
 * CA 4.3 asks for a formatted block with syntax highlighting. Spec item 34
 * settles on fixed colors rather than following the theme, so the palette is
 * hardcoded here. No dependency needed for a flat object of scalars.
 */
import type { ReactNode } from "react";

const TOKEN_CLASSES = {
  key: "text-sky-300",
  string: "text-emerald-300",
  number: "text-amber-300",
  boolean: "text-violet-300",
  null: "text-slate-400",
  punctuation: "text-slate-500",
} as const;

type TokenKind = keyof typeof TOKEN_CLASSES;

interface Token {
  kind: TokenKind;
  value: string;
}

/** Tokenize a flat JSON value. Nested objects are stringified on one line. */
function tokenize(value: unknown, indent = 0): Token[] {
  const pad = "  ".repeat(indent);
  const innerPad = "  ".repeat(indent + 1);
  const tokens: Token[] = [];

  if (value === null) {
    return [{ kind: "null", value: "null" }];
  }

  if (typeof value === "boolean") {
    return [{ kind: "boolean", value: String(value) }];
  }

  if (typeof value === "number") {
    return [{ kind: "number", value: String(value) }];
  }

  if (typeof value === "string") {
    return [{ kind: "string", value: JSON.stringify(value) }];
  }

  if (Array.isArray(value)) {
    if (value.length === 0) return [{ kind: "punctuation", value: "[]" }];
    tokens.push({ kind: "punctuation", value: "[" });
    value.forEach((item, index) => {
      tokens.push({ kind: "punctuation", value: "\n" + innerPad });
      tokens.push(...tokenize(item, indent + 1));
      if (index < value.length - 1) {
        tokens.push({ kind: "punctuation", value: "," });
      }
    });
    tokens.push({ kind: "punctuation", value: `\n${pad}]` });
    return tokens;
  }

  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) return [{ kind: "punctuation", value: "{}" }];

    tokens.push({ kind: "punctuation", value: "{" });
    entries.forEach(([key, item], index) => {
      tokens.push({ kind: "punctuation", value: "\n" + innerPad });
      tokens.push({ kind: "key", value: JSON.stringify(key) });
      tokens.push({ kind: "punctuation", value: ": " });
      tokens.push(...tokenize(item, indent + 1));
      if (index < entries.length - 1) {
        tokens.push({ kind: "punctuation", value: "," });
      }
    });
    tokens.push({ kind: "punctuation", value: `\n${pad}}` });
    return tokens;
  }

  return [{ kind: "string", value: JSON.stringify(String(value)) }];
}

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
    <pre className="overflow-x-auto whitespace-pre-wrap break-words rounded-lg bg-slate-950/80 p-4 text-xs leading-relaxed ring-1 ring-slate-800">
      <code>{nodes}</code>
    </pre>
  );
}
