# -*- coding: utf-8 -*-
"""
Valida a integridade do catálogo nacional de Planos Diretores e da base IBGE.
Verifica códigos IBGE de 7 dígitos, taxonomia de situações e consistência de fontes.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[2]
IBGE_FILE = ROOT_DIR / "data" / "municipios" / "municipios_ibge.json"
CATALOGO_FILE = ROOT_DIR / "data" / "catalogo" / "planos_diretores_verificados.json"

SITUACOES_VALIDAS = {
    "vigente",
    "localizado_em_verificacao",
    "desatualizado_ou_substituido",
    "nao_localizado",
}
CONFIABILIDADES_VALIDAS = {"alta", "media", "baixa", "nao_verificada"}
TIPOS_SERVICO_VALIDOS = {
    "arcgis_rest",
    "wms",
    "wfs",
    "wmts",
    "geojson",
    "geopackage",
    "shapefile",
    "postgis",
}


def validar_tudo() -> list[str]:
    erros: list[str] = []

    if not IBGE_FILE.exists():
        return [f"Arquivo IBGE ausente: {IBGE_FILE}"]
    if not CATALOGO_FILE.exists():
        return [f"Catálogo verificado ausente: {CATALOGO_FILE}"]

    ibge_data = json.loads(IBGE_FILE.read_text(encoding="utf-8"))
    municipios = ibge_data.get("municipios", [])
    if len(municipios) < 5570:
        erros.append(f"Esperados >= 5570 municípios IBGE, encontrados {len(municipios)}")

    ibge_index: dict[str, dict] = {}
    for m in municipios:
        cod = str(m.get("codigo_ibge", ""))
        if len(cod) != 7 or not cod.isdigit():
            erros.append(f"Código IBGE inválido na base IBGE: {cod!r}")
        elif cod in ibge_index:
            erros.append(f"Código IBGE duplicado na base IBGE: {cod}")
        else:
            ibge_index[cod] = m

    cat_data = json.loads(CATALOGO_FILE.read_text(encoding="utf-8"))
    for entry in cat_data.get("planos_diretores", []):
        cod = str(entry.get("codigo_ibge", ""))
        if cod not in ibge_index:
            erros.append(f"Município {cod} do catálogo não existe na base IBGE")
            continue

        ibge_mun = ibge_index[cod]
        if entry.get("uf") != ibge_mun["uf"]:
            erros.append(f"UF divergente para {cod}: {entry.get('uf')} != {ibge_mun['uf']}")

        situacao = entry.get("situacao")
        if situacao not in SITUACOES_VALIDAS:
            erros.append(f"Situação inválida em {cod}: {situacao!r}")

        conf = entry.get("confiabilidade")
        if conf not in CONFIABILIDADES_VALIDAS:
            erros.append(f"Confiabilidade inválida em {cod}: {conf!r}")

        if situacao != "nao_localizado":
            if not entry.get("lei_principal"):
                erros.append(f"Registro {cod} sem lei_principal informada")
            if not entry.get("fonte_oficial"):
                erros.append(f"Registro {cod} sem fonte_oficial informada")
            if not entry.get("data_verificacao"):
                erros.append(f"Registro {cod} sem data_verificacao informada")

        for camada in entry.get("camadas_gis", []):
            tipo = camada.get("tipo_servico")
            if tipo not in TIPOS_SERVICO_VALIDOS:
                erros.append(f"Camada {camada.get('id')} em {cod} com tipo inválido: {tipo!r}")
            if camada.get("origem_geometria") not in {"oficial", "derivada_pdf"}:
                erros.append(f"Camada {camada.get('id')} em {cod} sem origem_geometria válida")
            if not camada.get("url"):
                erros.append(f"Camada {camada.get('id')} em {cod} sem URL")

    return erros


if __name__ == "__main__":
    problemas = validar_tudo()
    if problemas:
        for p in problemas:
            print(f"[ERRO] {p}")
        sys.exit(1)
    print("[OK] Catálogo nacional e base IBGE (7 dígitos) validados sem erros.")
    sys.exit(0)
