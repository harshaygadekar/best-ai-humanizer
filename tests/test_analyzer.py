import unittest

from ai_humanizer.core.analyzer import LocalTextAnalyzer


class AnalyzerTests(unittest.TestCase):
    def setUp(self) -> None:
        self.analyzer = LocalTextAnalyzer()

    def test_ai_like_text_scores_higher_risk(self) -> None:
        ai_text = (
            "This groundbreaking platform underscores a pivotal shift in the evolving landscape. "
            "It is important to note that the vibrant solution could potentially enhance outcomes."
        )
        human_text = (
            "The tool is useful for rough drafts. It still gets stuff wrong, so I check every line before I keep it."
        )

        ai_result = self.analyzer.analyze(ai_text).result
        human_result = self.analyzer.analyze(human_text).result

        self.assertGreater(ai_result.detection_risk, human_result.detection_risk)
        self.assertLess(ai_result.human_likeness, human_result.human_likeness)


if __name__ == "__main__":
    unittest.main()
