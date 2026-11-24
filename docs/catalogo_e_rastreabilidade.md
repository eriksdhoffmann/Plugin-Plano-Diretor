# Catálogo Nacional, Rastreabilidade e Critérios Ambientais

## 1. Taxonomia Rigorosa de Situação Documental

Todo município do Brasil (5.571 municípios na divisão territorial oficial vigente do IBGE, identificados pelo código de 7 dígitos) consta no catálogo desde o primeiro dia, sem omissões. A situação documental distingue estritamente:

| Código | Rótulo na Interface | Significado |
|---|---|---|
| `vigente` | **Plano Diretor Vigente Verificado** | Lei principal identificada em fonte oficial (ou repositório institucional validado), com confirmação de vigência na data de verificação. |
| `localizado_em_verificacao` | **Localizado — Aguardando Verificação Integral** | Norma ou referência formal identificada em fontes públicas, porém com PDF integral, vigência consolidada ou anexos cartográficos ainda pendentes de conferência completa. |
| `desatualizado_ou_substituido` | **Histórico / Em Revisão** | Documento localizado referente a plano anterior ou em processo de revisão legislativa. |
| `nao_localizado` | **Não Localizado nas Fontes Consultadas** | Exibe obrigatoriamente o texto literal: `"Plano Diretor não localizado nas fontes consultadas."`. Nunca afirma inexistência de Plano Diretor no município. |

## 2. Hierarquia de Confiabilidade das Fontes

1. **Prefeituras Municipais** (portais oficiais e institutos municipais de planejamento, ex.: IPPUC/Curitiba, Prefeitura de Joinville/SIMGeo);
2. **Câmaras Municipais**;
3. **Diários Oficiais**;
4. **Portais Municipais de Legislação** (ex.: LeisMunicipais quando vinculados a atos oficiais municipais);
5. **Órgãos Estaduais**;
6. **Repositórios Oficiais Federais** (IBGE, Ministério das Cidades, ICMBio/MMA);
7. **Repositórios Acadêmicos e Institucionais** (exclusivamente como fonte secundária sinalizada).

## 3. Separação Obrigatória de Natureza da Informação

Tanto o WebGIS quanto o Plugin QGIS e o Assistente de IA separam visual e estruturalmente:

- **Texto literal da legislação**: transcrição exata de dispositivo legal citado;
- **Síntese produzida pelo sistema**: resumo estruturado com citação direta de lei/artigo/página;
- **Explicação gerada pela IA**: interpretação didática ou técnica derivada exclusivamente dos documentos recuperados;
- **Geometria oficial**: camada publicada diretamente por órgão oficial municipal/estadual/federal (ex.: ArcGIS REST do IPPUC ou SIMGeo Joinville);
- **Geometria derivada de PDF**: polígono vetorizado ou georreferenciado a partir de anexo cartográfico em PDF — sempre exibido com aviso explícito de não se tratar de dado vetorial oficial;
- **Informação ainda não verificada**: lacunas documentais explicitadas sem preenchimento especulativo.

## 4. Critérios Ambientais e Distinção Jurídico-Espacial

O motor de interpretação do projeto **proíbe confundir** categorias que frequentemente se sobrepõem no território, mas possuem regimes jurídicos distintos:

1. **Área de Preservação Permanente (APP)**: definida pelo **Código Florestal (Lei Federal nº 12.651/2012, Arts. 3º II e 4º)** por função ambiental (margens de cursos d'água, nascentes, topos de morro, encostas > 45°, restingas, manguezais, etc.), independentemente de cobertura vegetal ou previsão no zoneamento municipal.
2. **Zona de Preservação Municipal (ZPA/ZPM/AUAP)**: categoria criada pelo Plano Diretor ou Lei de Uso e Ocupação do Solo municipal com parâmetros construtivos próprios.
3. **Unidade de Conservação (UC)**: espaço territorial protegido pelo **SNUC (Lei Federal nº 9.985/2000)** instituído por ato específico do Poder Público (Parque, APA, RPPN, Estação Ecológica, etc.) e regido por plano de manejo próprio.
4. **Área Verde / Lazer**: espaço urbano destinado a uso público, permeabilidade, recreação ou arborização em parcelamento do solo ou sistema de áreas livres.
5. **Zona de Restrição Urbanística / Cota de Inundação / Cota Topográfica**: restrição urbanística ou geotécnica municipal (ex.: Cota 40 em Joinville/SC).
6. **Área de Risco**: setor sujeito a deslizamento, inundação ou processo geológico-geotécnico (CPRM/Defesa Civil/Leis de Parcelamento do Solo).

A plataforma **não emite parecer jurídico, licença ambiental nem autorização de construção**, informando sempre quais documentos e verificações em campo/órgão municipal competente ainda são necessários.
