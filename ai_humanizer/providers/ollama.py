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

    def list_models(self, config: ProviderConfig) -> list[ModelOption]:
        payload = request_json("GET", f"{self._base_url(config)}/tags", timeout=20)
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
            json_body={
                "model": request.model_id,
                "system": system_prompt,
                "prompt": user_prompt,
                "stream": False,
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
            json_body={
                "model": model_id,
                "system": system_prompt,
                "prompt": user_prompt,
                "stream": False,
                "options": {"temperature": 0.2},
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
