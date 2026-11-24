# -*- coding: utf-8 -*-
"""
Prepara e valida o pacote oficial para envio ao QGIS Official Plugin Repository
(https://plugins.qgis.org/plugins/add/), verificando checklist de publicação.
"""

from __future__ import annotations

import configparser
import sys
from pathlib import Path

from empacotar_qgis import PLUGIN_SRC, empacotar, validar_estrutura_zip

ROOT_DIR = Path(__file__).resolve().parents[1]


def verificar_checklist_publicacao() -> int:
    zip_path = empacotar(sync_local=True)
    erros = validar_estrutura_zip(zip_path)
    meta_path = PLUGIN_SRC / "metadata.txt"
    cp = configparser.ConfigParser()
    cp.read(meta_path, encoding="utf-8")

    print("\n=== Checklist de Publicação Oficial no QGIS Plugin Repository ===")
    campos = [
        ("name", "Nome do complemento"),
        ("version", "Versão"),
        ("qgisMinimumVersion", "Versão mínima QGIS"),
        ("qgisMaximumVersion", "Versão máxima QGIS"),
        ("supportsQt6", "Suporte QGIS 4 / Qt6"),
        ("author", "Autor"),
        ("email", "E-mail do autor"),
        ("repository", "URL do repositório Git"),
        ("tracker", "URL do tracker de issues"),
        ("homepage", "Homepage"),
        ("icon", "Ícone"),
    ]
    for chave, rotulo in campos:
        val = cp.get("general", chave, fallback="").strip()
        status = "OK" if val else "AUSENTE"
        print(f"  [{status}] {rotulo} ({chave}): {val}")
        if not val:
            erros.append(f"Campo recomendado ausente no metadata.txt: {chave}")

    if not (PLUGIN_SRC / "LICENSE").exists() and (ROOT_DIR / "LICENSE").exists():
        print("  [INFO] LICENSE presente na raiz do repositório; recomenda-se manter cópia também na pasta do plugin.")

    if erros:
        print("\n[FALHA] Corrija os itens acima antes de publicar:")
        for e in erros:
            print("  -", e)
        return 1

    print(f"\n[PRONTO] Pacote validado para upload em https://plugins.qgis.org/: {zip_path}")
    return 0


if __name__ == "__main__":
    sys.exit(verificar_checklist_publicacao())
