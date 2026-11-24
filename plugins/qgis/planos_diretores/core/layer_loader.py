# -*- coding: utf-8 -*-
"""
Construtor e carregador de camadas geoespaciais no QGIS.

Suporta:
- GeoPackage (.gpkg)
- Shapefile (.shp)
- GeoJSON (local/cache ou baixado da API unificada)
- WMS / WMTS
- WFS
- ArcGIS REST (MapServer / FeatureServer)

Inclui estilização categorizada automática preservando os códigos/nomes locais
das zonas, gravação de metadados de fonte na camada e zoom automático ao município.
"""

from __future__ import annotations

import hashlib
import urllib.parse
from typing import Any

from qgis.core import (
    QgsCategorizedSymbolRenderer,
    QgsCoordinateReferenceSystem,
    QgsCoordinateTransform,
    QgsFillSymbol,
    QgsProject,
    QgsRasterLayer,
    QgsRendererCategory,
    QgsVectorLayer,
)
from qgis.PyQt.QtGui import QColor


PALETA_HEX = [
    "#2563eb", "#059669", "#d97706", "#dc2626", "#7c3aed",
    "#0891b2", "#65a30d", "#db2777", "#ea580c", "#4f46e5",
    "#0d9488", "#ca8a04", "#9333ea", "#0284c7", "#16a34a",
]


def _cor_por_chave(chave: str) -> QColor:
    idx = int(hashlib.sha256(chave.encode("utf-8")).hexdigest()[:8], 16) % len(PALETA_HEX)
    return QColor(PALETA_HEX[idx])


def montar_uri_servico(camada: dict[str, Any]) -> tuple[str, str, str]:
    """
    Constrói (uri, provider_name, layer_kind['vector'|'raster']) para os formatos suportados.
    Útil também para testes unitários independentes do servidor GIS remoto.
    """
    tipo = (camada.get("tipo_servico") or "").lower().strip()
    url = str(camada.get("url") or "").strip()

    if tipo in {"geojson", "geopackage", "shapefile"}:
        if tipo == "geopackage" and camada.get("layername"):
            return f"{url}|layername={camada['layername']}", "ogr", "vector"
        return url, "ogr", "vector"

    if tipo == "wfs":
        sep = "&" if "?" in url else "?"
        typename = camada.get("typename") or camada.get("layername") or ""
        params = f"restrictToRequestBBOX='1' srsname='EPSG:4326' url='{url}'"
        if typename:
            params += f" typename='{typename}'"
        return params if "=" in params else f"{url}{sep}service=WFS", "WFS", "vector"

    if tipo in {"wms", "wmts"}:
        layers = camada.get("layername") or camada.get("layers") or "0"
        crs = camada.get("crs_wms") or "EPSG:4326"
        fmt = camada.get("format") or "image/png"
        uri = f"contextualWMSLegend=0&crs={crs}&dpiMode=7&format={fmt}&layers={urllib.parse.quote(layers)}&styles=&url={urllib.parse.quote(url)}"
        return uri, "wms", "raster"

    if tipo == "arcgis_rest":
        if "/FeatureServer/" in url or "/MapServer/" in url:
            return f"url='{url}'", "arcgisfeatureserver", "vector"
        return f"url='{url}'", "arcgismapserver", "raster"

    return url, "ogr", "vector"


def aplicar_metadados_rastreabilidade(layer: Any, municipio_info: dict[str, Any], camada: dict[str, Any]) -> None:
    """Registra fonte oficial, lei, código IBGE e origem da geometria diretamente na camada QGIS."""
    fonte = camada.get("fonte_oficial") or municipio_info.get("fonte_oficial") or "Não informada"
    lei = municipio_info.get("lei_principal") or "Não informada"
    origem = camada.get("origem_geometria") or "oficial"
    verif = camada.get("data_verificacao") or municipio_info.get("data_verificacao") or ""

    resumo = (
        f"Município: {municipio_info.get('nome')}/{municipio_info.get('uf')} "
        f"(IBGE {municipio_info.get('codigo_ibge')})\n"
        f"Lei: {lei}\n"
        f"Origem da geometria: {origem}\n"
        f"Fonte oficial: {fonte}\n"
        f"Data de verificação: {verif}\n"
        f"URL: {camada.get('url')}"
    )
    layer.setAbstract(resumo)
    if camada.get("url"):
        layer.setDataUrl(str(camada["url"]))
    layer.setCustomProperty("pd_codigo_ibge", str(municipio_info.get("codigo_ibge", "")))
    layer.setCustomProperty("pd_lei_principal", str(lei))
    layer.setCustomProperty("pd_fonte_oficial", str(fonte))
    layer.setCustomProperty("pd_origem_geometria", str(origem))


def estilizar_camada_zoneamento(layer: QgsVectorLayer, camada: dict[str, Any]) -> None:
    """Aplica renderização categorizada preservando exatamente as siglas e nomes municipais."""
    field_names = [f.name() for f in layer.fields()]
    candidatos = [
        "_pd_sigla",
        camada.get("campo_codigo_zona"),
        camada.get("campo_nome_zona"),
        camada.get("campo_grupo"),
        "sg_zona",
        "sigla_z",
        "nm_zona",
    ]
    campo_alvo = next((c for c in candidatos if c and c in field_names), None)
    if not campo_alvo:
        return

    valores_unicos = sorted(
        {str(v).strip() for v in layer.uniqueValues(layer.fields().indexFromName(campo_alvo)) if v not in (None, "")}
    )
    if not valores_unicos or len(valores_unicos) > 120:
        return

    categorias = []
    for val in valores_unicos:
        sym = QgsFillSymbol.createSimple(
            {
                "color": _cor_por_chave(val).name(),
                "outline_color": "#1e293b",
                "outline_width": "0.35",
            }
        )
        sym.setOpacity(0.65)
        categorias.append(QgsRendererCategory(val, sym, val))

    layer.setRenderer(QgsCategorizedSymbolRenderer(campo_alvo, categorias))
    layer.triggerRepaint()


