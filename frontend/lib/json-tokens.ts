/**
 * Tokenizer for the syntax-highlighted JSON block.
 *
 * Extracted from the component so the nesting and escaping rules can be tested
 * directly. Handles arrays and nested objects by recursing, which is enough for
 * a flat ticket payload and avoids pulling in a highlighting library.
 */

export type TokenKind = "key" | "string" | "number" | "boolean" | "null" | "punctuation";

export interface Token {
  kind: TokenKind;
  value: string;
}

export function tokenize(value: unknown, indent = 0): Token[] {
  const pad = "  ".repeat(indent);
  const innerPad = "  ".repeat(indent + 1);
  const tokens: Token[] = [];

  if (value === null) return [{ kind: "null", value: "null" }];

  if (typeof value === "boolean") return [{ kind: "boolean", value: String(value) }];

  if (typeof value === "number") {
    // NaN and Infinity are not valid JSON; never emit them bare.
    return Number.isFinite(value)
      ? [{ kind: "number", value: String(value) }]
      : [{ kind: "null", value: "null" }];
  }

  if (typeof value === "string") {
    return [{ kind: "string", value: JSON.stringify(value) }];
  }

  if (Array.isArray(value)) {
    if (value.length === 0) return [{ kind: "punctuation", value: "[]" }];
    tokens.push({ kind: "punctuation", value: "[" });
    value.forEach((item, index) => {
      tokens.push({ kind: "punctuation", value: `\n${innerPad}` });
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
      tokens.push({ kind: "punctuation", value: `\n${innerPad}` });
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

/** Flatten tokens to text. Used to assert the rendering is valid JSON. */
export function tokensToString(tokens: Token[]): string {
  return tokens.map((token) => token.value).join("");
}
