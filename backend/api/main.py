# -*- coding: utf-8 -*-
"""Aplicação FastAPI principal da plataforma Planos Diretores do Brasil."""

from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from ..catalogo.service import sincronizar_base_inicial
from ..db.database import SessionLocal, init_db
from .routes import router


@asynccontextmanager
async def lifespan(_app: FastAPI):
    init_db()
    with SessionLocal() as db:
        sincronizar_base_inicial(db)
    yield


app = FastAPI(
    title="Planos Diretores do Brasil — API Unificada",
    description=(
        "Infraestrutura nacional única de dados urbanísticos, legislações, cartografia "
        "e assistência por IA compartilhada entre o Plugin QGIS e o WebGIS."
    ),
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:4173",
        "http://127.0.0.1:4173",
        "*",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)
