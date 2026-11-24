# -*- coding: utf-8 -*-
"""
Empacota e valida o complemento QGIS (Planos Diretores do Brasil — QGIS) em dist/planos_diretores_qgis.zip.
Opcionalmente sincroniza com o perfil ativo do QGIS3/QGIS4 no Windows (--sync-local).
"""

from __future__ import annotations

import argparse
import configparser
import os
import shutil
import sys
import zipfile
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[1]
PLUGIN_SRC = ROOT_DIR / "plugins" / "qgis" / "planos_diretores"
DIST_ZIP = ROOT_DIR / "dist" / "planos_diretores_qgis.zip"


def validar_estrutura_zip(zip_path: Path) -> list[str]:
    erros: list[str] = []
    if not zip_path.exists():
        return [f"Arquivo ZIP não encontrado: {zip_path}"]

    with zipfile.ZipFile(zip_path, "r") as zf:
        names = set(zf.namelist())
        if "planos_diretores/__init__.py" not in names:
            erros.append("Falta planos_diretores/__init__.py no pacote ZIP")
        else:
            init_code = zf.read("planos_diretores/__init__.py").decode("utf-8")
            if "def classFactory(" not in init_code:
                erros.append("__init__.py não define classFactory(iface)")

        if "planos_diretores/metadata.txt" not in names:
            erros.append("Falta planos_diretores/metadata.txt no pacote ZIP")
        else:
            meta_txt = zf.read("planos_diretores/metadata.txt").decode("utf-8")
            cp = configparser.ConfigParser()
            cp.read_string(meta_txt)
            for req in ("name", "qgisMinimumVersion", "description", "version", "author", "email"):
                if not cp.has_option("general", req) or not cp.get("general", req).strip():
                    erros.append(f"metadata.txt sem campo obrigatório: {req}")

        # Garante compatibilidade PyQt5 / PyQt6 sem imports exclusivos de PyQt5
        for n in names:
            if n.endswith(".py"):
                code = zf.read(n).decode("utf-8")
                if "from PyQt5" in code or "import PyQt5" in code or "from PyQt6" in code:
                    erros.append(f"{n} importa PyQt5/PyQt6 diretamente em vez de qgis.PyQt")
    return erros


def empacotar(sync_local: bool = False) -> Path:
    DIST_ZIP.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(DIST_ZIP, "w", zipfile.ZIP_DEFLATED) as zf:
        for root, dirs, files in os.walk(PLUGIN_SRC):
            dirs[:] = [d for d in dirs if d != "__pycache__" and not d.startswith(".")]
            for file in files:
                if file.endswith((".pyc", ".pyo")) or file.startswith("."):
                    continue
                abs_file = Path(root) / file
                rel_in_zip = Path("planos_diretores") / abs_file.relative_to(PLUGIN_SRC)
                zf.write(abs_file, rel_in_zip.as_posix())

    erros = validar_estrutura_zip(DIST_ZIP)
    if erros:
        raise RuntimeError("Validação do pacote QGIS falhou:\n" + "\n".join(erros))

    print(f"[OK] Plugin QGIS empacotado e validado: {DIST_ZIP} ({DIST_ZIP.stat().st_size:,} bytes)")

    if sync_local:
        for qgis_ver in ("QGIS4", "QGIS3"):
            target = Path(os.path.expandvars(rf"%APPDATA%\QGIS\{qgis_ver}\profiles\default\python\plugins\planos_diretores"))
            if target.parent.exists():
                if target.exists():
                    shutil.rmtree(target)
                shutil.copytree(PLUGIN_SRC, target, ignore=shutil.ignore_patterns("__pycache__", "*.pyc"))
                print(f"[OK] Sincronizado no perfil local {qgis_ver}: {target}")
    return DIST_ZIP


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--sync-local", action="store_true", help="Copia o plugin para %APPDATA%\\QGIS\\QGIS3 e QGIS4")
    args = parser.parse_args()
    empacotar(sync_local=args.sync_local)
    sys.exit(0)
