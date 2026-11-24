# -*- coding: utf-8 -*-
"""
Extrator e indexador documental para Planos Diretores Municipais em PDF/texto.

Funcionalidades:
- Extrai texto página a página via pypdf.
- Detecta páginas sem texto nativo e aciona OCR opcional (pytesseract) quando disponível.
- Identifica leis/leis complementares, artigos, anexos, tabelas, referências a mapas e siglas de zonas.
- Calcula indicador de confiança (0.0 a 1.0) e persiste chunks rastreáveis no banco para o RAG.
"""

from __future__ import annotations

import re
from datetime import date
from pathlib import Path
from typing import Any

from pypdf import PdfReader
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db.database import DATA_DIR
from ..db.models import ChunkDocumental, DocumentoMunicipal

RE_LEI = re.compile(
    r"(Lei\s+(?:Complementar\s+|Municipal\s+)?n[º°o\.]*\s*[\d\.]+/\d{2,4})",
    re.IGNORECASE,
)
RE_ARTIGO = re.compile(r"(?m)^\s*(Art\.?\s*\d+[º°o]?[^\n]{0,100})")
RE_ANEXO = re.compile(r"(Anexo\s+[IVXLCDM\d]+(?:\s*[-–—]\s*[^\n]{3,80})?)", re.IGNORECASE)
RE_MAPA = re.compile(
    r"(Mapa\s+(?:de\s+)?(?:Zoneamento|Macrozoneamento|Uso\s+e\s+Ocupa[çc][ãa]o|Per[íi]metro|Sistema\s+Vi[áa]rio)[^\n\.]{0,70})",
    re.IGNORECASE,
)
RE_SIGLA_ZONA = re.compile(
    r"\b(Z[A-Z]{1,4}(?:-?\d{1,2})?|AUAP|AUPA|SA-\d{2}|APP|ZEIS(?:-?\d)?|ZEU|ZPA|ZPR|ZIA|ZIC|ZROC|ZROI|ZR\d)\b"
)
RE_TABELA = re.compile(
    r"(Tabela\s+[IVXLCDM\d]+[^\n]{0,80}|Quadro\s+[IVXLCDM\d]+[^\n]{0,80}|Coeficiente\s+de\s+Aproveitamento|Taxa\s+de\s+Ocupa[çc][ãa]o)",
    re.IGNORECASE,
)


def _tentar_ocr_pagina(pdf_path: Path, page_index: int) -> str:
    """Hook opcional de OCR via pdf2image + pytesseract quando a página PDF for imagem digitalizada."""
    try:
        from pdf2image import convert_from_path  # type: ignore
        import pytesseract  # type: ignore

        imagens = convert_from_path(
            str(pdf_path),
            first_page=page_index + 1,
            last_page=page_index + 1,
            dpi=200,
        )
        if not imagens:
            return ""
        return pytesseract.image_to_string(imagens[0], lang="por") or ""
    except Exception:
        return ""


def analisar_texto_pagina(texto: str, pagina: int, metodo_ocr: bool = False) -> dict[str, Any]:
    """Extrai entidades urbanísticas de uma página de texto e atribui pontuação de confiança."""
    leis = list(dict.fromkeys(m.group(1).strip() for m in RE_LEI.finditer(texto)))
    artigos = list(dict.fromkeys(m.group(1).strip() for m in RE_ARTIGO.finditer(texto)))
    anexos = list(dict.fromkeys(m.group(1).strip() for m in RE_ANEXO.finditer(texto)))
    mapas = list(dict.fromkeys(m.group(1).strip() for m in RE_MAPA.finditer(texto)))
    zonas = list(dict.fromkeys(m.group(1).strip() for m in RE_SIGLA_ZONA.finditer(texto)))
    tabelas = list(dict.fromkeys(m.group(1).strip() for m in RE_TABELA.finditer(texto)))

    texto_limpo = " ".join(texto.split())
    if not texto_limpo:
        confianca = 0.0
    else:
        confianca = 0.72 if metodo_ocr else 0.92
        if leis or artigos:
            confianca = min(0.98, confianca + 0.04)
        if len(texto_limpo) < 80:
            confianca = min(confianca, 0.55)

    return {
        "pagina": pagina,
        "metodo": "ocr" if metodo_ocr else "texto_nativo",
        "confianca": round(confianca, 2),
        "leis": leis,
        "artigos": artigos,
        "anexos": anexos,
        "mapas": mapas,
        "zonas": zonas,
        "tabelas": tabelas,
        "texto_limpo": texto_limpo,
    }


