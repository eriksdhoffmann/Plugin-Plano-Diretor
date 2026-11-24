# Projeto Nacional — Planos Diretores do Brasil

Plataforma tecnológica nacional integrada para consulta, espacialização e interpretação didática e técnica dos **Planos Diretores Municipais** do Brasil, reunindo **duas interfaces sobre uma única infraestrutura de dados**:

1. **Plugin QGIS (`Planos Diretores do Brasil — QGIS`)**: interface técnica e operacional para QGIS 3.28+ (PyQt5) e QGIS 4.x (PyQt6), com seleção por UF/município, consulta documental, abertura/download de atos e carregamento direto de camadas geoespaciais (GeoPackage, Shapefile, GeoJSON, WMS, WFS, WMTS e ArcGIS REST) com cache local.
2. **WebGIS Nacional (`WebGIS — Planos Diretores do Brasil`)**: aplicação web cartográfica interativa (React + TypeScript + MapLibre GL JS) com cobertura nacional dos 5.571 municípios do IBGE, visualização de zoneamento e camadas ambientais, leitor documental e assistente de IA com RAG fundamentado na legislação municipal e no Código Florestal (Lei Federal nº 12.651/2012).

## Princípios Fundamentais

- **Fonte única de verdade**: plugin QGIS e WebGIS consomem o mesmo catálogo nacional, metadados, documentos, camadas GIS e motor de API (`backend/`).
- **Chave única IBGE de 7 dígitos**: todos os 5.571 municípios oficiais do Brasil constam na base, distinguindo explicitamente município cadastrado, localizado em verificação, vigente e não localizado (`"Plano Diretor não localizado nas fontes consultadas."`).
- **Rigor documental e zero invenção**: nenhuma lei, link, artigo ou parâmetro é inventado. Separação explícita entre texto literal, síntese do sistema, explicação da IA, geometria oficial, geometria derivada de PDF e dado ainda não verificado.
- **Rigor ambiental**: distinção legal explícita entre **APP**, **Zona de Preservação Municipal**, **Unidade de Conservação**, **Área Verde**, **Zona de Restrição Urbanística** e **Área de Risco**.

## Estrutura do Monorepositório

```text
Plugin-Plano-Diretor/
├── apps/webgis/                  # Frontend React + TypeScript + Vite + MapLibre GL JS
├── backend/                      # API unificada FastAPI + SQLAlchemy/PostGIS + RAG + PDF
│   ├── api/                      # Endpoints REST (/api/v1)
│   ├── catalogo/                 # Serviço e schemas do catálogo nacional
│   ├── db/                       # Modelos SQLAlchemy (SQLite zero-config ou PostgreSQL/PostGIS)
│   ├── documentos/               # Extrator de PDFs, artigos, tabelas, zonas e OCR opcional
│   ├── geoprocessamento/         # Proxy/cache IBGE v3 + conectores ArcGIS REST / OGC / Vetores
│   └── inteligencia_artificial/  # RAG fundamentado (Modos Didático, Técnico e Prefeitura)
├── data/
│   ├── municipios/               # Divisão territorial oficial IBGE (5.571 municípios)
│   ├── catalogo/                 # Registros verificados e banco SQLite local
│   ├── legislacao/               # Bases estruturadas e rastreáveis por código IBGE e federal
│   ├── mapas/                    # Cache cartográfico (gerado em execução)
│   └── planos_diretores/         # PDFs processados e metadados locais
├── plugins/qgis/planos_diretores/# Complemento QGIS 3 / QGIS 4 independente e instalável
├── scripts/
│   ├── coleta/                   # Atualização da base oficial do IBGE
│   ├── validacao/                # Validação de integridade do catálogo
│   ├── atualizacao/              # Auditoria HTTP das fontes oficiais
│   └── empacotar_qgis.py         # Gerador e validador de pacote .zip para QGIS
├── docs/                         # Documentação técnica e estudo da referência geotrabalho-qgis
└── tests/                        # Suítes de teste (backend, extração, IA e plugin QGIS)
```

## Execução Rápida (Desenvolvimento Local)

### 1. Backend Unificado (FastAPI)

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\pip install -r requirements.txt
.\.venv\Scripts\uvicorn backend.api.main:app --reload --port 8000
```
*(Execute o `uvicorn` a partir da raiz do repositório: `.\backend\.venv\Scripts\uvicorn backend.api.main:app --reload --port 8000`)*

### 2. WebGIS (React + MapLibre GL)

```powershell
cd apps/webgis
npm install
npm run dev
```

### 3. Plugin QGIS (Empacotamento e Instalação)

```powershell
.\backend\.venv\Scripts\python scripts/empacotar_qgis.py --sync-local
```

O pacote instalável é gerado em `dist/planos_diretores_qgis.zip` e pode ser instalado no QGIS via **Complementos → Gerenciar e Instalar Complementos → Instalar a partir do ZIP**.

## Documentação Técnica

- [Arquitetura Integrada e Decisões Técnicas](docs/arquitetura.md)
- [Estudo Técnico do Repositório de Referência (geotrabalho-qgis)](docs/estudo_referencia_geotrabalho.md)
- [Catálogo Nacional, Rastreabilidade e Critérios Ambientais](docs/catalogo_e_rastreabilidade.md)

## Créditos e Referência Técnica

A arquitetura de empacotamento, compatibilidade QGIS 3/4, carregamento assíncrono em `QThread` e consumo com cache da API de Malhas v3 do IBGE no plugin desktop foi inspirada tecnicamente pelo estudo do projeto aberto [`duduluiss/geotrabalho-qgis`](https://github.com/duduluiss/geotrabalho-qgis) (GPLv3), sem dependência direta ou reutilização não autorizada de código de domínio.
