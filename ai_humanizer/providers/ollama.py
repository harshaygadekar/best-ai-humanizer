from __future__ import annotations

from ai_humanizer.models import (
    AnalysisResult,
    HumanizeRequest,
    HumanizeResult,
    ModelOption,
    ProviderConfig,
    ProviderType,
    ValidationResult,
)
from ai_humanizer.providers.base import ProviderClient
from ai_humanizer.providers.http import request_json


class OllamaProvider(ProviderClient):
    DEFAULT_BASE_URL = "http://localhost:11434/api"
    KEEP_ALIVE = "15m"

    def list_models(self, config: ProviderConfig) -> list[ModelOption]:
        payload = request_json(
            "GET",
            f"{self._base_url(config)}/tags",
            headers=self._headers(config),
            timeout=20,
        )
        models = []
        for item in payload.get("models", []):
            model_id = item.get("model") or item.get("name")
            if not model_id:
                continue
            models.append(
                ModelOption(
                    provider=ProviderType.OLLAMA,
                    model_id=model_id,
                    display_name=f"Ollama / {model_id}",
                )
            )
        return sorted(models, key=lambda model: model.display_name.lower())

    def humanize(
        self,
        config: ProviderConfig,
        request: HumanizeRequest,
        system_prompt: str,
        user_prompt: str,
    ) -> HumanizeResult:
        payload = request_json(
            "POST",
            f"{self._base_url(config)}/generate",
            headers=self._headers(config),
            json_body={
                "model": request.model_id,
                "system": system_prompt,
                "prompt": user_prompt,
                "stream": False,
                "format": "json",
                "think": self._think_setting(request.model_id),
                "keep_alive": self.KEEP_ALIVE,
                "options": {
                    "temperature": request.temperature,
                },
            },
        )
        usage = {
            key: payload[key]
            for key in (
                "total_duration",
                "load_duration",
                "prompt_eval_count",
                "eval_count",
                "eval_duration",
            )
            if key in payload
        }
        return HumanizeResult(
            output_text=payload.get("response", "").strip(),
            audit_notes=["Two-pass humanization completed via Ollama."],
            usage_meta=usage,
        )

    def analyze(
        self,
        config: ProviderConfig,
        model_id: str,
        system_prompt: str,
        user_prompt: str,
    ) -> AnalysisResult:
        payload = request_json(
            "POST",
            f"{self._base_url(config)}/generate",
            headers=self._headers(config),
            json_body={
                "model": model_id,
                "system": system_prompt,
                "prompt": user_prompt,
                "stream": False,
                "think": self._think_setting(model_id),
                "keep_alive": self.KEEP_ALIVE,
                "options": {"temperature": 0.1},
            },
        )
        notes = [
            line.strip("- ").strip()
            for line in payload.get("response", "").splitlines()
            if line.strip()
        ]
        return AnalysisResult(
            detection_risk=0.0,
            human_likeness=0.0,
            metrics={},
            suggestions=[],
            provider_notes=notes or ["Ollama analysis completed."],
        )

    def validate_config(self, config: ProviderConfig) -> ValidationResult:
        return ValidationResult(True, "Ollama ready.")

    def _base_url(self, config: ProviderConfig) -> str:
        return (config.base_url or self.DEFAULT_BASE_URL).rstrip("/")

    def _headers(self, config: ProviderConfig) -> dict[str, str]:
        headers = {"Content-Type": "application/json"}
        if config.cloud_token:
            headers["Authorization"] = f"Bearer {config.cloud_token}"
        return headers

    def _think_setting(self, model_id: str):
        lowered = model_id.lower()
        if "gpt-oss" in lowered:
            return "low"
        return False
