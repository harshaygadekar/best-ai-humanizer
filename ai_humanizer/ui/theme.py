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
        painter.fillRect(self.rect(), QColor("#dcd8cc"))

        stripe_pen = QPen(QColor(255, 255, 255, 28))
        painter.setPen(stripe_pen)
        for y in range(0, self.height(), 6):
            painter.drawLine(0, y, self.width(), y)

        dot_pen = QPen(QColor(80, 73, 60, 18))
        painter.setPen(dot_pen)
        for x in range(10, self.width(), 32):
            for y in range(14, self.height(), 28):
                painter.drawPoint(x, y)
        super().paintEvent(event)


def build_stylesheet() -> str:
    return """
    QWidget {
        color: #2d2a24;
        font-family: "Segoe UI", "Verdana", sans-serif;
        font-size: 13px;
    }
    QMainWindow {
        background: #d7d3c8;
    }
    QLabel[role="eyebrow"] {
        color: #5e5a52;
        font-size: 11px;
        letter-spacing: 1px;
        text-transform: uppercase;
    }
    QFrame[card="true"] {
        background: rgba(245, 241, 232, 0.95);
        border: 1px solid #8a8377;
        border-radius: 12px;
    }
    QFrame[metric="true"] {
        background: rgba(247, 243, 235, 0.98);
        border: 1px solid #8f887d;
        border-radius: 10px;
    }
    QTextEdit, QPlainTextEdit, QLineEdit, QComboBox, QListWidget {
        background: #f6f2e8;
        border: 1px solid #8f887d;
        border-radius: 8px;
        padding: 6px 8px;
        selection-background-color: #556b67;
    }
    QTextEdit:focus, QPlainTextEdit:focus, QLineEdit:focus, QComboBox:focus {
        border: 1px solid #546762;
    }
    QComboBox::drop-down {
        width: 24px;
        border: none;
    }
    QPushButton {
        background: qlineargradient(x1:0, y1:0, x2:0, y2:1,
            stop:0 #f4efe3, stop:0.52 #ddd6c8, stop:1 #c9c0b1);
        border: 1px solid #726b60;
        border-radius: 9px;
        padding: 8px 12px;
        min-height: 18px;
    }
    QPushButton:hover {
        background: qlineargradient(x1:0, y1:0, x2:0, y2:1,
            stop:0 #fcf7ec, stop:0.5 #e5ddcf, stop:1 #cec5b7);
    }
    QPushButton:pressed {
        background: #c5bdaf;
    }
    QPushButton[accent="true"] {
        background: qlineargradient(x1:0, y1:0, x2:0, y2:1,
            stop:0 #6f827e, stop:1 #435652);
        color: #f7f2e9;
        border: 1px solid #374742;
    }
    QPushButton[accent="true"]:hover {
        background: qlineargradient(x1:0, y1:0, x2:0, y2:1,
            stop:0 #7d8d8a, stop:1 #4c615c);
    }
    QCheckBox, QToolButton {
        spacing: 8px;
    }
    QSlider::groove:horizontal {
        height: 8px;
        background: #cbc3b5;
        border-radius: 4px;
    }
    QSlider::handle:horizontal {
        width: 18px;
        margin: -5px 0;
        background: #41514d;
        border-radius: 9px;
        border: 1px solid #2d3a37;
    }
    QScrollBar:vertical {
        background: transparent;
        width: 10px;
    }
    QScrollBar::handle:vertical {
        background: #b4ab9d;
        border-radius: 5px;
    }
    """
