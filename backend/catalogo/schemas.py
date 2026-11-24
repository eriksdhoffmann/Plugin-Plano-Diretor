# -*- coding: utf-8 -*-
"""Schemas Pydantic v2 da API unificada do Catálogo Nacional de Planos Diretores."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field

SituacaoPlano = Literal[
    "vigente",
    "localizado_em_verificacao",
    "desatualizado_ou_substituido",
    "nao_localizado",
]


class EstatisticasNacionais(BaseModel):
    municipios_cadastrados: int
    planos_localizados: int
    planos_vigentes: int
    documentos_fonte_oficial: int
    municipios_com_cartografia: int
    municipios_aguardando_verificacao: int
    municipios_nao_localizados: int


class EstadoResumo(BaseModel):
    uf: str
    uf_nome: str
    regiao: str
    municipios_cadastrados: int
    planos_localizados: int
    planos_vigentes: int
    municipios_com_cartografia: int
    municipios_aguardando_verificacao: int


class DocumentoSchema(BaseModel):
    id: int | None = None
    titulo: str
    tipo: str
    lei_numero: str | None = None
    ano: int | None = None
    url: str | None = None
    formato: str | None = None
    fonte_oficial: str | None = None
    hierarquia_fonte: int | None = None
    situacao_vigencia: str = "aguardando_verificacao"
    data_verificacao: str | None = None
    arquivo_local: str | None = None
    observacao: str | None = None
    confianca_extracao: float | None = None


class CamadaGISSchema(BaseModel):
    id: str
    nome: str
    categoria: str
    tipo_servico: str
    url: str
    campo_codigo_zona: str | None = None
    campo_nome_zona: str | None = None
    campo_grupo: str | None = None
    campo_legislacao: str | None = None
    campo_area: str | None = None
    crs_origem: str | None = None
    origem_geometria: Literal["oficial", "derivada_pdf"] = "oficial"
    fonte_oficial: str | None = None
    data_verificacao: str | None = None
    observacao: str | None = None


class ZonaRegraSchema(BaseModel):
    sigla: str
    nome: str
    grupo: str | None = None
    lei: str | None = None
    artigo: str | None = None
    finalidade: str | None = None
    usos_permitidos: str | None = None
    usos_condicionados: str | None = None
    usos_proibidos: str | None = None
    parametros: dict[str, Any] = Field(default_factory=dict)
    aviso_parametros: str | None = None


class HistoricoVersaoSchema(BaseModel):
    lei: str
    ano: int | None = None
    situacao: str
    observacao: str | None = None


class MunicipioResumo(BaseModel):
    codigo_ibge: str
    nome: str
    uf: str
    uf_nome: str
    regiao: str
    mesorregiao: str = ""
    microrregiao: str = ""
    situacao: SituacaoPlano = "nao_localizado"
    lei_principal: str | None = None
    ano_lei: int | None = None
    possui_cartografia: bool = False
    fonte_oficial: str | None = None
    confiabilidade: str = "nao_verificada"


class MunicipioDetalhe(MunicipioResumo):
    nome_plano_diretor: str
    data_aprovacao: str | None = None
    data_revisao: str | None = None
    hierarquia_fonte: int | None = None
    url_oficial: str | None = None
    url_pdf: str | None = None
    data_verificacao: str | None = None
    aviso_documental: str | None = None
    mensagem_situacao: str
    documentos: list[DocumentoSchema] = Field(default_factory=list)
    camadas_gis: list[CamadaGISSchema] = Field(default_factory=list)
    zonas_regras: list[ZonaRegraSchema] = Field(default_factory=list)
    historico_versoes: list[HistoricoVersaoSchema] = Field(default_factory=list)


class MunicipioBuscaResponse(BaseModel):
    total: int
    limit: int
    offset: int
    items: list[MunicipioResumo]


class ConsultaIARequest(BaseModel):
    codigo_ibge: str = Field(..., min_length=7, max_length=7)
    pergunta: str = Field(..., min_length=2, max_length=2000)
    modo: Literal["didatico", "tecnico", "prefeitura"] = "didatico"
    zona_sigla: str | None = None
    zona_nome: str | None = None
    atributos_feicao: dict[str, Any] | None = None


class ExplicarZonaRequest(BaseModel):
    codigo_ibge: str = Field(..., min_length=7, max_length=7)
    zona_sigla: str | None = None
    zona_nome: str | None = None
    modo: Literal["didatico", "tecnico", "prefeitura"] = "didatico"
    atributos_feicao: dict[str, Any] | None = None
