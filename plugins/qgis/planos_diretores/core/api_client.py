# -*- coding: utf-8 -*-
"""
Cliente da API Unificada Planos Diretores do Brasil com cache persistente em disco
e fallback offline para consulta da base IBGE e catálogo verificado.
"""

from __future__ import annotations

import json
import os
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
from typing import Any

from .ibge_malhas import atomic_write_bytes, get_cache_root

DEFAULT_API_URL = "http://127.0.0.1:8000/api/v1"
MENSAGEM_NAO_LOCALIZADO = "Plano Diretor não localizado nas fontes consultadas."

BRAZIL_UFS = [
    "AC", "AL", "AM", "AP", "BA", "CE", "DF", "ES", "GO",
    "MA", "MG", "MS", "MT", "PA", "PB", "PE", "PI", "PR",
    "RJ", "RN", "RO", "RR", "RS", "SC", "SE", "SP", "TO",
]


def normalizar_texto(texto: str | None) -> str:
    if not texto:
        return ""
    nfkd = unicodedata.normalize("NFKD", str(texto))
    sem_acentos = "".join(c for c in nfkd if not unicodedata.combining(c))
    return " ".join(sem_acentos.lower().strip().split())


class PlanosDiretoresApiClient:
    """Consome a API unificada (mesma fonte do WebGIS) e mantém cache local em disco."""

    def __init__(self, base_url: str | None = None, data_dir: str | None = None):
        self.base_url = (base_url or DEFAULT_API_URL).rstrip("/")
        self.plugin_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        self.data_dir = data_dir or os.path.join(self.plugin_dir, "data")
        self.cache_dir = get_cache_root()
        self._ibge_compact: list[dict[str, str]] | None = None
        self._fallback_catalog: dict[str, dict[str, Any]] | None = None

    def set_base_url(self, url: str) -> None:
        self.base_url = (url or DEFAULT_API_URL).strip().rstrip("/")

    def _carregar_ibge_local(self) -> list[dict[str, str]]:
        if self._ibge_compact is None:
            path = os.path.join(self.data_dir, "municipios_ibge_compact.json")
            if os.path.exists(path):
                with open(path, "r", encoding="utf-8") as f:
                    self._ibge_compact = json.load(f)
            else:
                self._ibge_compact = []
        return self._ibge_compact

    def _carregar_fallback_catalogo(self) -> dict[str, dict[str, Any]]:
        if self._fallback_catalog is None:
            path = os.path.join(self.data_dir, "catalogo_fallback.json")
            mapa: dict[str, dict[str, Any]] = {}
            if os.path.exists(path):
                with open(path, "r", encoding="utf-8") as f:
                    raw = json.load(f)
                for item in raw.get("planos_diretores", []):
                    mapa[str(item["codigo_ibge"])] = item
            self._fallback_catalog = mapa
        return self._fallback_catalog

    def _http_get_json(self, path: str, timeout: int = 25) -> dict[str, Any] | list[Any]:
        url = f"{self.base_url}{path}"
        req = urllib.request.Request(
            url,
            headers={
                "User-Agent": "PlanosDiretoresBrasil-QGIS/1.0",
                "Accept": "application/json",
            },
        )
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read().decode("utf-8"))

    def listar_municipios_por_uf(self, uf: str, filtro: str = "") -> list[dict[str, Any]]:
        """Retorna os municípios da UF (API online com fallback na base IBGE embarcada)."""
        uf_up = (uf or "").strip().upper()
        if not uf_up:
            return []

        try:
            params = urllib.parse.urlencode({"uf": uf_up, "limit": 1000, **({"q": filtro} if filtro else {})})
            resp = self._http_get_json(f"/municipios?{params}", timeout=10)
            if isinstance(resp, dict) and "items" in resp:
                return resp["items"]
        except Exception:
            pass

        # Fallback offline usando a base IBGE oficial de 5.571 municípios embarcada no plugin
        cat = self._carregar_fallback_catalogo()
        filtro_norm = normalizar_texto(filtro)
        out: list[dict[str, Any]] = []
        for item in self._carregar_ibge_local():
            if item["u"] != uf_up:
                continue
            if filtro_norm:
                if filtro.strip().isdigit():
                    if not item["c"].startswith(filtro.strip()):
                        continue
                elif filtro_norm not in normalizar_texto(item["n"]):
                    continue
            reg = cat.get(item["c"])
            out.append(
                {
                    "codigo_ibge": item["c"],
                    "nome": item["n"],
                    "uf": item["u"],
                    "uf_nome": item["un"],
                    "situacao": reg.get("situacao", "nao_localizado") if reg else "nao_localizado",
                    "lei_principal": reg.get("lei_principal") if reg else None,
                    "ano_lei": reg.get("ano_lei") if reg else None,
                    "possui_cartografia": bool(reg and reg.get("camadas_gis")),
                    "fonte_oficial": reg.get("fonte_oficial") if reg else None,
                    "confiabilidade": reg.get("confiabilidade", "nao_verificada") if reg else "nao_verificada",
                }
            )
        return out

    def obter_detalhe_municipio(self, codigo_ibge: str) -> tuple[dict[str, Any], str]:
        """
        Retorna (dados_municipio, origem_consulta['api_online' | 'cache_local' | 'fallback_embarcado']).
        Sempre grava resposta bem-sucedida da API em cache persistente.
        """
        cod = str(codigo_ibge).strip()
        cache_path = os.path.join(self.cache_dir, "municipios", f"{cod}.json")

        try:
            det = self._http_get_json(f"/municipios/{cod}", timeout=12)
            if isinstance(det, dict):
                atomic_write_bytes(cache_path, json.dumps(det, ensure_ascii=False).encode("utf-8"))
                return det, "api_online"
        except Exception:
            pass

        if os.path.exists(cache_path):
            with open(cache_path, "r", encoding="utf-8") as f:
                return json.load(f), "cache_local"

        # Fallback offline embarcado
        mun_meta = next((m for m in self._carregar_ibge_local() if m["c"] == cod), None)
        if mun_meta is None:
            raise LookupError(f"Código IBGE {cod} não localizado na base oficial.")

        cat = self._carregar_fallback_catalogo()
        reg = cat.get(cod)
        if reg:
            det_local = dict(reg)
            det_local.setdefault("nome", mun_meta["n"])
            det_local.setdefault("uf_nome", mun_meta["un"])
            det_local.setdefault("possui_cartografia", bool(reg.get("camadas_gis")))
            det_local.setdefault("mensagem_situacao", "Dados carregados do catálogo local em cache.")
            return det_local, "fallback_embarcado"

        return (
            {
                "codigo_ibge": cod,
                "nome": mun_meta["n"],
                "uf": mun_meta["u"],
                "uf_nome": mun_meta["un"],
                "nome_plano_diretor": f"Plano Diretor de {mun_meta['n']} (não localizado)",
                "lei_principal": None,
                "ano_lei": None,
                "situacao": "nao_localizado",
                "fonte_oficial": None,
                "url_oficial": None,
                "url_pdf": None,
                "confiabilidade": "nao_verificada",
                "data_verificacao": None,
                "aviso_documental": MENSAGEM_NAO_LOCALIZADO,
                "mensagem_situacao": MENSAGEM_NAO_LOCALIZADO,
                "possui_cartografia": False,
                "documentos": [],
                "camadas_gis": [],
                "zonas_regras": [],
                "historico_versoes": [],
            },
            "fallback_embarcado",
        )

    def baixar_geojson_camada(self, codigo_ibge: str, camada: dict[str, Any]) -> str:
        """
        Baixa o GeoJSON da camada (preferencialmente via API unificada ou diretamente
        do endpoint ArcGIS REST/GeoJSON) e armazena em cache persistente.
        """
        cod = str(codigo_ibge).strip()
        layer_id = str(camada["id"])
        cache_geojson = os.path.join(self.cache_dir, "camadas", f"{cod}_{layer_id}.geojson")
        if os.path.exists(cache_geojson) and os.path.getsize(cache_geojson) > 50:
            return cache_geojson

        # 1) Tenta via API unificada
        try:
            payload = self._http_get_json(f"/geo/municipios/{cod}/camadas/{layer_id}/geojson", timeout=60)
            if isinstance(payload, dict) and payload.get("geojson", {}).get("features"):
                raw = json.dumps(payload["geojson"], ensure_ascii=False).encode("utf-8")
                atomic_write_bytes(cache_geojson, raw)
                return cache_geojson
        except Exception:
            pass

        # 2) Fallback direto para serviços ArcGIS REST / GeoJSON se a API local não estiver rodando
        tipo = camada.get("tipo_servico")
        url = camada.get("url", "")
        if tipo == "arcgis_rest" and url:
            query_url = f"{url.rstrip('/')}/query?where=1%3D1&outFields=*&outSR=4326&f=geojson&resultRecordCount=1200"
            req = urllib.request.Request(query_url, headers={"User-Agent": "PlanosDiretoresBrasil-QGIS/1.0"})
            with urllib.request.urlopen(req, timeout=60) as resp:
                raw = resp.read()
            atomic_write_bytes(cache_geojson, raw)
            return cache_geojson

        if tipo == "geojson" and url.startswith("http"):
            req = urllib.request.Request(url, headers={"User-Agent": "PlanosDiretoresBrasil-QGIS/1.0"})
            with urllib.request.urlopen(req, timeout=60) as resp:
                raw = resp.read()
            atomic_write_bytes(cache_geojson, raw)
            return cache_geojson

        raise RuntimeError(f"Não foi possível baixar os dados GeoJSON da camada {camada.get('nome')}.")
