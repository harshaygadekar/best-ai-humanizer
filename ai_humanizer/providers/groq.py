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


class GroqProvider(ProviderClient):
    BASE_URL = "https://api.groq.com/openai/v1"

    def list_models(self, config: ProviderConfig) -> list[ModelOption]:
        validation = self.validate_config(config)
        if not validation.ok:
            return []
        payload = request_json(
            "GET",
            f"{self.BASE_URL}/models",
            headers=self._headers(config),
        )
        models = []
        for item in payload.get("data", []):
            model_id = item.get("id", "")
            if not model_id:
                continue
            models.append(
                ModelOption(
                    provider=ProviderType.GROQ,
                    model_id=model_id,
                    display_name=f"Groq / {model_id}",
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
        payload = self._chat(config, request.model_id, system_prompt, user_prompt, request.temperature)
        message = payload["choices"][0]["message"]["content"].strip()
        usage = payload.get("usage", {})
        return HumanizeResult(
            output_text=message,
            audit_notes=["Two-pass humanization completed via Groq."],
            usage_meta=usage,
        )

    def analyze(
        self,
        config: ProviderConfig,
        model_id: str,
        system_prompt: str,
        user_prompt: str,
    ) -> AnalysisResult:
        payload = self._chat(config, model_id, system_prompt, user_prompt, 0.2)
        content = payload["choices"][0]["message"]["content"].strip()
        notes = [line.strip("- ").strip() for line in content.splitlines() if line.strip()]
        return AnalysisResult(
            detection_risk=0.0,
            human_likeness=0.0,
            metrics={},
            suggestions=[],
            provider_notes=notes or ["Groq analysis completed."],
        )

    def validate_config(self, config: ProviderConfig) -> ValidationResult:
        if not config.api_key:
            return ValidationResult(False, "Groq API key is required.")
        return ValidationResult(True, "Groq ready.")

    def _chat(
        self,
        config: ProviderConfig,
        model_id: str,
        system_prompt: str,
        user_prompt: str,
        temperature: float,
    ) -> dict:
        return request_json(
            "POST",
            f"{self.BASE_URL}/chat/completions",
            headers=self._headers(config),
            json_body={
                "model": model_id,
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
                "temperature": temperature,
            },
        )

    def _headers(self, config: ProviderConfig) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {config.api_key or ''}",
            "Content-Type": "application/json",
        }
