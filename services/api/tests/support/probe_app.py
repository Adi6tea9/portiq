"""Test-only ASGI app: adds probe routes so the B01 error envelope can be exercised.

These routes are not part of the API surface. Tests import them, and the B01 live-server
demonstration runs ``uvicorn tests.support.probe_app:app`` to show a real 422 and 500.
"""

from __future__ import annotations

from fastapi import Body

from app.main import create_app

app = create_app()


@app.post("/_probe/validate")
def validate(weight_kg: int = Body(embed=True, gt=0)) -> dict[str, int]:
    return {"weight_kg": weight_kg}


@app.get("/_probe/boom")
def boom() -> None:
    raise RuntimeError("internal detail that must not leak")
