# -*- coding: utf-8 -*-
"""
Motor de Recuperação (RAG) fundamentado nos documentos do município selecionado
e na legislação ambiental federal (Código Florestal — Lei Federal nº 12.651/2012).
"""

from __future__ import annotations

import json
import math
import re
from collections import Counter
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db.database import DATA_DIR
from ..db.models import ChunkDocumental, ZonaRegra
from ..utils import normalizar_texto

FEDERAL_CF_FILE = DATA_DIR / "legislacao" / "federal_codigo_florestal_12651_2012.json"

STOPWORDS_PT = {
    "a", "o", "as", "os", "de", "da", "do", "das", "dos", "e", "em", "na", "no",
    "nas", "nos", "para", "por", "com", "sem", "que", "qual", "quais", "como",
    "onde", "essa", "esse", "esta", "este", "area", "zona", "aqui", "posso",
    "pode", "existem", "sobre", "entre", "um", "uma", "ser", "sao", "ao",
}


def tokenizar(texto: str) -> list[str]:
    norm = normalizar_texto(texto)
    tokens = re.findall(r"[a-z0-9\-]+", norm)
    return [t for t in tokens if len(t) >= 2 and t not in STOPWORDS_PT]


def carregar_base_codigo_florestal() -> dict[str, Any]:
    if not FEDERAL_CF_FILE.exists():
        return {}
    return json.loads(FEDERAL_CF_FILE.read_text(encoding="utf-8"))


def recuperar_contexto_bm25(
    db: Session,
    *,
    codigo_ibge: str,
    pergunta: str,
    zona_sigla: str | None = None,
    zona_nome: str | None = None,
    incluir_federal: bool = False,
    top_k: int = 5,
) -> dict[str, Any]:
    """
    Recupera dispositivos priorizando exclusivamente os documentos do município
    selecionado e a regra da zona consultada. Só inclui dispositivos federais
    (Código Florestal) quando a consulta envolver tema ambiental/APP/construção.
    """
    chunks_mun = db.scalars(
        select(ChunkDocumental).where(ChunkDocumental.codigo_ibge == codigo_ibge)
    ).all()

    documentos: list[dict[str, Any]] = [
        {
            "escopo": "municipal",
            "lei": c.lei,
            "artigo": c.artigo,
            "anexo": c.anexo,
            "pagina": c.pagina,
            "titulo": c.titulo,
            "texto_literal": c.texto_literal,
            "palavras_chave": c.palavras_chave or [],
            "url": c.url,
            "confianca": c.confianca,
            "data_verificacao": c.data_verificacao,
        }
        for c in chunks_mun
    ]

    federal_data = carregar_base_codigo_florestal()
    if incluir_federal:
        for disp in federal_data.get("dispositivos", []):
            documentos.append(
                {
                    "escopo": "federal",
                    "lei": disp["lei"],
                    "artigo": disp.get("artigo"),
                    "anexo": disp.get("anexo"),
                    "pagina": disp.get("pagina"),
                    "titulo": disp.get("titulo"),
                    "texto_literal": disp["texto_literal"],
                    "palavras_chave": disp.get("palavras_chave", []),
                    "url": disp.get("url"),
                    "confianca": disp.get("confianca", 1.0),
                    "data_verificacao": federal_data.get("data_verificacao"),
                }
            )

    query_tokens = tokenizar(" ".join(filter(None, [pergunta, zona_sigla, zona_nome])))
    if not documentos:
        return {"chunks": [], "zona_regra": None, "federal": federal_data}

    # Pontuação BM25 simplificada com bônus explícito para documentos do município
    doc_tokens_list: list[list[str]] = []
    df: Counter[str] = Counter()
    for doc in documentos:
        corpus_text = " ".join(
            [
                str(doc.get("lei") or ""),
                str(doc.get("artigo") or ""),
                str(doc.get("titulo") or ""),
                str(doc.get("texto_literal") or ""),
                " ".join(doc.get("palavras_chave") or []),
            ]
        )
        toks = tokenizar(corpus_text)
        doc_tokens_list.append(toks)
        for t in set(toks):
            df[t] += 1

    avgdl = sum(len(t) for t in doc_tokens_list) / max(len(doc_tokens_list), 1)
    n_docs = len(documentos)
    k1, b = 1.5, 0.75

    scored: list[tuple[float, dict[str, Any]]] = []
    for doc, toks in zip(documentos, doc_tokens_list):
        tf = Counter(toks)
        score = 0.0
        dl = max(len(toks), 1)
        for q in query_tokens:
            if q not in tf:
                continue
            idf = math.log(1.0 + (n_docs - df[q] + 0.5) / (df[q] + 0.5))
            num = tf[q] * (k1 + 1.0)
            den = tf[q] + k1 * (1.0 - b + b * dl / max(avgdl, 1.0))
            score += idf * (num / den)

        # Garante precedência do material municipal sobre referência federal
        if doc["escopo"] == "municipal":
            score += 0.35
        scored.append((score, doc))

    scored.sort(key=lambda item: item[0], reverse=True)
    selecionados = [doc for score, doc in scored[:top_k] if score > 0 or doc["escopo"] == "municipal"][:top_k]

    # Busca regra específica da zona, se informada
    zona_regra_obj: ZonaRegra | None = None
    if zona_sigla or zona_nome:
        regras = db.scalars(
            select(ZonaRegra).where(ZonaRegra.codigo_ibge == codigo_ibge)
        ).all()
        sigla_norm = normalizar_texto(zona_sigla)
        nome_norm = normalizar_texto(zona_nome)
        for r in regras:
            if sigla_norm and normalizar_texto(r.sigla) == sigla_norm:
                zona_regra_obj = r
                break
            if nome_norm and normalizar_texto(r.nome) == nome_norm:
                zona_regra_obj = r
                break

    return {
        "chunks": selecionados,
        "zona_regra": zona_regra_obj,
        "federal": federal_data,
    }
