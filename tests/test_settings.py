import unittest
from pathlib import Path
from unittest.mock import patch

from ai_humanizer.models import AppSettings, ProviderType, TechniqueSettings
from ai_humanizer.storage.settings import SecretStore, SettingsStore


class SettingsTests(unittest.TestCase):
    def test_settings_round_trip(self) -> None:
        base = Path(__file__).resolve().parents[1] / ".tmp-tests"
        base.mkdir(exist_ok=True)
        path = base / "settings.json"
        store = SettingsStore(path)
        expected = AppSettings(
            selected_provider=ProviderType.GROQ,
            selected_model="llama-3.3-70b-versatile",
            ollama_base_url="http://localhost:11434/api",
            temperature=0.5,
            technique_settings=TechniqueSettings(True, True, True, False),
            theme="vintage-mono",
            window_geometry="beef",
        )
        store.save(expected)
        loaded = store.load()

        self.assertEqual(expected.selected_provider, loaded.selected_provider)
        self.assertEqual(expected.selected_model, loaded.selected_model)
        self.assertTrue(loaded.technique_settings.organic_repetition)

    @patch("ai_humanizer.storage.settings.keyring", None)
    def test_secret_store_falls_back_without_keyring(self) -> None:
        store = SecretStore()
        store.set(ProviderType.GEMINI, "api_key", "abc123")
        self.assertEqual("abc123", store.get(ProviderType.GEMINI, "api_key"))


if __name__ == "__main__":
    unittest.main()
