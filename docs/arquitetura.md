# Arquitetura Integrada — Planos Diretores do Brasil

## 1. Princípio Arquitetural Central: Fonte Única de Verdade

O projeto foi concebido como um **monorepositório com núcleo compartilhado de dados e API**, garantindo que o **Plugin QGIS** (interface técnica/operacional) e o **WebGIS** (interface web de visualização, consulta e interpretação por IA) consultem exatamente:

- O mesmo catálogo nacional indexado pelo código IBGE de 7 dígitos (`municipios`, `planos_diretores`, `documentos`, `camadas_gis`, `historico_versoes`);
- As mesmas regras urbanísticas e referências de legislação por município;
- Os mesmos conectores geoespaciais (ArcGIS REST, WMS, WFS, WMTS, GeoJSON, GeoPackage, Shapefile, PostGIS);
- As mesmas métricas reais de cobertura documental e cartográfica (sem números fictícios).

```text
                ┌─────────────────────────────────────────────┐
                │   FONTES OFICIAIS & BASES NACIONAIS         │
                │  IBGE Localidades/Malhas v3 • Prefeituras   │
                │  Câmaras • Portais GIS (GeoCuritiba/SIMGeo) │
                └──────────────────────┬──────────────────────┘
                                       │ Coleta / Auditoria / Extração PDF
                                       ▼
                ┌─────────────────────────────────────────────┐
                │         BACKEND UNIFICADO (FastAPI)         │
                │  • Catálogo Nacional (SQLite / PostGIS)     │
                │  • Geoprocessamento & Proxy/Cache GeoJSON   │
                │  • Extrator Documental (pypdf + OCR + regex)│
                │  • Motor RAG Fundamentado (3 modos + APP)   │
                └──────────┬───────────────────────┬──────────┘
                           │ /api/v1               │ /api/v1
             ┌─────────────▼─────────┐   ┌─────────▼──────────────┐
             │  FRENTE 1: PLUGIN QGIS│   │  FRENTE 2: WEBGIS      │
             │  PyQGIS + PyQt5/6     │   │  React + TS + MapLibre │
             │  Cache local + Carreg.│   │  Leitor PDF + IA RAG   │
             └───────────────────────┘   └────────────────────────┘
```

## 2. Justificativa Técnica da Stack Escolhida

| Camada | Tecnologia Adotada | Justificativa Técnica |
|---|---|---|
| **Backend & API** | **Python 3.12 + FastAPI + Pydantic v2** | Ecossistema nativo em Python (mesma linguagem de dados do PyQGIS e dos scripts de coleta/extração), tipagem forte via Pydantic v2, geração automática de contrato OpenAPI (`/docs`), alta vazão assíncrona via ASGI/Uvicorn e streaming/upload nativo de PDFs e GeoJSON. |
| **Persistência Relacional/Espacial** | **SQLAlchemy 2 (SQLite local por padrão; PostgreSQL/PostGIS via `DATABASE_URL`)** | Permite execução imediata zero-config em desenvolvimento e testes usando SQLite (`data/catalogo/planos_diretores.db`), enquanto suporta implantação produtiva multiusuário com geometrias espaciais e índices GiST em PostgreSQL 16 + PostGIS 3.4 via `docker-compose.yml`. |
| **WebGIS Cartográfico** | **React 19 + TypeScript + Vite + MapLibre GL JS + Tailwind CSS** | MapLibre GL JS renderiza camadas vetoriais complexas (5.571 municípios, polígonos detalhados de zoneamento) via WebGL a 60 FPS sem restrições de licença proprietária, suportando interação direta com atributos de feições, estilos dinâmicos orientados a dados (`match` por sigla local preservada) e adaptação responsiva mobile. |
| **Plugin Desktop** | **PyQGIS + `qgis.PyQt` (Qt5/Qt6)** | Compatível simultaneamente com QGIS 3.28+ e QGIS 4.x sem dependências externas além da biblioteca padrão Python (`http.client`, `urllib`, `json`, `gzip`), facilitando aprovação e instalação no QGIS Official Plugin Repository. |
| **Extração & IA (RAG)** | **Pipeline `pypdf` + OCR opcional (`pytesseract`) + Recuperador BM25 + Provedor LLM opcional** | Garante resposta 100% fundamentada nos trechos e regras do município selecionado mesmo sem chave de API externa (fallback determinístico auditável que nunca inventa artigos/parâmetros), podendo opcionalmente acionar Gemini/OpenAI/Ollama restritos estritamente ao contexto recuperado. |

## 3. Contratos da API Comum (`/api/v1`)

- `GET /api/v1/health`: estado da API, banco ativo e contagem base.
- `GET /api/v1/estatisticas`: totais nacionais calculados em tempo real a partir do catálogo persistido.
- `GET /api/v1/estados`: lista das 27 UFs com estatísticas agregadas de cobertura.
- `GET /api/v1/municipios`: busca paginada por `uf`, `q` (nome sem acento ou código IBGE de 7 dígitos), `situacao` e `com_cartografia`.
- `GET /api/v1/municipios/{codigo_ibge}`: ficha completa do município, Plano Diretor, situação, histórico de versões, documentos, camadas e regras de zonas catalogadas.
- `GET /api/v1/geo/estados` e `GET /api/v1/geo/estados/{uf}/municipios`: malhas IBGE em cache enriquecidas com cobertura real.
- `GET /api/v1/geo/municipios/{codigo_ibge}/limite`: polígono oficial e `bbox` do município no IBGE.
- `GET /api/v1/geo/municipios/{codigo_ibge}/camadas`: metadados das camadas geoespaciais e origem (`oficial` vs `derivada_pdf`).
- `GET /api/v1/geo/municipios/{codigo_ibge}/camadas/{layer_id}/geojson`: GeoJSON normalizado em `EPSG:4326`, com área geodésica calculada quando ausente e legenda dinâmica construída a partir das classes locais reais.
- `POST /api/v1/documentos/{codigo_ibge}/processar`: upload e extração estruturada de PDF com pontuação de confiança.
- `POST /api/v1/ia/consultar` e `POST /api/v1/ia/explicar-zona`: consulta RAG nos modos `didatico`, `tecnico` e `prefeitura`.
