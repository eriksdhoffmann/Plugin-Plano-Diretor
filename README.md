# Planos Diretores do Brasil — Plugin QGIS

Complemento oficial para **QGIS 3.28+ (PyQt5)** e **QGIS 4.x (PyQt6)** do Projeto Nacional **Planos Diretores do Brasil**.

Permite ao profissional selecionar qualquer Estado e Município brasileiro (5.571 municípios IBGE identificados por código de 7 dígitos), consultar a situação documental do Plano Diretor, abrir legislações oficiais, exportar fichas/anexos e carregar diretamente no QGIS os mapas e camadas geoespaciais disponíveis (GeoPackage, Shapefile, GeoJSON, WMS, WFS, WMTS e ArcGIS REST) com zoom automático, simbologia categorizada por zonas locais e cache persistente offline.

- **Repositório irmão (WebGIS Nacional + Backend + IA):** https://github.com/eriksdhoffmann/Plano-Diretor-WebGis

## Estrutura do Repositório (Plugin QGIS)

```text
Plugin-Plano-Diretor/
├── plugins/qgis/planos_diretores/   # Código do complemento QGIS 3 / QGIS 4
│   ├── __init__.py                  # classFactory(iface)
│   ├── plugin.py                    # Ciclo de vida initGui / unload / run
│   ├── metadata.txt                 # Metadados oficiais QGIS Plugin Repository
│   ├── core/                        # API client, cache offline, IBGE malhas, BackgroundJob, layer_loader, qt_compat
│   ├── gui/                         # Interface PyQt5/PyQt6 (main_dialog.py)
│   └── data/                        # Catálogo offline embarcado + base IBGE compacta
├── data/                            # Catálogo nacional, municípios IBGE, MUNIC 2021 e legislações
├── scripts/
│   ├── coleta/                      # Coleta IBGE Localidades e MUNIC 2021
│   ├── validacao/                   # Validação de integridade do catálogo
│   ├── atualizacao/                 # Auditoria HTTP das fontes oficiais
│   ├── empacotar_qgis.py            # Gera e valida dist/planos_diretores_qgis.zip
│   └── publicar_qgis_hub.py         # Checklist completo para publicação em plugins.qgis.org
├── docs/                            # Estudo da referência geotrabalho-qgis, arquitetura e rastreabilidade
└── tests/qgis/                      # Suíte de testes do plugin e empacotamento
```

## Como Testar e Instalar no QGIS

1. **Empacotar e sincronizar diretamente no perfil local do QGIS (Windows):**
   ```powershell
   .\.venv\Scripts\python scripts/empacotar_qgis.py --sync-local
   ```
   Ou instalar via ZIP gerado em `dist/planos_diretores_qgis.zip` dentro do QGIS em:
   **Complementos → Gerenciar e Instalar Complementos → Instalar a partir do ZIP**.
2. **Validar pacote para publicação no QGIS Plugin Repository (`plugins.qgis.org`):**
   ```powershell
   .\.venv\Scripts\python scripts/publicar_qgis_hub.py
   ```
3. **Rodar testes automatizados do plugin:**
   ```powershell
   $env:PYTHONPATH = "."
   .\.venv\Scripts\pytest tests/qgis/ -v
   ```

## Créditos e Referência Técnica

A arquitetura de empacotamento, compatibilidade dupla QGIS 3/4, execução em `QThread` (`BackgroundJob`) e consumo com cache da API de Malhas v3 do IBGE foi inspirada tecnicamente pelo estudo do projeto aberto [`duduluiss/geotrabalho-qgis`](https://github.com/duduluiss/geotrabalho-qgis) (GPLv3), sem dependência direta ou reutilização não autorizada de código de domínio.
