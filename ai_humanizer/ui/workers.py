from __future__ import annotations

from typing import Any, Callable

from PySide6.QtCore import QObject, QRunnable, Signal, Slot


class WorkerSignals(QObject):
    result = Signal(object, int)
    error = Signal(str, int)
    finished = Signal(int)


class FunctionWorker(QRunnable):
    def __init__(self, task_id: int, fn: Callable[..., Any], *args: Any, **kwargs: Any) -> None:
        super().__init__()
        self.task_id = task_id
        self.fn = fn
        self.args = args
        self.kwargs = kwargs
        self.signals = WorkerSignals()

    @Slot()
    def run(self) -> None:
        try:
            result = self.fn(*self.args, **self.kwargs)
        except Exception as exc:  # pragma: no cover - UI plumbing
            try:
                self.signals.error.emit(str(exc), self.task_id)
            except RuntimeError:
                pass
        else:
            try:
                self.signals.result.emit(result, self.task_id)
            except RuntimeError:
                pass
        finally:
            try:
                self.signals.finished.emit(self.task_id)
            except RuntimeError:
                pass
