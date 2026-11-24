# -*- coding: utf-8 -*-
"""Utilitários de normalização e limpeza textual compartilhados entre módulos do backend."""

from __future__ import annotations

import unicodedata


def normalizar_texto(texto: str | None) -> str:
    """Remove acentos, normaliza espaços e converte para minúsculas para busca."""
    if not texto:
        return ""
    nfkd = unicodedata.normalize("NFKD", str(texto))
    sem_acentos = "".join(ch for ch in nfkd if not unicodedata.combining(ch))
    return " ".join(sem_acentos.lower().strip().split())
