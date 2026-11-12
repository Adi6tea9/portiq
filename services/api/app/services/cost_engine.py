from decimal import Decimal, ROUND_HALF_UP
from typing import List, Optional, Tuple, Any
import math
from datetime import date

CORE_COMPONENTS = ["customs_duty", "port_storage", "demurrage"]

def _get_specificity(rule: Any) -> int:
    """Counts non-null scope fields to determine rule specificity."""
    scope_fields = [
        rule.port_id,
        rule.hs_code_prefix,
        rule.shipping_line,
        rule.cargo_type,
        rule.container_size_ft
    ]
    return sum(1 for field in scope_fields if field is not None)

def _matches_scope(rule: Any, shipment: Any, effective_date: date) -> bool:
    """Checks if a rule matches the shipment's scope and arrival date."""
    if rule.valid_from and rule.valid_from > effective_date:
        return False
    if rule.valid_to and rule.valid_to < effective_date:
        return False
    
    if rule.port_id and rule.port_id != shipment.port_id:
        return False
    if rule.hs_code_prefix and not shipment.hs_code.startswith(rule.hs_code_prefix):
        return False
    if rule.shipping_line and rule.shipping_line != shipment.shipping_line:
        return False
    if rule.cargo_type and rule.cargo_type != shipment.cargo_type:
        return False
    if rule.container_size_ft and rule.container_size_ft != shipment.container_size_ft:
        return False
        
    return True

def _select_rule(rules: List[Any], component: str, shipment: Any) -> Tuple[Optional[Any], Optional[str]]:
    """Finds the most specific active rule for a component, handling ambiguity and currency mismatches."""
    effective_date = shipment.expected_arrival_at.date()
    
    matching_rules = [
        r for r in rules 
        if r.rule_type == component and r.is_active and _matches_scope(r, shipment, effective_date)
    ]
    
    if not matching_rules:
        return None, f"No active {component} rule for this scope on {effective_date.isoformat()}"
        
    # Sort by specificity descending
    matching_rules.sort(key=_get_specificity, reverse=True)
    
    highest_specificity = _get_specificity(matching_rules[0])
    top_rules = [r for r in matching_rules if _get_specificity(r) == highest_specificity]
    
    if len(top_rules) > 1:
        return None, "Ambiguous tariff rules"
        
    selected_rule = top_rules[0]
    
    if selected_rule.currency != shipment.currency:
        return None, f"Currency mismatch: rule is {selected_rule.currency}, shipment is {shipment.currency}"
        
    return selected_rule, None

def _calculate_line_amount(rule: Any, shipment: Any, predicted_dwell_days: float) -> Decimal:
    """Applies the specific math formula based on the rate type."""
    rate = Decimal(str(rule.rate_value))
    
    if rule.rate_type == "percent_of_value":
        declared = Decimal(str(shipment.declared_value))
        return (declared * rate / Decimal("100")).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        
    elif rule.rate_type == "flat":
        return rate.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        
    # Calculate chargeable days for per_day and tiered
    free_days = float(rule.free_days) if rule.free_days is not None else 0.0
    chargeable_days = math.ceil(max(0.0, predicted_dwell_days - free_days))
    
    if rule.rate_type == "per_day":
        return (Decimal(str(chargeable_days)) * rate).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        
    elif rule.rate_type == "tiered":
        total_amount = Decimal("0.00")
        days_remaining = chargeable_days
        
        if rule.tier_config and "tiers" in rule.tier_config:
            previous_limit = 0
            for tier in rule.tier_config["tiers"]:
                if days_remaining <= 0:
                    break
                    
                up_to = tier.get("up_to_days")
                tier_rate = Decimal(str(tier["rate"]))
                
                if up_to is None:
                    # Infinite upper bound
                    total_amount += Decimal(str(days_remaining)) * tier_rate
                    days_remaining = 0
                else:
                    days_in_tier = up_to - previous_limit
                    billable_in_tier = min(days_remaining, days_in_tier)
                    total_amount += Decimal(str(billable_in_tier)) * tier_rate
                    days_remaining -= billable_in_tier
                    previous_limit = up_to
                    
        return total_amount.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        
    return Decimal("0.00")

def calculate_costs(shipment: Any, predicted_dwell_days: float, available_rules: List[Any]) -> Tuple[List[dict], bool, Optional[Decimal]]:
    """
    Evaluates all components. 
    Returns: (list of cost lines, total_is_partial boolean, total_estimated_cost Decimal)
    """
    cost_lines = []
    total_estimated_cost = Decimal("0.00")
    total_is_partial = False
    any_estimated = False
    
    components_to_check = CORE_COMPONENTS + ["other_charge"]
    
    for component in components_to_check:
        rule, error_reason = _select_rule(available_rules, component, shipment)
        
        if not rule:
            if component in CORE_COMPONENTS:
                cost_lines.append({
                    "component": component,
                    "amount": None,
                    "status": "unavailable",
                    "reason": error_reason,
                    "rule_version": None
                })
                total_is_partial = True
            continue
            
        amount = _calculate_line_amount(rule, shipment, predicted_dwell_days)
        cost_lines.append({
            "component": component,
            "amount": str(amount),
            "status": "estimated",
            "reason": None,
            "rule_version": rule.version
        })
        total_estimated_cost += amount
        any_estimated = True

    final_total = total_estimated_cost if any_estimated else None
    return cost_lines, total_is_partial, final_total