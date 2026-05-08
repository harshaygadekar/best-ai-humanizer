from pathlib import Path
import unittest

from ai_humanizer.core.prompting import PromptBuilder
from ai_humanizer.models import HumanizeRequest, ProviderType, TechniqueSettings


class PromptBuilderTests(unittest.TestCase):
    def setUp(self) -> None:
        self.builder = PromptBuilder(
            Path(__file__).resolve().parents[1] / "ai_humanizer" / "resources" / "system-prompt-example1.md"
        )

    def test_humanize_prompt_includes_voice_and_techniques(self) -> None:
        request = HumanizeRequest(
            source_text="This is very important and showcases a pivotal shift.",
            voice_sample="I usually write in shorter paragraphs. I keep it blunt.",
            provider=ProviderType.OLLAMA,
            model_id="qwen2.5:14b",
            temperature=0.7,
            technique_settings=TechniqueSettings(
                typo_insertion=True,
                punctuation_variation=True,
                organic_repetition=False,
                dynamic_formatting=True,
            ),
        )

        package = self.builder.build_humanize_prompt(request)

        self.assertIn("Voice matching reference", package.system_prompt)
        self.assertIn("Allow at most one subtle typo-like touch", package.system_prompt)
        self.assertIn("Vary paragraph size and line breaks", package.system_prompt)
        self.assertIn("This is very important", package.user_prompt)

    def test_parse_humanize_response_splits_remaining_tells(self) -> None:
        raw = "FINAL VERSION\nClean rewrite.\n\nREMAINING TELLS\n- still a bit tidy\n- too polished"
        text, tells = self.builder.parse_humanize_response(raw)
        self.assertEqual("Clean rewrite.", text)
        self.assertEqual(["still a bit tidy", "too polished"], tells)

    def test_parse_humanize_response_handles_json_and_remnant_variant(self) -> None:
        raw = '{"final_text":"A more human rewrite.","remaining_tells":["slightly tidy ending"]}'
        text, tells = self.builder.parse_humanize_response(raw)
        self.assertEqual("A more human rewrite.", text)
        self.assertEqual(["slightly tidy ending"], tells)

        variant = "A more human rewrite.\n\nREMNANT TELLS: None detected"
        text, tells = self.builder.parse_humanize_response(variant)
        self.assertEqual("A more human rewrite.", text)
        self.assertEqual([], tells)


if __name__ == "__main__":
    unittest.main()
