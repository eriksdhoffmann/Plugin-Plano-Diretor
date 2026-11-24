# Estudo Técnico da Referência: `duduluiss/geotrabalho-qgis`

> Referência estudada exclusivamente para aprendizado arquitetural e boas práticas PyQGIS/PyQt: https://github.com/duduluiss/geotrabalho-qgis (licença GNU GPLv3, autor Luís Eduardo Araújo de Souza).  
> Este projeto **não modifica**, **não depende** e **não copia código de domínio** do repositório de referência.

## 1. Estrutura e Inicialização de um Plugin QGIS

O estudo de `geotrabalho_qgis/` evidenciou o padrão canônico esperado pelo QGIS Desktop e pelo repositório oficial de complementos:

- **`__init__.py`**: expõe `classFactory(iface)` como ponto de entrada obrigatório invocado pelo gerenciador de complementos do QGIS. Inclui função auxiliar `_reload_submodules()` para recarregar módulos internos em ordem topológica (core → gui → plugin) quando o usuário utiliza recarregamento a quente (*Plugin Reloader*).
- **`plugin.py`**: encapsula a classe do complemento com os três métodos de ciclo de vida exigidos pelo QGIS:
  - `__init__(self, iface)`: guarda `self.iface` (`QgisInterface`) e o diretório base `self.plugin_dir`.
  - `initGui(self)`: instancia `QAction` com ícone SVG/PNG, conecta `triggered`, registra na barra de ferramentas (`addToolBarIcon`) e no menu do QGIS.
  - `unload(self)`: remove ação da barra de ferramentas e do menu ao desativar o complemento, evitando menus órfãos.
- **`metadata.txt`**: arquivo INI lido tanto pelo QGIS quanto pelo QGIS Plugin Hub (`name`, `qgisMinimumVersion`, `qgisMaximumVersion`, `supportsQt6`, `version`, `author`, `email`, `tracker`, `repository`, `tags`, `category`, `icon`).

## 2. Compatibilidade entre Versões do QGIS (QGIS 3 / PyQt5 e QGIS 4 / PyQt6)

Um dos principais aprendizados práticos do repositório de referência foi o suporte simultâneo ao **QGIS 3.28+ (Qt5)** e ao **QGIS 4.x (Qt6)** no mesmo pacote:

1. **Importações via `qgis.PyQt`**: nunca importar `PyQt5` ou `PyQt6` diretamente; usar sempre o shim `qgis.PyQt`.
2. **`QAction`**: no Qt6 migrou de `QtWidgets` para `QtGui`, exigindo fallback explícito:
   ```python
   try:
       from qgis.PyQt.QtGui import QAction
   except ImportError:
       from qgis.PyQt.QtWidgets import QAction
   ```
3. **Tipos de campos (`QgsField`)**: Qt6 descontinuou `QVariant.Type` em favor de `QMetaType.Type` (`QMetaType.Type.QString`, `LongLong`, `Double`), exigindo função adaptadora que detecta `HAS_QMETATYPE`.
4. **Execução de diálogos**: preferir `dialog.exec()` em vez de `dialog.exec_()` (removido no PyQt6).
5. **Metadado `supportsQt6=True`** e `qgisMaximumVersion=4.99` no `metadata.txt`.

## 3. Execução Assíncrona (`BackgroundJob` com `QThread`)

Na referência (`core/background_job.py`), operações de rede e download não bloqueiam a thread principal da GUI:

- Subclasse de `QThread` que executa um callable `fn(report)` e emite sinais `progress(int, str)`, `succeeded(object)`, `failed(str)` e `cancelled()`.
- **Proteção contra destruição prematura (crash C++/Qt)**: referências às instâncias ativas ficam armazenadas em um `set` de módulo (`_ACTIVE_JOBS`) e só são descartadas no slot `finished` após `self.wait(...)`.
- **Isolamento de thread**: a thread secundária nunca manipula widgets nem adiciona camadas ao `QgsProject.instance()`; o carregamento de camadas ocorre exclusivamente no slot conectado a `succeeded` na main thread.

## 4. APIs, IBGE, Cache Persistente e Download de Malhas

A análise de `core/ibge_api.py` e `core/municipality_mapper.py` revelou técnicas sólidas para dados municipais brasileiros:

- **Chave IBGE de 7 dígitos**: identificação unívoca dos 5.571 municípios brasileiros + normalização tolerante a acentos, hífens e apóstrofos (`normalize_text`) para buscas do usuário.
- **Compressão GZIP + Escrita Atômica**: envio explícito de `Accept-Encoding: gzip, deflate` contra `servicodados.ibge.gov.br/api/v3/malhas`, reduzindo dezenas de MB para centenas de KB, seguido de gravação em arquivo temporário `.part` + `os.replace()` para evitar cache corrompido em quedas de energia/rede.
- **Fallback de proxy QGIS**: caso a conexão direta `http.client.HTTPSConnection` falhe em redes corporativas/prefeituras com proxy configurado no QGIS, utilizar `QgsBlockingNetworkRequest` como segunda tentativa.

## 5. Construção e Carregamento Automático de Camadas

Em `core/layer_builder.py` e no fluxo da `main_dialog.py`:

- Criação de camadas vetoriais configuradas com CRS explícito (`EPSG:4674` SIRGAS 2000 ou `EPSG:4326`), atributos tipados e renderização categorizada (`QgsCategorizedSymbolRenderer`) com cores contrastadas.
- Para o nosso plugin **Planos Diretores do Brasil — QGIS**, expandimos esse padrão com suporte multi-formato para **GeoPackage (`.gpkg`), Shapefile (`.shp`), GeoJSON, WMS, WFS, WMTS e ArcGIS REST (`FeatureServer` / `MapServer`)**, além de gravação de metadados de rastreabilidade (`abstract`, `dataUrl`, propriedades customizadas da lei e origem da geometria) e zoom automático com reprojeção de extensão (`QgsCoordinateTransform`) para o município selecionado.

## 6. Empacotamento e Validação de Instalação

Baseado em `test_and_package.py`:

- Geração automatizada de `.zip` contendo a pasta raiz do complemento (`planos_diretores/`), ignorando `__pycache__`, `.pyc` e arquivos ocultos.
- Validação automática da presença de `metadata.txt`, `__init__.py` com `classFactory` e campos obrigatórios do QGIS Plugin Repository.
- Sincronização opcional para os perfis locais ativos de `QGIS3` e `QGIS4` em `%APPDATA%\QGIS\`.
