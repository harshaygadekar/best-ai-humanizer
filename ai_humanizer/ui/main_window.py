from __future__ import annotations

import re
from dataclasses import replace
from typing import Any

from PySide6.QtCore import QEasingCurve, QPropertyAnimation, QThreadPool, QTimer, Qt
from PySide6.QtGui import QGuiApplication, QKeySequence, QShortcut
from PySide6.QtWidgets import (
    QCheckBox,
    QComboBox,
    QFrame,
    QGridLayout,
    QHBoxLayout,
    QLabel,
    QLineEdit,
    QMainWindow,
    QPlainTextEdit,
    QProgressBar,
    QPushButton,
    QScrollArea,
    QSizePolicy,
    QSlider,
    QSplitter,
    QTextEdit,
    QToolButton,
    QVBoxLayout,
    QWidget,
)

from ai_humanizer.core.service import HumanizeWorkflowResult, HumanizerService
from ai_humanizer.models import (
    AppSettings,
    LocalAnalysisSnapshot,
    ProviderConfig,
    ProviderType,
    TechniqueSettings,
)
from ai_humanizer.ui.theme import TexturedSurface
from ai_humanizer.ui.workers import FunctionWorker


class MainWindow(QMainWindow):
    ACTIVITY_FRAMES = (
        "[#....]",
        "[##...]",
        "[###..]",
        "[####.]",
        "[#####]",
        "[.####]",
        "[..###]",
        "[...##]",
    )

    def __init__(self, service: HumanizerService) -> None:
        super().__init__()
        self.service = service
        self.settings = self.service.settings_store.load()
        self.thread_pool = QThreadPool.globalInstance()
        self._task_counter = 0
        self._tasks: dict[int, dict[str, Any]] = {}
        self._activity_frame_index = 0
        self._live_snapshot = self.service.analyze_text("")

        self.setWindowTitle("AI Humanizer")
        self.resize(1560, 980)
        self._build_ui()
        self._connect_events()
        self._install_shortcuts()
        self._apply_settings()
        self._run_live_analysis()
        self.refresh_models(background=False)

    def _build_ui(self) -> None:
        self.app_scroll = QScrollArea()
        self.app_scroll.setWidgetResizable(True)
        self.app_scroll.setHorizontalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAlwaysOff)
        self.setCentralWidget(self.app_scroll)

        surface = TexturedSurface()
        self.app_scroll.setWidget(surface)

        root = QVBoxLayout(surface)
        root.setContentsMargins(18, 18, 18, 18)
        root.setSpacing(14)

        self.top_card, top_layout = self._make_card(
            "Vintage rewrite desk",
            "Fast rewrite first. Deeper notes after.",
        )
        top_row = QHBoxLayout()
        title_wrap = QVBoxLayout()
        eyebrow = QLabel("Local AI Humanizer")
        eyebrow.setProperty("role", "eyebrow")
        hero = QLabel("See the output without hunting for it")
        hero.setStyleSheet("font-size: 22px; font-weight: 700; color: #fff7e4;")
        subtitle = QLabel("Source, rewritten output, and controls stay visible in one horizontal workspace.")
        subtitle.setObjectName("subtleLabel")
        subtitle.setWordWrap(True)
        title_wrap.addWidget(eyebrow)
        title_wrap.addWidget(hero)
        title_wrap.addWidget(subtitle)

        status_wrap = QVBoxLayout()
        status_wrap.setSpacing(8)
        self.status_label = QLabel("Ready.")
        self.status_label.setObjectName("statusLabel")
        self.status_detail_label = QLabel("Paste text, pick a model, then press Ctrl+Enter.")
        self.status_detail_label.setObjectName("subtleLabel")
        self.status_detail_label.setWordWrap(True)
        self.processing_chip = QLabel(self.ACTIVITY_FRAMES[0] + " IDLE")
        self.processing_chip.setObjectName("processingChip")
        self.processing_chip.hide()
        self.activity_bar = QProgressBar()
        self.activity_bar.setObjectName("activityBar")
        self.activity_bar.setRange(0, 0)
        self.activity_bar.setTextVisible(False)
        self.activity_bar.hide()
        status_wrap.addWidget(self.status_label)
        status_wrap.addWidget(self.status_detail_label)
        status_wrap.addWidget(self.processing_chip)
        status_wrap.addWidget(self.activity_bar)

        top_row.addLayout(title_wrap, stretch=3)
        top_row.addSpacing(20)
        top_row.addLayout(status_wrap, stretch=2)
        top_layout.addLayout(top_row)
        root.addWidget(self.top_card)

        self.workspace_splitter = QSplitter(Qt.Orientation.Horizontal)
        self.workspace_splitter.setChildrenCollapsible(False)
        self.workspace_splitter.setSizePolicy(QSizePolicy.Policy.Expanding, QSizePolicy.Policy.Expanding)
        root.addWidget(self.workspace_splitter, stretch=1)

        self.source_card, source_layout = self._make_card(
            "Source text",
            "Paste the raw text here. This pane stays readable even when the app is busy.",
        )
        source_meta = QHBoxLayout()
        self.input_stats_label = QLabel("0 words | 0 chars | 0 lines")
        self.input_stats_label.setObjectName("subtleLabel")
        self.voice_toggle = QToolButton()
        self.voice_toggle.setText("Voice match")
        self.voice_toggle.setCheckable(True)
        source_meta.addWidget(self.input_stats_label)
        source_meta.addStretch(1)
        source_meta.addWidget(self.voice_toggle)
        source_layout.addLayout(source_meta)

        self.input_editor = QTextEdit()
        self.input_editor.setProperty("textEditor", True)
        self.input_editor.setAcceptRichText(False)
        self.input_editor.setPlaceholderText("Paste raw text here...")
        self.input_editor.setMinimumHeight(360)
        source_layout.addWidget(self.input_editor, stretch=1)

        self.voice_frame = QFrame()
        self.voice_frame.setProperty("inset", True)
        self.voice_frame.setMaximumHeight(0)
        voice_layout = QVBoxLayout(self.voice_frame)
        voice_layout.setContentsMargins(12, 12, 12, 12)
        voice_layout.setSpacing(8)
        voice_label = QLabel("Optional writing sample")
        voice_label.setStyleSheet("font-size: 14px; font-weight: 600; color: #f5ead0;")
        voice_caption = QLabel("Use a short sample of your own writing if you want the rewrite to match your voice.")
        voice_caption.setObjectName("subtleLabel")
        voice_caption.setWordWrap(True)
        self.voice_editor = QTextEdit()
        self.voice_editor.setProperty("textEditor", True)
        self.voice_editor.setAcceptRichText(False)
        self.voice_editor.setPlaceholderText("Paste a writing sample...")
        self.voice_editor.setMinimumHeight(120)
        voice_layout.addWidget(voice_label)
        voice_layout.addWidget(voice_caption)
        voice_layout.addWidget(self.voice_editor)
        source_layout.addWidget(self.voice_frame)
        self.source_card.setMinimumWidth(420)
        self.workspace_splitter.addWidget(self.source_card)

        self.output_card, output_layout = self._make_card(
            "Humanized output",
            "The rewrite lands here first. Analysis notes update under it and in the right dock.",
        )
        action_row = QHBoxLayout()
        self.humanize_button = QPushButton("Humanize")
        self.humanize_button.setProperty("accent", True)
        self.regenerate_button = QPushButton("Regenerate")
        self.analyze_button = QPushButton("Analyze")
        self.copy_button = QPushButton("Copy")
        self.clear_output_button = QPushButton("Clear")
        action_row.addWidget(self.humanize_button)
        action_row.addWidget(self.regenerate_button)
        action_row.addWidget(self.analyze_button)
        action_row.addStretch(1)
        action_row.addWidget(self.copy_button)
        action_row.addWidget(self.clear_output_button)
        output_layout.addLayout(action_row)

        output_meta = QHBoxLayout()
        self.output_stats_label = QLabel("0 words | 0 chars | 0 lines")
        self.output_stats_label.setObjectName("subtleLabel")
        self.output_phase_label = QLabel("Awaiting rewrite.")
        self.output_phase_label.setObjectName("subtleLabel")
        output_meta.addWidget(self.output_stats_label)
        output_meta.addStretch(1)
        output_meta.addWidget(self.output_phase_label)
        output_layout.addLayout(output_meta)

        self.output_editor = QTextEdit()
        self.output_editor.setProperty("textEditor", True)
        self.output_editor.setReadOnly(True)
        self.output_editor.setPlaceholderText("Humanized text will appear here.")
        self.output_editor.setMinimumHeight(360)
        output_layout.addWidget(self.output_editor, stretch=1)

        self.analysis_notes = QPlainTextEdit()
        self.analysis_notes.setProperty("notes", True)
        self.analysis_notes.setReadOnly(True)
        self.analysis_notes.setPlaceholderText("Quick audit and provider notes will appear here.")
        self.analysis_notes.setMinimumHeight(150)
        output_layout.addWidget(self.analysis_notes)
        self.output_card.setMinimumWidth(420)
        self.workspace_splitter.addWidget(self.output_card)

        self.sidebar_scroll = QScrollArea()
        self.sidebar_scroll.setWidgetResizable(True)
        self.sidebar_scroll.setHorizontalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAlwaysOff)
        self.sidebar_scroll.setMinimumWidth(320)
        self.workspace_splitter.addWidget(self.sidebar_scroll)
        self.workspace_splitter.setSizes([560, 560, 360])

        sidebar = QWidget()
        self.sidebar_scroll.setWidget(sidebar)
        sidebar_layout = QVBoxLayout(sidebar)
        sidebar_layout.setContentsMargins(0, 0, 0, 0)
        sidebar_layout.setSpacing(14)

        self.config_card, config_layout = self._make_card(
            "Provider and model",
            "Refresh model lists or type a model name manually. Provider labels stay visible.",
        )
        self.provider_combo = QComboBox()
        for provider in ProviderType:
            self.provider_combo.addItem(provider.label, provider)

        self.model_combo = QComboBox()
        self.model_combo.setEditable(True)
        self.model_combo.setInsertPolicy(QComboBox.InsertPolicy.NoInsert)
        self.model_combo.setMinimumContentsLength(18)
        self.refresh_models_button = QPushButton("Refresh models")
        self.api_key_input = QLineEdit()
        self.api_key_input.setEchoMode(QLineEdit.EchoMode.Password)
        self.api_key_input.setPlaceholderText("API key")
        self.base_url_input = QLineEdit()
        self.base_url_input.setPlaceholderText("http://localhost:11434/api")
        self.provider_status_label = QLabel("No model list loaded yet.")
        self.provider_status_label.setObjectName("subtleLabel")
        self.provider_status_label.setWordWrap(True)

        provider_grid = QGridLayout()
        provider_grid.setHorizontalSpacing(10)
        provider_grid.setVerticalSpacing(10)
        provider_grid.addWidget(QLabel("Provider"), 0, 0)
        provider_grid.addWidget(self.provider_combo, 0, 1)
        provider_grid.addWidget(QLabel("Model"), 1, 0)
        provider_grid.addWidget(self.model_combo, 1, 1)
        provider_grid.addWidget(self.refresh_models_button, 1, 2)
        provider_grid.addWidget(QLabel("API key"), 2, 0)
        provider_grid.addWidget(self.api_key_input, 2, 1, 1, 2)
        provider_grid.addWidget(QLabel("Ollama URL"), 3, 0)
        provider_grid.addWidget(self.base_url_input, 3, 1, 1, 2)
        config_layout.addLayout(provider_grid)
        config_layout.addWidget(self.provider_status_label)
        sidebar_layout.addWidget(self.config_card)

        self.temperature_card, temp_layout = self._make_card(
            "Temperature",
            "Lower values stay tighter. Higher values push the rewrite harder.",
        )
        temp_row = QHBoxLayout()
        self.temperature_value = QLabel("0.7")
        self.temperature_value.setStyleSheet("font-size: 18px; font-weight: 700; color: #fff2d6;")
        temp_row.addWidget(QLabel("Control"))
        temp_row.addStretch(1)
        temp_row.addWidget(self.temperature_value)
        self.temperature_slider = QSlider(Qt.Orientation.Horizontal)
        self.temperature_slider.setRange(1, 10)
        self.temperature_slider.setTickInterval(1)
        temp_layout.addLayout(temp_row)
        temp_layout.addWidget(self.temperature_slider)
        sidebar_layout.addWidget(self.temperature_card)

        self.techniques_card, technique_layout = self._make_card(
            "Humanization techniques",
            "Use these only if you want a little extra texture.",
        )
        self.typo_checkbox = QCheckBox("Smart typo insertion")
        self.punctuation_checkbox = QCheckBox("Natural punctuation variation")
        self.repetition_checkbox = QCheckBox("Organic repetition")
        self.formatting_checkbox = QCheckBox("Dynamic text formatting")
        for checkbox in (
            self.typo_checkbox,
            self.punctuation_checkbox,
            self.repetition_checkbox,
            self.formatting_checkbox,
        ):
            technique_layout.addWidget(checkbox)
        sidebar_layout.addWidget(self.techniques_card)

        self.metrics_card, metrics_layout = self._make_card(
            "Detection and feel",
            "Live heuristics update while you type. Provider notes layer in after the rewrite lands.",
        )
        score_grid = QGridLayout()
        self.detection_box, self.detection_value_label, self.detection_detail_label = self._make_metric_box("Detection risk")
        self.human_box, self.human_value_label, self.human_detail_label = self._make_metric_box("Human-likeness")
        score_grid.addWidget(self.detection_box, 0, 0)
        score_grid.addWidget(self.human_box, 0, 1)
        metrics_layout.addLayout(score_grid)

        metric_grid = QGridLayout()
        self.metric_boxes: dict[str, tuple[QLabel, QLabel]] = {}
        metric_keys = [
            "readability",
            "sentence_variation",
            "paragraph_variation",
            "filler_density",
            "repetition",
            "punctuation",
        ]
        for index, key in enumerate(metric_keys):
            box, value_label, detail_label = self._make_metric_box(key.replace("_", " ").title())
            metric_grid.addWidget(box, index // 2, index % 2)
            self.metric_boxes[key] = (value_label, detail_label)
        metrics_layout.addLayout(metric_grid)

        self.suggestions_box = QPlainTextEdit()
        self.suggestions_box.setProperty("notes", True)
        self.suggestions_box.setReadOnly(True)
        self.suggestions_box.setPlaceholderText("Actionable suggestions will update here.")
        self.suggestions_box.setMinimumHeight(220)
        metrics_layout.addWidget(self.suggestions_box)
        sidebar_layout.addWidget(self.metrics_card)
        sidebar_layout.addStretch(1)

    def _connect_events(self) -> None:
        self.provider_combo.currentIndexChanged.connect(self._provider_changed)
        self.model_combo.currentTextChanged.connect(self._on_config_changed)
        self.temperature_slider.valueChanged.connect(self._temperature_changed)
        self.base_url_input.textChanged.connect(self._on_config_changed)
        self.api_key_input.textChanged.connect(self._validate_actions)
        self.api_key_input.editingFinished.connect(self._persist_secret)
        self.refresh_models_button.clicked.connect(self.refresh_models)
        self.humanize_button.clicked.connect(self.run_humanize)
        self.regenerate_button.clicked.connect(self.run_humanize)
        self.analyze_button.clicked.connect(self.run_provider_analysis)
        self.copy_button.clicked.connect(self.copy_output)
        self.clear_output_button.clicked.connect(self.clear_output)
        self.voice_toggle.toggled.connect(self._toggle_voice_panel)
        self.voice_toggle.toggled.connect(self._on_config_changed)
        self.input_editor.textChanged.connect(self._handle_input_changed)
        self.voice_editor.textChanged.connect(self._on_config_changed)
        self.output_editor.textChanged.connect(self._update_output_stats)

        for checkbox in (
            self.typo_checkbox,
            self.punctuation_checkbox,
            self.repetition_checkbox,
            self.formatting_checkbox,
        ):
            checkbox.toggled.connect(self._on_config_changed)

        self._analysis_timer = QTimer(self)
        self._analysis_timer.setInterval(260)
        self._analysis_timer.setSingleShot(True)
        self._analysis_timer.timeout.connect(self._run_live_analysis)

        self._activity_timer = QTimer(self)
        self._activity_timer.setInterval(110)
        self._activity_timer.timeout.connect(self._tick_activity)

        self._voice_animation = QPropertyAnimation(self.voice_frame, b"maximumHeight", self)
        self._voice_animation.setDuration(180)
        self._voice_animation.setEasingCurve(QEasingCurve.Type.OutCubic)

    def _install_shortcuts(self) -> None:
        QShortcut(QKeySequence("Ctrl+Return"), self, activated=self.run_humanize)
        QShortcut(QKeySequence("Ctrl+Enter"), self, activated=self.run_humanize)
        QShortcut(QKeySequence("Ctrl+Shift+Return"), self, activated=self.run_provider_analysis)

    def _apply_settings(self) -> None:
        provider_index = self.provider_combo.findData(self.settings.selected_provider)
        if provider_index >= 0:
            self.provider_combo.setCurrentIndex(provider_index)
        self.base_url_input.setText(self.settings.ollama_base_url)
        self.temperature_slider.setValue(int(round(self.settings.temperature * 10)))
        self.typo_checkbox.setChecked(self.settings.technique_settings.typo_insertion)
        self.punctuation_checkbox.setChecked(self.settings.technique_settings.punctuation_variation)
        self.repetition_checkbox.setChecked(self.settings.technique_settings.organic_repetition)
        self.formatting_checkbox.setChecked(self.settings.technique_settings.dynamic_formatting)
        self.api_key_input.setText(self.service.secret_store.get(self.current_provider(), "api_key"))
        if self.settings.selected_model:
            self.model_combo.setEditText(self._format_model_display(self.current_provider(), self.settings.selected_model))
        self._provider_changed()
        self._update_input_stats()
        self._update_output_stats()

    def _provider_changed(self) -> None:
        provider = self.current_provider()
        self.api_key_input.setVisible(provider in {ProviderType.GEMINI, ProviderType.GROQ})
        self.base_url_input.setVisible(provider == ProviderType.OLLAMA)
        self.api_key_input.setText(self.service.secret_store.get(provider, "api_key"))
        if provider == ProviderType.OLLAMA:
            self.provider_status_label.setText("Local Ollama models can be refreshed without leaving the app.")
        else:
            self.provider_status_label.setText("Enter the API key, then refresh the model list or type a model manually.")
        self._on_config_changed()

    def current_provider(self) -> ProviderType:
        value = self.provider_combo.currentData()
        if isinstance(value, ProviderType):
            return value
        if isinstance(value, str) and value:
            return ProviderType(value)
        return ProviderType.OLLAMA

    def current_model_id(self) -> str:
        text = self.model_combo.currentText().strip()
        if " / " in text:
            return text.split(" / ", 1)[1].strip()
        return text

    def _format_model_display(self, provider: ProviderType, model_id: str) -> str:
        return f"{provider.label} / {model_id}"

    def _temperature_changed(self, value: int) -> None:
        self.temperature_value.setText(f"{value / 10:.1f}")
        self._on_config_changed()

    def _handle_input_changed(self) -> None:
        self._update_input_stats()
        self._analysis_timer.start()
        self._validate_actions()

    def _toggle_voice_panel(self, checked: bool) -> None:
        self._voice_animation.stop()
        self._voice_animation.setStartValue(self.voice_frame.maximumHeight())
        self._voice_animation.setEndValue(210 if checked else 0)
        self._voice_animation.start()

    def _run_live_analysis(self) -> None:
        self._live_snapshot = self.service.analyze_text(self.input_editor.toPlainText())
        self._apply_analysis_snapshot(self._live_snapshot, heading="Live input analysis")

    def refresh_models(self, background: bool = True) -> None:
        provider = self.current_provider()
        config = self._provider_config()

        def task():
            return self.service.list_models(provider, config)

        self.provider_status_label.setText("Refreshing models...")
        self._run_task(
            task,
            kind="models",
            on_result=self._models_loaded,
            meta={"provider": provider},
        )

    def run_humanize(self) -> None:
        request = self._build_request()
        if not request:
            return
        config = self._provider_config()

        def task():
            return self.service.humanize(request, config)

        self.output_phase_label.setText("Humanizing...")
        self.analysis_notes.setPlainText("Working on a rewrite...")
        self._run_task(
            task,
            kind="humanize",
            on_result=self._humanize_finished,
            meta={"provider": request.provider, "model_id": request.model_id},
        )

    def run_provider_analysis(self) -> None:
        text = self.output_editor.toPlainText().strip() or self.input_editor.toPlainText().strip()
        if not text:
            return
        self._queue_provider_analysis(text, automatic=False)

    def _queue_provider_analysis(self, text: str, *, automatic: bool) -> None:
        provider = self.current_provider()
        model_id = self.current_model_id()
        config = self._provider_config()
        if not model_id:
            return

        def task():
            return self.service.analyze_with_provider(provider, model_id, config, text)

        if automatic:
            self.output_phase_label.setText("Rewrite ready. Provider analysis is running...")
        else:
            self.output_phase_label.setText("Running provider analysis...")
            self.analysis_notes.setPlainText("Running provider analysis...")
        self._run_task(
            task,
            kind="analysis",
            on_result=self._provider_analysis_finished,
            meta={"provider": provider, "subject": text, "automatic": automatic},
        )

    def _run_task(self, fn, *, kind: str, on_result, meta: dict[str, Any] | None = None) -> None:
        self._task_counter += 1
        task_id = self._task_counter
        task_meta = {"kind": kind}
        if meta:
            task_meta.update(meta)
        self._tasks[task_id] = task_meta
        worker = FunctionWorker(task_id, fn)
        worker.signals.result.connect(on_result)
        worker.signals.error.connect(self._task_failed)
        worker.signals.finished.connect(self._task_finished)
        self.thread_pool.start(worker)
        self._refresh_controls_and_activity()

    def _humanize_finished(self, result: HumanizeWorkflowResult, task_id: int) -> None:
        if task_id not in self._tasks:
            return
        self.output_editor.setPlainText(result.rewrite.output_text)
        self._update_output_stats()
        self._reveal_output_panel()
        self._apply_analysis_snapshot(result.local_analysis, heading="Latest result analysis")
        self.analysis_notes.setPlainText(self._format_quick_audit(result.rewrite.audit_notes))
        self.output_phase_label.setText("Rewrite ready. Provider analysis is starting...")
        self.status_label.setText("Humanization complete.")
        self.status_detail_label.setText("The rewrite landed. Provider-backed notes are running in the background.")
        self._queue_provider_analysis(result.rewrite.output_text, automatic=True)

    def _provider_analysis_finished(self, result, task_id: int) -> None:
        meta = self._tasks.get(task_id, {})
        current_subject = self.output_editor.toPlainText().strip() or self.input_editor.toPlainText().strip()
        if meta.get("subject") and meta.get("subject") != current_subject:
            return
        notes = result.provider_notes or []
        if notes:
            self.analysis_notes.setPlainText("\n".join(notes))
        self._apply_analysis_result(result, heading="Provider-backed analysis")
        self.output_phase_label.setText("Rewrite ready.")
        self.status_label.setText("Analysis updated.")
        self.status_detail_label.setText("Provider notes now reflect the current text.")

    def _models_loaded(self, models, task_id: int) -> None:
        meta = self._tasks.get(task_id, {})
        if meta.get("provider") != self.current_provider():
            return
        current_text = self.current_model_id()
        provider = self.current_provider()

        self.model_combo.blockSignals(True)
        self.model_combo.clear()
        for model in models:
            self.model_combo.addItem(model.display_name, model.model_id)
        if current_text:
            self.model_combo.setEditText(self._format_model_display(provider, current_text))
        elif models:
            self.model_combo.setCurrentIndex(0)
        else:
            self.model_combo.setEditText("")
        self.model_combo.blockSignals(False)

        if models:
            self.provider_status_label.setText(f"{len(models)} models loaded.")
        else:
            self.provider_status_label.setText("No models returned. You can still type a model name manually.")
        self.status_label.setText("Models refreshed.")
        self.status_detail_label.setText("Source and output panes stay visible while you switch models.")
        self._on_config_changed()

    def _task_failed(self, message: str, task_id: int) -> None:
        meta = self._tasks.get(task_id, {})
        kind = meta.get("kind")
        self.status_label.setText("Request failed.")
        self.status_detail_label.setText(message)
        if kind == "models":
            self.provider_status_label.setText("Model refresh failed. You can still type a model manually.")
        elif kind == "analysis" and meta.get("automatic"):
            self.analysis_notes.setPlainText("Provider analysis is unavailable right now. Local metrics are still updated.")
            self.output_phase_label.setText("Rewrite ready.")
        else:
            self.analysis_notes.setPlainText(message)
            if kind == "humanize":
                self.output_phase_label.setText("Humanization failed.")
            elif kind == "analysis":
                self.output_phase_label.setText("Analysis failed.")

    def _task_finished(self, task_id: int) -> None:
        self._tasks.pop(task_id, None)
        self._refresh_controls_and_activity()

    def _refresh_controls_and_activity(self) -> None:
        has_text = bool(self.input_editor.toPlainText().strip())
        has_model = bool(self.current_model_id())
        provider = self.current_provider()
        has_provider_auth = True
        if provider in {ProviderType.GEMINI, ProviderType.GROQ}:
            has_provider_auth = bool(
                self.api_key_input.text().strip() or self.service.secret_store.get(provider, "api_key")
            )
        can_submit = has_text and has_model and has_provider_auth
        has_analysis_target = bool(self.output_editor.toPlainText().strip() or self.input_editor.toPlainText().strip())

        busy_kinds = {meta["kind"] for meta in self._tasks.values()}
        humanize_busy = "humanize" in busy_kinds
        analysis_busy = "analysis" in busy_kinds
        models_busy = "models" in busy_kinds

        self.humanize_button.setEnabled(can_submit and not humanize_busy)
        self.regenerate_button.setEnabled(can_submit and not humanize_busy)
        self.analyze_button.setEnabled(has_analysis_target and has_model and has_provider_auth and not humanize_busy and not analysis_busy)
        self.refresh_models_button.setEnabled(not models_busy)

        if humanize_busy:
            self._start_activity("humanizing")
        elif analysis_busy:
            self._start_activity("analyzing")
        elif models_busy:
            self._start_activity("refreshing")
        else:
            self._stop_activity()

    def _start_activity(self, label: str) -> None:
        self._activity_label = label.upper()
        self.processing_chip.show()
        self.activity_bar.show()
        if not self._activity_timer.isActive():
            self._activity_timer.start()
        self._tick_activity()

    def _stop_activity(self) -> None:
        self._activity_timer.stop()
        self.processing_chip.hide()
        self.activity_bar.hide()

    def _tick_activity(self) -> None:
        frame = self.ACTIVITY_FRAMES[self._activity_frame_index % len(self.ACTIVITY_FRAMES)]
        label = getattr(self, "_activity_label", "IDLE")
        self.processing_chip.setText(f"{frame} {label}")
        self._activity_frame_index += 1

    def _build_request(self):
        source_text = self.input_editor.toPlainText().strip()
        model_id = self.current_model_id()
        if not source_text or not model_id:
            return None
        return self._request_object(source_text, model_id)

    def _request_object(self, source_text: str, model_id: str):
        from ai_humanizer.models import HumanizeRequest

        return HumanizeRequest(
            source_text=source_text,
            voice_sample=self.voice_editor.toPlainText().strip() or None,
            provider=self.current_provider(),
            model_id=model_id,
            temperature=self.temperature_slider.value() / 10,
            technique_settings=self._technique_settings(),
        )

    def _provider_config(self) -> ProviderConfig:
        provider = self.current_provider()
        base_url = self.base_url_input.text().strip() or self.settings.ollama_base_url
        api_key = self.api_key_input.text().strip() or self.service.secret_store.get(provider, "api_key")
        return ProviderConfig(provider=provider, api_key=api_key, base_url=base_url)

    def _technique_settings(self) -> TechniqueSettings:
        return TechniqueSettings(
            typo_insertion=self.typo_checkbox.isChecked(),
            punctuation_variation=self.punctuation_checkbox.isChecked(),
            organic_repetition=self.repetition_checkbox.isChecked(),
            dynamic_formatting=self.formatting_checkbox.isChecked(),
        )

    def _on_config_changed(self) -> None:
        self._persist_settings()
        self._refresh_controls_and_activity()

    def _persist_settings(self) -> None:
        self.settings = AppSettings(
            selected_provider=self.current_provider(),
            selected_model=self.current_model_id(),
            ollama_base_url=self.base_url_input.text().strip() or "http://localhost:11434/api",
            temperature=self.temperature_slider.value() / 10,
            technique_settings=self._technique_settings(),
            theme=self.settings.theme,
            window_geometry=self.settings.window_geometry,
        )
        self.service.settings_store.save(self.settings)

    def _persist_secret(self) -> None:
        self.service.secret_store.set(self.current_provider(), "api_key", self.api_key_input.text().strip())
        self._refresh_controls_and_activity()

    def _validate_actions(self) -> None:
        self._refresh_controls_and_activity()

    def _apply_analysis_snapshot(
        self,
        snapshot: LocalAnalysisSnapshot,
        *,
        heading: str,
        provider_notes: list[str] | None = None,
    ) -> None:
        result = snapshot.result
        self._apply_analysis_result(result, heading=heading)
        if provider_notes:
            self.analysis_notes.setPlainText("\n".join(provider_notes))

    def _apply_analysis_result(self, result, *, heading: str) -> None:
        self.detection_value_label.setText(f"{result.detection_risk:.1f}")
        self.detection_detail_label.setText("Higher means riskier")
        self.human_value_label.setText(f"{result.human_likeness:.1f}")
        self.human_detail_label.setText("Higher reads more human")

        for key, metric in result.metrics.items():
            if key not in self.metric_boxes:
                continue
            value_label, detail_label = self.metric_boxes[key]
            value_label.setText(str(metric.value))
            detail_label.setText(metric.detail)

        lines = [heading, ""] + [f"- {item}" for item in result.suggestions]
        if result.provider_notes:
            lines += ["", "Provider notes:"] + [f"- {note}" for note in result.provider_notes]
        self.suggestions_box.setPlainText("\n".join(lines))

    def copy_output(self) -> None:
        text = self.output_editor.toPlainText().strip()
        if not text:
            return
        QGuiApplication.clipboard().setText(text)
        self.status_label.setText("Output copied.")
        self.status_detail_label.setText("The current rewrite is on your clipboard.")

    def clear_output(self) -> None:
        self.output_editor.clear()
        self.analysis_notes.clear()
        self.output_phase_label.setText("Awaiting rewrite.")
        self._update_output_stats()
        self.status_label.setText("Output cleared.")
        self.status_detail_label.setText("The source text is still intact.")

    def closeEvent(self, event) -> None:  # pragma: no cover - UI persistence
        geometry = bytes(self.saveGeometry()).hex()
        updated = replace(self.settings, window_geometry=geometry)
        self.service.settings_store.save(updated)
        self._persist_secret()
        super().closeEvent(event)

    def showEvent(self, event) -> None:  # pragma: no cover - UI persistence
        if self.settings.window_geometry:
            try:
                self.restoreGeometry(bytes.fromhex(self.settings.window_geometry))
            except ValueError:
                pass
        super().showEvent(event)

    def _make_card(self, title: str, caption: str) -> tuple[QFrame, QVBoxLayout]:
        card = QFrame()
        card.setProperty("card", True)
        card.setSizePolicy(QSizePolicy.Policy.Expanding, QSizePolicy.Policy.Expanding)
        layout = QVBoxLayout(card)
        layout.setContentsMargins(16, 16, 16, 16)
        layout.setSpacing(10)
        title_label = QLabel(title)
        title_label.setStyleSheet("font-size: 18px; font-weight: 700; color: #fff4db;")
        caption_label = QLabel(caption)
        caption_label.setObjectName("subtleLabel")
        caption_label.setWordWrap(True)
        layout.addWidget(title_label)
        layout.addWidget(caption_label)
        return card, layout

    def _make_metric_box(self, title: str) -> tuple[QFrame, QLabel, QLabel]:
        box = QFrame()
        box.setProperty("metric", True)
        box.setSizePolicy(QSizePolicy.Policy.Expanding, QSizePolicy.Policy.Fixed)
        layout = QVBoxLayout(box)
        layout.setContentsMargins(12, 10, 12, 10)
        layout.setSpacing(4)
        title_label = QLabel(title)
        title_label.setStyleSheet(
            'font-size: 11px; color: #cfbe9d; font-family: "Consolas", "Lucida Console", monospace;'
        )
        value_label = QLabel("0")
        value_label.setStyleSheet("font-size: 24px; font-weight: 700; color: #fff2d6;")
        detail_label = QLabel("Pending")
        detail_label.setWordWrap(True)
        detail_label.setObjectName("subtleLabel")
        layout.addWidget(title_label)
        layout.addWidget(value_label)
        layout.addWidget(detail_label)
        return box, value_label, detail_label

    def _update_input_stats(self) -> None:
        self.input_stats_label.setText(self._format_text_stats(self.input_editor.toPlainText()))

    def _update_output_stats(self) -> None:
        self.output_stats_label.setText(self._format_text_stats(self.output_editor.toPlainText()))

    def _format_text_stats(self, text: str) -> str:
        words = len(re.findall(r"\b[\w']+\b", text))
        chars = len(text)
        lines = len(text.splitlines()) if text else 0
        return f"{words} words | {chars} chars | {lines} lines"

    def _format_quick_audit(self, notes: list[str]) -> str:
        if not notes:
            return "Quick audit looks clean.\n\nProvider analysis is running in the background..."
        return "Quick audit:\n" + "\n".join(f"- {item}" for item in notes)

    def _reveal_output_panel(self) -> None:
        self.workspace_splitter.setSizes([520, 620, 360])
        self.output_editor.setFocus()
        self.output_editor.moveCursor(self.output_editor.textCursor().MoveOperation.Start)
        QTimer.singleShot(0, lambda: self.app_scroll.ensureWidgetVisible(self.output_card, 0, 12))
