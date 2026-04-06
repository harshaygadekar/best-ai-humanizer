from __future__ import annotations

import json
import os
from dataclasses import asdict
from pathlib import Path
from typing import Any

from ai_humanizer.models import AppSettings, ProviderType, TechniqueSettings

try:
    import keyring
except ImportError:  # pragma: no cover - runtime fallback until dependency is installed
    keyring = None


class AppPaths:
    APP_NAME = "AIHumanizer"

    @classmethod
    def config_dir(cls) -> Path:
        override = os.environ.get("AI_HUMANIZER_HOME", "").strip()
        candidates = []
        if override:
            candidates.append(Path(override))
        candidates.extend(
            [
                Path.home() / "AppData" / "Roaming" / cls.APP_NAME,
                Path.cwd() / ".ai-humanizer-data",
            ]
        )
        for root in candidates:
            try:
                root.mkdir(parents=True, exist_ok=True)
            except PermissionError:
                continue
            return root
        raise PermissionError("Unable to create a writable settings directory.")

    @classmethod
    def settings_file(cls) -> Path:
        return cls.config_dir() / "settings.json"


class SettingsStore:
    def __init__(self, path: Path | None = None) -> None:
        self.path = path or AppPaths.settings_file()

    def load(self) -> AppSettings:
        if not self.path.exists():
            return AppSettings()

        data = json.loads(self.path.read_text(encoding="utf-8"))
        techniques = TechniqueSettings(**data.get("technique_settings", {}))
        selected_provider = ProviderType(data.get("selected_provider", ProviderType.OLLAMA))
        return AppSettings(
            selected_provider=selected_provider,
            selected_model=data.get("selected_model", ""),
            ollama_base_url=data.get("ollama_base_url", "http://localhost:11434/api"),
            temperature=float(data.get("temperature", 0.7)),
            technique_settings=techniques,
            theme=data.get("theme", "vintage-mono"),
            window_geometry=data.get("window_geometry", ""),
        )

    def save(self, settings: AppSettings) -> None:
        payload: dict[str, Any] = asdict(settings)
        payload["selected_provider"] = settings.selected_provider.value
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.path.write_text(json.dumps(payload, indent=2), encoding="utf-8")


class SecretStore:
    SERVICE_NAME = "AIHumanizer"

    def __init__(self) -> None:
        self._fallback: dict[str, str] = {}

    def _credential_name(self, provider: ProviderType, field: str) -> str:
        return f"{provider.value}:{field}"

    def get(self, provider: ProviderType, field: str) -> str:
        key = self._credential_name(provider, field)
        if keyring is None:
            return self._fallback.get(key, "")
        value = keyring.get_password(self.SERVICE_NAME, key)
        return value or ""

    def set(self, provider: ProviderType, field: str, value: str) -> None:
        key = self._credential_name(provider, field)
        if keyring is None:
            self._fallback[key] = value
            return
        if value:
            keyring.set_password(self.SERVICE_NAME, key, value)
        else:
            try:
                keyring.delete_password(self.SERVICE_NAME, key)
            except keyring.errors.PasswordDeleteError:
                pass
