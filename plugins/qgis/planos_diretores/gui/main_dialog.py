# -*- coding: utf-8 -*-
"""
Interface gráfica principal do plugin Planos Diretores do Brasil — QGIS.
Compatível com QGIS 3 (PyQt5) e QGIS 4 (PyQt6).
"""

from __future__ import annotations

import json
import os
import webbrowser
from typing import Any

from qgis.PyQt.QtCore import QSettings, QUrl
from qgis.PyQt.QtGui import QDesktopServices
from qgis.PyQt.QtWidgets import (
    QComboBox,
    QDialog,
    QFileDialog,
    QFormLayout,
    QGroupBox,
    QHBoxLayout,
    QLabel,
    QLineEdit,
    QListWidget,
    QListWidgetItem,
    QMessageBox,
    QProgressBar,
    QPushButton,
    QTabWidget,
    QTextEdit,
    QVBoxLayout,
    QWidget,
)

from ..core.api_client import BRAZIL_UFS, DEFAULT_API_URL, MENSAGEM_NAO_LOCALIZADO, PlanosDiretoresApiClient
from ..core.background_job import BackgroundJob
from ..core.ibge_malhas import get_cache_root, obter_limite_municipal_geojson
from ..core.layer_loader import (
    carregar_camada_no_qgis,
    carregar_limite_municipal_no_qgis,
    consultar_zoneamento_selecionado,
)
from ..core.qt_compat import USER_ROLE

SITUACAO_LABELS = {
    "vigente": "Plano Diretor Vigente Verificado",
    "localizado_em_verificacao": "Localizado — Aguardando Verificação Integral",
    "desatualizado_ou_substituido": "Histórico / Em Revisão",
    "nao_localizado": MENSAGEM_NAO_LOCALIZADO,
}


