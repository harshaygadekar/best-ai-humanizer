from __future__ import annotations

from dataclasses import replace

from PySide6.QtCore import QThreadPool, QTimer, Qt
from PySide6.QtGui import QGuiApplication
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
    QPushButton,
    QSizePolicy,
    QSlider,
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
    def __init__(self, service: HumanizerService) -> None:
        super().__init__()
        self.service = service
        self.settings = self.service.settings_store.load()
        self.thread_pool = QThreadPool.globalInstance()
        self._task_counter = 0
        self._active_task_id = 0
        self._workers: dict[int, FunctionWorker] = {}
        self._live_snapshot = self.service.analyze_text("")

        self.setWindowTitle("AI Humanizer")
        self.resize(1420, 930)
        self._build_ui()
        self._apply_settings()
        self._connect_events()
        self._run_live_analysis()
        self.refresh_models(background=False)

    def _build_ui(self) -> None:
        surface = TexturedSurface()
        self.setCentralWidget(surface)

        root = QHBoxLayout(surface)
        root.setContentsMargins(20, 20, 20, 20)
        root.setSpacing(18)

        left_column = QVBoxLayout()
        left_column.setSpacing(16)
        right_column = QVBoxLayout()
        right_column.setSpacing(16)

        root.addLayout(left_column, stretch=5)
        root.addLayout(right_column, stretch=2)

        top_bar = QFrame()
        top_bar.setProperty("card", True)
        top_bar_layout = QHBoxLayout(top_bar)
        top_bar_layout.setContentsMargins(18, 16, 18, 16)
        title_wrap = QVBoxLayout()
        eyebrow = QLabel("Local AI Text Humanizer")
        eyebrow.setProperty("role", "eyebrow")
        title = QLabel("Vintage rewrite console")
        title.setStyleSheet("font-size: 28px; font-weight: 600;")
        subtitle = QLabel("Heavy humanization, live local analysis, provider-backed rewrite and audit.")
        subtitle.setStyleSheet("color: #575249;")
        title_wrap.addWidget(eyebrow)
        title_wrap.addWidget(title)
        title_wrap.addWidget(subtitle)
        top_bar_layout.addLayout(title_wrap)
        top_bar_layout.addStretch(1)
        self.status_label = QLabel("Ready.")
        self.status_label.setStyleSheet("font-weight: 600; color: #435652;")
        top_bar_layout.addWidget(self.status_label)
        left_column.addWidget(top_bar)

        self.input_card = self._make_card("Source text")
        self.input_editor = QTextEdit()
        self.input_editor.setPlaceholderText("Paste raw text here...")
        self.input_editor.setMinimumHeight(210)
        self.input_card.layout().addWidget(self.input_editor)
        left_column.addWidget(self.input_card, stretch=3)

        self.voice_card = self._make_card("Voice sample")
        voice_header = QHBoxLayout()
        voice_header.setContentsMargins(0, 0, 0, 0)
        self.voice_toggle = QToolButton()
        self.voice_toggle.setText("Show voice matching sample")
        self.voice_toggle.setCheckable(True)
        self.voice_toggle.setToolButtonStyle(Qt.ToolButtonStyle.ToolButtonTextOnly)
        voice_header.addWidget(self.voice_toggle)
        voice_header.addStretch(1)
        self.voice_card.layout().addLayout(voice_header)
        self.voice_editor = QTextEdit()
        self.voice_editor.setPlaceholderText("Optional: paste a sample of your own writing to guide tone and rhythm.")
        self.voice_editor.setVisible(False)
        self.voice_editor.setMaximumHeight(170)
        self.voice_card.layout().addWidget(self.voice_editor)
        left_column.addWidget(self.voice_card)

        self.output_card = self._make_card("Humanized output")
        output_actions = QHBoxLayout()
        output_actions.setContentsMargins(0, 0, 0, 0)
        self.copy_button = QPushButton("Copy")
        self.clear_output_button = QPushButton("Clear")
        output_actions.addStretch(1)
        output_actions.addWidget(self.copy_button)
        output_actions.addWidget(self.clear_output_button)
        self.output_card.layout().addLayout(output_actions)
        self.output_editor = QTextEdit()
        self.output_editor.setReadOnly(True)
        self.output_editor.setMinimumHeight(250)
        self.output_card.layout().addWidget(self.output_editor)

        self.analysis_notes = QPlainTextEdit()
        self.analysis_notes.setReadOnly(True)
        self.analysis_notes.setMaximumHeight(160)
        self.analysis_notes.setPlaceholderText("AI-backed notes and remaining tells will appear here.")
        self.output_card.layout().addWidget(self.analysis_notes)
        left_column.addWidget(self.output_card, stretch=3)

        self.config_card = self._make_card("Model and provider")
        right_column.addWidget(self.config_card)
        config_layout = self.config_card.layout()

        self.provider_combo = QComboBox()
        for provider in ProviderType:
            self.provider_combo.addItem(provider.label, provider)
        self.model_combo = QComboBox()
        self.model_combo.setEditable(True)
        self.model_combo.setInsertPolicy(QComboBox.InsertPolicy.NoInsert)
        self.refresh_models_button = QPushButton("Refresh models")
        self.api_key_input = QLineEdit()
        self.api_key_input.setEchoMode(QLineEdit.EchoMode.Password)
        self.api_key_input.setPlaceholderText("API key")
        self.base_url_input = QLineEdit()
        self.base_url_input.setPlaceholderText("http://localhost:11434/api")

        provider_grid = QGridLayout()
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

        self.temperature_card = self._make_card("Temperature")
        temp_layout = self.temperature_card.layout()
        temp_row = QHBoxLayout()
        self.temperature_value = QLabel("0.7")
        self.temperature_value.setStyleSheet("font-weight: 700; color: #435652;")
        temp_row.addWidget(QLabel("Control"))
        temp_row.addStretch(1)
        temp_row.addWidget(self.temperature_value)
        self.temperature_slider = QSlider(Qt.Orientation.Horizontal)
        self.temperature_slider.setRange(1, 10)
        self.temperature_slider.setTickInterval(1)
        temp_layout.addLayout(temp_row)
        temp_layout.addWidget(self.temperature_slider)
        right_column.addWidget(self.temperature_card)

        self.techniques_card = self._make_card("Humanization techniques")
        technique_layout = self.techniques_card.layout()
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
        right_column.addWidget(self.techniques_card)

        self.actions_card = self._make_card("Actions")
        actions_layout = self.actions_card.layout()
        self.humanize_button = QPushButton("Humanize")
        self.humanize_button.setProperty("accent", True)
        self.analyze_button = QPushButton("Analyze")
        self.regenerate_button = QPushButton("Regenerate")
        actions_layout.addWidget(self.humanize_button)
        actions_layout.addWidget(self.analyze_button)
        actions_layout.addWidget(self.regenerate_button)
        right_column.addWidget(self.actions_card)

        self.metrics_card = self._make_card("Detection and metrics")
        metrics_layout = self.metrics_card.layout()
        score_grid = QGridLayout()
        self.detection_score = self._make_metric_box("Detection risk")
        self.human_score = self._make_metric_box("Human-likeness")
        score_grid.addWidget(self.detection_score, 0, 0)
        score_grid.addWidget(self.human_score, 0, 1)
        metrics_layout.addLayout(score_grid)

        self.metric_grid = QGridLayout()
        self.metric_boxes: dict[str, tuple[QLabel, QLabel]] = {}
        for index, key in enumerate(
            [
                "readability",
                "sentence_variation",
                "paragraph_variation",
                "filler_density",
                "repetition",
                "punctuation",
            ]
        ):
            box = self._make_metric_box(key.replace("_", " ").title())
            value_label = box.findChild(QLabel, "value")
            detail_label = box.findChild(QLabel, "detail")
            self.metric_boxes[key] = (value_label, detail_label)
            row = 1 + index // 2
            col = index % 2
            self.metric_grid.addWidget(box, row, col)
        metrics_layout.addLayout(self.metric_grid)

        self.suggestions_box = QPlainTextEdit()
        self.suggestions_box.setReadOnly(True)
        self.suggestions_box.setPlaceholderText("Actionable suggestions will update here.")
        self.suggestions_box.setMaximumHeight(180)
        metrics_layout.addWidget(self.suggestions_box)
        right_column.addWidget(self.metrics_card, stretch=1)

    def _connect_events(self) -> None:
        self.provider_combo.currentIndexChanged.connect(self._provider_changed)
        self.model_combo.currentTextChanged.connect(self._on_config_changed)
        self.temperature_slider.valueChanged.connect(self._temperature_changed)
        self.base_url_input.textChanged.connect(self._on_config_changed)
        self.api_key_input.editingFinished.connect(self._persist_secret)
        self.refresh_models_button.clicked.connect(self.refresh_models)
        self.humanize_button.clicked.connect(self.run_humanize)
        self.regenerate_button.clicked.connect(self.run_humanize)
        self.analyze_button.clicked.connect(self.run_provider_analysis)
        self.copy_button.clicked.connect(self.copy_output)
        self.clear_output_button.clicked.connect(self.clear_output)
        self.voice_toggle.toggled.connect(self.voice_editor.setVisible)
        self.voice_toggle.toggled.connect(self._on_config_changed)
        self.input_editor.textChanged.connect(self._schedule_live_analysis)
        self.voice_editor.textChanged.connect(self._on_config_changed)

        for checkbox in (
            self.typo_checkbox,
            self.punctuation_checkbox,
            self.repetition_checkbox,
            self.formatting_checkbox,
        ):
            checkbox.toggled.connect(self._on_config_changed)

        self._analysis_timer = QTimer(self)
        self._analysis_timer.setInterval(320)
        self._analysis_timer.setSingleShot(True)
        self._analysis_timer.timeout.connect(self._run_live_analysis)

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

    def _provider_changed(self) -> None:
        provider = self.current_provider()
        self.api_key_input.setVisible(provider in {ProviderType.GEMINI, ProviderType.GROQ})
        self.base_url_input.setVisible(provider == ProviderType.OLLAMA)
        self.api_key_input.setText(self.service.secret_store.get(provider, "api_key"))
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

    def _schedule_live_analysis(self) -> None:
        self._analysis_timer.start()
        self._validate_actions()

    def _run_live_analysis(self) -> None:
        self._live_snapshot = self.service.analyze_text(self.input_editor.toPlainText())
        self._apply_analysis_snapshot(self._live_snapshot, heading="Live input analysis")

    def refresh_models(self, background: bool = True) -> None:
        provider = self.current_provider()
        config = self._provider_config()

        def task():
            return self.service.list_models(provider, config)

        self._run_task(
            task,
            on_result=self._models_loaded,
            busy_message="Refreshing models..." if background else "Loading models...",
        )

    def run_humanize(self) -> None:
        request = self._build_request()
        config = self._provider_config()
        if not request:
            return

        def task():
            return self.service.humanize(request, config)

        self._run_task(task, on_result=self._humanize_finished, busy_message="Humanizing text...")

    def run_provider_analysis(self) -> None:
        text = self.output_editor.toPlainText().strip() or self.input_editor.toPlainText().strip()
        if not text:
            return
        provider = self.current_provider()
        model_id = self.current_model_id()
        config = self._provider_config()

        def task():
            return self.service.analyze_with_provider(provider, model_id, config, text)

        self._run_task(task, on_result=self._provider_analysis_finished, busy_message="Running AI analysis...")

    def _run_task(self, fn, *, on_result, busy_message: str) -> None:
        self._task_counter += 1
        task_id = self._task_counter
        self._active_task_id = task_id
        self._set_busy(True, busy_message)
        worker = FunctionWorker(task_id, fn)
        self._workers[task_id] = worker
        worker.signals.result.connect(on_result)
        worker.signals.error.connect(self._task_failed)
        worker.signals.finished.connect(self._task_finished)
        self.thread_pool.start(worker)

    def _humanize_finished(self, result: HumanizeWorkflowResult, task_id: int) -> None:
        if task_id != self._active_task_id:
            return
        self.output_editor.setPlainText(result.rewrite.output_text)
        combined_notes = result.ai_analysis_notes or []
        if result.rewrite.audit_notes:
            combined_notes = ["Remaining tells:"] + result.rewrite.audit_notes + [""] + combined_notes
        self.analysis_notes.setPlainText("\n".join(combined_notes).strip())
        self._apply_analysis_snapshot(result.local_analysis, heading="Latest result analysis", provider_notes=result.ai_analysis_notes)
        self.status_label.setText("Humanization complete.")

    def _provider_analysis_finished(self, result, task_id: int) -> None:
        if task_id != self._active_task_id:
            return
        notes = result.provider_notes or []
        self.analysis_notes.setPlainText("\n".join(notes))
        self._apply_analysis_result(result, heading="Provider-backed analysis")
        self.status_label.setText("Analysis complete.")

    def _models_loaded(self, models, task_id: int) -> None:
        if task_id != self._active_task_id:
            return
        current_text = self.current_model_id()
        provider = self.current_provider()
        self.model_combo.blockSignals(True)
        self.model_combo.clear()
        for model in models:
            self.model_combo.addItem(model.display_name, model.model_id)
        if current_text:
            self.model_combo.setEditText(self._format_model_display(provider, current_text))
        self.model_combo.blockSignals(False)
        self._validate_actions()
        self.status_label.setText(f"Loaded {len(models)} models.")

    def _task_failed(self, message: str, task_id: int) -> None:
        if task_id != self._active_task_id:
            return
        self.status_label.setText("Request failed.")
        self.analysis_notes.setPlainText(message)

    def _task_finished(self, task_id: int) -> None:
        self._workers.pop(task_id, None)
        if task_id == self._active_task_id:
            self._set_busy(False, "")

    def _set_busy(self, busy: bool, message: str) -> None:
        self.humanize_button.setDisabled(busy)
        self.analyze_button.setDisabled(busy)
        self.regenerate_button.setDisabled(busy)
        self.refresh_models_button.setDisabled(busy)
        if busy:
            self.status_label.setText(message)
        else:
            self._validate_actions()

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
        self._validate_actions()

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
        self._validate_actions()

    def _validate_actions(self) -> None:
        has_text = bool(self.input_editor.toPlainText().strip())
        has_model = bool(self.current_model_id())
        provider = self.current_provider()
        has_provider_auth = True
        if provider in {ProviderType.GEMINI, ProviderType.GROQ}:
            has_provider_auth = bool(self.api_key_input.text().strip() or self.service.secret_store.get(provider, "api_key"))
        enabled = has_text and has_model and has_provider_auth
        self.humanize_button.setEnabled(enabled)
        self.regenerate_button.setEnabled(enabled)
        self.analyze_button.setEnabled(enabled or bool(self.output_editor.toPlainText().strip()))

    def _apply_analysis_snapshot(
        self,
        snapshot: LocalAnalysisSnapshot,
        *,
        heading: str,
        provider_notes: list[str] | None = None,
    ) -> None:
        result = snapshot.result
        self._apply_analysis_result(result, heading=heading)
        notes = provider_notes or result.provider_notes or []
        if not self.analysis_notes.toPlainText().strip() and notes:
            self.analysis_notes.setPlainText("\n".join(notes))

    def _apply_analysis_result(self, result, *, heading: str) -> None:
        self.detection_score.findChild(QLabel, "value").setText(f"{result.detection_risk:.1f}")
        self.detection_score.findChild(QLabel, "detail").setText("Higher means riskier")
        self.human_score.findChild(QLabel, "value").setText(f"{result.human_likeness:.1f}")
        self.human_score.findChild(QLabel, "detail").setText("Higher reads more human")
        for key, metric in result.metrics.items():
            value_label, detail_label = self.metric_boxes[key]
            value_label.setText(str(metric.value))
            detail_label.setText(metric.detail)
        suggestion_lines = [heading, ""] + [f"- {item}" for item in result.suggestions]
        if result.provider_notes:
            suggestion_lines += ["", "Provider notes:"] + [f"- {note}" for note in result.provider_notes]
        self.suggestions_box.setPlainText("\n".join(suggestion_lines))

    def copy_output(self) -> None:
        text = self.output_editor.toPlainText().strip()
        if not text:
            return
        QGuiApplication.clipboard().setText(text)
        self.status_label.setText("Output copied.")

    def clear_output(self) -> None:
        self.output_editor.clear()
        self.analysis_notes.clear()
        self.status_label.setText("Output cleared.")

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

    def _make_card(self, title: str) -> QFrame:
        card = QFrame()
        card.setProperty("card", True)
        layout = QVBoxLayout(card)
        layout.setContentsMargins(16, 16, 16, 16)
        layout.setSpacing(12)
        label = QLabel(title)
        label.setStyleSheet("font-size: 18px; font-weight: 600;")
        layout.addWidget(label)
        return card

    def _make_metric_box(self, title: str) -> QFrame:
        box = QFrame()
        box.setProperty("metric", True)
        box.setSizePolicy(QSizePolicy.Policy.Expanding, QSizePolicy.Policy.Fixed)
        layout = QVBoxLayout(box)
        layout.setContentsMargins(12, 10, 12, 10)
        layout.setSpacing(4)
        title_label = QLabel(title)
        title_label.setStyleSheet("font-size: 11px; color: #615b51; text-transform: uppercase;")
        value_label = QLabel("0")
        value_label.setObjectName("value")
        value_label.setStyleSheet("font-size: 24px; font-weight: 700; color: #344742;")
        detail_label = QLabel("Pending")
        detail_label.setObjectName("detail")
        detail_label.setWordWrap(True)
        detail_label.setStyleSheet("color: #6c665d;")
        layout.addWidget(title_label)
        layout.addWidget(value_label)
        layout.addWidget(detail_label)
        return box
