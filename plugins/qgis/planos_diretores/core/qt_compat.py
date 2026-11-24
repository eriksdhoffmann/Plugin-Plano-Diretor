# -*- coding: utf-8 -*-
"""Adaptadores leves de compatibilidade entre QGIS 3 (PyQt5 / Qt5) e QGIS 4 (PyQt6 / Qt6)."""

from __future__ import annotations

from qgis.core import QgsField
from qgis.PyQt.QtCore import Qt, QVariant

try:
    from qgis.PyQt.QtGui import QAction as QActionCompat
except ImportError:
    from qgis.PyQt.QtWidgets import QAction as QActionCompat  # type: ignore

try:
    from qgis.PyQt.QtCore import QMetaType

    HAS_QMETATYPE = True
except ImportError:
    QMetaType = None  # type: ignore
    HAS_QMETATYPE = False

USER_ROLE = Qt.ItemDataRole.UserRole if hasattr(Qt, "ItemDataRole") else Qt.UserRole
ALIGN_LEFT = Qt.AlignmentFlag.AlignLeft if hasattr(Qt, "AlignmentFlag") else Qt.AlignLeft
WORD_WRAP = True


def criar_qgs_field(nome: str, tipo: str) -> QgsField:
    """Cria QgsField usando QMetaType no Qt6 ou QVariant no Qt5."""
    if HAS_QMETATYPE and QMetaType is not None and hasattr(QMetaType, "Type"):
        if tipo == "int":
            return QgsField(nome, QMetaType.Type.LongLong)
        if tipo == "float":
            return QgsField(nome, QMetaType.Type.Double)
        return QgsField(nome, QMetaType.Type.QString)

    if tipo == "int":
        return QgsField(nome, QVariant.LongLong)
    if tipo == "float":
        return QgsField(nome, QVariant.Double)
    return QgsField(nome, QVariant.String)
