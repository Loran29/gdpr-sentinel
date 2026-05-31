"""Settings loader. Reads .env once and exposes a singleton."""

from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    openrouter_api_key: str = ""
    openrouter_model: str = "anthropic/claude-haiku-4.5"
    openrouter_base_url: str = "https://openrouter.ai/api/v1"
    data_root: str = "./data"
    master_of_data_config: str = "./master_of_data.yaml"

    database_url: str = "sqlite:///./gdpr_sentinel.db"

    delta_scan_interval_minutes: int = 0

    # Azure AD / Microsoft Graph OAuth
    azure_client_id: str = ""
    azure_client_secret: str = ""
    azure_tenant_id: str = "common"
    azure_redirect_uri: str = "http://localhost:8000/auth/callback"

    @property
    def data_root_path(self) -> Path:
        return Path(self.data_root).resolve()

    @property
    def has_llm(self) -> bool:
        return bool(self.openrouter_api_key.strip())

    @property
    def has_azure(self) -> bool:
        return bool(self.azure_client_id.strip() and self.azure_client_secret.strip())


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
