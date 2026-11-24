# -*- coding: utf-8 -*-
"""
Executor assíncrono em QThread para evitar congelamento da interface do QGIS
durante consultas à API unificada e downloads geoespaciais.
"""

from __future__ import annotations

import logging
import traceback
from typing import Any, Callable, Set

from qgis.PyQt.QtCore import QThread, pyqtSignal

LOGGER = logging.getLogger("PlanosDiretoresBrasil")
_ACTIVE_JOBS: Set["BackgroundJob"] = set()


class JobCancelled(Exception):
    """Exceção interna para interromper tarefa cancelada pelo usuário."""


class BackgroundJob(QThread):
    """Executa `fn(report)` em thread de trabalho; sinais chegam com segurança na thread principal."""

    progress = pyqtSignal(int, str)
    succeeded = pyqtSignal(object)
    failed = pyqtSignal(str)
    cancelled = pyqtSignal()

    def __init__(self, fn: Callable[[Callable[[int, str], None]], Any]):
        super().__init__(None)
        self._fn = fn
        self._cancel_requested = False
        _ACTIVE_JOBS.add(self)
        self.finished.connect(self._release)

    def request_cancel(self) -> None:
        self._cancel_requested = True

    def report(self, pct: int, msg: str) -> None:
        if self._cancel_requested:
            raise JobCancelled()
        self.progress.emit(int(pct), str(msg))

    def run(self) -> None:
        try:
            result = self._fn(self.report)
            if self._cancel_requested:
                self.cancelled.emit()
            else:
                self.succeeded.emit(result)
        except JobCancelled:
            self.cancelled.emit()
        except Exception as exc:
            LOGGER.error("Erro em BackgroundJob: %s\n%s", exc, traceback.format_exc())
            if self._cancel_requested:
                self.cancelled.emit()
            else:
                self.failed.emit(str(exc) or exc.__class__.__name__)

    def _release(self) -> None:
        self.wait(10000)
        _ACTIVE_JOBS.discard(self)
