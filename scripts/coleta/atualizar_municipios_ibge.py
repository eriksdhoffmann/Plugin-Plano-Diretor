# -*- coding: utf-8 -*-
"""
Coleta a divisão territorial oficial mais recente do IBGE (Localidades v1)
e gera o arquivo normalizado data/municipios/municipios_ibge.json
indexado pelo código IBGE de 7 dígitos.
"""

from __future__ import annotations

import json
import os
import sys
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

IBGE_MUNICIPIOS_URL = "https://servicodados.ibge.gov.br/api/v1/localidades/municipios"

ROOT_DIR = Path(__file__).resolve().parents[2]
OUTPUT_FILE = ROOT_DIR / "data" / "municipios" / "municipios_ibge.json"


def extrair_registro(item: dict) -> dict:
    """Normaliza um registro retornado pela API v1/localidades/municipios do IBGE."""
    codigo = str(item.get("id", "")).strip()
    if len(codigo) != 7 or not codigo.isdigit():
        raise ValueError(f"Código IBGE inválido encontrado: {codigo!r}")

    micro = item.get("microrregiao") or {}
    meso = micro.get("mesorregiao") or {}
    uf_obj = meso.get("UF") or (item.get("regiao-imediata") or {}).get("regiao-intermediaria", {}).get("UF") or {}
    regiao_obj = uf_obj.get("regiao") or {}

    return {
        "codigo_ibge": codigo,
        "nome": str(item.get("nome", "")).strip(),
        "uf": str(uf_obj.get("sigla", "")).strip().upper(),
        "uf_nome": str(uf_obj.get("nome", "")).strip(),
        "regiao": str(regiao_obj.get("nome", "")).strip(),
        "mesorregiao": str(meso.get("nome", "")).strip(),
        "microrregiao": str(micro.get("nome", "")).strip(),
    }


def atualizar_municipios_ibge(output_path: Path = OUTPUT_FILE) -> dict:
    """Baixa os municípios da API oficial do IBGE e grava atomicamente em JSON."""
    req = urllib.request.Request(
        IBGE_MUNICIPIOS_URL,
        headers={
            "User-Agent": "PlanosDiretoresBrasil/1.0",
            "Accept": "application/json",
        },
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        if resp.status != 200:
            raise RuntimeError(f"API IBGE retornou HTTP {resp.status}")
        raw = json.loads(resp.read().decode("utf-8"))

    municipios = [extrair_registro(item) for item in raw]
    municipios.sort(key=lambda m: (m["uf"], m["nome"], m["codigo_ibge"]))

    ufs = sorted({m["uf"] for m in municipios if m["uf"]})
    if len(ufs) != 27:
        raise RuntimeError(f"Esperadas 27 UFs na resposta do IBGE, obtidas {len(ufs)}")

    payload = {
        "fonte": IBGE_MUNICIPIOS_URL,
        "coletado_em": datetime.now(timezone.utc).isoformat(),
        "total_municipios": len(municipios),
        "total_ufs": len(ufs),
        "municipios": municipios,
    }

    output_path.parent.mkdir(parents=True, exist_ok=True)
    tmp_path = output_path.with_suffix(".json.part")
    tmp_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    os.replace(tmp_path, output_path)
    return payload


if __name__ == "__main__":
    data = atualizar_municipios_ibge()
    print(
        f"[OK] Base IBGE atualizada: {data['total_municipios']} municípios em "
        f"{data['total_ufs']} UFs -> {OUTPUT_FILE}"
    )
    sys.exit(0)
