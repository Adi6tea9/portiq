"""Write the API's OpenAPI schema to ``docs/openapi.json`` (backend spec B10).

    python scripts/export_openapi.py              # from services/api
    python scripts/export_openapi.py --out x.json

Needs no database: the schema comes from the route definitions only.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

API_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(API_ROOT))  # `python scripts/export_openapi.py` must find `app`

DEFAULT_OUT = API_ROOT.parents[1] / "docs" / "openapi.json"


def export(out: Path) -> int:
    from app.main import create_app

    schema = create_app().openapi()
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(schema, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return len(schema.get("paths", {}))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    args = parser.parse_args()
    print(f"Wrote {export(args.out)} paths to {args.out}")
