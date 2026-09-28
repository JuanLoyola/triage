/**
 * Component tests for the pieces that encode product rules.
 *
 * Accessibility is a design constraint here, not an extra, so the
 * "color is never the only signal" rule is asserted rather than assumed.
 */
import { render, screen } from "@testing-library/react";
import { CategoryBadge, UrgencyBadge } from "@/components/badges";
import { JsonBlock } from "@/components/json-block";
import { AuditTrail } from "@/components/audit-trail";
import { ResultPanel } from "@/components/result-panel";
import type { AttemptLog, RunResult } from "@/lib/types";

const attempt = (over: Partial<AttemptLog> = {}): AttemptLog => ({
  attempt: 1,
  succeeded: true,
  error: null,
  ticket: null,
  ...over,
});

const run = (over: Partial<RunResult> = {}): RunResult => ({
  status: "success",
  attempts: [],
  ticket: null,
  customer_message: "Mensaje del cliente suficientemente largo",
  channel: "email",
  max_retries: 3,
  needs_manual_review: false,
  quota_exceeded: false,
  unavailable: false,
  error: null,
  total_ms: 7,
  runs_remaining: 2,
  ...over,
});

const ticket = {
  summary: "Se le cobraron dos veces la suscripción de marzo por 4999 pesos",
  category: "Facturación" as const,
  urgency: "Alta" as const,
  requires_human_escalation: true,
  extracted_amount: 4999,
};

describe("UrgencyBadge", () => {
  it.each(["Baja", "Media", "Alta", "Crítica"])(
    "renders the urgency %s as text, not only as a color",
    (urgency) => {
      render(<UrgencyBadge urgency={urgency} />);
      expect(screen.getByText(urgency)).toBeInTheDocument();
    },
  );

  it("hides the decorative dot from screen readers", () => {
    const { container } = render(<UrgencyBadge urgency="Alta" />);
    const dot = container.querySelector('[aria-hidden="true"]');
    expect(dot).toBeInTheDocument();
  });

  it("falls back to a neutral style for an unknown urgency", () => {
    render(<UrgencyBadge urgency="Desconocida" />);
    expect(screen.getByText("Desconocida")).toBeInTheDocument();
  });
});

describe("CategoryBadge", () => {
  it.each(["Facturación", "Técnico", "Cuenta", "Sugerencia"])(
    "renders the category %s",
    (category) => {
      render(<CategoryBadge category={category} />);
      expect(screen.getByText(category)).toBeInTheDocument();
    },
  );

  it("does not crash on an unknown category", () => {
    render(<CategoryBadge category="Finanzas" />);
    expect(screen.getByText("Finanzas")).toBeInTheDocument();
  });
});

describe("JsonBlock", () => {
  it("renders every field of a ticket", () => {
    render(<JsonBlock data={ticket} />);
    for (const key of [
      "summary",
      "category",
      "urgency",
      "requires_human_escalation",
      "extracted_amount",
    ]) {
      expect(screen.getByText(new RegExp(`"${key}"`))).toBeInTheDocument();
    }
  });

  it("shows null for a missing amount rather than hiding the field", () => {
    render(<JsonBlock data={{ extracted_amount: null }} />);
    expect(screen.getByText("null")).toBeInTheDocument();
  });
});

