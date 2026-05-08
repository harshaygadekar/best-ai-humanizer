from __future__ import annotations

from PySide6.QtCore import Qt
from PySide6.QtGui import QColor, QPainter, QPen
from PySide6.QtWidgets import QWidget


class TexturedSurface(QWidget):
    def __init__(self) -> None:
        super().__init__()
        self.setAttribute(Qt.WidgetAttribute.WA_StyledBackground, True)

    def paintEvent(self, event) -> None:  # pragma: no cover - visual behavior
        painter = QPainter(self)
        painter.fillRect(self.rect(), QColor("#14120f"))

        stripe_pen = QPen(QColor(255, 255, 255, 12))
        painter.setPen(stripe_pen)
        for y in range(0, self.height(), 5):
            painter.drawLine(0, y, self.width(), y)

        grid_pen = QPen(QColor(112, 96, 72, 28))
        painter.setPen(grid_pen)
        for x in range(0, self.width(), 24):
            painter.drawLine(x, 0, x, self.height())

        dot_pen = QPen(QColor(174, 148, 108, 22))
        painter.setPen(dot_pen)
        for x in range(8, self.width(), 28):
            for y in range(12, self.height(), 28):
                painter.drawPoint(x, y)
        super().paintEvent(event)


def build_stylesheet() -> str:
    return """
    QWidget {
        color: #f0eadf;
        font-family: "Trebuchet MS", "Verdana", sans-serif;
        font-size: 13px;
    }
    QMainWindow {
        background: #14120f;
    }
    QLabel[role="eyebrow"] {
        color: #cab894;
        font-family: "Consolas", "Lucida Console", monospace;
        font-size: 11px;
        letter-spacing: 1px;
        text-transform: uppercase;
    }
    QFrame[card="true"] {
        background: rgba(33, 29, 25, 0.94);
        border: 1px solid #665a47;
        border-radius: 14px;
    }
    QFrame[inset="true"] {
        background: rgba(23, 21, 18, 0.96);
        border: 1px solid #4e473a;
        border-radius: 10px;
    }
    QFrame[metric="true"] {
        background: rgba(25, 23, 19, 0.98);
        border: 1px solid #5d533f;
        border-radius: 10px;
    }
    QTextEdit, QPlainTextEdit, QLineEdit, QComboBox, QListWidget {
        background: #f3ead8;
        color: #181512;
        border: 1px solid #8f7a58;
        border-radius: 9px;
        padding: 7px 9px;
        selection-background-color: #607262;
    }
    QTextEdit:focus, QPlainTextEdit:focus, QLineEdit:focus, QComboBox:focus {
        border: 1px solid #97c29d;
    }
    QTextEdit[textEditor="true"] {
        font-family: "Georgia", "Times New Roman", serif;
        font-size: 15px;
    }
    QPlainTextEdit[notes="true"] {
        font-family: "Consolas", "Lucida Console", monospace;
        font-size: 12px;
    }
    QComboBox::drop-down {
        width: 24px;
        border: none;
    }
    QPushButton {
        background: qlineargradient(x1:0, y1:0, x2:0, y2:1,
            stop:0 #eadcbd, stop:0.52 #cfbb95, stop:1 #b29668);
        color: #17130f;
        border: 1px solid #7e6948;
        border-radius: 10px;
        padding: 9px 14px;
        min-height: 18px;
        font-weight: 600;
    }
    QPushButton:hover {
        background: qlineargradient(x1:0, y1:0, x2:0, y2:1,
            stop:0 #f3e6c8, stop:0.5 #d6c29d, stop:1 #bb9e6d);
    }
    QPushButton:pressed {
        background: #a88b5f;
    }
    QPushButton[accent="true"] {
        background: qlineargradient(x1:0, y1:0, x2:0, y2:1,
            stop:0 #92af97, stop:1 #516c58);
        color: #f7f2e9;
        border: 1px solid #3d5344;
    }
    QPushButton[accent="true"]:hover {
        background: qlineargradient(x1:0, y1:0, x2:0, y2:1,
            stop:0 #a0bca6, stop:1 #597760);
    }
    QToolButton {
        background: transparent;
        color: #cfc2a6;
        border: 1px solid #5e523f;
        border-radius: 8px;
        padding: 6px 10px;
    }
    QToolButton:hover {
        background: rgba(207, 194, 166, 0.08);
    }
    QCheckBox, QToolButton {
        spacing: 8px;
    }
    QLabel#statusLabel {
        color: #f7efd9;
        font-size: 16px;
        font-weight: 600;
    }
    QLabel#subtleLabel {
        color: #a99d86;
    }
    QLabel#processingChip {
        background: rgba(146, 175, 151, 0.16);
        color: #dfeee1;
        border: 1px solid #6c8c72;
        border-radius: 8px;
        padding: 6px 10px;
        font-family: "Consolas", "Lucida Console", monospace;
    }
    QProgressBar#activityBar {
        min-height: 9px;
        max-height: 9px;
        background: rgba(243, 234, 216, 0.14);
        border: 1px solid #524736;
        border-radius: 5px;
    }
    QProgressBar#activityBar::chunk {
        background: qlineargradient(x1:0, y1:0, x2:1, y2:0,
            stop:0 #d8c18f, stop:1 #90ad97);
        border-radius: 4px;
    }
    QSlider::groove:horizontal {
        height: 8px;
        background: #52473a;
        border-radius: 4px;
    }
    QSlider::handle:horizontal {
        width: 18px;
        margin: -5px 0;
        background: #d7c091;
        border-radius: 9px;
        border: 1px solid #7c6848;
    }
    QScrollBar:vertical {
        background: transparent;
        width: 11px;
    }
    QScrollBar::handle:vertical {
        background: #88755a;
        border-radius: 5px;
    }
    QScrollBar::add-line:vertical, QScrollBar::sub-line:vertical {
        height: 0;
    }
    QScrollBar:horizontal {
        background: transparent;
        height: 11px;
    }
    QScrollBar::handle:horizontal {
        background: #88755a;
        border-radius: 5px;
    }
    QSplitter::handle {
        background: rgba(207, 194, 166, 0.08);
    }
    QSplitter::handle:horizontal {
        width: 10px;
    }
    QSplitter::handle:vertical {
        height: 10px;
    }
    QScrollArea {
        border: none;
        background: transparent;
    }
    """
