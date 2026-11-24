# -*- coding: utf-8 -*-
"""
Serviço de Geoprocessamento do Backend Unificado.

Responsabilidades:
- Proxy e cache atômico em disco para as malhas oficiais do IBGE (UFs e municípios)
  com enriquecimento de indicadores reais do catálogo.
- Conector para camadas geoespaciais municipais (ArcGIS REST, WFS, GeoJSON,
  WMS/WMTS, GeoPackage, Shapefile, PostGIS).
- Geração de legenda dinâmica preservando siglas e nomes locais originais.
- Cálculo geodésico aproximado de área (m² e hectares) quando o atributo não vier preenchido.
"""

from __future__ import annotations

import gzip
import hashlib
import json
import math
import os
from pathlib import Path
from typing import Any

import httpx
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..catalogo.service import listar_estados_com_cobertura
from ..db.database import DATA_DIR
from ..db.models import CamadaGIS, Municipio, PlanoDiretor

CACHE_DIR = DATA_DIR / "mapas" / "cache"
IBGE_MALHAS_BASE = "https://servicodados.ibge.gov.br/api/v3/malhas"

UF_TO_COD_IBGE = {
    "RO": "11", "AC": "12", "AM": "13", "RR": "14", "PA": "15", "AP": "16", "TO": "17",
    "MA": "21", "PI": "22", "CE": "23", "RN": "24", "PB": "25", "PE": "26", "AL": "27",
    "SE": "28", "BA": "29", "MG": "31", "ES": "32", "RJ": "33", "SP": "35", "PR": "41",
    "SC": "42", "RS": "43", "MS": "50", "MT": "51", "GO": "52", "DF": "53",
}
COD_TO_UF = {v: k for k, v in UF_TO_COD_IBGE.items()}

PALETA_ZONAS = [
    "#2563eb", "#059669", "#d97706", "#dc2626", "#7c3aed",
    "#0891b2", "#65a30d", "#db2777", "#ea580c", "#4f46e5",
    "#0d9488", "#ca8a04", "#9333ea", "#0284c7", "#16a34a",
    "#b91c1c", "#c026d3", "#4338ca", "#15803d", "#b45309",
]


