# -*- coding: utf-8 -*-
"""
Coleta a base oficial nacional da pesquisa IBGE MUNIC (Perfil dos Municípios Brasileiros — 2021)
para TODOS os 5.571 municípios brasileiros:
  - 94437: Plano diretor - existência (Sim / Não)
  - 94438: Ano da lei de criação
  - 94439: O plano foi revisto (Sim / Não)
  - 94440: Ano da última revisão
  - 94441: O município está elaborando o Plano Diretor (Sim / Não)

Grava data/catalogo/munic_ibge_planos_diretores.json indexado pelo código IBGE de 7 dígitos.
"""

from __future__ import annotations

import json
import os
import sys
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[2]
IBGE_FILE = ROOT_DIR / "data" / "municipios" / "municipios_ibge.json"
OUT_FILE = ROOT_DIR / "data" / "catalogo" / "munic_ibge_planos_diretores.json"

INDICADORES = "94437|94438|94439|94440|94441"
PERIODO = "2021"
BASE_URL = f"https://servicodados.ibge.gov.br/api/v1/pesquisas/1/periodos/{PERIODO}/indicadores/{INDICADORES}/resultados"


def _parse_int_or_none(val: str | None) -> int | None:
    if not val:
        return None
    s = str(val).strip()
    if s.isdigit():
        num = int(s)
        if 1950 <= num <= 2030:
            return num
    return None


def _buscar_lote(lote6: list[str]) -> list[dict]:
    locs = "|".join(lote6)
    url = f"{BASE_URL}/{locs}"
    req = urllib.request.Request(
        url,
        headers={"User-Agent": "PlanosDiretoresBrasil-MUNIC/1.0", "Accept": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode("utf-8"))


def coletar_munic_nacional() -> dict:
    ibge_data = json.loads(IBGE_FILE.read_text(encoding="utf-8"))
    municipios = ibge_data.get("municipios", [])

    # Mapa 6 dígitos -> lista de registros de 7 dígitos (IBGE MUNIC usa 6 dígitos na API de pesquisas)
    map6_to_7: dict[str, str] = {}
    for m in municipios:
        cod7 = str(m["codigo_ibge"])
        map6_to_7[cod7[:6]] = cod7

    cods6 = sorted(map6_to_7.keys())
    lotes = [cods6[i : i + 100] for i in range(0, len(cods6), 100)]

    por_cod6: dict[str, dict[str, str | None]] = {c: {} for c in cods6}

    with ThreadPoolExecutor(max_workers=6) as pool:
        futs = {pool.submit(_buscar_lote, lote): lote for lote in lotes}
        for fut in as_completed(futs):
            resp_list = fut.result()
            for ind_obj in resp_list:
                ind_id = str(ind_obj.get("id"))
                for item in ind_obj.get("res", []):
                    loc = str(item.get("localidade", "")).strip()
                    val = (item.get("res") or {}).get(PERIODO)
                    if loc in por_cod6:
                        por_cod6[loc][ind_id] = val

    registros: dict[str, dict] = {}
    contagem = {"sim": 0, "em_elaboracao": 0, "nao": 0, "sem_dados": 0}

    for cod6, cod7 in map6_to_7.items():
        vals = por_cod6.get(cod6, {})
        existe_raw = (vals.get("94437") or "").strip()
        elab_raw = (vals.get("94441") or "").strip()
        revisto_raw = (vals.get("94439") or "").strip()

        if existe_raw == "Sim":
            status = "sim"
        elif elab_raw == "Sim":
            status = "em_elaboracao"
        elif existe_raw == "Não":
            status = "nao"
        else:
            status = "sem_dados"

        contagem[status] += 1
        registros[cod7] = {
            "munic_possui_plano": status,
            "munic_ano_criacao": _parse_int_or_none(vals.get("94438")),
            "munic_foi_revisto": revisto_raw if revisto_raw in {"Sim", "Não"} else None,
            "munic_ano_revisao": _parse_int_or_none(vals.get("94440")),
        }

    payload = {
        "fonte": "IBGE — Pesquisa de Informações Básicas Municipais (MUNIC 2021)",
        "url_api": BASE_URL,
        "periodo": PERIODO,
        "coletado_em": datetime.now(timezone.utc).isoformat(),
        "total_municipios": len(registros),
        "resumo": contagem,
        "municipios": registros,
    }

    OUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    tmp = OUT_FILE.with_suffix(".json.part")
    tmp.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
    os.replace(tmp, OUT_FILE)
    return payload


if __name__ == "__main__":
    data = coletar_munic_nacional()
    print(f"[OK] IBGE MUNIC {PERIODO} coletado para {data['total_municipios']} municípios:")
    print(f"     Resumo real: {data['resumo']}")
    sys.exit(0)
