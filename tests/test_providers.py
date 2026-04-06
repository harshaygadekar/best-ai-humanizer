import unittest
from unittest.mock import patch

from ai_humanizer.models import ProviderConfig, ProviderType
from ai_humanizer.providers.gemini import GeminiProvider
from ai_humanizer.providers.groq import GroqProvider
from ai_humanizer.providers.ollama import OllamaProvider


class ProviderTests(unittest.TestCase):
    @patch("ai_humanizer.providers.gemini.request_json")
    def test_gemini_model_labels_include_provider(self, mock_request) -> None:
        mock_request.return_value = {
            "models": [
                {"name": "models/gemini-2.5-pro", "supportedGenerationMethods": ["generateContent"]},
            ]
        }
        models = GeminiProvider().list_models(ProviderConfig(provider=ProviderType.GEMINI, api_key="key"))
        self.assertEqual("Gemini / gemini-2.5-pro", models[0].display_name)

    @patch("ai_humanizer.providers.groq.request_json")
    def test_groq_model_labels_include_provider(self, mock_request) -> None:
        mock_request.return_value = {"data": [{"id": "llama-3.3-70b-versatile"}]}
        models = GroqProvider().list_models(ProviderConfig(provider=ProviderType.GROQ, api_key="key"))
        self.assertEqual("Groq / llama-3.3-70b-versatile", models[0].display_name)

    @patch("ai_humanizer.providers.ollama.request_json")
    def test_ollama_model_labels_include_provider(self, mock_request) -> None:
        mock_request.return_value = {"models": [{"name": "qwen2.5:14b"}]}
        models = OllamaProvider().list_models(ProviderConfig(provider=ProviderType.OLLAMA))
        self.assertEqual("Ollama / qwen2.5:14b", models[0].display_name)


if __name__ == "__main__":
    unittest.main()
