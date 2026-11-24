# -*- coding: utf-8 -*-
"""Testes headless do Plugin QGIS (API client offline, cache, compatibilidade Qt5/Qt6 e ZIP)."""

from __future__ import annotations

import importlib.util
from pathlib import Path

from scripts.empacotar_qgis import empacotar, validar_estrutura_zip

ROOT_DIR = Path(__file__).resolve().parents[2]
PLUGIN_DIR = ROOT_DIR / "plugins" / "qgis" / "planos_diretores"


def _load_module_direct(name: str, file_path: Path):
    spec = importlib.util.spec_from_file_location(name, str(file_path))
    assert spec and spec.loader
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def test_plugin_api_client_fallback_offline(tmp_path):
    # Importa api_client sem precisar do runtime do QGIS Desktop
    core_pkg = PLUGIN_DIR / "core"
    # Carrega ibge_malhas primeiro pois api_client importa dele relativamente
    import sys
    import types

    sys.modules.setdefault("planos_diretores", types.ModuleType("planos_diretores"))
    sys.modules.setdefault("planos_diretores.core", types.ModuleType("planos_diretores.core"))
    ibge_mod = _load_module_direct("planos_diretores.core.ibge_malhas", core_pkg / "ibge_malhas.py")
    sys.modules["planos_diretores.core.ibge_malhas"] = ibge_mod
    api_mod = _load_module_direct("planos_diretores.core.api_client", core_pkg / "api_client.py")

    client = api_mod.PlanosDiretoresApiClient(
        base_url="http://127.0.0.1:59999/api/v1",  # porta offline proposital para testar fallback
        data_dir=str(PLUGIN_DIR / "data"),
    )
    client.cache_dir = str(tmp_path)

    muns_sc = client.listar_municipios_por_uf("SC")
    assert len(muns_sc) == 295  # 295 municípios oficiais de Santa Catarina

    det_jlle, orig = client.obter_detalhe_municipio("4209102")
    assert orig == "fallback_embarcado"
    assert det_jlle["uf"] == "SC"
    assert len(det_jlle["camadas_gis"]) >= 1

    det_abdon, _ = client.obter_detalhe_municipio("4200051")
    assert det_abdon["situacao"] == "nao_localizado"
    assert api_mod.MENSAGEM_NAO_LOCALIZADO in det_abdon["aviso_documental"]


def test_empacotamento_e_compatibilidade_qgis3_qgis4():
    zip_path = empacotar(sync_local=False)
    erros = validar_estrutura_zip(zip_path)
    assert erros == []