def extrair_e_indexar_pdf(
    db: Session,
    codigo_ibge: str,
    pdf_path: Path,
    *,
    titulo_documento: str,
    lei_numero: str | None = None,
    url_origem: str | None = None,
) -> dict[str, Any]:
    """Lê um PDF municipal, extrai artigos/zonas/tabelas/mapas e indexa chunks rastreáveis no banco."""
    reader = PdfReader(str(pdf_path))
    paginas_analisadas: list[dict[str, Any]] = []
    leis_globais: set[str] = set()
    zonas_globais: set[str] = set()
    anexos_globais: set[str] = set()
    mapas_globais: set[str] = set()
    tabelas_globais: set[str] = set()
    chunks_criados = 0
    soma_conf = 0.0
    usou_ocr = False

    for idx, page in enumerate(reader.pages):
        texto_nativo = page.extract_text() or ""
        metodo_ocr = False
        texto = texto_nativo
        if len(texto_nativo.strip()) < 25:
            ocr_texto = _tentar_ocr_pagina(pdf_path, idx)
            if ocr_texto.strip():
                texto = ocr_texto
                metodo_ocr = True
                usou_ocr = True

        analise = analisar_texto_pagina(texto, pagina=idx + 1, metodo_ocr=metodo_ocr)
        paginas_analisadas.append(analise)
        leis_globais.update(analise["leis"])
        zonas_globais.update(analise["zonas"])
        anexos_globais.update(analise["anexos"])
        mapas_globais.update(analise["mapas"])
        tabelas_globais.update(analise["tabelas"])

        if analise["texto_limpo"]:
            soma_conf += analise["confianca"]
            lei_chunk = lei_numero or (analise["leis"][0] if analise["leis"] else titulo_documento)
            artigo_chunk = analise["artigos"][0][:155] if analise["artigos"] else f"Página {idx + 1}"
            anexo_chunk = analise["anexos"][0][:155] if analise["anexos"] else None
            palavras = list(dict.fromkeys(analise["zonas"] + analise["anexos"] + analise["mapas"]))[:20]

            db.add(
                ChunkDocumental(
                    codigo_ibge=codigo_ibge,
                    escopo="municipal",
                    lei=lei_chunk[:175],
                    artigo=artigo_chunk,
                    anexo=anexo_chunk,
                    pagina=idx + 1,
                    titulo=titulo_documento[:250],
                    texto_literal=analise["texto_limpo"][:4000],
                    palavras_chave=palavras,
                    url=url_origem,
                    confianca=analise["confianca"],
                    data_verificacao=date.today().isoformat(),
                )
            )
            chunks_criados += 1

    confianca_media = round(soma_conf / max(chunks_criados, 1), 2) if chunks_criados else 0.0

    doc = DocumentoMunicipal(
        codigo_ibge=codigo_ibge,
        titulo=titulo_documento,
        tipo="plano_diretor_pdf",
        lei_numero=lei_numero or (sorted(leis_globais)[0] if leis_globais else None),
        url=url_origem,
        formato="PDF (processado)",
        fonte_oficial="Upload / Extração Documental Local",
        hierarquia_fonte=4,
        situacao_vigencia="aguardando_verificacao",
        data_verificacao=date.today().isoformat(),
        arquivo_local=str(pdf_path),
        observacao=(
            f"Extraído automaticamente em {len(reader.pages)} página(s). "
            f"{'Incluiu OCR.' if usou_ocr else 'Texto nativo.'} Confiança média: {confianca_media:.2f}."
        ),
        confianca_extracao=confianca_media,
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)

    return {
        "documento_id": doc.id,
        "codigo_ibge": codigo_ibge,
        "titulo": titulo_documento,
        "total_paginas": len(reader.pages),
        "chunks_indexados": chunks_criados,
        "usou_ocr": usou_ocr,
        "confianca_media": confianca_media,
        "leis_identificadas": sorted(leis_globais),
        "zonas_identificadas": sorted(zonas_globais),
        "anexos_identificados": sorted(anexos_globais),
        "mapas_identificados": sorted(mapas_globais),
        "tabelas_identificadas": sorted(tabelas_globais),
        "paginas": [
            {
                "pagina": p["pagina"],
                "metodo": p["metodo"],
                "confianca": p["confianca"],
                "artigos": p["artigos"][:10],
                "zonas": p["zonas"],
                "anexos": p["anexos"],
                "mapas": p["mapas"],
                "tabelas": p["tabelas"],
                "trecho": p["texto_limpo"][:320],
            }
            for p in paginas_analisadas
        ],
    }


def listar_chunks_municipio(db: Session, codigo_ibge: str) -> list[dict[str, Any]]:
    """Retorna os trechos indexados de um município com metadados de rastreabilidade."""
    rows = db.scalars(
        select(ChunkDocumental)
        .where(ChunkDocumental.codigo_ibge == codigo_ibge)
        .order_by(ChunkDocumental.pagina, ChunkDocumental.id)
    ).all()
    return [
        {
            "id": r.id,
            "lei": r.lei,
            "artigo": r.artigo,
            "anexo": r.anexo,
            "pagina": r.pagina,
            "titulo": r.titulo,
            "texto_literal": r.texto_literal,
            "palavras_chave": r.palavras_chave or [],
            "url": r.url,
            "confianca": r.confianca,
            "data_verificacao": r.data_verificacao,
        }
        for r in rows
    ]


def salvar_pdf_upload(codigo_ibge: str, nome_arquivo: str, conteudo: bytes) -> Path:
    dest_dir = DATA_DIR / "planos_diretores" / "downloads" / codigo_ibge
    dest_dir.mkdir(parents=True, exist_ok=True)
    safe_name = re.sub(r"[^a-zA-Z0-9._-]+", "_", nome_arquivo) or "documento.pdf"
    dest_path = dest_dir / safe_name
    dest_path.write_bytes(conteudo)
    return dest_path
