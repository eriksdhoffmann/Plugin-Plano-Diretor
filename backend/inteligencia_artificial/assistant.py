# -*- coding: utf-8 -*-
"""
Assistente de Inteligência Artificial Fundamentado (Modos Didático, Técnico e Prefeitura).

Regras rígidas de integridade:
1. Consulta primeiro o catálogo e documentos do município selecionado (RAG).
2. Quando não há documentos localizados ou parâmetros suficientes, declara explicitamente
   que não foi possível determinar — nunca inventa artigos, links ou índices urbanísticos.
3. Estrutura obrigatória em 7 blocos:
   o_que_e, por_que_existe, o_que_pode, o_que_depende_de_condicoes, o_que_nao_pode,
   fundamentacao, fonte.
4. Separa claramente texto literal, síntese do sistema, explicação gerada pela IA e origem
   da geometria (oficial vs derivada_pdf vs não verificada).
5. Distingue APP, Zona de Preservação Municipal, Unidade de Conservação, Área Verde,
   Restrição Urbanística e Área de Risco, exibindo aviso legal explícito.
"""

from __future__ import annotations

import json
import os
from typing import Any

import httpx
from sqlalchemy.orm import Session

from ..catalogo.service import MENSAGEM_NAO_LOCALIZADO, obter_municipio_detalhe
from ..utils import normalizar_texto
from .rag_engine import recuperar_contexto_bm25

AVISO_LEGAL = (
    "Esta resposta tem caráter exclusivamente informativo e de apoio técnico/didático, "
    "baseado nos registros catalogados até a data de verificação. Não constitui parecer jurídico, "
    "licença ambiental, consulta de viabilidade oficial nem autorização para construir — "
    "atos que competem exclusivamente ao órgão municipal competente e órgãos ambientais."
)


def _detectar_tema_ambiental_ou_construcao(texto: str, sigla: str | None = None, nome: str | None = None) -> dict[str, bool]:
    blob = normalizar_texto(" ".join(filter(None, [texto, sigla, nome])))
    eh_app = any(k in blob for k in ["app", "preservacao permanente", "codigo florestal", "nascente", "curso dagua", "rio", "mangue", "encosta", "12651"])
    eh_ambiental = eh_app or any(
        k in blob
        for k in [
            "ambiental", "preservacao", "conservacao", "apa", "parque", "aupa",
            "unidade de conservacao", "area verde", "risco", "cota 40", "inundacao",
        ]
    )
    eh_construcao = any(
        k in blob
        for k in [
            "construir", "edificar", "residencial", "comercial", "industrial",
            "imovel", "terreno", "lote", "parametro", "coeficiente", "taxa", "gabarito", "viabilidade",
        ]
    )
    return {
        "eh_app": eh_app,
        "eh_ambiental": eh_ambiental,
        "eh_construcao": eh_construcao,
    }


def _gerar_llm_opcional(prompt_sistema: str, prompt_usuario: str) -> str | None:
    """
    Conector opcional para Gemini / OpenAI / Ollama quando o usuário configurar variável de ambiente.
    Se ausente ou indisponível, o sistema opera 100% com o motor determinístico auditável.
    """
    gemini_key = os.getenv("GEMINI_API_KEY", "").strip()
    if gemini_key:
        try:
            url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={gemini_key}"
            payload = {
                "contents": [{"parts": [{"text": f"{prompt_sistema}\n\n{prompt_usuario}"}]}],
                "generationConfig": {"temperature": 0.1},
            }
            with httpx.Client(timeout=20.0) as client:
                r = client.post(url, json=payload)
                if r.status_code == 200:
                    data = r.json()
                    return data["candidates"][0]["content"]["parts"][0]["text"]
        except Exception:
            pass

    openai_key = os.getenv("OPENAI_API_KEY", "").strip()
    if openai_key:
        try:
            with httpx.Client(timeout=20.0) as client:
                r = client.post(
                    "https://api.openai.com/v1/chat/completions",
                    headers={"Authorization": f"Bearer {openai_key}"},
                    json={
                        "model": os.getenv("OPENAI_MODEL", "gpt-4o-mini"),
                        "temperature": 0.1,
                        "messages": [
                            {"role": "system", "content": prompt_sistema},
                            {"role": "user", "content": prompt_usuario},
                        ],
                    },
                )
                if r.status_code == 200:
                    return r.json()["choices"][0]["message"]["content"]
        except Exception:
            pass

    return None


