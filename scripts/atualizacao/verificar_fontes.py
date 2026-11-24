# -*- coding: utf-8 -*-
"""
Audita a disponibilidade HTTP das URLs oficiais e serviços GIS cadastrados
em data/catalogo/planos_diretores_verificados.json sem alterar dados em caso de falha.
"""

from __future__ import annotations

import json
import sys
import urllib.error
import urllib.request
from datetime import date
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[2]
CATALOGO_FILE = ROOT_DIR / "data" / "catalogo" / "planos_diretores_verificados.json"


def testar_url(url: str) -> tuple[int | None, str]:
    req = urllib.request.Request(
        url,
        headers={"User-Agent": "PlanosDiretoresBrasil-Auditoria/1.0"},
        method="GET",
    )
    try:
        with urllib.request.urlopen(req, timeout=12) as resp:
            return resp.status, "OK"
    except urllib.error.HTTPError as exc:
        return exc.code, f"HTTP {exc.code}"
    except Exception as exc:
        return None, str(exc)


def auditar() -> None:
    data = json.loads(CATALOGO_FILE.read_text(encoding="utf-8"))
    print(f"=== Auditoria de Fontes Oficiais ({date.today().isoformat()}) ===")
    for entry in data.get("planos_diretores", []):
        print(f"\n[{entry['codigo_ibge']}] {entry['municipio']}/{entry['uf']} ({entry['situacao']})")
        if entry.get("url_oficial"):
            code, msg = testar_url(entry["url_oficial"])
            print(f"  Portal principal: {entry['url_oficial']} -> {code or '-'} ({msg})")
        for cam in entry.get("camadas_gis", []):
            url = cam["url"]
            probe = f"{url}?f=json" if cam["tipo_servico"] == "arcgis_rest" and "?" not in url else url
            code, msg = testar_url(probe)
            print(f"  Camada [{cam['tipo_servico']}] {cam['nome']}: {code or '-'} ({msg})")


if __name__ == "__main__":
    auditar()
    sys.exit(0)
