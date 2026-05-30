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

    @property
    def data_root_path(self) -> Path:
        return Path(self.data_root).resolve()

    @property
    def has_llm(self) -> bool:
        return bool(self.openrouter_api_key.strip())


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