def _obter_ou_criar_grupo(nome_grupo: str):
    root = QgsProject.instance().layerTreeRoot()
    grupo = root.findGroup(nome_grupo)
    if grupo is None:
        grupo = root.insertGroup(0, nome_grupo)
    return grupo


def zoom_para_camada(iface: Any, layer: Any) -> None:
    """Centraliza o canvas do QGIS na extensão da camada reprojetada para o CRS do projeto."""
    if iface is None or layer is None or not layer.isValid():
        return
    canvas = iface.mapCanvas()
    extent = layer.extent()
    if extent.isEmpty():
        return

    proj_crs = QgsProject.instance().crs()
    layer_crs = layer.crs()
    if layer_crs.isValid() and proj_crs.isValid() and layer_crs != proj_crs:
        xform = QgsCoordinateTransform(layer_crs, proj_crs, QgsProject.instance())
        extent = xform.transformBoundingBox(extent)

    extent.scale(1.08)
    canvas.setExtent(extent)
    canvas.refresh()


def carregar_camada_no_qgis(
    iface: Any,
    municipio_info: dict[str, Any],
    camada: dict[str, Any],
    *,
    geojson_local_path: str | None = None,
) -> Any:
    """Adiciona camada vetorial ou matricial ao QgsProject dentro do grupo do município."""
    nome_camada = f"{camada.get('nome', 'Camada')} [{municipio_info.get('nome')}]"
    nome_grupo = f"Planos Diretores — {municipio_info.get('nome')} ({municipio_info.get('uf')})"
    grupo = _obter_ou_criar_grupo(nome_grupo)

    if geojson_local_path:
        layer = QgsVectorLayer(geojson_local_path, nome_camada, "ogr")
        if not layer.crs().isValid():
            layer.setCrs(QgsCoordinateReferenceSystem("EPSG:4326"))
    else:
        uri, provider, kind = montar_uri_servico(camada)
        if kind == "raster":
            layer = QgsRasterLayer(uri, nome_camada, provider)
        else:
            layer = QgsVectorLayer(uri, nome_camada, provider)

    if not layer.isValid():
        raise RuntimeError(f"O QGIS não conseguiu abrir a camada '{nome_camada}'.")

    aplicar_metadados_rastreabilidade(layer, municipio_info, camada)
    if isinstance(layer, QgsVectorLayer):
        estilizar_camada_zoneamento(layer, camada)

    QgsProject.instance().addMapLayer(layer, False)
    grupo.addLayer(layer)
    zoom_para_camada(iface, layer)
    return layer


def carregar_limite_municipal_no_qgis(iface: Any, municipio_info: dict[str, Any], geojson_path: str) -> QgsVectorLayer:
    """Carrega o contorno oficial do município (IBGE) com preenchimento transparente e borda destacada."""
    nome_grupo = f"Planos Diretores — {municipio_info.get('nome')} ({municipio_info.get('uf')})"
    grupo = _obter_ou_criar_grupo(nome_grupo)
    nome = f"Limite Municipal IBGE — {municipio_info.get('nome')} ({municipio_info.get('codigo_ibge')})"
    layer = QgsVectorLayer(geojson_path, nome, "ogr")
    if not layer.isValid():
        raise RuntimeError("Não foi possível carregar o limite municipal IBGE no QGIS.")

    sym = QgsFillSymbol.createSimple(
        {
            "style": "no",
            "outline_color": "#0f172a",
            "outline_width": "0.8",
            "outline_style": "dash",
        }
    )
    layer.renderer().setSymbol(sym)
    layer.setAbstract(f"Limite municipal oficial IBGE {municipio_info.get('codigo_ibge')}")
    QgsProject.instance().addMapLayer(layer, False)
    grupo.addLayer(layer)
    zoom_para_camada(iface, layer)
    return layer


def consultar_zoneamento_selecionado(iface: Any) -> str:
    """Lê atributos das feições selecionadas na camada ativa do QGIS para identificação rápida de zoneamento."""
    if iface is None:
        return "Interface do QGIS indisponível."
    layer = iface.activeLayer()
    if not isinstance(layer, QgsVectorLayer):
        return "Selecione no Painel de Camadas uma camada vetorial de zoneamento carregada."
    feats = layer.selectedFeatures()
    if not feats:
        return (
            f"Camada ativa: {layer.name()}\n"
            "Nenhuma feição selecionada no mapa. Use a ferramenta 'Selecionar Feições' do QGIS e clique novamente."
        )

    fonte = layer.customProperty("pd_fonte_oficial") or layer.abstract() or "Não informada"
    linhas = [f"Camada: {layer.name()}", f"Fonte: {fonte}", "---"]
    for i, feat in enumerate(feats[:5], start=1):
        attrs = {
            f.name(): feat[f.name()]
            for f in layer.fields()
            if feat[f.name()] not in (None, "", " ")
        }
        sigla = attrs.get("_pd_sigla") or attrs.get("sg_zona") or attrs.get("sigla_z") or "-"
        nome = attrs.get("_pd_nome") or attrs.get("nm_zona") or attrs.get("legenda_m") or "-"
        lei = attrs.get("_pd_legislacao") or attrs.get("legislacao") or layer.customProperty("pd_lei_principal") or "-"
        linhas.append(f"Feição #{i}: {sigla} — {nome} (Legislação: {lei})")
        for k, v in list(attrs.items())[:12]:
            if not k.startswith("_pd_cor"):
                linhas.append(f"  • {k}: {v}")
    return "\n".join(linhas)
