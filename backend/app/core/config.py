from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    project_name: str = "DevPulse"
    environment: str = "development"
    api_v1_prefix: str = "/api/v1"
    cors_origins: str = "http://localhost:5173"
    database_url: str = "postgresql+asyncpg://devpulse:devpulse@localhost:5433/devpulse"
    secret_key: str ="6d02e15c0be30fe66a692d8201ce43b267a0319bec98146f36ed5413b80bf273"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 30

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",")]


@lru_cache
def get_settings() -> Settings:
    # cached so Settings() — which reads the .env file — only runs once per process
    return Settings()