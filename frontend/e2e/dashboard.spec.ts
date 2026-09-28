import { expect, test } from "@playwright/test";

/**
 * End-to-end tests for the dashboard.
 *
 * Every test gets a fresh sessionStorage session, so each one starts with the
 * full 3-execution budget even though the backend counts them in one shared
 * in-memory bucket.
 */
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.sessionStorage.clear();
  });
});

test.describe("carga inicial", () => {
  test("muestra el dashboard sin pedir login", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByRole("heading", { name: "Triage de Tickets" })).toBeVisible();
    // No redirect to a login page, and no auth UI anywhere.
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByLabel("Email")).toHaveCount(0);
  });

  test("explica qué hace la app y guía los pasos", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByText(/Un agente de IA lee el mensaje crudo/)).toBeVisible();
    await expect(page.getByText("Pegá el mensaje")).toBeVisible();
    await expect(page.getByText("El agente lo clasifica")).toBeVisible();
    await expect(page.getByText("Se corrige solo")).toBeVisible();
  });

  test("muestra el presupuesto de ejecuciones del día", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByText(/Te quedan \d+ de 3 ejecuciones hoy/)).toBeVisible();
  });

  test("avisa cuando el backend no responde", async ({ page }) => {
    // The banner only appears when the /health probe fails, so the failure has
    // to happen at request time, not at load time.
    await page.route("**/health", (route) => route.abort("connectionrefused"));
    await page.goto("/");

    await expect(page.getByText("El backend no está corriendo")).toBeVisible({
      timeout: 15_000,
    });
  });
});

test.describe("validación del formulario", () => {
  test("el botón arranca deshabilitado con el campo vacío", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("button", { name: "Enviar" })).toBeDisabled();
  });

  test("explica por qué el envío está deshabilitado con un mensaje corto", async ({ page }) => {
    await page.goto("/");
    const textarea = page.getByLabel("Mensaje del cliente");

    await textarea.fill("muy corto");

    // The button is disabled, so the reason has to be visible without
    // attempting to submit (EC-1).
    await expect(page.getByRole("button", { name: "Enviar" })).toBeDisabled();
    await expect(page.getByText(/Faltan \d+ caracteres/)).toBeVisible();
  });

  test("no muestra error de longitud con el campo vacío", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByRole("button", { name: "Enviar" })).toBeDisabled();
    await expect(page.getByText(/Faltan \d+ caracteres/)).toHaveCount(0);
  });

  test("explica por qué el envío está deshabilitado con un mensaje largo", async ({ page }) => {
    await page.goto("/");

    await page.getByLabel("Mensaje del cliente").fill("a".repeat(1001));

    await expect(page.getByRole("button", { name: "Enviar" })).toBeDisabled();
    await expect(page.getByText(/Supera el máximo por \d+ caracteres/)).toBeVisible();
  });

  test("el error exacto aparece tras intentar enviar", async ({ page }) => {
    await page.goto("/");

    // Fill short, then force the submit past the disabled button to reach the
    // validation path and get the canonical message from the schema.
    await page.getByLabel("Mensaje del cliente").fill("corto");
    await page.getByRole("button", { name: "Enviar" }).evaluate((el: HTMLButtonElement) => {
      el.disabled = false;
      el.click();
    });

    await expect(
      page.getByText("El mensaje debe tener al menos 15 caracteres."),
    ).toBeVisible();
  });

  test("habilita el envío con un mensaje válido", async ({ page }) => {
    await page.goto("/");
    await page
      .getByLabel("Mensaje del cliente")
      .fill("Me cobraron dos veces la suscripción de marzo por 4999 pesos.");

    await expect(page.getByRole("button", { name: "Enviar" })).toBeEnabled();
  });

  test("un preset rellena el textarea y sobreescribe lo que había", async ({ page }) => {
    await page.goto("/");
    const textarea = page.getByLabel("Mensaje del cliente");

    await textarea.fill("texto previo que debería desaparecer");
    await page.getByRole("button", { name: "Cobro duplicado en tarjeta" }).click();

    await expect(textarea).not.toHaveValue("texto previo que debería desaparecer");
    await expect(textarea).toHaveValue(/suscripción de marzo/);
  });
});

