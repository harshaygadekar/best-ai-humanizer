from __future__ import annotations

from pathlib import Path

from PySide6.QtWidgets import QApplication

from ai_humanizer.core.service import HumanizerService
from ai_humanizer.ui.main_window import MainWindow
from ai_humanizer.ui.theme import build_stylesheet


def run() -> int:
    app = QApplication([])
    app.setApplicationDisplayName("AI Humanizer")
    app.setStyleSheet(build_stylesheet())
    prompt_path = Path(__file__).resolve().parent / "resources" / "system-prompt-example1.md"
    window = MainWindow(HumanizerService(prompt_path=prompt_path))
    window.show()
    return app.exec()
