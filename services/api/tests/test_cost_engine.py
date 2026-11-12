from decimal import Decimal
from datetime import datetime, date
from app.services.cost_engine import calculate_costs

class MockShipment:
    def __init__(self):
        self.expected_arrival_at = datetime(2026, 11, 15)
        self.port_id = "INNSA"
        self.hs_code = "850440"
        self.shipping_line = "Line A"
        self.cargo_type = "general_container"
        self.container_size_ft = 20
        self.declared_value = "10000.00"
        self.currency = "INR"

class MockRule:
    def __init__(self, rule_type, rate_type="flat", rate_value="100.00"):
        self.rule_type = rule_type
        self.rate_type = rate_type
        self.rate_value = rate_value
        self.version = "1.0"
        self.is_active = True
        self.valid_from = date(2026, 1, 1)
        self.valid_to = None
        self.port_id = None
        self.hs_code_prefix = None
        self.shipping_line = None
        self.cargo_type = None
        self.container_size_ft = None
        self.currency = "INR"
        self.free_days = None
        self.tier_config = None

def test_missing_tariff_returns_unavailable_not_zero():
    shipment = MockShipment()
    # Provide ONLY customs duty. Port storage and demurrage are missing.
    rules = [MockRule(rule_type="customs_duty", rate_type="percent_of_value", rate_value="10.00")]
    
    cost_lines, total_is_partial, total = calculate_costs(shipment, 3.0, rules)
    
    assert total_is_partial is True
    
    port_storage = next(c for c in cost_lines if c["component"] == "port_storage")
    assert port_storage["status"] == "unavailable"
    assert port_storage["amount"] is None
    assert "No active port_storage rule" in port_storage["reason"]