class PlanosDiretoresDialog(QDialog):
    """Diálogo principal do plugin Planos Diretores do Brasil — QGIS."""

    def __init__(self, iface: Any, parent: QWidget | None = None):
        super().__init__(parent or (iface.mainWindow() if iface else None))
        self.iface = iface
        self.settings = QSettings("PlanosDiretoresBrasil", "QGISPlugin")
        api_url = self.settings.value("api_url", DEFAULT_API_URL)
        self.api = PlanosDiretoresApiClient(base_url=str(api_url))

        self.municipio_atual: dict[str, Any] | None = None
        self.origem_consulta: str = ""
        self._active_job: BackgroundJob | None = None

        self.setWindowTitle("Planos Diretores do Brasil — QGIS")
        self.resize(840, 680)
        self._build_ui()
        self._carregar_municipios_uf()

    def _build_ui(self) -> None:
        root = QVBoxLayout(self)

        # Cabeçalho
        header = QLabel("PLANOS DIRETORES DO BRASIL")
        header.setStyleSheet("font-size: 16px; font-weight: bold; color: #0f3d5e; padding: 4px 0;")
        sub = QLabel("Infraestrutura nacional unificada • Identificação oficial por código IBGE de 7 dígitos")
        sub.setStyleSheet("color: #475569; margin-bottom: 6px;")
        root.addWidget(header)
        root.addWidget(sub)

        # Seletor Estado + Busca + Município
        sel_group = QGroupBox("Seleção Territorial (IBGE)")
        sel_layout = QFormLayout(sel_group)

        row_uf = QHBoxLayout()
        self.combo_uf = QComboBox()
        for uf in BRAZIL_UFS:
            self.combo_uf.addItem(uf, uf)
        idx_sc = self.combo_uf.findData("SC")
        if idx_sc >= 0:
            self.combo_uf.setCurrentIndex(idx_sc)
        self.combo_uf.currentIndexChanged.connect(self._carregar_municipios_uf)

        self.input_filtro = QLineEdit()
        self.input_filtro.setPlaceholderText("Filtrar município por nome ou código IBGE...")
        self.input_filtro.textChanged.connect(self._filtrar_municipios)

        row_uf.addWidget(self.combo_uf, 1)
        row_uf.addWidget(self.input_filtro, 3)
        sel_layout.addRow("Estado (UF):", row_uf)

        row_mun = QHBoxLayout()
        self.combo_municipio = QComboBox()
        self.combo_municipio.currentIndexChanged.connect(self._on_municipio_changed)
        self.btn_consultar = QPushButton("Atualizar Ficha")
        self.btn_consultar.clicked.connect(self._on_municipio_changed)
        row_mun.addWidget(self.combo_municipio, 4)
        row_mun.addWidget(self.btn_consultar, 1)
        sel_layout.addRow("Município:", row_mun)
        root.addWidget(sel_group)

        # Abas principais
        self.tabs = QTabWidget()
        root.addWidget(self.tabs, 1)

        # Aba 1: Dados, Ações e Camadas
        tab_principal = QWidget()
        tab_l = QVBoxLayout(tab_principal)

        info_group = QGroupBox("Dados do Município e Situação Documental")
        info_form = QFormLayout(info_group)
        self.lbl_nome = QLabel("-")
        self.lbl_uf = QLabel("-")
        self.lbl_ibge = QLabel("-")
        self.lbl_plano = QLabel("-")
        self.lbl_lei = QLabel("-")
        self.lbl_ano = QLabel("-")
        self.lbl_situacao = QLabel("-")
        self.lbl_situacao.setWordWrap(True)
        self.lbl_fonte = QLabel("-")
        self.lbl_fonte.setWordWrap(True)
        self.lbl_aviso = QLabel("-")
        self.lbl_aviso.setWordWrap(True)
        self.lbl_aviso.setStyleSheet("color: #92400e;")

        info_form.addRow("Município:", self.lbl_nome)
        info_form.addRow("UF:", self.lbl_uf)
        info_form.addRow("Código IBGE:", self.lbl_ibge)
        info_form.addRow("Plano Diretor:", self.lbl_plano)
        info_form.addRow("Número da Lei:", self.lbl_lei)
        info_form.addRow("Ano:", self.lbl_ano)
        info_form.addRow("Situação documental:", self.lbl_situacao)
        info_form.addRow("Fonte oficial:", self.lbl_fonte)
        info_form.addRow("Observação / Origem:", self.lbl_aviso)
        tab_l.addWidget(info_group)

        # Botões oficiais solicitados
        btns_group = QGroupBox("Ações Documentais e Cartográficas")
        btns_v = QVBoxLayout(btns_group)
        row_b1 = QHBoxLayout()
        row_b2 = QHBoxLayout()

        self.btn_abrir_pd = QPushButton("ABRIR PLANO DIRETOR")
        self.btn_abrir_leg = QPushButton("ABRIR LEGISLAÇÃO")
        self.btn_ver_mapas = QPushButton("VER MAPAS")
        self.btn_ver_anexos = QPushButton("VER ANEXOS")
        self.btn_baixar_docs = QPushButton("BAIXAR DOCUMENTOS")
        self.btn_carregar_camadas = QPushButton("CARREGAR CAMADAS NO QGIS")
        self.btn_carregar_camadas.setStyleSheet(
            "background-color: #0f3d5e; color: white; font-weight: bold; padding: 6px;"
        )

        self.btn_abrir_pd.clicked.connect(self._acao_abrir_plano_diretor)
        self.btn_abrir_leg.clicked.connect(self._acao_abrir_legislacao)
        self.btn_ver_mapas.clicked.connect(self._acao_ver_mapas)
        self.btn_ver_anexos.clicked.connect(self._acao_ver_anexos)
        self.btn_baixar_docs.clicked.connect(self._acao_baixar_documentos)
        self.btn_carregar_camadas.clicked.connect(self._acao_carregar_camadas)

        row_b1.addWidget(self.btn_abrir_pd)
        row_b1.addWidget(self.btn_abrir_leg)
        row_b1.addWidget(self.btn_ver_mapas)
        row_b2.addWidget(self.btn_ver_anexos)
        row_b2.addWidget(self.btn_baixar_docs)
        row_b2.addWidget(self.btn_carregar_camadas)
        btns_v.addLayout(row_b1)
        btns_v.addLayout(row_b2)
        tab_l.addWidget(btns_group)

        cam_group = QGroupBox("Camadas Geoespaciais Disponíveis (marque/selecione ou carregue todas)")
        cam_l = QVBoxLayout(cam_group)
        self.list_camadas = QListWidget()
        cam_l.addWidget(self.list_camadas)
        tab_l.addWidget(cam_group, 1)

        self.tabs.addTab(tab_principal, "1. Município e Camadas")

        # Aba 2: Documentos, Anexos e Zoneamento Selecionado
        tab_docs = QWidget()
        td_l = QVBoxLayout(tab_docs)
        td_l.addWidget(QLabel("Documentos e Legislação Catalogada (duplo clique para abrir URL):"))
        self.list_docs = QListWidget()
        self.list_docs.itemDoubleClicked.connect(self._abrir_item_documento)
        td_l.addWidget(self.list_docs, 1)

        btn_inspecionar = QPushButton("Consultar Zoneamento e Atributos da Feição Selecionada no QGIS")
        btn_inspecionar.clicked.connect(self._acao_consultar_zoneamento)
        td_l.addWidget(btn_inspecionar)

        self.txt_inspecao = QTextEdit()
        self.txt_inspecao.setReadOnly(True)
        self.txt_inspecao.setPlaceholderText("Atributos de zoneamento e fonte da feição selecionada aparecerão aqui...")
        td_l.addWidget(self.txt_inspecao, 1)
        self.tabs.addTab(tab_docs, "2. Documentos e Identificação")

        # Aba 3: API Unificada e Cache Offline
        tab_cfg = QWidget()
        cfg_l = QFormLayout(tab_cfg)
        self.input_api_url = QLineEdit(self.api.base_url)
        btn_salvar_api = QPushButton("Salvar URL da API")
        btn_salvar_api.clicked.connect(self._salvar_config_api)
        cfg_l.addRow("URL da API Unificada (/api/v1):", self.input_api_url)
        cfg_l.addRow("", btn_salvar_api)
        cfg_l.addRow("Diretório de Cache Local:", QLabel(get_cache_root()))
        self.tabs.addTab(tab_cfg, "3. Conexão e Cache")

        # Barra de progresso e status
        self.progress_bar = QProgressBar()
        self.progress_bar.setRange(0, 100)
        self.progress_bar.setValue(0)
        self.lbl_status = QLabel("Pronto.")
        root.addWidget(self.progress_bar)
        root.addWidget(self.lbl_status)

    def _set_status(self, msg: str, pct: int | None = None) -> None:
        self.lbl_status.setText(msg)
        if pct is not None:
            self.progress_bar.setValue(pct)

    def _abrir_url(self, url: str) -> None:
        if not QDesktopServices.openUrl(QUrl(url)):
            webbrowser.open(url)

    def _carregar_municipios_uf(self) -> None:
        self._filtrar_municipios()

    def _filtrar_municipios(self) -> None:
        uf = self.combo_uf.currentData()
        filtro = self.input_filtro.text().strip()
        municipios = self.api.listar_municipios_por_uf(uf, filtro=filtro)
        self.combo_municipio.blockSignals(True)
        self.combo_municipio.clear()
        for m in municipios:
            tag = ""
            if m.get("possui_cartografia"):
                tag = " [GIS]"
            elif m.get("situacao") in {"vigente", "localizado_em_verificacao"}:
                tag = " [PD]"
            self.combo_municipio.addItem(f"{m['nome']} ({m['codigo_ibge']}){tag}", m["codigo_ibge"])
        self.combo_municipio.blockSignals(False)
        if self.combo_municipio.count() > 0:
            self._on_municipio_changed()

    def _on_municipio_changed(self) -> None:
        cod = self.combo_municipio.currentData()
        if not cod:
            return
        self._set_status(f"Consultando município IBGE {cod}...", 20)

        def _task(report):
            report(40, f"Carregando catálogo para IBGE {cod}...")
            return self.api.obter_detalhe_municipio(cod)

        self._run_job(_task, self._on_municipio_loaded)

    def _on_municipio_loaded(self, payload: tuple[dict[str, Any], str]) -> None:
        det, origem = payload
        self.municipio_atual = det
        self.origem_consulta = origem

        sit = det.get("situacao", "nao_localizado")
        self.lbl_nome.setText(det.get("nome") or "-")
        self.lbl_uf.setText(f"{det.get('uf')} — {det.get('uf_nome', '')}")
        self.lbl_ibge.setText(det.get("codigo_ibge") or "-")
        self.lbl_plano.setText(det.get("nome_plano_diretor") or MENSAGEM_NAO_LOCALIZADO)
        self.lbl_lei.setText(det.get("lei_principal") or "Não localizada nas fontes consultadas")
        self.lbl_ano.setText(str(det.get("ano_lei") or "-"))
        self.lbl_situacao.setText(SITUACAO_LABELS.get(sit, sit))
        self.lbl_fonte.setText(det.get("fonte_oficial") or "Não localizada")
        aviso = det.get("aviso_documental") or ""
        self.lbl_aviso.setText(f"[{origem}] {aviso}" if aviso else f"Origem dos dados: {origem}")

        self.list_camadas.clear()
        for cam in det.get("camadas_gis", []):
            txt = f"[{cam.get('categoria', '').upper()} | {cam.get('tipo_servico', '').upper()} | {cam.get('origem_geometria', 'oficial')}] {cam.get('nome')}"
            item = QListWidgetItem(txt)
            item.setData(USER_ROLE, cam)
            self.list_camadas.addItem(item)

        self.list_docs.clear()
        for doc in det.get("documentos", []):
            txt = f"[{doc.get('tipo', '')}] {doc.get('titulo')} — {doc.get('url') or 'sem URL'}"
            item = QListWidgetItem(txt)
            item.setData(USER_ROLE, doc)
            self.list_docs.addItem(item)

        self._set_status(f"Município {det.get('nome')}/{det.get('uf')} carregado ({origem}).", 100)

    def _run_job(self, fn, on_success) -> None:
        job = BackgroundJob(fn)
        self._active_job = job
        job.progress.connect(lambda p, m: self._set_status(m, p))
        job.succeeded.connect(on_success)
        job.failed.connect(self._on_job_failed)
        job.start()

    def _on_job_failed(self, erro: str) -> None:
        self._set_status(f"Erro: {erro}", 0)
        QMessageBox.warning(self, "Planos Diretores do Brasil", f"Falha na operação:\n{erro}")

    def _require_municipio(self) -> dict[str, Any] | None:
        if not self.municipio_atual:
            QMessageBox.information(self, "Planos Diretores", "Selecione um município primeiro.")
            return None
        return self.municipio_atual

    def _acao_abrir_plano_diretor(self) -> None:
        det = self._require_municipio()
        if not det:
            return
        url = det.get("url_pdf") or det.get("url_oficial")
        if url:
            self._abrir_url(url)
        else:
            QMessageBox.information(self, "Plano Diretor", MENSAGEM_NAO_LOCALIZADO)

    def _acao_abrir_legislacao(self) -> None:
        det = self._require_municipio()
        if not det:
            return
        docs = [d for d in det.get("documentos", []) if d.get("url")]
        if docs:
            self._abrir_url(docs[0]["url"])
            self.tabs.setCurrentIndex(1)
        elif det.get("url_oficial"):
            self._abrir_url(det["url_oficial"])
        else:
            QMessageBox.information(self, "Legislação", MENSAGEM_NAO_LOCALIZADO)

    def _acao_ver_mapas(self) -> None:
        det = self._require_municipio()
        if not det:
            return
        camadas = det.get("camadas_gis", [])
        if camadas:
            self._acao_carregar_camadas()
        else:
            map_docs = [d for d in det.get("documentos", []) if d.get("tipo") == "anexo_cartografico" and d.get("url")]
            if map_docs:
                self._abrir_url(map_docs[0]["url"])
            else:
                QMessageBox.information(
                    self,
                    "Mapas",
                    "Nenhuma camada ou mapa oficial catalogado até o momento para este município.",
                )

    def _acao_ver_anexos(self) -> None:
        det = self._require_municipio()
        if not det:
            return
        self.tabs.setCurrentIndex(1)
        if not det.get("documentos"):
            QMessageBox.information(self, "Anexos", MENSAGEM_NAO_LOCALIZADO)

    def _acao_baixar_documentos(self) -> None:
        det = self._require_municipio()
        if not det:
            return
        pasta = QFileDialog.getExistingDirectory(self, "Escolha a pasta para salvar a ficha e metadados")
        if not pasta:
            return
        cod = det["codigo_ibge"]
        out_json = os.path.join(pasta, f"plano_diretor_{cod}_{det['uf']}.json")
        with open(out_json, "w", encoding="utf-8") as f:
            json.dump(det, f, ensure_ascii=False, indent=2)
        QMessageBox.information(
            self,
            "Documentos Exportados",
            f"Ficha completa, referências legais e URLs oficiais salvas em:\n{out_json}",
        )

    def _acao_carregar_camadas(self) -> None:
        det = self._require_municipio()
        if not det:
            return
        cod = det["codigo_ibge"]
        selecionados = [item.data(USER_ROLE) for item in self.list_camadas.selectedItems()]
        camadas = selecionados or det.get("camadas_gis", [])

        def _worker(report):
            report(15, f"Baixando limite oficial IBGE de {det['nome']}...")
            limite_path = obter_limite_municipal_geojson(cod)
            arquivos_camadas = []
            total = max(len(camadas), 1)
            for idx, cam in enumerate(camadas):
                pct = 25 + int((idx / total) * 65)
                report(pct, f"Preparando camada {cam.get('nome')}...")
                tipo = (cam.get("tipo_servico") or "").lower()
                if tipo in {"arcgis_rest", "geojson"}:
                    try:
                        local_geo = self.api.baixar_geojson_camada(cod, cam)
                        arquivos_camadas.append((cam, local_geo))
                        continue
                    except Exception:
                        pass
                arquivos_camadas.append((cam, None))
            return {"limite_path": limite_path, "camadas": arquivos_camadas}

        def _on_loaded(res: dict[str, Any]):
            carregadas = 0
            try:
                carregar_limite_municipal_no_qgis(self.iface, det, res["limite_path"])
                carregadas += 1
            except Exception as exc:
                self._set_status(f"Aviso ao carregar limite IBGE: {exc}", 80)

            for cam, local_geo in res["camadas"]:
                try:
                    carregar_camada_no_qgis(self.iface, det, cam, geojson_local_path=local_geo)
                    carregadas += 1
                except Exception as exc:
                    QMessageBox.warning(
                        self,
                        "Camada GIS",
                        f"Não foi possível carregar '{cam.get('nome')}':\n{exc}",
                    )

            self._set_status(f"{carregadas} camada(s) adicionada(s) ao projeto QGIS.", 100)

        self._run_job(_worker, _on_loaded)

    def _abrir_item_documento(self, item: QListWidgetItem) -> None:
        doc = item.data(USER_ROLE)
        if isinstance(doc, dict) and doc.get("url"):
            self._abrir_url(doc["url"])

    def _acao_consultar_zoneamento(self) -> None:
        self.txt_inspecao.setPlainText(consultar_zoneamento_selecionado(self.iface))

    def _salvar_config_api(self) -> None:
        url = self.input_api_url.text().strip() or DEFAULT_API_URL
        self.settings.setValue("api_url", url)
        self.api.set_base_url(url)
        self._set_status(f"URL da API atualizada para {url}", 100)
        self._carregar_municipios_uf()