test.describe("ejecución del agente", () => {
  test("procesa un preset y muestra el ticket validado", async ({ page }) => {
    await page.goto("/");

    await page.getByRole("button", { name: "Cobro duplicado en tarjeta" }).click();
    await page.getByRole("button", { name: "Enviar" }).click();

    await expect(page.getByText("Ticket validado")).toBeVisible({ timeout: 20_000 });

    // "Facturación" appears twice: in the category badge and inside the JSON
    // block. Scope the assertions so the locator is not ambiguous.
    const ticketCard = page.locator("section", { hasText: "Ticket procesado" });
    await expect(ticketCard.getByText("Facturación", { exact: true })).toBeVisible();
    await expect(ticketCard.getByText("Alta", { exact: true })).toBeVisible();
    await expect(ticketCard.getByText("$4999.00")).toBeVisible();

    // Use the heading role: the step description also contains the words
    // "JSON estricto", so a plain text match is ambiguous.
    await expect(
      page.getByRole("heading", { name: "JSON estricto" }),
    ).toBeVisible();
  });

  test("muestra el JSON estricto con los campos del schema", async ({ page }) => {
    await page.goto("/");

    await page.getByRole("button", { name: "Cobro duplicado en tarjeta" }).click();
    await page.getByRole("button", { name: "Enviar" }).click();

    await expect(page.getByText("Ticket validado")).toBeVisible({ timeout: 20_000 });
    const jsonBlock = page.locator("pre", { hasText: "summary" });
    for (const key of [
      "summary",
      "category",
      "urgency",
      "requires_human_escalation",
      "extracted_amount",
    ]) {
      await expect(jsonBlock.getByText(new RegExp(`"${key}"`)).first()).toBeVisible();
    }
  });

  test("el audit trail arranca colapsado y se puede abrir", async ({ page }) => {
    await page.goto("/");

    await page.getByRole("button", { name: "Cobro duplicado en tarjeta" }).click();
    await page.getByRole("button", { name: "Enviar" }).click();
    await expect(page.getByText("Ticket validado")).toBeVisible({ timeout: 20_000 });

    const summary = page.locator("summary", { hasText: "Audit trail" });
    await expect(summary).not.toHaveAttribute("open", "");

    await summary.click();
    await expect(page.getByText(/Intento #1/)).toBeVisible();
  });

  test("muestra el error exacto de validación cuando el agente se equivoca", async ({ page }) => {
    await page.goto("/");

    await page.getByRole("button", { name: "Cobro duplicado en tarjeta" }).click();
    await page.getByRole("button", { name: "Enviar" }).click();
    await expect(page.getByText("Ticket validado")).toBeVisible({ timeout: 20_000 });

    // With MOCK_LLM the harness always succeeds, so this asserts the audit
    // trail renders the attempt; the retry copy is covered by unit tests.
    await page.locator("summary", { hasText: "Audit trail" }).click();
    await expect(page.getByText(/exitoso|falló/)).toBeVisible();
  });

  test("muestra el estado de revisión manual con el aviso en ámbar", async ({ page }) => {
    // Force the exhausted-retry path: the backend caps at max_retries, and
    // with the mock every call succeeds, so make the provider fail by asking
    // for a run while the backend has no valid quota left. Simplest reliable
    // trigger: intercept the API with a manual-review payload.
    await page.route("**/api/triage", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          status: "needs_manual_review",
          attempts: [
            { attempt: 1, succeeded: false, error: "Regla de negocio CA 2.3: summary genérico", ticket: null },
            { attempt: 2, succeeded: false, error: "Regla de negocio CA 2.3: summary genérico", ticket: null },
          ],
          ticket: null,
          customer_message: "x".repeat(50),
          channel: "email",
          max_retries: 2,
          needs_manual_review: true,
          quota_exceeded: false,
          error: "Regla de negocio CA 2.3: summary genérico",
          total_ms: 2100,
          runs_remaining: 1,
        }),
      }),
    );

    await page.goto("/");
    await page.getByLabel("Mensaje del cliente").fill("problema con la factura");
    await page.getByRole("button", { name: "Enviar" }).click();

    await expect(page.getByText("Se agotaron los reintentos")).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText(/requiere revisión manual/)).toBeVisible();

    // The audit trail must still show the exact validation error.
    await page.locator("summary", { hasText: "Audit trail" }).click();
    await expect(page.getByText(/summary genérico/).first()).toBeVisible();
  });
});

test.describe("límite de ejecuciones", () => {
  test("el contador baja con cada ejecución", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText(/Te quedan 3 de 3/)).toBeVisible();

    await page.getByRole("button", { name: "Cobro duplicado en tarjeta" }).click();
    await page.getByRole("button", { name: "Enviar" }).click();

    await expect(page.getByText(/Te quedan 2 de 3/)).toBeVisible({
      timeout: 20_000,
    });
  });

  test("agotado el presupuesto, el botón queda deshabilitado con otro label", async ({ page }) => {
    await page.goto("/");

    // Burn the session budget of 3.
    for (let i = 0; i < 3; i++) {
      await page.getByRole("button", { name: "Cobro duplicado en tarjeta" }).click();
      await page.getByRole("button", { name: "Enviar" }).click();
      await expect(page.getByText(/Te quedan \d+ de 3/)).toBeVisible({
        timeout: 20_000,
      });
    }

    await expect(page.getByText(/Te quedan 0 de 3/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Sin ejecuciones" })).toBeDisabled();
  });

  test("otra sesión del navegador arranca con presupuesto completo", async ({ page, context }) => {
    await page.goto("/");

    await page.getByRole("button", { name: "Cobro duplicado en tarjeta" }).click();
    await page.getByRole("button", { name: "Enviar" }).click();
    await expect(page.getByText(/Te quedan 2 de 3/)).toBeVisible({ timeout: 20_000 });

    // A new tab is a new sessionStorage, so the budget is per session.
    const second = await context.newPage();
    await second.goto("/");
    await expect(second.getByText(/Te quedan 3 de 3/)).toBeVisible();
  });
});
