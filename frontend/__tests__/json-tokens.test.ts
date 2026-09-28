/**
 * Tests for the JSON tokenizer used by the syntax-highlighted block.
 *
 * The important property is that the flattened output is always valid JSON:
 * a highlighter that produces malformed text would misrepresent the payload,
 * which is the opposite of what the harness is for.
 */
import { tokenize, tokensToString } from "@/lib/json-tokens";

const render = (value: unknown) => tokensToString(tokenize(value));

describe("scalars", () => {
  it("renders null", () => {
    expect(render(null)).toBe("null");
  });

  it("renders booleans", () => {
    expect(render(true)).toBe("true");
    expect(render(false)).toBe("false");
  });

  it("renders numbers", () => {
    expect(render(4999)).toBe("4999");
    expect(render(4999.5)).toBe("4999.5");
  });

  it("escapes strings with JSON.stringify", () => {
    expect(render('dice "hola"')).toBe('"dice \\"hola\\""');
  });

  it("escapes newlines and control characters", () => {
    const out = render("línea 1\nlínea 2");
    expect(out).toContain("\\n");
    expect(JSON.parse(out)).toBe("línea 1\nlínea 2");
  });

  it("preserves accented characters for display", () => {
    expect(render("Facturación")).toBe('"Facturación"');
  });

  it("never emits NaN or Infinity, which are not valid JSON", () => {
    expect(render(Number.NaN)).toBe("null");
    expect(render(Number.POSITIVE_INFINITY)).toBe("null");
  });
});

describe("objects", () => {
  it("renders an empty object inline", () => {
    expect(render({})).toBe("{}");
  });

  it("round-trips a flat object", () => {
    const data = {
      summary: "Cobro duplicado de 4999 pesos",
      category: "Facturación",
      urgency: "Alta",
      requires_human_escalation: true,
      extracted_amount: 4999,
    };
    expect(JSON.parse(render(data))).toEqual(data);
  });

  it("labels keys distinctly from string values", () => {
    const tokens = tokenize({ urgency: "Alta" });
    expect(tokens.some((t) => t.kind === "key" && t.value === '"urgency"')).toBe(true);
    expect(tokens.some((t) => t.kind === "string" && t.value === '"Alta"')).toBe(true);
  });

  it("puts a null amount as a null token, not a missing field", () => {
    const tokens = tokenize({ extracted_amount: null });
    expect(tokens.some((t) => t.kind === "null")).toBe(true);
  });
});

describe("arrays and nesting", () => {
  it("renders an empty array inline", () => {
    expect(render([])).toBe("[]");
  });

  it("round-trips an array of scalars", () => {
    expect(JSON.parse(render([1, "dos", true, null]))).toEqual([1, "dos", true, null]);
  });

  it("round-trips nested objects", () => {
    const data = { outer: { inner: { deep: "valor" } } };
    expect(JSON.parse(render(data))).toEqual(data);
  });

  it("round-trips an array of objects", () => {
    const data = { attempts: [{ n: 1, ok: false }, { n: 2, ok: true }] };
    expect(JSON.parse(render(data))).toEqual(data);
  });

  it("indents deeper levels further", () => {
    const out = render({ a: { b: 1 } });
    const innerLine = out.split("\n").find((line) => line.includes('"b"')) ?? "";
    const outerLine = out.split("\n").find((line) => line.includes('"a"')) ?? "";
    expect(innerLine.length - innerLine.trimStart().length).toBeGreaterThan(
      outerLine.length - outerLine.trimStart().length,
    );
  });
});

describe("robustness", () => {
  it("survives a deeply nested payload", () => {
    const deep = { a: { b: { c: { d: { e: "f" } } } } };
    expect(JSON.parse(render(deep))).toEqual(deep);
  });

  it("handles undefined values without throwing", () => {
    expect(() => render({ a: undefined })).not.toThrow();
  });
});
