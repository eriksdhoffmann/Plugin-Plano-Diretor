# -*- coding: utf-8 -*-
"""
Prepara o bundle de dados estáticos em apps/webgis/public/data/ para que o WebGIS
funcione integralmente tanto conectado ao backend FastAPI quanto 100% estático
no GitHub Pages, incluindo a base nacional oficial IBGE MUNIC 2021 dos 5.571 municípios.
"""

from __future__ import annotations

import json
import shutil
import sys
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[1]
IBGE_FILE = ROOT_DIR / "data" / "municipios" / "municipios_ibge.json"
MUNIC_FILE = ROOT_DIR / "data" / "catalogo" / "munic_ibge_planos_diretores.json"
CATALOGO_FILE = ROOT_DIR / "data" / "catalogo" / "planos_diretores_verificados.json"
LEGISLACAO_DIR = ROOT_DIR / "data" / "legislacao"
OUT_DIR = ROOT_DIR / "apps" / "webgis" / "public" / "data"


def preparar_estatico() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    ibge_data = json.loads(IBGE_FILE.read_text(encoding="utf-8"))
    munic_map = {}
    if MUNIC_FILE.exists():
        munic_map = json.loads(MUNIC_FILE.read_text(encoding="utf-8")).get("municipios", {})

    compact = []
    for m in ibge_data.get("municipios", []):
        cod = m["codigo_ibge"]
        mu = munic_map.get(cod, {})
        compact.append(
            {
                "c": cod,
                "n": m["nome"],
                "u": m["uf"],
                "un": m.get("uf_nome", m["uf"]),
                "r": m.get("regiao", ""),
                "me": m.get("mesorregiao", ""),
                "mi": m.get("microrregiao", ""),
                "mp": mu.get("munic_possui_plano", "sem_dados"),
                "ma": mu.get("munic_ano_criacao"),
                "mr": mu.get("munic_ano_revisao"),
            }
        )
    (OUT_DIR / "municipios_ibge_compact.json").write_text(
        json.dumps(compact, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )

    shutil.copy2(CATALOGO_FILE, OUT_DIR / "planos_diretores_verificados.json")

    federal = {}
    municipais: dict[str, dict] = {}
    for arq in sorted(LEGISLACAO_DIR.glob("*.json")):
        conteudo = json.loads(arq.read_text(encoding="utf-8"))
        if arq.name.startswith("federal_"):
            federal = conteudo
        else:
            cod = str(conteudo.get("codigo_ibge", "")).strip()
            if cod:
                municipais[cod] = conteudo

    bundle = {"federal": federal, "municipais": municipais}
    (OUT_DIR / "legislacao_bundle.json").write_text(
        json.dumps(bundle, ensure_ascii=False),
        encoding="utf-8",
    )
    print(
        f"[OK] Dados estáticos + MUNIC gerados em {OUT_DIR}: "
        f"{len(compact)} municípios, {len(municipais)} legislações."
    )


if __name__ == "__main__":
    preparar_estatico()
    sys.exit(0)
