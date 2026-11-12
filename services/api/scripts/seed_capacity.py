import argparse
import sys
import os
from datetime import date, timedelta, datetime, timezone

# Add app to path if running from root
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from sqlalchemy.orm import Session
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert

from app.db import engine
from app.models import Port, CapacityForecast
from app.services.capacity_sim import capacity_sim_for_date

def run_seed(start_date: date, days: int):
    with Session(engine) as db:
        ports = db.scalars(select(Port)).all()
        if not ports:
            print("No ports found. Run seed_dev.py first.")
            return

        resources = ["yard", "berth"]
        version = "sim-1.0"
        generated_at = datetime.now(timezone.utc)
        inserted_count = 0

        for port in ports:
            for resource in resources:
                for d in range(days):
                    target_date = start_date + timedelta(days=d)
                    
                    sim_result = capacity_sim_for_date(port.port_code, resource, target_date)
                    
                    if not sim_result.get("is_valid"):
                        continue
                        
                    bucket_start = datetime.combine(target_date, datetime.min.time(), tzinfo=timezone.utc)
                    bucket_end = bucket_start + timedelta(days=1)
                    
                    # Upsert query mapping to section 6 constraint: Unique (port_id, resource_type, bucket_start, model_or_rule_version)
                    stmt = insert(CapacityForecast).values(
                        port_id=port.id,
                        resource_type=resource,
                        bucket_start=bucket_start,
                        bucket_end=bucket_end,
                        predicted_occupied=sim_result["predicted_occupied"],
                        total_capacity=sim_result["total_capacity"],
                        utilization_pct=sim_result["utilization_pct"],
                        source_type="synthetic",
                        model_or_rule_version=version,
                        generated_at=generated_at
                    ).on_conflict_do_nothing(
                        index_elements=['port_id', 'resource_type', 'bucket_start', 'model_or_rule_version']
                    )
                    
                    db.execute(stmt)
                    inserted_count += 1
                    
        db.commit()
        print(f"Capacity seed complete. Processed/Skipped {inserted_count} valid buckets over {days} days.")

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--start", type=str, help="YYYY-MM-DD format", default=date.today().isoformat())
    parser.add_argument("--days", type=int, default=120)
    args = parser.parse_args()
    
    start_dt = date.fromisoformat(args.start)
    run_seed(start_dt, args.days)