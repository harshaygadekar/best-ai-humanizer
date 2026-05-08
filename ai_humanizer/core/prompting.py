from __future__ import annotations

import json
import re
from ast import literal_eval
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
You are an expert rewrite editor for AI-assisted text humanization.

Goal:
- Rewrite text so it sounds like a real person wrote it.
- Heavy humanization is required, but the original meaning and factual claims must stay intact.
- Make the writing sound lived-in, specific, and natural rather than polished into generic "good prose."

Core rules:
- Do a real rewrite, not light cleanup. If the output mostly mirrors the source with tiny edits, that is a failure.
- Remove inflated significance, fake grandeur, vague authority, tutorial signposting, filler, and overexplained transitions.
- Prefer direct verbs, natural sentence openings, and concrete wording over compressed noun stacks.
- Break overly tidy cadence. Vary sentence length and paragraph shape. Avoid three neat summary sentences in a row.
- Cut em-dash overuse, rule-of-three phrasing, repetitive synonyms, hedging clusters, and canned AI vocabulary.
- For short technical blurbs, unpack the compressed pitch-deck style into natural prose while keeping key technical terms.
- Keep named entities, pipeline names, counts, and claims unless the source itself is unclear.
- Do not add citations, studies, names, or facts that were not present in the source.
- Avoid sounding sterile. Selective informality is good when it fits. Human writing can be slightly uneven.
- Never include labels like FINAL VERSION, REMAINING TELLS, NOTES, or any audit commentary in the final prose.

Technique controls:
{technique_lines}

Reference digest derived from the bundled anti-AI writing guide:
{reference_digest}
{voice_section}
Process:
1. Draft a substantially more human version.
2. Audit it privately for anything that still sounds synthetic.
3. Revise once more.
4. Return only a JSON object with this exact shape:
   {{"final_text":"...","remaining_tells":["..."]}}
5. Do not wrap the JSON in markdown fences.
""".strip()

        user_prompt = f"""
Humanize the following text.

Constraints:
- Meaning must stay intact.
- Default mode is heavy but faithful rewriting.
- If the source is informal, keep it informal.
- If the source is structured, keep it readable but less robotic.
- Use straight quotes.
- If the source is short, do not be timid. Humanize it enough that the sentence structure clearly changes.
- If the source sounds like a product blurb or abstract, make it sound more like a person explaining the same thing.

Source text:
--- SOURCE START ---
{request.source_text.strip()}
--- SOURCE END ---
""".strip()
        return PromptPackage(system_prompt=system_prompt, user_prompt=user_prompt)

    def build_analysis_prompt(self, text: str, local_summary: str, model_id: str) -> PromptPackage:
        system_prompt = f"""
You are analyzing text for AI-detection risk and human-likeness.

Return concise plain-text sections using short lines only:
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

Constraints:
- No markdown bold.
- No code fences.
- Keep it short.
- Do not restate the whole passage.

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
        cleaned = self._strip_wrappers(raw_text)
        payload = self._extract_json_payload(cleaned)
        if payload is not None:
            final_text = self._clean_final_text(str(payload.get("final_text", "")).strip())
            tells = self._normalize_tells(payload.get("remaining_tells", []))
            if final_text:
                return final_text, tells

        sections = re.split(
            r"(?is)\b(?:rem(?:aining|nant)\s+tells?|remaining ai tells|audit(?:\s+notes)?|what still sounds ai-generated)\b\s*:?",
            cleaned,
            maxsplit=1,
        )
        final_text = self._clean_final_text(sections[0])
        tells = self._normalize_tells(sections[1].splitlines() if len(sections) > 1 else [])
        return final_text or cleaned.strip(), tells

    def _technique_lines(self, settings: TechniqueSettings) -> str:
        enabled = []
        if settings.typo_insertion:
            enabled.append("- Allow at most one subtle typo-like touch in longer text only when it feels believable and does not hurt readability.")
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

    def _extract_json_payload(self, text: str) -> dict | None:
        candidates = [text.strip()]
        match = re.search(r"\{.*\}", text, flags=re.DOTALL)
        if match:
            candidates.append(match.group(0).strip())

        for candidate in candidates:
            if not candidate or "{" not in candidate or "}" not in candidate:
                continue
            for parser in (json.loads, literal_eval):
                try:
                    payload = parser(candidate)
                except (ValueError, SyntaxError):
                    continue
                if isinstance(payload, dict):
                    return payload
        return None

    def _strip_wrappers(self, text: str) -> str:
        cleaned = text.strip()
        cleaned = re.sub(r"^```(?:json|text)?\s*", "", cleaned, flags=re.IGNORECASE)
        cleaned = re.sub(r"\s*```$", "", cleaned)
        return cleaned.strip()

    def _clean_final_text(self, text: str) -> str:
        text = self._strip_wrappers(text)
        text = re.sub(r"(?im)^(?:final(?:\s+version)?|rewrite|output)\s*:?\s*$", "", text).strip()
        text = re.split(
            r"(?is)\b(?:rem(?:aining|nant)\s+tells?|remaining ai tells|audit(?:\s+notes)?|what still sounds ai-generated)\b\s*:?",
            text,
            maxsplit=1,
        )[0].strip()
        lines = []
        for line in text.splitlines():
            stripped = line.strip()
            if re.match(
                r"(?i)^(?:rem(?:aining|nant)\s+tells?|audit(?:\s+notes)?|what still sounds ai-generated)\b",
                stripped,
            ):
                break
            lines.append(line.rstrip())
        return "\n".join(lines).strip()

    def _normalize_tells(self, value: object) -> list[str]:
        if isinstance(value, str):
            values = value.splitlines()
        elif isinstance(value, list):
            values = [str(item) for item in value]
        else:
            values = []

        tells = []
        for item in values:
            cleaned = item.strip().strip("-").strip()
            if not cleaned:
                continue
            lowered = cleaned.lower().rstrip(".")
            if lowered in {"none", "none detected", "no remaining tells", "no obvious tells"}:
                continue
            tells.append(cleaned)
        return tells
