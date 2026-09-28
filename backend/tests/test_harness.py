"""Tests for the harness core.

These are not part of the MVP deliverable (spec section 15, "No hay tests
automatizados"). They exist because the retry loop is the part of the system
most likely to break silently, and it is cheap to verify without an API key.
"""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.llm import MockProvider
from app.models import Category, ExtractedTicket, Urgency, validate_business_rules


class TestSchema:
    def test_valid_ticket(self):
        ticket = ExtractedTicket(
            summary="Se le cobraron dos veces el mismo importe de la suscripción",
            category="Facturación",
            urgency="Alta",
            requires_human_escalation=True,
            extracted_amount=4999.0,
        )
        assert ticket.category is Category.FACTURACION
        assert ticket.urgency is Urgency.ALTA

    def test_amount_is_optional(self):
        ticket = ExtractedTicket(
            summary="El cliente pide una funcionalidad nueva para el panel",
            category="Sugerencia",
            urgency="Baja",
            requires_human_escalation=False,
        )
        assert ticket.extracted_amount is None

    @pytest.mark.parametrize("category", ["Finanzas", "Urgente", "", "facturacion"])
    def test_invalid_category_rejected(self, category):
        with pytest.raises(ValidationError):
            ExtractedTicket(
                summary="Mensaje suficientemente largo para pasar la validación",
                category=category,
                urgency="Alta",
                requires_human_escalation=False,
            )

    @pytest.mark.parametrize("urgency", ["Urgente", "Critica", "medium", ""])
    def test_invalid_urgency_rejected(self, urgency):
        with pytest.raises(ValidationError):
            ExtractedTicket(
                summary="Mensaje suficientemente largo para pasar la validación",
                category="Técnico",
                urgency=urgency,
                requires_human_escalation=False,
            )

    def test_summary_min_length(self):
        with pytest.raises(ValidationError):
            ExtractedTicket(
                summary="hola",
                category="Técnico",
                urgency="Baja",
                requires_human_escalation=False,
            )

    def test_extra_fields_forbidden(self):
        with pytest.raises(ValidationError):
            ExtractedTicket(
                summary="Mensaje suficientemente largo para pasar la validación",
                category="Técnico",
                urgency="Baja",
                requires_human_escalation=False,
                notas_internas="no debería aparecer",
            )


class TestBusinessRules:
    def test_facturacion_with_generic_summary_fails(self):
        ticket = ExtractedTicket(
            summary="problema con la factura",
            category="Facturación",
            urgency="Baja",
            requires_human_escalation=False,
        )
        with pytest.raises(ValueError, match="CA 2.3"):
            validate_business_rules(ticket)

    def test_critica_with_generic_summary_fails(self):
        ticket = ExtractedTicket(
            summary="urgente",
            category="Técnico",
            urgency="Crítica",
            requires_human_escalation=True,
        )
        with pytest.raises(ValueError, match="CA 2.3"):
            validate_business_rules(ticket)

    def test_facturacion_with_specific_summary_passes(self):
        ticket = ExtractedTicket(
            summary="Le cobraron dos veces la suscripción de marzo por 4999 pesos",
            category="Facturación",
            urgency="Alta",
            requires_human_escalation=True,
            extracted_amount=4999.0,
        )
        validate_business_rules(ticket)  # no raise

    def test_sugerencia_with_generic_summary_passes(self):
        """CA 2.3 only applies to Facturación and Crítica."""
        ticket = ExtractedTicket(
            summary="Consulta sobre el plan",
            category="Sugerencia",
            urgency="Baja",
            requires_human_escalation=False,
        )
        validate_business_rules(ticket)  # no raise


class TestMockProvider:
    def test_returns_valid_json_by_default(self):
        provider = MockProvider()
        raw = provider.complete("system", "user")
        ticket = ExtractedTicket.model_validate_json(raw)
        assert ticket.category is Category.FACTURACION

    @pytest.mark.parametrize("fail_times", [1, 2, 3, 4])
    def test_fails_the_first_n_calls(self, fail_times):
        """Every mock failure mode must be caught by schema or business rule.

        The mock mixes both kinds: bad enums (schema) and a generic summary on a
        Facturación ticket (CA 2.3). So the check has to run both gates, the same
        way the graph does.
        """
        for seed in range(6):
            provider = MockProvider(fail_times=fail_times, seed=seed)
            outputs = [provider.complete("s", "u") for _ in range(fail_times + 1)]
            for raw in outputs[:fail_times]:
                with pytest.raises((ValidationError, ValueError)):
                    _validate_like_the_graph(raw)
            _validate_like_the_graph(outputs[-1])

    def test_eventually_returns_a_valid_ticket(self):
        provider = MockProvider(fail_times=2)
        for _ in range(2):
            with pytest.raises((ValidationError, ValueError)):
                _validate_like_the_graph(provider.complete("s", "u"))
        ticket = _validate_like_the_graph(provider.complete("s", "u"))
        assert ticket.category is Category.FACTURACION


def _validate_like_the_graph(raw: str) -> ExtractedTicket:
    """Parse plus business rules, mirroring graph.extract_ticket/validate_ticket."""
    import json as _json

    payload = _json.loads(raw)
    ticket = ExtractedTicket(**payload)
    validate_business_rules(ticket)
    return ticket
