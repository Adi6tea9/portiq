import math
import hashlib
import numpy as np
from datetime import date, timedelta
from typing import Dict, Any, Optional

# Anchor date for day 0 calculations
EPOCH_DATE = date(2025, 1, 1)

PORT_CAPACITIES = {
    "INNSA": {"yard": 1000, "berth": 8},
    "INMUN": {"yard": 1200, "berth": 10}
}

def _get_seed(port_code: str, resource_type: str, d: date) -> int:
    seed_str = f"{port_code}_{resource_type}_{d.isoformat()}"
    return int(hashlib.md5(seed_str.encode()).hexdigest(), 16) % (2**32)

def _get_base_arrivals(port_code: str, resource_type: str) -> float:
    cap = PORT_CAPACITIES[port_code][resource_type]
    target_pct = 0.70 if resource_type == "yard" else 0.60
    mean_dwell = 2.0 if resource_type == "yard" else 1.0
    return (target_pct * cap) / mean_dwell

def capacity_sim_for_date(port_code: str, resource_type: str, target_date: date) -> Dict[str, Any]:
    if target_date < EPOCH_DATE:
        raise ValueError("Cannot simulate dates before epoch (2025-01-01)")

    cap = PORT_CAPACITIES.get(port_code, {}).get(resource_type)
    if not cap:
        return {"is_valid": False}

    mean_dwell = 2.0 if resource_type == "yard" else 1.0
    occupied = cap * (0.65 if resource_type == "yard" else 0.55)
    base_arrivals = _get_base_arrivals(port_code, resource_type)

    current_date = EPOCH_DATE
    while current_date <= target_date:
        day_of_year = current_date.timetuple().tm_yday
        weekday = current_date.weekday()
        
        if weekday in (0, 1, 2, 3):  # Mon - Thu
            weekday_effect = 0.08
        elif weekday in (5, 6):      # Sat - Sun
            weekday_effect = -0.12
        else:                        # Fri
            weekday_effect = 0.0

        seasonality = 1 + 0.15 * math.sin(2 * math.pi * day_of_year / 365) + weekday_effect

        rng = np.random.default_rng(_get_seed(port_code, resource_type, current_date))
        arrivals = rng.poisson(base_arrivals * seasonality)
        
        departures = occupied / mean_dwell
        occupied = occupied + arrivals - departures
        
        current_date += timedelta(days=1)

    utilization_pct = 100 * occupied / cap
    is_valid = True
    
    # Validation rules specified in section 9
    if cap <= 0 or occupied < 0 or occupied > 1.2 * cap:
        is_valid = False

    return {
        "resource_type": resource_type,
        "predicted_occupied": occupied,
        "total_capacity": cap,
        "utilization_pct": utilization_pct,
        "is_valid": is_valid
    }

def utilization_for(port_code: str, resource_type: str, target_date: date) -> Optional[float]:
    """Returns just the utilization percentage for the ML generator and prediction orchestrator."""
    res = capacity_sim_for_date(port_code, resource_type, target_date)
    if not res.get("is_valid"):
        return None
    return res["utilization_pct"]