# -*- coding: utf-8 -*-
"""Rotas REST compartilhadas (/api/v1) pelo Plugin QGIS e pelo WebGIS."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from sqlalchemy.orm import Session

from ..catalogo.schemas import (
    ConsultaIARequest,
    EstadoResumo,
    EstatisticasNacionais,
    ExplicarZonaRequest,
    MunicipioBuscaResponse,
    MunicipioDetalhe,
)
from ..catalogo.service import (
    buscar_municipios,
    listar_estados_com_cobertura,
    obter_estatisticas_nacionais,
    obter_municipio_detalhe,
)
from ..db.database import get_db
from ..documentos.extractor import (
    extrair_e_indexar_pdf,
    listar_chunks_municipio,
    salvar_pdf_upload,
)
from ..geoprocessamento.service import (
    obter_camada_geojson,
    obter_geojson_estados,
    obter_geojson_municipios_uf,
    obter_limite_municipio,
)
from ..inteligencia_artificial.assistant import consultar_assistente

router = APIRouter(prefix="/api/v1")


@router.get("/health")
def health(db: Session = Depends(get_db)) -> dict[str, Any]:
    stats = obter_estatisticas_nacionais(db)
    return {
        "status": "ok",
        "servico": "Planos Diretores do Brasil API",
        "municipios_cadastrados": stats.municipios_cadastrados,
    }


@router.get("/estatisticas", response_model=EstatisticasNacionais)
def get_estatisticas(db: Session = Depends(get_db)) -> EstatisticasNacionais:
    return obter_estatisticas_nacionais(db)


@router.get("/estados", response_model=list[EstadoResumo])
def get_estados(db: Session = Depends(get_db)) -> list[EstadoResumo]:
    return listar_estados_com_cobertura(db)


@router.get("/municipios", response_model=MunicipioBuscaResponse)
def get_municipios(
    uf: str | None = Query(default=None, min_length=2, max_length=2),
    q: str | None = Query(default=None),
    situacao: str | None = Query(default=None),
    com_cartografia: bool | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=1000),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
) -> MunicipioBuscaResponse:
    return buscar_municipios(
        db,
        uf=uf,
        q=q,
        situacao=situacao,
        com_cartografia=com_cartografia,
        limit=limit,
        offset=offset,
    )


@router.get("/municipios/{codigo_ibge}", response_model=MunicipioDetalhe)
def get_municipio(codigo_ibge: str, db: Session = Depends(get_db)) -> MunicipioDetalhe:
    det = obter_municipio_detalhe(db, codigo_ibge)
    if det is None:
        raise HTTPException(
            status_code=404,
            detail=f"Município IBGE {codigo_ibge} não encontrado na divisão territorial oficial.",
        )
    return det


@router.get("/geo/estados")
def get_geo_estados(db: Session = Depends(get_db)) -> dict[str, Any]:
    try:
        return obter_geojson_estados(db)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Falha ao obter malha estadual do IBGE: {exc}") from exc


@router.get("/geo/estados/{uf}/municipios")
def get_geo_municipios_uf(uf: str, db: Session = Depends(get_db)) -> dict[str, Any]:
    try:
        return obter_geojson_municipios_uf(db, uf)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Falha ao obter malha municipal da UF {uf}: {exc}") from exc


@router.get("/geo/municipios/{codigo_ibge}/limite")
def get_geo_limite_municipio(codigo_ibge: str, db: Session = Depends(get_db)) -> dict[str, Any]:
    det = obter_municipio_detalhe(db, codigo_ibge)
    if det is None:
        raise HTTPException(status_code=404, detail=f"Município {codigo_ibge} não encontrado.")
    try:
        return obter_limite_municipio(codigo_ibge)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Falha ao obter limite municipal IBGE: {exc}") from exc


@router.get("/geo/municipios/{codigo_ibge}/camadas")
def get_geo_camadas(codigo_ibge: str, db: Session = Depends(get_db)) -> dict[str, Any]:
    det = obter_municipio_detalhe(db, codigo_ibge)
    if det is None:
        raise HTTPException(status_code=404, detail=f"Município {codigo_ibge} não encontrado.")
    return {
        "codigo_ibge": det.codigo_ibge,
        "municipio": det.nome,
        "uf": det.uf,
        "camadas": [c.model_dump() for c in det.camadas_gis],
    }


@router.get("/geo/municipios/{codigo_ibge}/camadas/{layer_id}/geojson")
def get_geo_camada_geojson(
    codigo_ibge: str,
    layer_id: str,
    limit: int = Query(default=1200, ge=10, le=5000),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    try:
        return obter_camada_geojson(db, codigo_ibge, layer_id, limit=limit)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Erro ao carregar camada geoespacial: {exc}") from exc


@router.get("/documentos/{codigo_ibge}")
def get_documentos_municipio(codigo_ibge: str, db: Session = Depends(get_db)) -> dict[str, Any]:
    det = obter_municipio_detalhe(db, codigo_ibge)
    if det is None:
        raise HTTPException(status_code=404, detail=f"Município {codigo_ibge} não encontrado.")
    return {
        "codigo_ibge": det.codigo_ibge,
        "municipio": det.nome,
        "uf": det.uf,
        "documentos": [d.model_dump() for d in det.documentos],
        "trechos_indexados": listar_chunks_municipio(db, codigo_ibge),
    }


@router.post("/documentos/{codigo_ibge}/processar")
async def post_processar_pdf(
    codigo_ibge: str,
    arquivo: UploadFile = File(...),
    titulo: str = Form(default="Documento Municipal do Plano Diretor"),
    lei_numero: str | None = Form(default=None),
    url_origem: str | None = Form(default=None),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    det = obter_municipio_detalhe(db, codigo_ibge)
    if det is None:
        raise HTTPException(status_code=404, detail=f"Município {codigo_ibge} não encontrado.")

    conteudo = await arquivo.read()
    if not conteudo:
        raise HTTPException(status_code=400, detail="Arquivo enviado está vazio.")

    destino = salvar_pdf_upload(codigo_ibge, arquivo.filename or "documento.pdf", conteudo)
    try:
        return extrair_e_indexar_pdf(
            db,
            codigo_ibge,
            destino,
            titulo_documento=titulo,
            lei_numero=lei_numero,
            url_origem=url_origem,
        )
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"Não foi possível processar o PDF: {exc}") from exc


@router.post("/ia/consultar")
def post_ia_consultar(req: ConsultaIARequest, db: Session = Depends(get_db)) -> dict[str, Any]:
    try:
        return consultar_assistente(
            db,
            codigo_ibge=req.codigo_ibge,
            pergunta=req.pergunta,
            modo=req.modo,
            zona_sigla=req.zona_sigla,
            zona_nome=req.zona_nome,
            atributos_feicao=req.atributos_feicao,
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post("/ia/explicar-zona")
def post_ia_explicar_zona(req: ExplicarZonaRequest, db: Session = Depends(get_db)) -> dict[str, Any]:
    alvo = req.zona_nome or req.zona_sigla or "zona selecionada"
    pergunta = f"O que é, qual a finalidade e quais as regras urbanísticas e ambientais de {alvo}?"
    try:
        return consultar_assistente(
            db,
            codigo_ibge=req.codigo_ibge,
            pergunta=pergunta,
            modo=req.modo,
            zona_sigla=req.zona_sigla,
            zona_nome=req.zona_nome,
            atributos_feicao=req.atributos_feicao,
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
