from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from ai_humanizer.core.analyzer import LocalTextAnalyzer
from ai_humanizer.core.prompting import PromptBuilder
from ai_humanizer.models import (
    AnalysisResult,
    HumanizeRequest,
    HumanizeResult,
    LocalAnalysisSnapshot,
    ModelOption,
    ProviderConfig,
    ProviderType,
)
from ai_humanizer.providers.factory import ProviderRegistry
from ai_humanizer.storage.settings import SecretStore, SettingsStore


@dataclass(slots=True)
class HumanizeWorkflowResult:
    rewrite: HumanizeResult
    local_analysis: LocalAnalysisSnapshot
    ai_analysis_notes: list[str]


class HumanizerService:
    def __init__(
        self,
        prompt_path: Path,
        registry: ProviderRegistry | None = None,
        analyzer: LocalTextAnalyzer | None = None,
        settings_store: SettingsStore | None = None,
        secret_store: SecretStore | None = None,
    ) -> None:
        self.prompt_builder = PromptBuilder(prompt_path)
        self.registry = registry or ProviderRegistry()
        self.analyzer = analyzer or LocalTextAnalyzer()
        self.settings_store = settings_store or SettingsStore()
        self.secret_store = secret_store or SecretStore()

    def analyze_text(self, text: str) -> LocalAnalysisSnapshot:
        return self.analyzer.analyze(text)

    def list_models(self, provider: ProviderType, config: ProviderConfig) -> list[ModelOption]:
        client = self.registry.get(provider)
        return client.list_models(config)

    def humanize(self, request: HumanizeRequest, config: ProviderConfig) -> HumanizeWorkflowResult:
        client = self.registry.get(request.provider)
        validation = client.validate_config(config)
        if not validation.ok:
            raise RuntimeError(validation.message)

        prompts = self.prompt_builder.build_humanize_prompt(request)
        provider_result = client.humanize(config, request, prompts.system_prompt, prompts.user_prompt)
        final_text, remaining_tells = self.prompt_builder.parse_humanize_response(provider_result.output_text)
        rewrite = HumanizeResult(
            output_text=final_text,
            audit_notes=remaining_tells or provider_result.audit_notes,
            usage_meta=provider_result.usage_meta,
        )
        local_snapshot = self.analyzer.analyze(final_text)
        ai_notes = self._analyze_with_provider(
            provider=request.provider,
            model_id=request.model_id,
            config=config,
            text=final_text,
            local_snapshot=local_snapshot,
        )
        return HumanizeWorkflowResult(rewrite=rewrite, local_analysis=local_snapshot, ai_analysis_notes=ai_notes)

    def analyze_with_provider(
        self,
        provider: ProviderType,
        model_id: str,
        config: ProviderConfig,
        text: str,
    ) -> AnalysisResult:
        local_snapshot = self.analyzer.analyze(text)
        notes = self._analyze_with_provider(provider, model_id, config, text, local_snapshot)
        result = local_snapshot.result
        return AnalysisResult(
            detection_risk=result.detection_risk,
            human_likeness=result.human_likeness,
            metrics=result.metrics,
            suggestions=result.suggestions,
            provider_notes=notes,
        )

    def _analyze_with_provider(
        self,
        provider: ProviderType,
        model_id: str,
        config: ProviderConfig,
        text: str,
        local_snapshot: LocalAnalysisSnapshot,
    ) -> list[str]:
        client = self.registry.get(provider)
        validation = client.validate_config(config)
        if not validation.ok:
            return [validation.message]

        prompts = self.prompt_builder.build_analysis_prompt(
            text=text,
            local_summary=self.analyzer.summarize(local_snapshot),
            model_id=model_id,
        )
        response = client.analyze(config, model_id, prompts.system_prompt, prompts.user_prompt)
        return response.provider_notes or []
