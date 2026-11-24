# -*- coding: utf-8 -*-
"""Modelos relacionais do Catálogo Nacional de Planos Diretores."""

from __future__ import annotations

from sqlalchemy import (
    Boolean,
    Float,
    ForeignKey,
    Integer,
    JSON,
    String,
    Text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


class Municipio(Base):
    __tablename__ = "municipios"

    codigo_ibge: Mapped[str] = mapped_column(String(7), primary_key=True, index=True)
    nome: Mapped[str] = mapped_column(String(150), nullable=False, index=True)
    nome_normalizado: Mapped[str] = mapped_column(String(150), nullable=False, index=True)
    uf: Mapped[str] = mapped_column(String(2), nullable=False, index=True)
    uf_nome: Mapped[str] = mapped_column(String(60), nullable=False)
    regiao: Mapped[str] = mapped_column(String(40), nullable=False)
    mesorregiao: Mapped[str] = mapped_column(String(120), nullable=False, default="")
    microrregiao: Mapped[str] = mapped_column(String(120), nullable=False, default="")
    munic_possui_plano: Mapped[str] = mapped_column(String(24), nullable=False, default="sem_dados", index=True)
    munic_ano_criacao: Mapped[int | None] = mapped_column(Integer, nullable=True)
    munic_ano_revisao: Mapped[int | None] = mapped_column(Integer, nullable=True)

    plano: Mapped["PlanoDiretor | None"] = relationship(
        back_populates="municipio_rel", uselist=False, cascade="all, delete-orphan"
    )
    documentos: Mapped[list["DocumentoMunicipal"]] = relationship(
        back_populates="municipio_rel", cascade="all, delete-orphan"
    )
    camadas: Mapped[list["CamadaGIS"]] = relationship(
        back_populates="municipio_rel", cascade="all, delete-orphan"
    )
    zonas: Mapped[list["ZonaRegra"]] = relationship(
        back_populates="municipio_rel", cascade="all, delete-orphan"
    )
    chunks: Mapped[list["ChunkDocumental"]] = relationship(
        back_populates="municipio_rel", cascade="all, delete-orphan"
    )
    historico: Mapped[list["HistoricoVersao"]] = relationship(
        back_populates="municipio_rel", cascade="all, delete-orphan"
    )


class PlanoDiretor(Base):
    __tablename__ = "planos_diretores"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    codigo_ibge: Mapped[str] = mapped_column(
        String(7), ForeignKey("municipios.codigo_ibge", ondelete="CASCADE"), unique=True, index=True
    )
    nome_plano_diretor: Mapped[str] = mapped_column(String(255), nullable=False)
    lei_principal: Mapped[str | None] = mapped_column(String(160), nullable=True)
    ano_lei: Mapped[int | None] = mapped_column(Integer, nullable=True)
    data_aprovacao: Mapped[str | None] = mapped_column(String(32), nullable=True)
    data_revisao: Mapped[str | None] = mapped_column(String(32), nullable=True)
    situacao: Mapped[str] = mapped_column(String(40), nullable=False, default="nao_localizado", index=True)
    fonte_oficial: Mapped[str | None] = mapped_column(String(255), nullable=True)
    hierarquia_fonte: Mapped[int | None] = mapped_column(Integer, nullable=True)
    url_oficial: Mapped[str | None] = mapped_column(String(500), nullable=True)
    url_pdf: Mapped[str | None] = mapped_column(String(500), nullable=True)
    confiabilidade: Mapped[str] = mapped_column(String(32), nullable=False, default="nao_verificada")
    data_verificacao: Mapped[str | None] = mapped_column(String(32), nullable=True)
    aviso_documental: Mapped[str | None] = mapped_column(Text, nullable=True)
    possui_cartografia: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    municipio_rel: Mapped["Municipio"] = relationship(back_populates="plano")


class DocumentoMunicipal(Base):
    __tablename__ = "documentos"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    codigo_ibge: Mapped[str] = mapped_column(
        String(7), ForeignKey("municipios.codigo_ibge", ondelete="CASCADE"), index=True
    )
    titulo: Mapped[str] = mapped_column(String(300), nullable=False)
    tipo: Mapped[str] = mapped_column(String(60), nullable=False)
    lei_numero: Mapped[str | None] = mapped_column(String(140), nullable=True)
    ano: Mapped[int | None] = mapped_column(Integer, nullable=True)
    url: Mapped[str | None] = mapped_column(String(600), nullable=True)
    formato: Mapped[str | None] = mapped_column(String(60), nullable=True)
    fonte_oficial: Mapped[str | None] = mapped_column(String(255), nullable=True)
    hierarquia_fonte: Mapped[int | None] = mapped_column(Integer, nullable=True)
    situacao_vigencia: Mapped[str] = mapped_column(String(40), nullable=False, default="aguardando_verificacao")
    data_verificacao: Mapped[str | None] = mapped_column(String(32), nullable=True)
    arquivo_local: Mapped[str | None] = mapped_column(String(500), nullable=True)
    observacao: Mapped[str | None] = mapped_column(Text, nullable=True)
    confianca_extracao: Mapped[float | None] = mapped_column(Float, nullable=True)

    municipio_rel: Mapped["Municipio"] = relationship(back_populates="documentos")


class CamadaGIS(Base):
    __tablename__ = "camadas_gis"

    id: Mapped[str] = mapped_column(String(120), primary_key=True)
    codigo_ibge: Mapped[str] = mapped_column(
        String(7), ForeignKey("municipios.codigo_ibge", ondelete="CASCADE"), index=True
    )
    nome: Mapped[str] = mapped_column(String(255), nullable=False)
    categoria: Mapped[str] = mapped_column(String(40), nullable=False, default="urbanistica")
    tipo_servico: Mapped[str] = mapped_column(String(40), nullable=False)
    url: Mapped[str] = mapped_column(String(700), nullable=False)
    campo_codigo_zona: Mapped[str | None] = mapped_column(String(80), nullable=True)
    campo_nome_zona: Mapped[str | None] = mapped_column(String(80), nullable=True)
    campo_grupo: Mapped[str | None] = mapped_column(String(80), nullable=True)
    campo_legislacao: Mapped[str | None] = mapped_column(String(80), nullable=True)
    campo_area: Mapped[str | None] = mapped_column(String(80), nullable=True)
    crs_origem: Mapped[str | None] = mapped_column(String(120), nullable=True)
    origem_geometria: Mapped[str] = mapped_column(String(32), nullable=False, default="oficial")
    fonte_oficial: Mapped[str | None] = mapped_column(String(255), nullable=True)
    data_verificacao: Mapped[str | None] = mapped_column(String(32), nullable=True)
    observacao: Mapped[str | None] = mapped_column(Text, nullable=True)

    municipio_rel: Mapped["Municipio"] = relationship(back_populates="camadas")


class ZonaRegra(Base):
    __tablename__ = "zonas_regras"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    codigo_ibge: Mapped[str] = mapped_column(
        String(7), ForeignKey("municipios.codigo_ibge", ondelete="CASCADE"), index=True
    )
    sigla: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    nome: Mapped[str] = mapped_column(String(255), nullable=False)
    grupo: Mapped[str | None] = mapped_column(String(160), nullable=True)
    lei: Mapped[str | None] = mapped_column(String(160), nullable=True)
    artigo: Mapped[str | None] = mapped_column(String(160), nullable=True)
    finalidade: Mapped[str | None] = mapped_column(Text, nullable=True)
    usos_permitidos: Mapped[str | None] = mapped_column(Text, nullable=True)
    usos_condicionados: Mapped[str | None] = mapped_column(Text, nullable=True)
    usos_proibidos: Mapped[str | None] = mapped_column(Text, nullable=True)
    parametros: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    aviso_parametros: Mapped[str | None] = mapped_column(Text, nullable=True)

    municipio_rel: Mapped["Municipio"] = relationship(back_populates="zonas")


class ChunkDocumental(Base):
    __tablename__ = "chunks_documentais"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    codigo_ibge: Mapped[str] = mapped_column(
        String(7), ForeignKey("municipios.codigo_ibge", ondelete="CASCADE"), index=True
    )
    escopo: Mapped[str] = mapped_column(String(32), nullable=False, default="municipal")
    lei: Mapped[str] = mapped_column(String(180), nullable=False)
    artigo: Mapped[str | None] = mapped_column(String(160), nullable=True)
    anexo: Mapped[str | None] = mapped_column(String(160), nullable=True)
    pagina: Mapped[int | None] = mapped_column(Integer, nullable=True)
    titulo: Mapped[str | None] = mapped_column(String(255), nullable=True)
    texto_literal: Mapped[str] = mapped_column(Text, nullable=False)
    palavras_chave: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    url: Mapped[str | None] = mapped_column(String(600), nullable=True)
    confianca: Mapped[float] = mapped_column(Float, nullable=False, default=0.9)
    data_verificacao: Mapped[str | None] = mapped_column(String(32), nullable=True)

    municipio_rel: Mapped["Municipio"] = relationship(back_populates="chunks")


class HistoricoVersao(Base):
    __tablename__ = "historico_versoes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    codigo_ibge: Mapped[str] = mapped_column(
        String(7), ForeignKey("municipios.codigo_ibge", ondelete="CASCADE"), index=True
    )
    lei: Mapped[str] = mapped_column(String(160), nullable=False)
    ano: Mapped[int | None] = mapped_column(Integer, nullable=True)
    situacao: Mapped[str] = mapped_column(String(40), nullable=False)
    observacao: Mapped[str | None] = mapped_column(Text, nullable=True)

    municipio_rel: Mapped["Municipio"] = relationship(back_populates="historico")
