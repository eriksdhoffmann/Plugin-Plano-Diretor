# -*- coding: utf-8 -*-
"""Classe principal de ciclo de vida do plugin Planos Diretores do Brasil — QGIS."""

from __future__ import annotations

import os

from qgis.PyQt.QtGui import QIcon

from . import _reload_submodules
from .core.qt_compat import QActionCompat


class PlanosDiretoresPlugin:
    """Registra ícone na barra de ferramentas, menu no QGIS e abre o diálogo principal."""

    def __init__(self, iface):
        self.iface = iface
        self.plugin_dir = os.path.dirname(os.path.abspath(__file__))
        self.action = None
        self.dialog = None
        self.menu_name = "&Planos Diretores do Brasil"

    def initGui(self) -> None:  # noqa: N802 - convenção PyQGIS
        icon_path = os.path.join(self.plugin_dir, "icon.svg")
        self.action = QActionCompat(
            QIcon(icon_path),
            "Planos Diretores do Brasil — QGIS...",
            self.iface.mainWindow(),
        )
        self.action.setToolTip(
            "Consulta Planos Diretores, legislações municipais e carrega camadas GIS oficiais por UF/Município (IBGE)"
        )
        self.action.triggered.connect(self.run)

        self.iface.addToolBarIcon(self.action)
        self.iface.addPluginToMenu(self.menu_name, self.action)

    def unload(self) -> None:
        if self.action is not None:
            self.iface.removePluginMenu(self.menu_name, self.action)
            self.iface.removeToolBarIcon(self.action)
            self.action = None
        if self.dialog is not None:
            self.dialog.close()
            self.dialog = None

    def run(self) -> None:
        _reload_submodules()
        from .gui.main_dialog import PlanosDiretoresDialog

        if self.dialog is None:
            self.dialog = PlanosDiretoresDialog(self.iface)
        self.dialog.show()
        self.dialog.raise_()
        self.dialog.activateWindow()
        self.dialog.exec()
