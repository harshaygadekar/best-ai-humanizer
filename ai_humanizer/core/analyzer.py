from __future__ import annotations

import math
import re
import statistics
from collections import Counter

from ai_humanizer.models import AnalysisResult, LocalAnalysisSnapshot, MetricValue


class LocalTextAnalyzer:
    AI_WORDS = {
        "delve",
        "underscores",
        "testament",
        "vibrant",
        "landscape",
        "pivotal",
        "showcasing",
        "fostering",
        "highlighting",
        "enhance",
        "crucial",
        "intricate",
    }
    HEDGE_WORDS = {
        "perhaps",
        "potentially",
        "arguably",
        "might",
        "could",
        "may",
        "appears",
        "seems",
    }
    FILLER_PHRASES = (
        "in order to",
        "at this point in time",
        "it is important to note",
        "here's what you need to know",
        "let's dive in",
        "without further ado",
        "the real question is",
    )

    def analyze(self, text: str) -> LocalAnalysisSnapshot:
        cleaned = text.strip()
        if not cleaned:
            empty = AnalysisResult(0.0, 0.0, {}, ["Paste text to see live analysis."], [])
            return LocalAnalysisSnapshot(result=empty, raw_signals={})

        sentences = self._split_sentences(cleaned)
        paragraphs = [block.strip() for block in re.split(r"\n\s*\n", cleaned) if block.strip()]
        words = re.findall(r"\b[\w']+\b", cleaned.lower())

        sentence_lengths = [len(re.findall(r"\b[\w']+\b", sentence)) for sentence in sentences] or [0]
        paragraph_lengths = [len(re.findall(r"\b[\w']+\b", paragraph)) for paragraph in paragraphs] or [0]
        punctuation_profile = self._punctuation_profile(cleaned)
        repeated_phrases = self._repeated_phrases(words)
        ai_hits = sum(1 for word in words if word in self.AI_WORDS)
        hedge_hits = sum(1 for word in words if word in self.HEDGE_WORDS)
        filler_hits = sum(cleaned.lower().count(phrase) for phrase in self.FILLER_PHRASES)
        em_dash_hits = cleaned.count("—")
        bold_hits = len(re.findall(r"\*\*.+?\*\*", cleaned))
        emoji_hits = len(re.findall(r"[\U0001F300-\U0001FAFF]", cleaned))
        title_case_headings = len(re.findall(r"(?m)^#{1,6}\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+){2,}$", cleaned))
        passive_hits = len(re.findall(r"\b(?:is|was|were|been|be|are|being)\s+\w+ed\b", cleaned.lower()))
        readability = self._flesch_reading_ease(sentences, words)
        burstiness = self._variance_score(sentence_lengths)
        paragraph_variance = self._variance_score(paragraph_lengths)

        risk = min(
            100.0,
            20
            + ai_hits * 3.5
            + hedge_hits * 2.0
            + filler_hits * 5.0
            + repeated_phrases * 7.0
            + em_dash_hits * 4.0
            + bold_hits * 4.0
            + emoji_hits * 5.0
            + title_case_headings * 4.0
            + passive_hits * 2.5
            + max(0.0, 15 - burstiness)
            + max(0.0, 10 - paragraph_variance)
            + max(0.0, readability - 75) * 0.2,
        )
        human_likeness = max(
            0.0,
            min(
                100.0,
                72
                + burstiness * 1.2
                + paragraph_variance * 0.8
                - ai_hits * 2.8
                - filler_hits * 4.5
                - passive_hits * 1.8
                - repeated_phrases * 5.0,
            ),
        )

        suggestions = self._suggestions(
            ai_hits=ai_hits,
            filler_hits=filler_hits,
            repeated_phrases=repeated_phrases,
            passive_hits=passive_hits,
            burstiness=burstiness,
            paragraph_variance=paragraph_variance,
            em_dash_hits=em_dash_hits,
        )

        metrics = {
            "readability": MetricValue("Readability", round(readability, 1), self._band(readability, inverse=True)),
            "sentence_variation": MetricValue("Sentence variation", round(burstiness, 1), self._band(burstiness)),
            "paragraph_variation": MetricValue("Paragraph variation", round(paragraph_variance, 1), self._band(paragraph_variance)),
            "filler_density": MetricValue("Filler density", round((filler_hits + hedge_hits) / max(1, len(sentences)), 2), f"{filler_hits + hedge_hits} filler/hedge hits"),
            "repetition": MetricValue("Repetition", repeated_phrases, f"{repeated_phrases} repeated phrase patterns"),
            "punctuation": MetricValue("Punctuation naturalness", round(punctuation_profile, 1), self._band(punctuation_profile)),
        }

        raw_signals = {
            "ai_hits": float(ai_hits),
            "hedge_hits": float(hedge_hits),
            "filler_hits": float(filler_hits),
            "repeated_phrases": float(repeated_phrases),
            "em_dash_hits": float(em_dash_hits),
            "passive_hits": float(passive_hits),
            "sentence_variation": burstiness,
            "paragraph_variation": paragraph_variance,
            "readability": readability,
        }
        result = AnalysisResult(
            detection_risk=round(risk, 1),
            human_likeness=round(human_likeness, 1),
            metrics=metrics,
            suggestions=suggestions,
            provider_notes=[],
        )
        return LocalAnalysisSnapshot(result=result, raw_signals=raw_signals)

    def summarize(self, snapshot: LocalAnalysisSnapshot) -> str:
        metrics = snapshot.result.metrics
        return (
            f"Detection risk: {snapshot.result.detection_risk}/100\n"
            f"Human-likeness: {snapshot.result.human_likeness}/100\n"
            f"Sentence variation: {metrics.get('sentence_variation', MetricValue('', 0, '')).value}\n"
            f"Paragraph variation: {metrics.get('paragraph_variation', MetricValue('', 0, '')).value}\n"
            f"Filler density: {metrics.get('filler_density', MetricValue('', 0, '')).detail}\n"
            f"Repetition: {metrics.get('repetition', MetricValue('', 0, '')).detail}\n"
        )

    def _split_sentences(self, text: str) -> list[str]:
        parts = re.split(r"(?<=[.!?])\s+", text)
        return [part.strip() for part in parts if part.strip()]

    def _punctuation_profile(self, text: str) -> float:
        punctuation = re.findall(r"[,:;.!?—]", text)
        if not punctuation:
            return 25.0
        counts = Counter(punctuation)
        diversity = len(counts)
        dominant_ratio = max(counts.values()) / len(punctuation)
        return max(0.0, min(100.0, diversity * 18 - dominant_ratio * 25 + 35))

    def _repeated_phrases(self, words: list[str]) -> int:
        repeated = 0
        for size in (2, 3, 4):
            grams = [" ".join(words[index : index + size]) for index in range(max(0, len(words) - size + 1))]
            counts = Counter(grams)
            repeated += sum(1 for count in counts.values() if count > 1)
        return repeated

    def _flesch_reading_ease(self, sentences: list[str], words: list[str]) -> float:
        sentence_count = max(1, len(sentences))
        word_count = max(1, len(words))
        syllables = sum(self._count_syllables(word) for word in words)
        return 206.835 - 1.015 * (word_count / sentence_count) - 84.6 * (syllables / word_count)

    def _count_syllables(self, word: str) -> int:
        word = word.lower()
        groups = re.findall(r"[aeiouy]+", word)
        return max(1, len(groups))

    def _variance_score(self, values: list[int]) -> float:
        if len(values) < 2:
            return 5.0
        stdev = statistics.pstdev(values)
        return max(0.0, min(100.0, stdev * 3.2))

    def _band(self, value: float, inverse: bool = False) -> str:
        adjusted = 100 - value if inverse else value
        if adjusted >= 70:
            return "Strong"
        if adjusted >= 40:
            return "Mixed"
        return "Needs work"

    def _suggestions(
        self,
        *,
        ai_hits: int,
        filler_hits: int,
        repeated_phrases: int,
        passive_hits: int,
        burstiness: float,
        paragraph_variance: float,
        em_dash_hits: int,
    ) -> list[str]:
        suggestions: list[str] = []
        if ai_hits:
            suggestions.append("Swap out abstract AI-sounding vocabulary for plainer verbs and nouns.")
        if filler_hits:
            suggestions.append("Cut filler and hedging. Say the point directly instead of circling it.")
        if repeated_phrases:
            suggestions.append("Break repeated phrase patterns and let some sentences end less predictably.")
        if passive_hits:
            suggestions.append("Use more active voice so the writing sounds less distant.")
        if burstiness < 18:
            suggestions.append("Mix short and long sentences more aggressively.")
        if paragraph_variance < 12:
            suggestions.append("Vary paragraph sizes so the text feels less leveled.")
        if em_dash_hits:
            suggestions.append("Replace most em dashes with periods or commas.")
        if not suggestions:
            suggestions.append("The draft is relatively natural already. Focus on sharper specifics and voice.")
        return suggestions
