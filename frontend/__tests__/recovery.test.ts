/**
 * Tests for the recovery copy.
 *
 * This is the logic that decides whether the UI claims the agent
 * self-corrected. Getting it wrong means telling a visitor "autocorrección"
 * when every attempt was a 503 from the provider, which is a visible lie next
 * to the audit trail that contradicts it.
 */
import {
  allFailuresAreProvider,
  describeRecovery,
  isProviderError,
  needsManualReviewCopy,
  type AttemptLike,
} from "@/lib/recovery";

const ok = (n: number): AttemptLike => ({ attempt: n, succeeded: true, error: null });

const providerFail = (n: number): AttemptLike => ({
  attempt: n,
  succeeded: false,
  error: "Error del proveedor: Gemini falló: 503 UNAVAILABLE.",
});

const validationFail = (n: number): AttemptLike => ({
  attempt: n,
  succeeded: false,
  error: "1 validation error for ExtractedTicket\ncategory\n  Input should be 'Facturación'",
});

const businessRuleFail = (n: number): AttemptLike => ({
  attempt: n,
  succeeded: false,
  error: "Regla de negocio CA 2.3: el summary debe ser específico",
});

describe("isProviderError", () => {
  it("detects the provider marker", () => {
    expect(isProviderError("Error del proveedor: 429")).toBe(true);
  });

  it("does not treat a validation error as a provider error", () => {
    expect(isProviderError("1 validation error for ExtractedTicket")).toBe(false);
  });

  it("handles null and undefined", () => {
    expect(isProviderError(null)).toBe(false);
    expect(isProviderError(undefined)).toBe(false);
    expect(isProviderError("")).toBe(false);
  });
});

describe("describeRecovery", () => {
  it("reports a clean first attempt", () => {
    const result = describeRecovery([ok(1)]);
    expect(result.title).toBe("Ticket validado");
    expect(result.detail).toContain("primer intento");
  });

  it("does not claim self-correction when every failure was the provider", () => {
    // Regression: the UI used to say "autocorrección" here, while the audit
    // trail showed three 503s. The model never produced anything to correct.
    const result = describeRecovery([providerFail(1), providerFail(2), ok(3)]);
    expect(result.title).toBe("Ticket validado tras 3 intentos");
    expect(result.detail).toContain("No hubo autocorrección");
    expect(result.detail).not.toContain("corrigió su propia salida");
  });

  it("claims self-correction when a validation error was reinjected", () => {
    const result = describeRecovery([validationFail(1), ok(2)]);
    expect(result.title).toBe("Ticket validado tras 2 intentos");
    expect(result.detail).toContain("corrigió su propia salida");
    expect(result.detail).toContain("1 error de validación");
  });

  it("counts a business-rule failure as a validation error", () => {
    // CA 2.3 is not a schema violation, but it is the model being wrong, and
    // the agent did have to fix it.
    const result = describeRecovery([businessRuleFail(1), ok(2)]);
    expect(result.detail).toContain("corrigió su propia salida");
  });

  it("uses the singular for exactly one validation error", () => {
    const result = describeRecovery([validationFail(1), ok(2)]);
    expect(result.detail).toContain("1 error de validación");
    expect(result.detail).not.toContain("errores de validación");
  });

  it("pluralizes two validation errors", () => {
    const result = describeRecovery([validationFail(1), validationFail(2), ok(3)]);
    expect(result.detail).toContain("2 errores de validación");
  });

  it("mentions the provider failures when they are mixed in", () => {
    const result = describeRecovery([
      providerFail(1),
      validationFail(2),
      ok(3),
    ]);
    expect(result.detail).toContain("corrigió su propia salida");
    expect(result.detail).toContain("1 fallo del proveedor");
  });

  it("handles an empty attempt list", () => {
    const result = describeRecovery([]);
    expect(result.title).toBe("Ticket validado");
  });
});

describe("allFailuresAreProvider", () => {
  it("is true when every failure is the provider", () => {
    expect(allFailuresAreProvider([providerFail(1), providerFail(2)])).toBe(true);
  });

  it("is false when a validation error is mixed in", () => {
    expect(allFailuresAreProvider([providerFail(1), validationFail(2)])).toBe(false);
  });

  it("is false when there are no failures at all", () => {
    // Vacuously true would be wrong: there is no provider failure to report.
    expect(allFailuresAreProvider([ok(1)])).toBe(false);
    expect(allFailuresAreProvider([])).toBe(false);
  });
});

describe("needsManualReviewCopy", () => {
  it("blames the provider when the provider failed everything", () => {
    const copy = needsManualReviewCopy([providerFail(1), providerFail(2)]);
    expect(copy).toContain("error del proveedor");
    expect(copy).not.toContain("revisión manual");
  });

  it("asks for manual review when the model kept failing validation", () => {
    const copy = needsManualReviewCopy([validationFail(1), validationFail(2)]);
    expect(copy).toContain("revisión manual");
  });
});