def consultar_assistente(
    db: Session,
    *,
    codigo_ibge: str,
    pergunta: str,
    modo: str = "didatico",
    zona_sigla: str | None = None,
    zona_nome: str | None = None,
    atributos_feicao: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Gera resposta fundamentada, rastreável e estruturada em 7 blocos nos modos didático, técnico ou prefeitura."""
    detalhe = obter_municipio_detalhe(db, codigo_ibge)
    if detalhe is None:
        raise LookupError(f"Município com código IBGE {codigo_ibge} não encontrado na base oficial.")

    flags = _detectar_tema_ambiental_ou_construcao(pergunta, zona_sigla, zona_nome)
    incluir_federal = flags["eh_ambiental"] or flags["eh_construcao"]

    rag = recuperar_contexto_bm25(
        db,
        codigo_ibge=codigo_ibge,
        pergunta=pergunta,
        zona_sigla=zona_sigla,
        zona_nome=zona_nome,
        incluir_federal=incluir_federal,
        top_k=5,
    )
    chunks: list[dict[str, Any]] = rag["chunks"]
    zona_regra = rag["zona_regra"]
    federal_data = rag["federal"]

    chunks_municipais = [c for c in chunks if c["escopo"] == "municipal"]
    chunks_federais = [c for c in chunks if c["escopo"] == "federal"]

    origem_geom = (
        (atributos_feicao or {}).get("_pd_origem_geometria")
        or (detalhe.camadas_gis[0].origem_geometria if detalhe.camadas_gis else "nao_disponivel")
    )

    # Caso 1: Município sem Plano Diretor localizado nas fontes consultadas
    if detalhe.situacao == "nao_localizado" and not chunks_municipais:
        sem_dados_msg = (
            f"{MENSAGEM_NAO_LOCALIZADO} Não existem documentos municipais verificados para "
            f"{detalhe.nome}/{detalhe.uf} (IBGE {detalhe.codigo_ibge}) nesta base até o momento, "
            "portanto não é possível determinar o zoneamento nem regras urbanísticas locais."
        )
        distincao = federal_data.get("distincao_conceitual") if flags["eh_ambiental"] else None
        return {
            "codigo_ibge": detalhe.codigo_ibge,
            "municipio": detalhe.nome,
            "uf": detalhe.uf,
            "modo": modo,
            "situacao_documental": detalhe.situacao,
            "aviso_documental": MENSAGEM_NAO_LOCALIZADO,
            "sete_blocos": {
                "o_que_e": sem_dados_msg,
                "por_que_existe": "Não foi possível determinar a finalidade local porque a legislação municipal ainda não foi localizada nas fontes consultadas.",
                "o_que_pode": "Não foi possível determinar sem o texto vigente do Plano Diretor e da Lei de Uso e Ocupação do Solo do município.",
                "o_que_depende_de_condicoes": (
                    "Caso haja cursos d'água, nascentes, encostas > 45° ou áreas protegidas no terreno, "
                    "aplicam-se as restrições federais do Código Florestal (Lei nº 12.651/2012) e demais normas estaduais/federais."
                ),
                "o_que_nao_pode": "Não é possível afirmar proibições locais específicas sem consultar o documento oficial junto à Prefeitura ou Câmara Municipal.",
                "fundamentacao": (
                    "Código Florestal Federal (Lei nº 12.651/2012, Arts. 3º II, 4º, 7º e 8º) para critérios gerais de APP, "
                    "quando aplicável. Legislação municipal: não localizada."
                ),
                "fonte": "Catálogo Nacional (sem fonte municipal validada até esta data). Consulte a Prefeitura ou Câmara Municipal.",
            },
            "proveniencia": {
                "texto_literal": [
                    {
                        "lei": c["lei"],
                        "artigo": c["artigo"],
                        "trecho": c["texto_literal"],
                        "url": c["url"],
                    }
                    for c in chunks_federais
                ],
                "sintese_sistema": sem_dados_msg,
                "explicacao_ia": "Não aplicável além dos critérios federais gerais, pois não há texto municipal catalogado.",
                "geometria_origem": "nao_disponivel",
                "status_verificacao": "nao_localizado",
            },
            "distincao_ambiental": distincao,
            "checklist_analise": _montar_checklist_instrumentos(detalhe, zona_regra, flags),
            "aviso_legal": AVISO_LEGAL,
        }

    # Caso 2: Município com documentos/regras localizados (ex.: Curitiba, Joinville, Araquari ou PDF importado)
    alvo_zona = zona_sigla or zona_nome or (zona_regra.sigla if zona_regra else None)

    if zona_regra is not None:
        titulo_zona = f"{zona_regra.nome} ({zona_regra.sigla})"
        o_que_e_base = f"Em {detalhe.nome}/{detalhe.uf}, {titulo_zona} corresponde a uma classificação territorial prevista em {zona_regra.lei}."
        por_que_base = zona_regra.finalidade or "Finalidade detalhada não especificada no extrato catalogado."
        pode_base = zona_regra.usos_permitidos or "Não foi possível determinar integralmente sem o quadro de usos completo da lei municipal."
        cond_base = zona_regra.usos_condicionados or "Sujeito à análise e condições previstas na legislação urbanística e ambiental vigente."
        nao_pode_base = zona_regra.usos_proibidos or "Conferir lista completa de usos vedados nos anexos da legislação municipal."
        if zona_regra.aviso_parametros:
            cond_base += f" Observação técnica: {zona_regra.aviso_parametros}"
    elif flags["eh_app"]:
        app_info = (federal_data.get("distincao_conceitual") or {}).get("app", {})
        o_que_e_base = app_info.get(
            "definicao",
            "Área de Preservação Permanente (APP) é área protegida pela Lei Federal nº 12.651/2012 (Código Florestal).",
        )
        por_que_base = "Preservar recursos hídricos, estabilidade geológica, biodiversidade, fluxo gênico, solo e bem-estar humano (Art. 3º, II da Lei nº 12.651/2012)."
        pode_base = "Manutenção da vegetação nativa e usos sustentáveis não supressivos compatíveis com a legislação federal e municipal."
        cond_base = app_info.get("excecoes_hipoteses", "Intervenção apenas em hipóteses legais excepcionais (utilidade pública, interesse social ou baixo impacto) com autorização ambiental.")
        nao_pode_base = "Supressão de vegetação nativa ou ocupação irregular fora das hipóteses legais do Art. 8º da Lei nº 12.651/2012. A identificação definitiva de APP exige verificação hidrográfica/topográfica técnica — nunca apenas pela cor de um mapa."
    else:
        resumo_chunks = " ".join(c["texto_literal"] for c in chunks_municipais[:2])
        o_que_e_base = (
            f"Consulta sobre {detalhe.nome}/{detalhe.uf} ({detalhe.lei_principal or 'Plano Diretor em verificação'}). "
            + (resumo_chunks[:500] if resumo_chunks else "Não há extrato textual detalhado para esta pergunta específica.")
        )
        por_que_base = (
            chunks_municipais[0]["texto_literal"][:400]
            if chunks_municipais
            else "Não foi possível determinar a finalidade específica a partir dos registros atuais."
        )
        pode_base = "Não foi possível determinar permissões pontuais sem o quadro específico de parâmetros da zona/imóvel."
        cond_base = "Toda intervenção edilícia ou parcelamento depende do Plano Diretor, da Lei de Uso e Ocupação do Solo e da verificação ambiental do lote."
        nao_pode_base = "Atividades desconformes com o zoneamento vigente ou incidentes sobre restrições ambientais não autorizadas."

    # Ajuste de linguagem por modo (Didático vs Técnico vs Prefeitura)
    if modo == "didatico":
        o_que_e = (
            f"[Modo Didático] {o_que_e_base} "
            "Em termos simples, isso funciona como uma 'regra de vizinhança e proteção' da cidade para organizar onde morar, trabalhar e proteger a natureza."
        )
    elif modo == "prefeitura":
        faltantes = [item["instrumento"] for item in _montar_checklist_instrumentos(detalhe, zona_regra, flags) if item["status"] != "disponivel"]
        o_que_e = (
            f"[Apoio Técnico Municipal — IBGE {detalhe.codigo_ibge}] {o_que_e_base} "
            f"Instrumentos pendentes de conferência antes de decisão técnica: {', '.join(faltantes) or 'conferência integral em planta cadastral/lote'}."
        )
    else:
        o_que_e = f"[Modo Técnico] {o_que_e_base}"

    refs = []
    for c in chunks:
        ref_str = f"{c['lei']}"
        if c.get("artigo"):
            ref_str += f" — {c['artigo']}"
        if c.get("anexo"):
            ref_str += f" ({c['anexo']})"
        if c.get("pagina"):
            ref_str += f", p. {c['pagina']}"
        refs.append(ref_str)

    if zona_regra and zona_regra.lei:
        refs.insert(0, f"{zona_regra.lei} — {zona_regra.artigo or zona_regra.sigla}")

    fundamentacao = "; ".join(dict.fromkeys(refs)) if refs else (detalhe.lei_principal or "Não identificada.")
    fontes = [u for u in dict.fromkeys([detalhe.url_oficial] + [c.get("url") for c in chunks]) if u]

    # Opcionalmente refina apenas a redação explicativa se chave LLM existir no ambiente
    llm_nota = None
    if os.getenv("GEMINI_API_KEY") or os.getenv("OPENAI_API_KEY"):
        prompt_sys = (
            "Você é um assistente urbanístico brasileiro. Responda EXCLUSIVAMENTE com base no contexto JSON abaixo. "
            "NUNCA invente artigos, números de leis ou parâmetros. Se faltar dado, diga explicitamente."
        )
        prompt_usr = json.dumps(
            {
                "municipio": detalhe.nome,
                "uf": detalhe.uf,
                "modo": modo,
                "pergunta": pergunta,
                "zona": alvo_zona,
                "trechos_recuperados": [c["texto_literal"] for c in chunks],
            },
            ensure_ascii=False,
        )
        llm_nota = _gerar_llm_opcional(prompt_sys, prompt_usr)

    checklist = _montar_checklist_instrumentos(detalhe, zona_regra, flags)
    distincao = federal_data.get("distincao_conceitual") if (flags["eh_ambiental"] or flags["eh_construcao"]) else None

    return {
        "codigo_ibge": detalhe.codigo_ibge,
        "municipio": detalhe.nome,
        "uf": detalhe.uf,
        "modo": modo,
        "zona_consultada": alvo_zona,
        "situacao_documental": detalhe.situacao,
        "aviso_documental": detalhe.aviso_documental,
        "sete_blocos": {
            "o_que_e": o_que_e,
            "por_que_existe": por_que_base,
            "o_que_pode": pode_base,
            "o_que_depende_de_condicoes": cond_base,
            "o_que_nao_pode": nao_pode_base,
            "fundamentacao": fundamentacao,
            "fonte": " | ".join(fontes) if fontes else (detalhe.fonte_oficial or "Fonte oficial não catalogada"),
        },
        "proveniencia": {
            "texto_literal": [
                {
                    "escopo": c["escopo"],
                    "lei": c["lei"],
                    "artigo": c.get("artigo"),
                    "anexo": c.get("anexo"),
                    "pagina": c.get("pagina"),
                    "trecho": c["texto_literal"],
                    "confianca": c.get("confianca"),
                    "data_verificacao": c.get("data_verificacao"),
                    "url": c.get("url"),
                }
                for c in chunks
            ],
            "sintese_sistema": f"Síntese estruturada a partir de {len(chunks_municipais)} trecho(s) municipal(is) e {len(chunks_federais)} referência(s) federal(is).",
            "explicacao_ia": llm_nota or "Explicação gerada pelo motor determinístico auditável sobre os documentos recuperados (sem uso de texto especulativo).",
            "geometria_origem": origem_geom,
            "status_verificacao": detalhe.situacao,
        },
        "distincao_ambiental": distincao,
        "checklist_analise": checklist,
        "aviso_legal": AVISO_LEGAL,
    }


def _montar_checklist_instrumentos(detalhe: Any, zona_regra: Any, flags: dict[str, bool]) -> list[dict[str, str]]:
    """Lista os instrumentos necessários para análise construtiva/ambiental e o que está disponível vs ausente."""
    tem_pd = detalhe.situacao in {"vigente", "localizado_em_verificacao"}
    tem_camada_urb = any(c.categoria == "urbanistica" for c in detalhe.camadas_gis)
    tem_camada_amb = any(c.categoria == "ambiental" for c in detalhe.camadas_gis)
    tem_param_zona = bool(zona_regra and zona_regra.parametros)

    return [
        {
            "instrumento": "Plano Diretor Municipal",
            "status": "disponivel" if tem_pd else "nao_localizado",
            "detalhe": detalhe.lei_principal or MENSAGEM_NAO_LOCALIZADO,
        },
        {
            "instrumento": "Zoneamento / Uso e Ocupação do Solo",
            "status": "disponivel" if (tem_camada_urb or zona_regra) else "requer_verificacao",
            "detalhe": "Camada oficial e referências disponíveis; índices por lote devem ser confirmados na tabela integral da lei." if tem_camada_urb else "Camada ou tabela de usos não localizada no catálogo.",
        },
        {
            "instrumento": "Parâmetros construtivos do lote (CA, TO, Recuos, Gabarito)",
            "status": "disponivel" if tem_param_zona else "requer_verificacao",
            "detalhe": "Presentes na ficha da zona." if tem_param_zona else "Consultar tabela anexa oficial / Guia Amarela ou Viabilidade municipal.",
        },
        {
            "instrumento": "Parcelamento do Solo",
            "status": "requer_verificacao",
            "detalhe": "Verificar matrícula do imóvel, testada mínima e restrições da Lei Federal nº 6.766/1979 e lei municipal.",
        },
        {
            "instrumento": "APP (Código Florestal — Lei nº 12.651/2012)",
            "status": "requer_verificacao",
            "detalhe": "Exige levantamento topográfico/hidrográfico em campo; nunca inferir apenas pela cor do zoneamento.",
        },
        {
            "instrumento": "Unidades de Conservação e Restrições Ambientais",
            "status": "disponivel" if tem_camada_amb else "requer_verificacao",
            "detalhe": "Camadas ambientais oficiais disponíveis para sobreposição." if tem_camada_amb else "Camada específica de UC/restrição ambiental ainda não carregada para este município.",
        },
        {
            "instrumento": "Patrimônio Protegido e Áreas de Risco",
            "status": "requer_verificacao",
            "detalhe": "Conferir tombamentos (IPHAN/Estadual/Municipal) e cartas geotécnicas/Defesa Civil antes de aprovar projetos.",
        },
    ]
