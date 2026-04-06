from __future__ import annotations

from ai_humanizer.models import ProviderType
from ai_humanizer.providers.base import ProviderClient
from ai_humanizer.providers.gemini import GeminiProvider
from ai_humanizer.providers.groq import GroqProvider
from ai_humanizer.providers.ollama import OllamaProvider


class ProviderRegistry:
    def __init__(self) -> None:
        self._providers: dict[ProviderType, ProviderClient] = {
            ProviderType.GEMINI: GeminiProvider(),
            ProviderType.GROQ: GroqProvider(),
            ProviderType.OLLAMA: OllamaProvider(),
        }

    def get(self, provider: ProviderType) -> ProviderClient:
        return self._providers[provider]
