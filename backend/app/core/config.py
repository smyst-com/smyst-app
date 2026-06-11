from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_name: str = "smyst"
    app_env: str = "local"
    api_version: str = "v1"
    public_base_url: str = "http://localhost:3000"

    database_url: str = Field(
        default="postgresql+asyncpg://smyst:smyst_dev_password@postgres:5432/smyst",
        validation_alias="DATABASE_URL",
    )
    redis_url: str = Field(default="redis://redis:6379/0", validation_alias="REDIS_URL")

    idrive_e2_endpoint: str = Field(
        default="https://s3.eu-central-1.idrivee2.com",
        validation_alias="IDRIVE_E2_ENDPOINT",
    )
    idrive_e2_bucket: str = Field(default="smyst-private", validation_alias="IDRIVE_E2_BUCKET")
    idrive_e2_region: str = Field(default="eu-central-1", validation_alias="IDRIVE_E2_REGION")
    idrive_e2_access_key: str | None = Field(default=None, validation_alias="IDRIVE_E2_ACCESS_KEY")
    idrive_e2_secret_key: str | None = Field(default=None, validation_alias="IDRIVE_E2_SECRET_KEY")

    auth_session_secret: str = Field(
        default="replace-with-48-byte-random-secret",
        validation_alias="AUTH_SESSION_SECRET",
    )

    cors_origin_raw: str = Field(default="http://localhost:3000", validation_alias="CORS_ORIGINS")
    csp_report_only: bool = Field(default=False, validation_alias="CSP_REPORT_ONLY")
    csp_report_uri: str = Field(default="/api/v1/security/csp-report", validation_alias="CSP_REPORT_URI")
    rate_limit_requests: int = Field(default=120, validation_alias="RATE_LIMIT_REQUESTS")
    rate_limit_window_seconds: int = Field(default=60, validation_alias="RATE_LIMIT_WINDOW_SECONDS")

    @property
    def cors_origins(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origin_raw.split(",") if origin.strip()]

    @property
    def content_security_policy(self) -> str:
        return "; ".join(
            [
                "default-src 'self'",
                "base-uri 'self'",
                "frame-ancestors 'none'",
                "object-src 'none'",
                "form-action 'self'",
                "img-src 'self' data: https:",
                "font-src 'self' data:",
                "style-src 'self' 'unsafe-inline'",
                "script-src 'self'",
                "connect-src 'self' https:",
                f"report-uri {self.csp_report_uri}",
            ]
        )


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
