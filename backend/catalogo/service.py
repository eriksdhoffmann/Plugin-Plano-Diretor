# -*- coding: utf-8 -*-
"""Serviço do Catálogo Nacional de Planos Diretores."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Iterable

from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from ..db.database import DATA_DIR
from ..db.models import (
    CamadaGIS,
    ChunkDocumental,
    DocumentoMunicipal,
    HistoricoVersao,
    Municipio,
    PlanoDiretor,
    ZonaRegra,
)
from ..utils import normalizar_texto
from .schemas import (
    CamadaGISSchema,
    DocumentoSchema,
    EstadoResumo,
    EstatisticasNacionais,
    HistoricoVersaoSchema,
    MunicipioBuscaResponse,
    MunicipioDetalhe,
    MunicipioResumo,
    ZonaRegraSchema,
)

MENSAGEM_NAO_LOCALIZADO = "Plano Diretor não localizado nas fontes consultadas."

IBGE_FILE = DATA_DIR / "municipios" / "municipios_ibge.json"
MUNIC_FILE = DATA_DIR / "catalogo" / "munic_ibge_planos_diretores.json"
CATALOGO_VERIFICADO_FILE = DATA_DIR / "catalogo" / "planos_diretores_verificados.json"
LEGISLACAO_DIR = DATA_DIR / "legislacao"


def _carregar_json(path: Path) -> dict:
    if not path.exists():
        return {}
    return json.loads(path.read_text(encoding="utf-8"))


def sincronizar_base_inicial(db: Session) -> dict[str, int]:
    """
    Popula e atualiza o banco com a divisão territorial oficial completa do IBGE
    (5.571 municípios) e os registros verificados em data/catalogo e data/legislacao.
    """
    ibge_data = _carregar_json(IBGE_FILE)
    municipios_raw = ibge_data.get("municipios", [])
    munic_data = _carregar_json(MUNIC_FILE).get("municipios", {})

    existentes = {
        row[0] for row in db.execute(select(Municipio.codigo_ibge)).all()
    }
    novos_municipios: list[Municipio] = []
    for m in municipios_raw:
        cod = str(m["codigo_ibge"])
        mu = munic_data.get(cod, {})
        if cod not in existentes:
            novos_municipios.append(
                Municipio(
                    codigo_ibge=cod,
                    nome=m["nome"],
                    nome_normalizado=normalizar_texto(m["nome"]),
                    uf=m["uf"],
                    uf_nome=m.get("uf_nome", m["uf"]),
                    regiao=m.get("regiao", ""),
                    mesorregiao=m.get("mesorregiao", ""),
                    microrregiao=m.get("microrregiao", ""),
                    munic_possui_plano=mu.get("munic_possui_plano", "sem_dados"),
                    munic_ano_criacao=mu.get("munic_ano_criacao"),
                    munic_ano_revisao=mu.get("munic_ano_revisao"),
                )
            )
    if novos_municipios:
        db.add_all(novos_municipios)
        db.commit()

    cat_data = _carregar_json(CATALOGO_VERIFICADO_FILE)
    atualizados = 0
    for entry in cat_data.get("planos_diretores", []):
        cod = str(entry["codigo_ibge"])
        mun = db.get(Municipio, cod)
        if mun is None:
            continue

        camadas = entry.get("camadas_gis", [])
        plano = db.scalar(select(PlanoDiretor).where(PlanoDiretor.codigo_ibge == cod))
        if plano is None:
            plano = PlanoDiretor(codigo_ibge=cod, nome_plano_diretor=entry["nome_plano_diretor"])
            db.add(plano)

        plano.nome_plano_diretor = entry["nome_plano_diretor"]
        plano.lei_principal = entry.get("lei_principal")
        plano.ano_lei = entry.get("ano_lei")
        plano.data_aprovacao = entry.get("data_aprovacao")
        plano.data_revisao = entry.get("data_revisao")
        plano.situacao = entry.get("situacao", "nao_localizado")
        plano.fonte_oficial = entry.get("fonte_oficial")
        plano.hierarquia_fonte = entry.get("hierarquia_fonte")
        plano.url_oficial = entry.get("url_oficial")
        plano.url_pdf = entry.get("url_pdf")
        plano.confiabilidade = entry.get("confiabilidade", "nao_verificada")
        plano.data_verificacao = entry.get("data_verificacao")
        plano.aviso_documental = entry.get("aviso_documental")
        plano.possui_cartografia = len(camadas) > 0

        # Sincroniza documentos oficiais verificados (preserva eventuais uploads locais)
        for doc in entry.get("documentos", []):
            existente_doc = db.scalar(
                select(DocumentoMunicipal).where(
                    DocumentoMunicipal.codigo_ibge == cod,
                    DocumentoMunicipal.titulo == doc["titulo"],
                )
            )
            if existente_doc is None:
                db.add(
                    DocumentoMunicipal(
                        codigo_ibge=cod,
                        titulo=doc["titulo"],
                        tipo=doc["tipo"],
                        lei_numero=doc.get("lei_numero"),
                        ano=doc.get("ano"),
                        url=doc.get("url"),
                        formato=doc.get("formato"),
                        fonte_oficial=doc.get("fonte_oficial"),
                        hierarquia_fonte=doc.get("hierarquia_fonte"),
                        situacao_vigencia=doc.get("situacao_vigencia", "aguardando_verificacao"),
                        data_verificacao=doc.get("data_verificacao"),
                        observacao=doc.get("observacao"),
                    )
                )

        # Sincroniza camadas GIS verificadas
        for cam in camadas:
            existente_cam = db.get(CamadaGIS, cam["id"])
            if existente_cam is None:
                existente_cam = CamadaGIS(id=cam["id"], codigo_ibge=cod, nome=cam["nome"], tipo_servico=cam["tipo_servico"], url=cam["url"])
                db.add(existente_cam)
            existente_cam.nome = cam["nome"]
            existente_cam.categoria = cam.get("categoria", "urbanistica")
            existente_cam.tipo_servico = cam["tipo_servico"]
            existente_cam.url = cam["url"]
            existente_cam.campo_codigo_zona = cam.get("campo_codigo_zona")
            existente_cam.campo_nome_zona = cam.get("campo_nome_zona")
            existente_cam.campo_grupo = cam.get("campo_grupo")
            existente_cam.campo_legislacao = cam.get("campo_legislacao")
            existente_cam.campo_area = cam.get("campo_area")
            existente_cam.crs_origem = cam.get("crs_origem")
            existente_cam.origem_geometria = cam.get("origem_geometria", "oficial")
            existente_cam.fonte_oficial = cam.get("fonte_oficial")
            existente_cam.data_verificacao = cam.get("data_verificacao")
            existente_cam.observacao = cam.get("observacao")

        # Sincroniza histórico de versões
        for hist in entry.get("historico_versoes", []):
            existente_hist = db.scalar(
                select(HistoricoVersao).where(
                    HistoricoVersao.codigo_ibge == cod,
                    HistoricoVersao.lei == hist["lei"],
                )
            )
            if existente_hist is None:
                db.add(
                    HistoricoVersao(
                        codigo_ibge=cod,
                        lei=hist["lei"],
                        ano=hist.get("ano"),
                        situacao=hist.get("situacao", "nao_verificada"),
                        observacao=hist.get("observacao"),
                    )
                )
        atualizados += 1

    # Sincroniza legislações e regras de zonas por município
    if LEGISLACAO_DIR.exists():
        for arq in sorted(LEGISLACAO_DIR.glob("*.json")):
            if arq.name.startswith("federal_"):
                continue
            leg_data = _carregar_json(arq)
            cod = str(leg_data.get("codigo_ibge", ""))
            if not cod or db.get(Municipio, cod) is None:
                continue

            data_verif = leg_data.get("data_verificacao")
            for zr in leg_data.get("zonas_conhecidas", []):
                existente_zr = db.scalar(
                    select(ZonaRegra).where(
                        ZonaRegra.codigo_ibge == cod,
                        ZonaRegra.sigla == zr["sigla"],
                    )
                )
                if existente_zr is None:
                    existente_zr = ZonaRegra(codigo_ibge=cod, sigla=zr["sigla"], nome=zr["nome"])
                    db.add(existente_zr)
                existente_zr.nome = zr["nome"]
                existente_zr.grupo = zr.get("grupo")
                existente_zr.lei = zr.get("lei")
                existente_zr.artigo = zr.get("artigo")
                existente_zr.finalidade = zr.get("finalidade")
                existente_zr.usos_permitidos = zr.get("usos_permitidos")
                existente_zr.usos_condicionados = zr.get("usos_condicionados")
                existente_zr.usos_proibidos = zr.get("usos_proibidos")
                existente_zr.parametros = zr.get("parametros", {})
                existente_zr.aviso_parametros = zr.get("aviso_parametros")

            for disp in leg_data.get("dispositivos", []):
                existente_ch = db.scalar(
                    select(ChunkDocumental).where(
                        ChunkDocumental.codigo_ibge == cod,
                        ChunkDocumental.lei == disp["lei"],
                        ChunkDocumental.artigo == disp.get("artigo"),
                        ChunkDocumental.titulo == disp.get("titulo"),
                    )
                )
                if existente_ch is None:
                    db.add(
                        ChunkDocumental(
                            codigo_ibge=cod,
                            escopo="municipal",
                            lei=disp["lei"],
                            artigo=disp.get("artigo"),
                            anexo=disp.get("anexo"),
                            pagina=disp.get("pagina"),
                            titulo=disp.get("titulo"),
                            texto_literal=disp["texto_literal"],
                            palavras_chave=disp.get("palavras_chave", []),
                            url=disp.get("url"),
                            confianca=float(disp.get("confianca", 0.9)),
                            data_verificacao=data_verif,
                        )
                    )

    db.commit()
    return {"municipios_inseridos": len(novos_municipios), "planos_sincronizados": atualizados}


def obter_estatisticas_nacionais(db: Session) -> EstatisticasNacionais:
    """Calcula indicadores reais a partir dos registros efetivos no banco."""
    total_municipios = db.scalar(select(func.count(Municipio.codigo_ibge))) or 0
    munic_com_plano = db.scalar(select(func.count(Municipio.codigo_ibge)).where(Municipio.munic_possui_plano == "sim")) or 0
    munic_em_elab = db.scalar(select(func.count(Municipio.codigo_ibge)).where(Municipio.munic_possui_plano == "em_elaboracao")) or 0
    munic_sem_plano = db.scalar(select(func.count(Municipio.codigo_ibge)).where(Municipio.munic_possui_plano == "nao")) or 0

    planos_localizados = (
        db.scalar(
            select(func.count(PlanoDiretor.id)).where(
                PlanoDiretor.situacao.in_(["vigente", "localizado_em_verificacao", "desatualizado_ou_substituido"])
            )
        )
        or 0
    )
    planos_vigentes = (
        db.scalar(select(func.count(PlanoDiretor.id)).where(PlanoDiretor.situacao == "vigente")) or 0
    )
    aguardando_verificacao = (
        db.scalar(
            select(func.count(PlanoDiretor.id)).where(
                PlanoDiretor.situacao == "localizado_em_verificacao"
            )
        )
        or 0
    )
    docs_oficiais = (
        db.scalar(
            select(func.count(DocumentoMunicipal.id)).where(
                DocumentoMunicipal.hierarquia_fonte <= 4,
                DocumentoMunicipal.url.is_not(None),
            )
        )
        or 0
    )
    municipios_cartografia = (
        db.scalar(select(func.count(func.distinct(CamadaGIS.codigo_ibge)))) or 0
    )
    nao_localizados = max(total_municipios - planos_localizados, 0)

    return EstatisticasNacionais(
        municipios_cadastrados=total_municipios,
        munic_com_plano=munic_com_plano,
        munic_em_elaboracao=munic_em_elab,
        munic_sem_plano=munic_sem_plano,
        planos_localizados=planos_localizados,
        planos_vigentes=planos_vigentes,
        documentos_fonte_oficial=docs_oficiais,
        municipios_com_cartografia=municipios_cartografia,
        municipios_aguardando_verificacao=aguardando_verificacao,
        municipios_nao_localizados=nao_localizados,
    )


def listar_estados_com_cobertura(db: Session) -> list[EstadoResumo]:
    """Retorna as 27 UFs com contadores reais de cobertura documental, IBGE MUNIC e cartográfica."""
    rows = db.execute(
        select(
            Municipio.uf,
            Municipio.uf_nome,
            Municipio.regiao,
            func.count(Municipio.codigo_ibge),
        )
        .group_by(Municipio.uf, Municipio.uf_nome, Municipio.regiao)
        .order_by(Municipio.uf)
    ).all()

    munic_rows = db.execute(
        select(Municipio.uf, Municipio.munic_possui_plano)
    ).all()
    munic_uf: dict[str, dict[str, int]] = {}
    for uf, st in munic_rows:
        mb = munic_uf.setdefault(uf, {"sim": 0, "em_elaboracao": 0, "nao": 0})
        if st in mb:
            mb[st] += 1

    planos_rows = db.execute(
        select(
            Municipio.uf,
            PlanoDiretor.situacao,
            PlanoDiretor.possui_cartografia,
        )
        .join(PlanoDiretor, PlanoDiretor.codigo_ibge == Municipio.codigo_ibge)
    ).all()

    por_uf: dict[str, dict[str, int]] = {}
    for uf, sit, cart in planos_rows:
        bucket = por_uf.setdefault(uf, {"loc": 0, "vig": 0, "cart": 0, "verif": 0})
        if sit in {"vigente", "localizado_em_verificacao", "desatualizado_ou_substituido"}:
            bucket["loc"] += 1
        if sit == "vigente":
            bucket["vig"] += 1
        if sit == "localizado_em_verificacao":
            bucket["verif"] += 1
        if cart:
            bucket["cart"] += 1

    resultado: list[EstadoResumo] = []
    for uf, uf_nome, regiao, total in rows:
        b = por_uf.get(uf, {"loc": 0, "vig": 0, "cart": 0, "verif": 0})
        mb = munic_uf.get(uf, {"sim": 0, "em_elaboracao": 0, "nao": 0})
        resultado.append(
            EstadoResumo(
                uf=uf,
                uf_nome=uf_nome,
                regiao=regiao,
                municipios_cadastrados=int(total),
                munic_com_plano=mb["sim"],
                munic_em_elaboracao=mb["em_elaboracao"],
                munic_sem_plano=mb["nao"],
                planos_localizados=b["loc"],
                planos_vigentes=b["vig"],
                municipios_com_cartografia=b["cart"],
                municipios_aguardando_verificacao=b["verif"],
            )
        )
    return resultado


def _to_resumo(m: Municipio) -> MunicipioResumo:
    p = m.plano
    return MunicipioResumo(
        codigo_ibge=m.codigo_ibge,
        nome=m.nome,
        uf=m.uf,
        uf_nome=m.uf_nome,
        regiao=m.regiao,
        mesorregiao=m.mesorregiao,
        microrregiao=m.microrregiao,
        munic_possui_plano=m.munic_possui_plano,
        munic_ano_criacao=m.munic_ano_criacao,
        munic_ano_revisao=m.munic_ano_revisao,
        situacao=p.situacao if p else "nao_localizado",
        lei_principal=p.lei_principal if p else None,
        ano_lei=p.ano_lei if p else None,
        possui_cartografia=bool(p.possui_cartografia) if p else False,
        fonte_oficial=p.fonte_oficial if p else None,
        confiabilidade=p.confiabilidade if p else "nao_verificada",
    )


def buscar_municipios(
    db: Session,
    *,
    uf: str | None = None,
    q: str | None = None,
    situacao: str | None = None,
    munic_status: str | None = None,
    com_cartografia: bool | None = None,
    limit: int = 100,
    offset: int = 0,
) -> MunicipioBuscaResponse:
    """Busca municípios por UF, nome normalizado ou código IBGE de 7 dígitos."""
    stmt = select(Municipio).options(selectinload(Municipio.plano))
    count_stmt = select(func.count(Municipio.codigo_ibge))

    filters = []
    if uf:
        uf_up = uf.strip().upper()
        filters.append(Municipio.uf == uf_up)

    if munic_status:
        filters.append(Municipio.munic_possui_plano == munic_status.strip().lower())

    if q:
        q_clean = q.strip()
        if q_clean.isdigit():
            filters.append(Municipio.codigo_ibge.startswith(q_clean))
        else:
            q_norm = normalizar_texto(q_clean)
            filters.append(Municipio.nome_normalizado.contains(q_norm))

    if situacao:
        if situacao == "nao_localizado":
            stmt = stmt.outerjoin(PlanoDiretor, PlanoDiretor.codigo_ibge == Municipio.codigo_ibge)
            count_stmt = count_stmt.outerjoin(PlanoDiretor, PlanoDiretor.codigo_ibge == Municipio.codigo_ibge)
            filters.append((PlanoDiretor.id.is_(None)) | (PlanoDiretor.situacao == "nao_localizado"))
        else:
            stmt = stmt.join(PlanoDiretor, PlanoDiretor.codigo_ibge == Municipio.codigo_ibge)
            count_stmt = count_stmt.join(PlanoDiretor, PlanoDiretor.codigo_ibge == Municipio.codigo_ibge)
            filters.append(PlanoDiretor.situacao == situacao)

    if com_cartografia is True:
        if situacao is None:
            stmt = stmt.join(PlanoDiretor, PlanoDiretor.codigo_ibge == Municipio.codigo_ibge)
            count_stmt = count_stmt.join(PlanoDiretor, PlanoDiretor.codigo_ibge == Municipio.codigo_ibge)
        filters.append(PlanoDiretor.possui_cartografia.is_(True))

    for f in filters:
        stmt = stmt.where(f)
        count_stmt = count_stmt.where(f)

    total = int(db.scalar(count_stmt) or 0)
    rows = db.scalars(stmt.order_by(Municipio.uf, Municipio.nome).limit(limit).offset(offset)).all()
    return MunicipioBuscaResponse(
        total=total,
        limit=limit,
        offset=offset,
        items=[_to_resumo(m) for m in rows],
    )


def obter_municipio_detalhe(db: Session, codigo_ibge: str) -> MunicipioDetalhe | None:
    """Retorna todos os metadados, documentos, camadas e regras do município pelo código IBGE de 7 dígitos."""
    m = db.scalar(
        select(Municipio)
        .options(
            selectinload(Municipio.plano),
            selectinload(Municipio.documentos),
            selectinload(Municipio.camadas),
            selectinload(Municipio.zonas),
            selectinload(Municipio.historico),
        )
        .where(Municipio.codigo_ibge == codigo_ibge)
    )
    if m is None:
        return None

    p = m.plano
    situacao = p.situacao if p else "nao_localizado"
    mensagem = (
        MENSAGEM_NAO_LOCALIZADO
        if situacao == "nao_localizado"
        else (
            "Plano Diretor vigente verificado nas fontes catalogadas."
            if situacao == "vigente"
            else "Plano Diretor localizado; aguardando verificação integral de anexos/vigência."
        )
    )

    return MunicipioDetalhe(
        codigo_ibge=m.codigo_ibge,
        nome=m.nome,
        uf=m.uf,
        uf_nome=m.uf_nome,
        regiao=m.regiao,
        mesorregiao=m.mesorregiao,
        microrregiao=m.microrregiao,
        munic_possui_plano=m.munic_possui_plano,
        munic_ano_criacao=m.munic_ano_criacao,
        munic_ano_revisao=m.munic_ano_revisao,
        situacao=situacao,
        lei_principal=p.lei_principal if p else None,
        ano_lei=p.ano_lei if p else None,
        possui_cartografia=bool(p.possui_cartografia) if p else (len(m.camadas) > 0),
        fonte_oficial=p.fonte_oficial if p else None,
        confiabilidade=p.confiabilidade if p else "nao_verificada",
        nome_plano_diretor=p.nome_plano_diretor if p else f"Plano Diretor de {m.nome} (não localizado)",
        data_aprovacao=p.data_aprovacao if p else None,
        data_revisao=p.data_revisao if p else None,
        hierarquia_fonte=p.hierarquia_fonte if p else None,
        url_oficial=p.url_oficial if p else None,
        url_pdf=p.url_pdf if p else None,
        data_verificacao=p.data_verificacao if p else None,
        aviso_documental=(
            p.aviso_documental
            if p and p.aviso_documental
            else (MENSAGEM_NAO_LOCALIZADO if situacao == "nao_localizado" else None)
        ),
        mensagem_situacao=mensagem,
        documentos=[
            DocumentoSchema(
                id=d.id,
                titulo=d.titulo,
                tipo=d.tipo,
                lei_numero=d.lei_numero,
                ano=d.ano,
                url=d.url,
                formato=d.formato,
                fonte_oficial=d.fonte_oficial,
                hierarquia_fonte=d.hierarquia_fonte,
                situacao_vigencia=d.situacao_vigencia,
                data_verificacao=d.data_verificacao,
                arquivo_local=d.arquivo_local,
                observacao=d.observacao,
                confianca_extracao=d.confianca_extracao,
            )
            for d in m.documentos
        ],
        camadas_gis=[
            CamadaGISSchema(
                id=c.id,
                nome=c.nome,
                categoria=c.categoria,
                tipo_servico=c.tipo_servico,
                url=c.url,
                campo_codigo_zona=c.campo_codigo_zona,
                campo_nome_zona=c.campo_nome_zona,
                campo_grupo=c.campo_grupo,
                campo_legislacao=c.campo_legislacao,
                campo_area=c.campo_area,
                crs_origem=c.crs_origem,
                origem_geometria=c.origem_geometria,
                fonte_oficial=c.fonte_oficial,
                data_verificacao=c.data_verificacao,
                observacao=c.observacao,
            )
            for c in m.camadas
        ],
        zonas_regras=[
            ZonaRegraSchema(
                sigla=z.sigla,
                nome=z.nome,
                grupo=z.grupo,
                lei=z.lei,
                artigo=z.artigo,
                finalidade=z.finalidade,
                usos_permitidos=z.usos_permitidos,
                usos_condicionados=z.usos_condicionados,
                usos_proibidos=z.usos_proibidos,
                parametros=z.parametros or {},
                aviso_parametros=z.aviso_parametros,
            )
            for z in m.zonas
        ],
        historico_versoes=[
            HistoricoVersaoSchema(
                lei=h.lei,
                ano=h.ano,
                situacao=h.situacao,
                observacao=h.observacao,
            )
            for h in m.historico
        ],
    )