def _atomic_write_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(f"{path.name}.{os.getpid()}.tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    os.replace(tmp, path)


def _cor_deterministica(chave: str, categoria: str = "urbanistica") -> str:
    if categoria == "ambiental":
        h = int(hashlib.sha256(chave.encode("utf-8")).hexdigest()[:8], 16)
        ambientais = ["#15803d", "#0f766e", "#166534", "#047857", "#065f46"]
        return ambientais[h % len(ambientais)]
    h = int(hashlib.sha256(chave.encode("utf-8")).hexdigest()[:8], 16)
    return PALETA_ZONAS[h % len(PALETA_ZONAS)]


def calcular_bbox_geojson(geojson: dict[str, Any]) -> list[float] | None:
    """Calcula [minLon, minLat, maxLon, maxLat] para um GeoJSON Feature ou FeatureCollection."""
    minx, miny, maxx, maxy = float("inf"), float("inf"), float("-inf"), float("-inf")

    def _walk(coords: Any) -> None:
        nonlocal minx, miny, maxx, maxy
        if isinstance(coords, (list, tuple)) and coords:
            if isinstance(coords[0], (int, float)) and len(coords) >= 2:
                x, y = float(coords[0]), float(coords[1])
                minx, miny = min(minx, x), min(miny, y)
                maxx, maxy = max(maxx, x), max(maxy, y)
            else:
                for item in coords:
                    _walk(item)

    if geojson.get("type") == "FeatureCollection":
        for feat in geojson.get("features", []):
            geom = feat.get("geometry") or {}
            _walk(geom.get("coordinates"))
    elif geojson.get("type") == "Feature":
        geom = geojson.get("geometry") or {}
        _walk(geom.get("coordinates"))

    if minx == float("inf"):
        return None
    return [minx, miny, maxx, maxy]


def calcular_area_anel_m2(anel: list[list[float]]) -> float:
    """Calcula área esférica aproximada (WGS84, m²) via excesso esférico de Chamberlain-Duquette."""
    if len(anel) < 3:
        return 0.0
    r = 6378137.0
    total = 0.0
    n = len(anel)
    for i in range(n):
        p1 = anel[i]
        p2 = anel[(i + 1) % n]
        lon1, lat1 = math.radians(p1[0]), math.radians(p1[1])
        lon2, lat2 = math.radians(p2[0]), math.radians(p2[1])
        total += (lon2 - lon1) * (2.0 + math.sin(lat1) + math.sin(lat2))
    return abs(total * r * r / 2.0)


def calcular_area_geometria_m2(geometry: dict[str, Any] | None) -> float | None:
    """Calcula área aproximada em m² para Polygon ou MultiPolygon em EPSG:4326."""
    if not geometry:
        return None
    gtype = geometry.get("type")
    coords = geometry.get("coordinates") or []
    if gtype == "Polygon" and coords:
        area = calcular_area_anel_m2(coords[0])
        for hole in coords[1:]:
            area -= calcular_area_anel_m2(hole)
        return round(max(area, 0.0), 2)
    if gtype == "MultiPolygon":
        total = 0.0
        for poly in coords:
            if poly:
                a = calcular_area_anel_m2(poly[0])
                for hole in poly[1:]:
                    a -= calcular_area_anel_m2(hole)
                total += max(a, 0.0)
        return round(total, 2)
    return None


def _baixar_json_http(url: str, timeout: float = 60.0) -> dict[str, Any]:
    headers = {
        "User-Agent": "PlanosDiretoresBrasil-API/1.0",
        "Accept": "application/vnd.geo+json, application/json",
        "Accept-Encoding": "gzip, deflate",
    }
    with httpx.Client(timeout=timeout, follow_redirects=True) as client:
        resp = client.get(url, headers=headers)
        resp.raise_for_status()
        content = resp.content
        if content[:2] == b"\x1f\x8b":
            content = gzip.decompress(content)
        return json.loads(content.decode("utf-8"))


def obter_geojson_estados(db: Session) -> dict[str, Any]:
    """Retorna a malha oficial das 27 UFs (IBGE v3) enriquecida com cobertura real."""
    cache_path = CACHE_DIR / "ibge_estados_minima.geojson"
    if cache_path.exists():
        geojson = json.loads(cache_path.read_text(encoding="utf-8"))
    else:
        url = (
            f"{IBGE_MALHAS_BASE}/paises/BR"
            "?intrarregiao=UF&qualidade=minima&formato=application/vnd.geo+json"
        )
        geojson = _baixar_json_http(url, timeout=90.0)
        _atomic_write_json(cache_path, geojson)

    estados_stats = {e.uf: e for e in listar_estados_com_cobertura(db)}
    features = []
    for feat in geojson.get("features", []):
        props = dict(feat.get("properties") or {})
        codarea = str(props.get("codarea", "")).strip()
        uf = COD_TO_UF.get(codarea, "")
        est = estados_stats.get(uf)
        props["uf"] = uf
        props["uf_nome"] = est.uf_nome if est else uf
        props["regiao"] = est.regiao if est else ""
        props["municipios_cadastrados"] = est.municipios_cadastrados if est else 0
        props["planos_localizados"] = est.planos_localizados if est else 0
        props["planos_vigentes"] = est.planos_vigentes if est else 0
        props["municipios_com_cartografia"] = est.municipios_com_cartografia if est else 0
        props["municipios_aguardando_verificacao"] = est.municipios_aguardando_verificacao if est else 0
        features.append({**feat, "properties": props})

    return {"type": "FeatureCollection", "features": features}


def obter_geojson_municipios_uf(db: Session, uf: str) -> dict[str, Any]:
    """Retorna os polígonos municipais da UF (IBGE v3) enriquecidos com o catálogo real."""
    uf_up = uf.strip().upper()
    cod_uf = UF_TO_COD_IBGE.get(uf_up)
    if not cod_uf:
        raise ValueError(f"UF inválida: {uf}")

    cache_path = CACHE_DIR / f"ibge_municipios_{uf_up}_minima.geojson"
    if cache_path.exists():
        geojson = json.loads(cache_path.read_text(encoding="utf-8"))
    else:
        url = (
            f"{IBGE_MALHAS_BASE}/estados/{cod_uf}"
            "?intrarregiao=municipio&qualidade=minima&formato=application/vnd.geo+json"
        )
        geojson = _baixar_json_http(url, timeout=90.0)
        _atomic_write_json(cache_path, geojson)

    rows = db.execute(
        select(
            Municipio.codigo_ibge,
            Municipio.nome,
            PlanoDiretor.situacao,
            PlanoDiretor.lei_principal,
            PlanoDiretor.possui_cartografia,
        )
        .outerjoin(PlanoDiretor, PlanoDiretor.codigo_ibge == Municipio.codigo_ibge)
        .where(Municipio.uf == uf_up)
    ).all()
    por_ibge = {
        r[0]: {
            "nome": r[1],
            "situacao": r[2] or "nao_localizado",
            "lei_principal": r[3],
            "possui_cartografia": bool(r[4]) if r[4] is not None else False,
        }
        for r in rows
    }

    features = []
    for feat in geojson.get("features", []):
        props = dict(feat.get("properties") or {})
        cod = str(props.get("codarea", "")).strip()
        info = por_ibge.get(cod, {})
        props["codigo_ibge"] = cod
        props["uf"] = uf_up
        props["nome"] = info.get("nome", cod)
        props["situacao"] = info.get("situacao", "nao_localizado")
        props["lei_principal"] = info.get("lei_principal")
        props["possui_cartografia"] = info.get("possui_cartografia", False)
        features.append({**feat, "properties": props})

    return {
        "type": "FeatureCollection",
        "bbox": calcular_bbox_geojson({"type": "FeatureCollection", "features": features}),
        "features": features,
    }


def obter_limite_municipio(codigo_ibge: str) -> dict[str, Any]:
    """Baixa (com cache em disco) o limite municipal oficial em qualidade intermediária."""
    cache_path = CACHE_DIR / f"ibge_municipio_{codigo_ibge}.geojson"
    if cache_path.exists():
        geojson = json.loads(cache_path.read_text(encoding="utf-8"))
    else:
        url = (
            f"{IBGE_MALHAS_BASE}/municipios/{codigo_ibge}"
            "?qualidade=intermediaria&formato=application/vnd.geo+json"
        )
        geojson = _baixar_json_http(url, timeout=60.0)
        _atomic_write_json(cache_path, geojson)

    geojson["bbox"] = calcular_bbox_geojson(geojson)
    return geojson


def _buscar_geojson_arcgis_rest(camada: CamadaGIS, limit: int = 1200) -> dict[str, Any]:
    """Consulta paginada e em cache para camadas ArcGIS REST retornando GeoJSON em EPSG:4326."""
    base_url = camada.url.rstrip("/")
    all_features: list[dict[str, Any]] = []
    offset = 0
    page_size = min(limit, 500)

    with httpx.Client(timeout=60.0, follow_redirects=True) as client:
        while len(all_features) < limit:
            params = {
                "where": "1=1",
                "outFields": "*",
                "outSR": "4326",
                "f": "geojson",
                "resultOffset": str(offset),
                "resultRecordCount": str(page_size),
            }
            resp = client.get(
                f"{base_url}/query",
                params=params,
                headers={"User-Agent": "PlanosDiretoresBrasil-API/1.0"},
            )
            resp.raise_for_status()
            chunk = resp.json()
            feats = chunk.get("features") or []
            if not feats:
                break
            all_features.extend(feats)
            if len(feats) < page_size:
                break
            offset += len(feats)

    return {"type": "FeatureCollection", "features": all_features[:limit]}


def _normalizar_e_gerar_legenda(
    geojson: dict[str, Any],
    camada: CamadaGIS,
) -> dict[str, Any]:
    """
    Preserva os códigos, siglas e nomes originais das zonas municipais,
    calcula área geodésica quando ausente e constrói legenda dinâmica real.
    """
    features_out: list[dict[str, Any]] = []
    legenda_map: dict[str, dict[str, Any]] = {}

    for idx, feat in enumerate(geojson.get("features", [])):
        props = dict(feat.get("properties") or {})
        sigla_raw = props.get(camada.campo_codigo_zona) if camada.campo_codigo_zona else None
        nome_raw = props.get(camada.campo_nome_zona) if camada.campo_nome_zona else None
        grupo_raw = props.get(camada.campo_grupo) if camada.campo_grupo else None
        leg_raw = props.get(camada.campo_legislacao) if camada.campo_legislacao else None

        sigla = str(sigla_raw).strip() if sigla_raw not in (None, "") else ""
        nome = str(nome_raw).strip() if nome_raw not in (None, "") else ""
        if not sigla and nome:
            sigla = nome[:32]
        if not nome and sigla:
            nome = sigla
        if not sigla and not nome:
            sigla = camada.nome
            nome = camada.nome

        area_m2 = None
        if camada.campo_area and isinstance(props.get(camada.campo_area), (int, float)):
            area_m2 = round(float(props[camada.campo_area]), 2)
        if area_m2 is None or area_m2 <= 0:
            area_m2 = calcular_area_geometria_m2(feat.get("geometry"))

        classe_key = sigla or nome
        cor = _cor_deterministica(classe_key, camada.categoria)

        if classe_key not in legenda_map:
            legenda_map[classe_key] = {
                "chave": classe_key,
                "sigla": sigla,
                "nome": nome,
                "grupo": str(grupo_raw).strip() if grupo_raw else None,
                "cor": cor,
                "contagem": 0,
            }
        legenda_map[classe_key]["contagem"] += 1

        props["_pd_feature_id"] = idx + 1
        props["_pd_sigla"] = sigla
        props["_pd_nome"] = nome
        props["_pd_grupo"] = str(grupo_raw).strip() if grupo_raw else None
        props["_pd_legislacao"] = str(leg_raw).strip() if leg_raw else None
        props["_pd_area_m2"] = area_m2
        props["_pd_area_ha"] = round(area_m2 / 10000.0, 4) if area_m2 is not None else None
        props["_pd_cor"] = cor
        props["_pd_origem_geometria"] = camada.origem_geometria
        props["_pd_fonte_oficial"] = camada.fonte_oficial

        features_out.append({**feat, "properties": props})

    legenda = sorted(legenda_map.values(), key=lambda x: (-x["contagem"], x["sigla"]))
    fc = {
        "type": "FeatureCollection",
        "features": features_out,
    }
    fc["bbox"] = calcular_bbox_geojson(fc)
    return {
        "camada": {
            "id": camada.id,
            "nome": camada.nome,
            "categoria": camada.categoria,
            "tipo_servico": camada.tipo_servico,
            "url": camada.url,
            "origem_geometria": camada.origem_geometria,
            "fonte_oficial": camada.fonte_oficial,
            "data_verificacao": camada.data_verificacao,
            "crs_origem": camada.crs_origem,
        },
        "total_feicoes": len(features_out),
        "legenda": legenda,
        "geojson": fc,
    }


def obter_camada_geojson(db: Session, codigo_ibge: str, layer_id: str, limit: int = 1200) -> dict[str, Any]:
    """Retorna GeoJSON padronizado e legenda dinâmica de uma camada GIS catalogada (com cache em disco)."""
    camada = db.scalar(
        select(CamadaGIS).where(
            CamadaGIS.id == layer_id,
            CamadaGIS.codigo_ibge == codigo_ibge,
        )
    )
    if camada is None:
        raise LookupError(f"Camada {layer_id} não localizada para o município {codigo_ibge}.")

    cache_path = CACHE_DIR / f"layer_{codigo_ibge}_{layer_id}.json"
    if cache_path.exists():
        return json.loads(cache_path.read_text(encoding="utf-8"))

    if camada.tipo_servico == "arcgis_rest":
        raw_geojson = _buscar_geojson_arcgis_rest(camada, limit=limit)
    elif camada.tipo_servico == "geojson":
        if camada.url.startswith("http"):
            raw_geojson = _baixar_json_http(camada.url, timeout=60.0)
        else:
            local_path = Path(camada.url)
            if not local_path.is_absolute():
                local_path = DATA_DIR.parent / camada.url
            raw_geojson = json.loads(local_path.read_text(encoding="utf-8"))
    elif camada.tipo_servico == "wfs":
        sep = "&" if "?" in camada.url else "?"
        wfs_url = f"{camada.url}{sep}service=WFS&request=GetFeature&outputFormat=application/json&srsName=EPSG:4326"
        raw_geojson = _baixar_json_http(wfs_url, timeout=60.0)
    else:
        return {
            "camada": {
                "id": camada.id,
                "nome": camada.nome,
                "categoria": camada.categoria,
                "tipo_servico": camada.tipo_servico,
                "url": camada.url,
                "origem_geometria": camada.origem_geometria,
                "fonte_oficial": camada.fonte_oficial,
                "data_verificacao": camada.data_verificacao,
            },
            "total_feicoes": 0,
            "legenda": [],
            "geojson": {"type": "FeatureCollection", "features": []},
            "aviso": (
                f"Camada do tipo {camada.tipo_servico.upper()} registrada para consumo direto no QGIS "
                "ou serviço matricial/vetorial externo."
            ),
        }

    resultado = _normalizar_e_gerar_legenda(raw_geojson, camada)
    _atomic_write_json(cache_path, resultado)
    return resultado