describe("AuditTrail", () => {
  it("starts collapsed", () => {
    render(<AuditTrail result={run({ attempts: [attempt()] })} />);
    expect(screen.getByText("Audit trail")).toBeInTheDocument();
    expect(screen.getByText(/1 intento/)).toBeInTheDocument();
  });

  it("pluralizes the attempt count", () => {
    render(<AuditTrail result={run({ attempts: [attempt(), attempt()] })} />);
    expect(screen.getByText(/2 intentos/)).toBeInTheDocument();
  });

  it("shows the exact validation error of a failed attempt", () => {
    render(
      <AuditTrail
        result={run({
          attempts: [
            attempt({ succeeded: false, error: "category: Input should be 'Facturación'" }),
          ],
        })}
      />,
    );
    expect(screen.getByText(/Intento #1: falló/)).toBeInTheDocument();
    expect(screen.getByText(/Input should be/)).toBeInTheDocument();
  });

  it("shows the total response time in seconds", () => {
    const { container } = render(
      <AuditTrail result={run({ total_ms: 1234, attempts: [attempt()] })} />,
    );
    expect(container.textContent).toContain("Tiempo total de respuesta: 1.2 s");
  });

  it("shows sub-second times in milliseconds", () => {
    const { container } = render(
      <AuditTrail result={run({ total_ms: 87, attempts: [attempt()] })} />,
    );
    expect(container.textContent).toContain("Tiempo total de respuesta: 87 ms");
  });

  it("shows an empty state when there are no attempts", () => {
    const { container } = render(<AuditTrail result={run({ attempts: [] })} />);
    expect(container.textContent).toContain("Sin intentos registrados");
  });
});

describe("ResultPanel", () => {
  it("renders the ticket with badges and the amount", () => {
    render(<ResultPanel result={run({ ticket })} />);
    expect(screen.getByText("Alta")).toBeInTheDocument();
    expect(screen.getByText("Facturación")).toBeInTheDocument();
    expect(screen.getByText("$4999.00")).toBeInTheDocument();
    // The label and the value are separate text nodes.
    expect(
      screen.getByText((_, el) => el?.textContent === "Escalar a humano: Sí"),
    ).toBeInTheDocument();
  });

  it("shows No when no human escalation is needed", () => {
    render(
      <ResultPanel result={run({ ticket: { ...ticket, requires_human_escalation: false } })} />,
    );
    expect(
      screen.getByText((_, el) => el?.textContent === "Escalar a humano: No"),
    ).toBeInTheDocument();
  });

  it("does not claim self-correction when the provider failed every attempt", () => {
    render(
      <ResultPanel
        result={run({
          attempts: [
            attempt({ succeeded: false, error: "Error del proveedor: 503 UNAVAILABLE." }),
            attempt({ attempt: 2, succeeded: false, error: "Error del proveedor: 503" }),
            attempt({ attempt: 3 }),
          ],
        })}
      />,
    );
    expect(screen.getByText(/No hubo autocorrección/)).toBeInTheDocument();
  });

  it("does claim self-correction when a validation error was reinjected", () => {
    render(
      <ResultPanel
        result={run({
          attempts: [
            attempt({ succeeded: false, error: "1 validation error for ExtractedTicket" }),
            attempt({ attempt: 2 }),
          ],
        })}
      />,
    );
    expect(screen.getByText(/corrigió su propia salida/)).toBeInTheDocument();
  });

  it("explains a quota failure as informational, not as a harness error", () => {
    render(
      <ResultPanel
        result={run({
          status: "quota_exceeded",
          quota_exceeded: true,
          error: "Se agotó la cuota del free tier",
        })}
      />,
    );
    expect(screen.getByText("Cuota del free tier agotada")).toBeInTheDocument();
    expect(screen.getByText(/harness está funcionando correctamente/)).toBeInTheDocument();
  });

  it("shows a service misconfiguration as unavailable, not as a rejection", () => {
    render(
      <ResultPanel
        result={run({
          status: "unavailable",
          unavailable: true,
          error: "GEMINI_API_KEY no está definida",
        })}
      />,
    );
    expect(screen.getByText(/no está disponible/)).toBeInTheDocument();
    // It must be explicit that the operator's message was not the problem.
    expect(screen.getByText(/No es un problema con tu mensaje/)).toBeInTheDocument();
  });

  it("blames the provider on manual review when the provider failed everything", () => {
    render(
      <ResultPanel
        result={run({
          status: "needs_manual_review",
          needs_manual_review: true,
          attempts: [
            attempt({ succeeded: false, error: "Error del proveedor: 503" }),
            attempt({ attempt: 2, succeeded: false, error: "Error del proveedor: 503" }),
          ],
        })}
      />,
    );
    expect(screen.getByText(/Todos los intentos fallaron por error del proveedor/)).toBeInTheDocument();
  });

  it("always shows the strict JSON, even without a ticket", () => {
    render(
      <ResultPanel
        result={run({ status: "needs_manual_review", error: "se agotaron los reintentos" })}
      />,
    );
    expect(screen.getByText("JSON estricto")).toBeInTheDocument();
    expect(screen.getByText(/needs_manual_review/)).toBeInTheDocument();
  });
});
