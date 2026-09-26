from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    project_name: str = "DevPulse"
    environment: str = "development"
    api_v1_prefix: str = "/api/v1"
    cors_origins: str = "http://localhost:5173"
    database_url: str = "postgresql+asyncpg://devpulse:devpulse@localhost:5433/devpulse"
    secret_key: str
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 30
    redis_url: str = "redis://localhost:6379/0"
    alert_ingest_api_key: str  # no default — fails fast, same reasoning as secret_key

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",")]


@lru_cache
def get_settings() -> Settings:
    return Settings()