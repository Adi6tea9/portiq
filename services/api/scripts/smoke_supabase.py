"""B11 smoke test against a running API in ``AUTH_MODE=supabase``.

Signs in with a real Supabase user through the Auth REST API, then calls ``GET /me``,
``GET /ports``, creates a shipment and runs a prediction. It reads no API environment
variables and prints no tokens: credentials come from arguments or a prompt.

    python scripts/smoke_supabase.py ^
        --supabase-url https://<project>.supabase.co ^
        --supabase-key <publishable-or-anon-key> ^
        --email you@example.com

Exit code 0 means every step returned the expected status; anything else prints the
failing step and the API's error envelope.
"""

from __future__ import annotations

import argparse
import getpass
import json
import sys
import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

import httpx

TIMEOUT_SECONDS = 30


def call(
    client: httpx.Client, step: str, method: str, url: str, expected: int, **kwargs: Any
) -> dict[str, Any]:
    response = client.request(method, url, **kwargs)
    print(f"\n{step}: {method} {url} -> {response.status_code}")
    body: dict[str, Any] = response.json()
    print(json.dumps(body, indent=2, sort_keys=True))
    if response.status_code != expected:
        error = body.get("error", {})
        raise SystemExit(
            f"{step} failed: expected {expected}, got {response.status_code} "
            f"({error.get('code')}: {error.get('message')})"
        )
    return body


def sign_in(client: httpx.Client, url: str, key: str, email: str, password: str) -> str:
    response = client.post(
        f"{url.rstrip('/')}/auth/v1/token",
        params={"grant_type": "password"},
        headers={"apikey": key, "Content-Type": "application/json"},
        json={"email": email, "password": password},
    )
    print(f"\nSign-in: POST {url.rstrip('/')}/auth/v1/token -> {response.status_code}")
    if response.status_code != 200:
        raise SystemExit(f"Sign-in failed ({response.status_code}): {response.text}")
    payload = response.json()
    # Never print the token or refresh token; only proof that a user was returned.
    user = {"user_id": payload["user"]["id"], "email": payload["user"]["email"]}
    print(json.dumps(user, indent=2))
    return str(payload["access_token"])


def main() -> int:
    parser = argparse.ArgumentParser(description="PortIQ Supabase smoke test")
    parser.add_argument("--api-base", default="http://localhost:8000/api/v1")
    parser.add_argument("--supabase-url", required=True)
    parser.add_argument("--supabase-key", required=True, help="publishable or anon key")
    parser.add_argument("--email", required=True)
    parser.add_argument("--password", help="prompted when omitted, so it stays out of history")
    args = parser.parse_args()

    password = args.password or getpass.getpass(f"Supabase password for {args.email}: ")
    with httpx.Client(timeout=TIMEOUT_SECONDS) as client:
        token = sign_in(client, args.supabase_url, args.supabase_key, args.email, password)
        headers = {"Authorization": f"Bearer {token}"}

        me = call(client, "GET /me", "GET", f"{args.api_base}/me", 200, headers=headers)
        if me["data"]["email"].lower() != args.email.lower():
            raise SystemExit(f"/me returned {me['data']['email']}, expected {args.email}")
        if me["data"]["role"] != "importer_exporter":
            raise SystemExit(
                "The smoke test creates a shipment, which needs an importer account; "
                f"/me reports role={me['data']['role']}"
            )

        ports = call(client, "GET /ports", "GET", f"{args.api_base}/ports", 200, headers=headers)
        port_id = ports["data"][0]["id"]

        arrival = datetime.now(UTC) + timedelta(days=7)
        arrival_z = arrival.replace(microsecond=0).isoformat().replace("+00:00", "Z")
        created = call(
            client,
            "POST /shipments",
            "POST",
            f"{args.api_base}/shipments",
            201,
            headers=headers,
            json={
                "port_id": port_id,
                "reference": f"SMOKE-{uuid.uuid4().hex[:8].upper()}",
                "direction": "import",
                "cargo_type": "general_container",
                "container_size_ft": 40,
                "hs_code": "847130",
                "weight_kg": "15000.00",
                "declared_value": "250000.00",
                "currency": "INR",
                "shipping_line": "Line A",
                "vessel_size_band": "medium",
                "expected_arrival_at": arrival_z,
                "documentation_status": "complete",
            },
        )
        shipment_id = created["data"]["id"]

        prediction = call(
            client,
            "POST /shipments/{id}/prediction",
            "POST",
            f"{args.api_base}/shipments/{shipment_id}/prediction",
            201,
            headers={**headers, "Idempotency-Key": str(uuid.uuid4())},
        )

    data = prediction["data"]
    print("\nSmoke test passed.")
    print(
        json.dumps(
            {
                "shipment_id": shipment_id,
                "prediction_id": data["prediction_id"],
                "predicted_dwell_days": data["predicted_dwell_days"],
                "capacity_snapshot": data["capacity_snapshot"]["status"],
                "explanation": data["explanation"]["status"],
                "warnings": [warning["code"] for warning in data["warnings"]],
                "model_version": data["provenance"]["model_version"],
            },
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
