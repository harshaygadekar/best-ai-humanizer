from __future__ import annotations

from abc import ABC, abstractmethod

from ai_humanizer.models import (
    AnalysisResult,
    HumanizeRequest,
    HumanizeResult,
    ModelOption,
    ProviderConfig,
    ValidationResult,
)


class ProviderClient(ABC):
    @abstractmethod
    def list_models(self, config: ProviderConfig) -> list[ModelOption]:
        raise NotImplementedError

    @abstractmethod
    def humanize(
        self,
        config: ProviderConfig,
        request: HumanizeRequest,
        system_prompt: str,
        user_prompt: str,
    ) -> HumanizeResult:
        raise NotImplementedError

    @abstractmethod
    def analyze(
        self,
        config: ProviderConfig,
        model_id: str,
        system_prompt: str,
        user_prompt: str,
    ) -> AnalysisResult:
        raise NotImplementedError

    @abstractmethod
    def validate_config(self, config: ProviderConfig) -> ValidationResult:
        raise NotImplementedError
