from __future__ import annotations

import re
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

from ai_humanizer.models import HumanizeRequest, TechniqueSettings


@dataclass(slots=True)
class PromptPackage:
    system_prompt: str
    user_prompt: str


class PromptBuilder:
    def __init__(self, prompt_path: Path) -> None:
        self.prompt_path = prompt_path

    def build_humanize_prompt(self, request: HumanizeRequest) -> PromptPackage:
        technique_lines = self._technique_lines(request.technique_settings)
        reference_digest = self._reference_digest(self.prompt_path)
        voice_section = ""
        if request.voice_sample and request.voice_sample.strip():
            voice_section = (
                "\nVoice matching reference:\n"
                "Use the sample below to match rhythm, punctuation habits, paragraph shape, and formality.\n"
                "--- VOICE SAMPLE START ---\n"
                f"{request.voice_sample.strip()}\n"
                "--- VOICE SAMPLE END ---\n"
            )

        system_prompt = f"""
You are an expert humanization editor for personal local use.

Goal:
- Rewrite text so it reads as naturally human-written, with heavy anti-AI cleanup, while preserving the original meaning and useful structure.
- Keep the writing grounded, specific, and believable.
- Sound like a person with texture, not a chatbot trying to sound polished.

Core rules:
- Remove inflated significance, fake grandeur, promotional language, vague authority, tutorial signposting, filler, and overexplained transitions.
- Prefer direct verbs, simple syntax, and specific details over padded abstraction.
- Break overly tidy cadence. Vary sentence length. Allow occasional asymmetry and light roughness.
- Cut em-dash overuse, rule-of-three phrasing, repetitive synonyms, hedging clusters, and canned "AI vocabulary."
- Preserve the user's apparent intent, factual meaning, and tone target.
- Do not add citations, studies, names, or facts that were not present in the source.
- Avoid sounding sterile. Use selective informality where it fits. Human writing can be slightly uneven.

Technique controls:
{technique_lines}

Reference digest derived from the bundled anti-AI writing guide:
{reference_digest}
{voice_section}
Process:
1. Rewrite the text into a strong first draft.
2. Audit the draft by asking: "What still sounds AI-generated here?"
3. Revise once more and return only:
   - FINAL VERSION
   - REMAINING TELLS
""".strip()

        user_prompt = f"""
Humanize the following text.

Constraints:
- Meaning must stay intact.
- Default mode is heavy but faithful rewriting.
- If the source is informal, keep it informal.
- If the source is structured, keep it readable but less robotic.
- Use straight quotes.

Source text:
--- SOURCE START ---
{request.source_text.strip()}
--- SOURCE END ---
""".strip()
        return PromptPackage(system_prompt=system_prompt, user_prompt=user_prompt)

    def build_analysis_prompt(self, text: str, local_summary: str, model_id: str) -> PromptPackage:
        system_prompt = f"""
You are analyzing text for AI-detection risk and human-likeness.

Return concise plain-text sections:
Detection risk:
- ...

Human-likeness:
- ...

Suggestions:
- ...

Focus on:
- remaining AI tells
- rhythm and sentence-shape issues
- filler or overformal language
- punctuation naturalness
- whether the text feels too neat or too synthetic

Model context: {model_id}
Local heuristic snapshot:
{local_summary}
""".strip()

        user_prompt = f"""
Analyze this text and explain what still sounds synthetic.

Text:
--- TEXT START ---
{text.strip()}
--- TEXT END ---
""".strip()
        return PromptPackage(system_prompt=system_prompt, user_prompt=user_prompt)

    def parse_humanize_response(self, raw_text: str) -> tuple[str, list[str]]:
        sections = re.split(r"(?im)^remaining tells\s*:?\s*$", raw_text)
        if len(sections) == 1:
            text = raw_text.strip()
            return text, []

        final_text = re.sub(r"(?im)^final version\s*:?\s*$", "", sections[0]).strip()
        tells = [line.strip("- ").strip() for line in sections[1].splitlines() if line.strip()]
        return final_text, tells

    def _technique_lines(self, settings: TechniqueSettings) -> str:
        enabled = []
        if settings.typo_insertion:
            enabled.append("- Allow subtle, rare typo-like texture only when it feels believable and does not break readability.")
        if settings.punctuation_variation:
            enabled.append("- Vary punctuation naturally. Do not fall into perfectly regular comma patterns.")
        if settings.organic_repetition:
            enabled.append("- Allow small amounts of natural repetition or callback phrasing when it strengthens a human voice.")
        if settings.dynamic_formatting:
            enabled.append("- Vary paragraph size and line breaks when it helps the text feel less machine-leveled.")
        if not enabled:
            enabled.append("- Keep formatting clean and natural without forcing extra quirks.")
        return "\n".join(enabled)

    @staticmethod
    @lru_cache(maxsize=1)
    def _reference_digest(prompt_path: Path) -> str:
        text = prompt_path.read_text(encoding="utf-8")
        headings = re.findall(r"^###\s+(.+)$", text, flags=re.MULTILINE)
        selected = headings[:10]
        digest = "; ".join(selected)
        return (
            "Remove common AI tells such as "
            f"{digest}. Also favor active voice, specific claims, simpler copulas, fewer bold/list theatrics, "
            "and endings that sound grounded instead of cheerfully generic."
        )
