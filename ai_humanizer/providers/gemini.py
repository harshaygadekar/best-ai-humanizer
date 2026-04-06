from __future__ import annotations

from typing import Any

from ai_humanizer.models import (
    AnalysisResult,
    HumanizeRequest,
    HumanizeResult,
    MetricValue,
    ModelOption,
    ProviderConfig,
    ProviderType,
    ValidationResult,
)
from ai_humanizer.providers.base import ProviderClient
from ai_humanizer.providers.http import request_json


class GeminiProvider(ProviderClient):
    DEFAULT_BASE_URL = "https://generativelanguage.googleapis.com/v1beta"

    def list_models(self, config: ProviderConfig) -> list[ModelOption]:
        validation = self.validate_config(config)
        if not validation.ok:
            return []

        payload = request_json(
            "GET",
            f"{self.DEFAULT_BASE_URL}/models",
            params={"key": config.api_key or ""},
        )
        models = []
        for item in payload.get("models", []):
            supported = item.get("supportedGenerationMethods") or item.get("supported_actions") or []
            if "generateContent" not in supported:
                continue
            base_model_id = item.get("baseModelId") or item.get("name", "").removeprefix("models/")
            if not base_model_id:
                continue
            models.append(
                ModelOption(
                    provider=ProviderType.GEMINI,
                    model_id=base_model_id,
                    display_name=f"Gemini / {base_model_id}",
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
        payload = self._generate(config, request.model_id, system_prompt, user_prompt, request.temperature)
        text = self._extract_text(payload)
        audit_notes = ["Two-pass humanization completed via Gemini."]
        usage = payload.get("usageMetadata", {})
        return HumanizeResult(output_text=text, audit_notes=audit_notes, usage_meta=usage)

    def analyze(
        self,
        config: ProviderConfig,
        model_id: str,
        system_prompt: str,
        user_prompt: str,
    ) -> AnalysisResult:
        payload = self._generate(config, model_id, system_prompt, user_prompt, 0.3, analysis_mode=True)
        content = self._extract_text(payload)
        lines = [line.strip("- ").strip() for line in content.splitlines() if line.strip()]
        return AnalysisResult(
            detection_risk=0.0,
            human_likeness=0.0,
            metrics={},
            suggestions=[],
            provider_notes=lines or ["Gemini analysis completed."],
        )

    def validate_config(self, config: ProviderConfig) -> ValidationResult:
        if not config.api_key:
            return ValidationResult(False, "Gemini API key is required.")
        return ValidationResult(True, "Gemini ready.")

    def _generate(
        self,
        config: ProviderConfig,
        model_id: str,
        system_prompt: str,
        user_prompt: str,
        temperature: float,
        analysis_mode: bool = False,
    ) -> dict[str, Any]:
        return request_json(
            "POST",
            f"{self.DEFAULT_BASE_URL}/models/{model_id}:generateContent",
            params={"key": config.api_key or ""},
            json_body={
                "systemInstruction": {
                    "parts": [{"text": system_prompt}],
                },
                "contents": [
                    {
                        "role": "user",
                        "parts": [{"text": user_prompt}],
                    }
                ],
                "generationConfig": {
                    "temperature": temperature,
                    "topP": 0.95,
                    "maxOutputTokens": 2048 if analysis_mode else 4096,
                },
            },
        )

    def _extract_text(self, payload: dict[str, Any]) -> str:
        candidates = payload.get("candidates", [])
        if not candidates:
            raise RuntimeError("Gemini returned no candidates.")
        parts = candidates[0].get("content", {}).get("parts", [])
        text = "\n".join(part.get("text", "") for part in parts if part.get("text"))
        if not text.strip():
            raise RuntimeError("Gemini returned an empty response.")
        return text.strip()
