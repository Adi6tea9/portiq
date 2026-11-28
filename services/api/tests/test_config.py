"""B01: configuration is read from the fixed environment variables and fails fast."""

from __future__ import annotations

import os
from pathlib import Path

import pytest

from app.core.config import DEFAULT_DATABASE_URL, load_env_file, load_settings

JWKS_URL = "https://project.supabase.co/auth/v1/.well-known/jwks.json"
ISSUER = "https://project.supabase.co/auth/v1"
AUDIENCE = "authenticated"


def test_defaults_are_local_development_values() -> None:
    settings = load_settings({})

    assert settings.app_env == "local"
    assert settings.auth_mode == "dev"
    assert settings.log_level == "INFO"
    assert settings.database_url == DEFAULT_DATABASE_URL
    assert settings.allowed_origins == ("http://localhost:3000",)
    assert settings.prediction_timeout_seconds == 5.0


def test_all_documented_variables_are_read() -> None:
    settings = load_settings(
        {
            "APP_ENV": "staging",
            "LOG_LEVEL": "debug",
            "DATABASE_URL": "postgresql+psycopg://u:p@db:5432/x",
            "ALLOWED_ORIGINS": "https://a.example, https://b.example",
            "AUTH_MODE": "supabase",
            "SUPABASE_URL": "https://project.supabase.co",
            "SUPABASE_JWT_JWKS_URL": "https://project.supabase.co/auth/v1/.well-known/jwks.json",
            "SUPABASE_JWT_ISSUER": "https://project.supabase.co/auth/v1",
            "SUPABASE_JWT_AUDIENCE": "authenticated",
            "MODEL_PATH": "ml/artifacts/dwell_model.joblib",
            "MODEL_VERSION": "dwell-rf-1.0.0",
            "PREDICTION_TIMEOUT_SECONDS": "2.5",
        }
    )

    assert settings.app_env == "staging"
    assert settings.log_level == "DEBUG"
    assert settings.allowed_origins == ("https://a.example", "https://b.example")
    assert settings.auth_mode == "supabase"
    assert settings.supabase_jwt_audience == "authenticated"
    assert settings.model_version == "dwell-rf-1.0.0"
    assert settings.prediction_timeout_seconds == 2.5


@pytest.mark.parametrize("app_env", ["staging", "production"])
def test_dev_auth_mode_refuses_to_start_outside_local(app_env: str) -> None:
    with pytest.raises(RuntimeError, match="AUTH_MODE=dev is not allowed"):
        load_settings({"APP_ENV": app_env, "AUTH_MODE": "dev"})


def test_database_url_is_required_outside_local() -> None:
    with pytest.raises(RuntimeError, match="DATABASE_URL is required"):
        load_settings(
            {
                "APP_ENV": "production",
                "AUTH_MODE": "supabase",
                "SUPABASE_JWT_JWKS_URL": JWKS_URL,
                "SUPABASE_JWT_ISSUER": ISSUER,
                "SUPABASE_JWT_AUDIENCE": AUDIENCE,
            }
        )


def test_render_postgres_url_uses_psycopg_driver() -> None:
    settings = load_settings({"DATABASE_URL": "postgresql://u:p@db:5432/portiq"})
    assert settings.database_url == "postgresql+psycopg://u:p@db:5432/portiq"


def test_supabase_settings_are_derived_from_the_project_url() -> None:
    settings = load_settings(
        {"AUTH_MODE": "supabase", "SUPABASE_URL": "https://project.supabase.co/"}
    )

    assert settings.supabase_jwt_jwks_url == JWKS_URL
    assert settings.supabase_jwt_issuer == ISSUER
    assert settings.supabase_jwt_audience == "authenticated"


def test_explicit_supabase_jwt_settings_win_over_derived_ones() -> None:
    settings = load_settings(
        {
            "AUTH_MODE": "supabase",
            "SUPABASE_URL": "https://project.supabase.co",
            "SUPABASE_JWT_JWKS_URL": "https://keys.example/jwks.json",
            "SUPABASE_JWT_ISSUER": "https://issuer.example",
            "SUPABASE_JWT_AUDIENCE": "custom",
        }
    )

    assert settings.supabase_jwt_jwks_url == "https://keys.example/jwks.json"
    assert settings.supabase_jwt_issuer == "https://issuer.example"
    assert settings.supabase_jwt_audience == "custom"


def test_supabase_mode_requires_jwt_settings() -> None:
    with pytest.raises(RuntimeError, match="SUPABASE_JWT_JWKS_URL"):
        load_settings(
            {
                "APP_ENV": "staging",
                "AUTH_MODE": "supabase",
                "DATABASE_URL": "postgresql+psycopg://u:p@db:5432/x",
            }
        )


@pytest.mark.parametrize(
    ("env", "message"),
    [
        ({"APP_ENV": "prod"}, "APP_ENV must be one of"),
        ({"AUTH_MODE": "none"}, "AUTH_MODE must be one of"),
        ({"LOG_LEVEL": "verbose"}, "LOG_LEVEL must be one of"),
        ({"ALLOWED_ORIGINS": "http://localhost:3000,*"}, "must not contain '\\*'"),
        ({"PREDICTION_TIMEOUT_SECONDS": "0"}, "must be greater than 0"),
        ({"PREDICTION_TIMEOUT_SECONDS": "soon"}, "must be a number"),
    ],
)
def test_invalid_values_fail_fast(env: dict[str, str], message: str) -> None:
    with pytest.raises(RuntimeError, match=message):
        load_settings(env)


def test_env_file_only_fills_missing_values(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    env_file = tmp_path / ".env"
    env_file.write_text(
        '# comment\n\nAUTH_MODE="supabase"\nSUPABASE_URL=https://project.supabase.co\n'
        "SUPABASE_JWT_AUDIENCE=stale\n",
        encoding="utf-8",
    )
    monkeypatch.delenv("APP_ENV", raising=False)
    monkeypatch.delenv("AUTH_MODE", raising=False)
    monkeypatch.setenv("SUPABASE_JWT_AUDIENCE", "authenticated")

    load_env_file(env_file)

    assert os.environ["AUTH_MODE"] == "supabase"
    assert os.environ["SUPABASE_URL"] == "https://project.supabase.co"
    assert os.environ["SUPABASE_JWT_AUDIENCE"] == "authenticated"


def test_env_file_is_ignored_in_tests(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    env_file = tmp_path / ".env"
    env_file.write_text("AUTH_MODE=supabase\n", encoding="utf-8")
    monkeypatch.setenv("APP_ENV", "test")
    monkeypatch.delenv("AUTH_MODE", raising=False)

    load_env_file(env_file)

    assert "AUTH_MODE" not in os.environ
