"""B01: configuration is read from the fixed environment variables and fails fast."""

from __future__ import annotations

import pytest

from app.core.config import DEFAULT_DATABASE_URL, load_settings

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
