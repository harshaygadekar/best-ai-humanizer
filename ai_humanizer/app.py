from __future__ import annotations

from pathlib import Path
import sys

from PySide6.QtWidgets import QApplication

from ai_humanizer.core.service import HumanizerService
from ai_humanizer.ui.main_window import MainWindow
from ai_humanizer.ui.theme import build_stylesheet


def resource_path(*parts: str) -> Path:
    if getattr(sys, "frozen", False) and hasattr(sys, "_MEIPASS"):
        base = Path(sys._MEIPASS)
        candidate = base.joinpath(*parts)
        if candidate.exists():
            return candidate
    return Path(__file__).resolve().parent.joinpath(*parts)


def run() -> int:
    app = QApplication([])
    app.setApplicationDisplayName("AI Humanizer")
    app.setStyleSheet(build_stylesheet())
    prompt_path = resource_path("ai_humanizer", "resources", "system-prompt-example1.md")
    if not prompt_path.exists():
        prompt_path = resource_path("resources", "system-prompt-example1.md")
    window = MainWindow(HumanizerService(prompt_path=prompt_path))
    window.show()
    return app.exec()
