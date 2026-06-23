# ============================================================
# backend/app/app/core/settings.py
# ============================================================
#
# Purpose:
#   Centralised application settings. All configuration values
#   are read from environment variables via pydantic-settings.
#   A single `get_settings()` call returns the singleton; it is
#   cached after first call so the .env file is parsed once.
#
# Design:
#   pydantic-settings reads from .env automatically when
#   `env_file` is set. Environment variables take precedence
#   over the file values so Docker and CI can override without
#   editing .env.
#
# Consumed by:
#   - backend/app/main.py (CORS origins, debug flag)
#   - backend/app/app/core/database.py (DATABASE_URL)
#   - backend/app/app/core/security.py (JWT config)
#   - backend/app/app/integrations/r2.py (R2 config)
#   - backend/app/app/integrations/resend_client.py (Resend key)
#   - backend/app/app/auth/services/sso_service.py (MS SSO config)
# ============================================================

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict

# ==================================================
# SETTINGS MODEL
# ==================================================


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # ------------------------------ Application --------------------------------
    app_env: str = "development"
    app_secret_key: str
    app_debug: bool = False

    # ------------------------------ Database -----------------------------------
    database_url: str

    # ------------------------------ JWT ----------------------------------------
    jwt_algorithm: str = "HS256"
    jwt_access_token_expire_minutes: int = 30
    jwt_refresh_token_expire_days: int = 30

    # ------------------------------ Cloudflare R2 ------------------------------
    r2_account_id: str = ""
    r2_access_key_id: str = ""
    r2_secret_access_key: str = ""
    r2_bucket_name: str = "sovcore-auto"
    r2_public_url: str = ""

    # ------------------------------ Resend ------------------------------------
    resend_api_key: str = ""
    resend_from_address: str = "noreply@sovcore.com"

    # ------------------------------ Microsoft SSO (OpenID Connect) ------------
    ms_tenant_id: str = "common"
    ms_client_id: str = ""
    ms_client_secret: str = ""
    ms_redirect_uri: str = "http://localhost:8000/api/v1/auth/sso/microsoft/callback"

    # ------------------------------ CORS --------------------------------------
    cors_origins: str = "http://localhost:3000"

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


# ==================================================
# SINGLETON
# ==================================================

# lru_cache(maxsize=1) means the Settings object is built once
# and reused across all callers — avoids repeated .env parsing.
@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
