# -*- coding: utf-8 -*-
"""
Ponto de entrada obrigatório do complemento QGIS: Planos Diretores do Brasil — QGIS.
Compatível com QGIS 3.28+ (PyQt5) e QGIS 4.x (PyQt6).
"""

from __future__ import annotations

import importlib
import logging
import sys

LOGGER = logging.getLogger("PlanosDiretoresBrasil")


def _reload_submodules() -> None:
    """Recarrega submódulos em ordem segura durante recarregamento a quente no QGIS."""
    modules = [
        "planos_diretores.core.qt_compat",
        "planos_diretores.core.background_job",
        "planos_diretores.core.ibge_malhas",
        "planos_diretores.core.api_client",
        "planos_diretores.core.layer_loader",
        "planos_diretores.gui.main_dialog",
        "planos_diretores.plugin",
    ]
    for mod_name in modules:
        mod_obj = sys.modules.get(mod_name)
        if mod_obj is not None:
            try:
                importlib.reload(mod_obj)
            except ImportError as exc:
                LOGGER.debug("Submódulo não recarregado (%s): %s", mod_name, exc)


def classFactory(iface):  # noqa: N802 - assinatura exigida pelo QGIS
    _reload_submodules()
    from .plugin import PlanosDiretoresPlugin

    return PlanosDiretoresPlugin(iface)
