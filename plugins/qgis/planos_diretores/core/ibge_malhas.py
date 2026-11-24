# -*- coding: utf-8 -*-
"""
Cliente de malhas municipais da API v3 do IBGE com compressão GZIP,
escrita atômica em cache persistente e fallback via QgsBlockingNetworkRequest.
"""

from __future__ import annotations

import gzip
import http.client
import logging
import os
import tempfile
from urllib.parse import urlparse

LOGGER = logging.getLogger("PlanosDiretoresBrasil")
ALLOWED_IBGE_HOST = "servicodados.ibge.gov.br"


def get_cache_root() -> str:
    candidates = [
        os.path.join(os.path.expanduser("~"), ".planos_diretores_qgis", "cache"),
        os.path.join(tempfile.gettempdir(), "planos_diretores_qgis_cache"),
    ]
    for path in candidates:
        try:
            os.makedirs(path, exist_ok=True)
            return path
        except OSError:
            continue
    return tempfile.gettempdir()


def atomic_write_bytes(path: str, data: bytes) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp_path = f"{path}.part"
    with open(tmp_path, "wb") as f:
        f.write(data)
    os.replace(tmp_path, path)


def _fetch_https(url: str, timeout: int = 90) -> bytes | None:
    parsed = urlparse(url)
    if parsed.scheme != "https" or parsed.netloc != ALLOWED_IBGE_HOST:
        raise ValueError(f"URL IBGE não permitida: {url}")

    path_query = parsed.path + (f"?{parsed.query}" if parsed.query else "")
    conn = http.client.HTTPSConnection(ALLOWED_IBGE_HOST, timeout=timeout)
    try:
        conn.request(
            "GET",
            path_query,
            headers={
                "User-Agent": "PlanosDiretoresBrasil-QGIS/1.0",
                "Accept": "application/vnd.geo+json, application/json",
                "Accept-Encoding": "gzip, deflate",
                "Connection": "close",
            },
        )
        resp = conn.getresponse()
        if resp.status != 200:
            return None
        raw = resp.read()
        if raw[:2] == b"\x1f\x8b":
            raw = gzip.decompress(raw)
        return raw
    except Exception as exc:
        LOGGER.warning("Falha HTTPS direta no IBGE (%s): %s", url, exc)
        return None
    finally:
        conn.close()


def _fetch_qgis_network(url: str) -> bytes | None:
    try:
        from qgis.core import QgsBlockingNetworkRequest
        from qgis.PyQt.QtCore import QUrl
        from qgis.PyQt.QtNetwork import QNetworkRequest

        qreq = QNetworkRequest(QUrl(url))
        qreq.setRawHeader(b"User-Agent", b"PlanosDiretoresBrasil-QGIS/1.0")
        qreq.setRawHeader(b"Accept", b"application/vnd.geo+json, application/json")
        qreq.setRawHeader(b"Accept-Encoding", b"gzip, deflate")
        blocker = QgsBlockingNetworkRequest()
        err = blocker.get(qreq)
        if err == QgsBlockingNetworkRequest.ErrorCode.NoError:
            raw = bytes(blocker.reply().content())
            if raw[:2] == b"\x1f\x8b":
                raw = gzip.decompress(raw)
            return raw
    except Exception as exc:
        LOGGER.debug("Fallback QgsBlockingNetworkRequest indisponível/falhou: %s", exc)
    return None


def obter_limite_municipal_geojson(codigo_ibge: str) -> str:
    """Garante o arquivo GeoJSON oficial do limite do município em cache local e retorna seu caminho."""
    cod = str(codigo_ibge).strip()
    if len(cod) != 7 or not cod.isdigit():
        raise ValueError(f"Código IBGE de 7 dígitos inválido: {codigo_ibge!r}")

    cache_path = os.path.join(get_cache_root(), "malhas", f"ibge_{cod}.geojson")
    if os.path.exists(cache_path) and os.path.getsize(cache_path) > 100:
        return cache_path

    url = (
        f"https://{ALLOWED_IBGE_HOST}/api/v3/malhas/municipios/{cod}"
        "?qualidade=intermediaria&formato=application/vnd.geo+json"
    )
    raw = _fetch_https(url) or _fetch_qgis_network(url)
    if not raw:
        raise RuntimeError(f"Não foi possível baixar o limite municipal IBGE {cod}.")

    atomic_write_bytes(cache_path, raw)
    return cache_path
