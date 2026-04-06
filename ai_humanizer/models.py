from __future__ import annotations

from dataclasses import dataclass, field
from enum import StrEnum
from typing import Any


class ProviderType(StrEnum):
    GEMINI = "gemini"
    GROQ = "groq"
    OLLAMA = "ollama"

    @property
    def label(self) -> str:
        return {
            ProviderType.GEMINI: "Gemini",
            ProviderType.GROQ: "Groq",
            ProviderType.OLLAMA: "Ollama",
        }[self]


@dataclass(slots=True)
class TechniqueSettings:
    typo_insertion: bool = False
    punctuation_variation: bool = True
    organic_repetition: bool = False
    dynamic_formatting: bool = False


@dataclass(slots=True)
class ModelOption:
    provider: ProviderType
    model_id: str
    display_name: str
    supports_temperature: bool = True


@dataclass(slots=True)
class ProviderConfig:
    provider: ProviderType
    api_key: str | None = None
    base_url: str | None = None
    cloud_token: str | None = None


@dataclass(slots=True)
class HumanizeRequest:
    source_text: str
    voice_sample: str | None
    provider: ProviderType
    model_id: str
    temperature: float
    technique_settings: TechniqueSettings


@dataclass(slots=True)
class HumanizeResult:
    output_text: str
    audit_notes: list[str]
    usage_meta: dict[str, Any] | None = None


@dataclass(slots=True)
class MetricValue:
    label: str
    value: float
    detail: str


@dataclass(slots=True)
class AnalysisResult:
    detection_risk: float
    human_likeness: float
    metrics: dict[str, MetricValue]
    suggestions: list[str]
    provider_notes: list[str] | None = None


@dataclass(slots=True)
class ValidationResult:
    ok: bool
    message: str


@dataclass(slots=True)
class AppSettings:
    selected_provider: ProviderType = ProviderType.OLLAMA
    selected_model: str = ""
    ollama_base_url: str = "http://localhost:11434/api"
    temperature: float = 0.7
    technique_settings: TechniqueSettings = field(default_factory=TechniqueSettings)
    theme: str = "vintage-mono"
    window_geometry: str = ""


@dataclass(slots=True)
class LocalAnalysisSnapshot:
    result: AnalysisResult
    raw_signals: dict[str, float]
