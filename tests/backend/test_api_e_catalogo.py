# -*- coding: utf-8 -*-
"""Testes do Backend Unificado (Catálogo IBGE, API REST, Geoprocessamento, Extração PDF e RAG)."""

from __future__ import annotations

import json
from pathlib import Path

from fastapi.testclient import TestClient

from backend.api.main import app
from backend.catalogo.service import MENSAGEM_NAO_LOCALIZADO
from backend.documentos.extractor import analisar_texto_pagina
from backend.geoprocessamento.service import calcular_area_geometria_m2


def test_estatisticas_reais_e_5571_municipios():
    with TestClient(app) as client:
        resp = client.get("/api/v1/estatisticas")
        assert resp.status_code == 200
        stats = resp.json()
        assert stats["municipios_cadastrados"] == 5571
        assert stats["munic_com_plano"] >= 2900
        assert stats["munic_sem_plano"] >= 2000
        assert stats["planos_localizados"] >= 3
        assert stats["planos_vigentes"] >= 2
        assert stats["municipios_com_cartografia"] >= 2
        assert (
            stats["planos_localizados"] + stats["municipios_nao_localizados"]
            == stats["municipios_cadastrados"]
        )


def test_busca_e_detalhes_curitiba_joinville_araquari_e_nao_localizado():
    with TestClient(app) as client:
        # Curitiba 4106902
        cwb = client.get("/api/v1/municipios/4106902").json()
        assert cwb["codigo_ibge"] == "4106902"
        assert cwb["uf"] == "PR"
        assert cwb["situacao"] == "vigente"
        assert "14.771/2015" in (cwb["lei_principal"] or "")
        assert len(cwb["camadas_gis"]) >= 2

        # Joinville 4209102
        jlle = client.get("/api/v1/municipios/4209102").json()
        assert jlle["codigo_ibge"] == "4209102"
        assert jlle["situacao"] == "vigente"
        assert "620/2022" in (jlle["lei_principal"] or "")

        # Araquari 4201307 (em verificação, camadas LC 281 marcadas como derivada_pdf)
        arq = client.get("/api/v1/municipios/4201307").json()
        assert arq["situacao"] == "localizado_em_verificacao"
        assert arq["possui_cartografia"] is True
        assert any(c["origem_geometria"] == "derivada_pdf" for c in arq["camadas_gis"])

        # Município sem plano localizado no catálogo: ex. Abdon Batista (4200051)
        abdon = client.get("/api/v1/municipios/4200051").json()
        assert abdon["situacao"] == "nao_localizado"
        assert MENSAGEM_NAO_LOCALIZADO in abdon["mensagem_situacao"]


def test_ia_tres_modos_sete_blocos_e_distincao_app():
    with TestClient(app) as client:
        for modo in ("didatico", "tecnico", "prefeitura"):
            r = client.post(
                "/api/v1/ia/consultar",
                json={
                    "codigo_ibge": "4106902",
                    "pergunta": "Qual a finalidade da ZROC e qual a diferença para APP?",
                    "modo": modo,
                    "zona_sigla": "ZROC",
                },
            )
            assert r.status_code == 200
            data = r.json()
            blocos = data["sete_blocos"]
            for chave in (
                "o_que_e",
                "por_que_existe",
                "o_que_pode",
                "o_que_depende_de_condicoes",
                "o_que_nao_pode",
                "fundamentacao",
                "fonte",
            ):
                assert blocos[chave]
            assert data["distincao_ambiental"] is not None
            assert "app" in data["distincao_ambiental"]
            assert "unidade_conservacao" in data["distincao_ambiental"]
            assert "Não constitui parecer jurídico" in data["aviso_legal"]


def test_ia_nao_inventa_para_municipio_nao_localizado():
    with TestClient(app) as client:
        r = client.post(
            "/api/v1/ia/consultar",
            json={
                "codigo_ibge": "4200051",
                "pergunta": "Qual o coeficiente de aproveitamento de Abdon Batista?",
                "modo": "tecnico",
            },
        )
        assert r.status_code == 200
        data = r.json()
        assert data["situacao_documental"] == "nao_localizado"
        assert MENSAGEM_NAO_LOCALIZADO in data["aviso_documental"]
        assert "Não foi possível determinar" in data["sete_blocos"]["o_que_pode"]


def test_extrator_textual_identifica_leis_artigos_zonas_e_tabelas():
    texto_exemplo = """
    Lei Complementar nº 999/2024 - Anexo II - Mapa de Zoneamento Urbano
    Art. 15 Fica instituída a Zona Residencial 2 (ZR-2) e a Zona de Preservação Ambiental (ZPA).
    Tabela I - Parâmetros Urbanísticos: Coeficiente de Aproveitamento máximo 2,0.
    """
    res = analisar_texto_pagina(texto_exemplo, pagina=4)
    assert res["confianca"] >= 0.9
    assert any("999/2024" in l for l in res["leis"])
    assert any(a.startswith("Art. 15") for a in res["artigos"])
    assert "ZR-2" in res["zonas"]
    assert "ZPA" in res["zonas"]
    assert res["anexos"]
    assert res["mapas"]
    assert res["tabelas"]


def test_calculo_area_geodesica_aproximada():
    # Quadrado aproximado de 0.01 x 0.01 grau perto do Equador (~1.23 km²)
    geom = {
        "type": "Polygon",
        "coordinates": [
            [[0.0, 0.0], [0.01, 0.0], [0.01, 0.01], [0.0, 0.01], [0.0, 0.0]]
        ],
    }
    area = calcular_area_geometria_m2(geom)
    assert area is not None
    assert 1_200_000 < area < 1_260_000
