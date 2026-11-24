export type SituacaoPlano =
  | 'vigente'
  | 'localizado_em_verificacao'
  | 'desatualizado_ou_substituido'
  | 'nao_localizado';

export type ModoIA = 'didatico' | 'tecnico' | 'prefeitura';

export interface EstatisticasNacionais {
  municipios_cadastrados: number;
  planos_localizados: number;
  planos_vigentes: number;
  documentos_fonte_oficial: number;
  municipios_com_cartografia: number;
  municipios_aguardando_verificacao: number;
  municipios_nao_localizados: number;
}

export interface EstadoResumo {
  uf: string;
  uf_nome: string;
  regiao: string;
  municipios_cadastrados: number;
  planos_localizados: number;
  planos_vigentes: number;
  municipios_com_cartografia: number;
  municipios_aguardando_verificacao: number;
}

export interface DocumentoMunicipal {
  id?: number;
  titulo: string;
  tipo: string;
  lei_numero?: string | null;
  ano?: number | null;
  url?: string | null;
  formato?: string | null;
  fonte_oficial?: string | null;
  hierarquia_fonte?: number | null;
  situacao_vigencia: string;
  data_verificacao?: string | null;
  arquivo_local?: string | null;
  observacao?: string | null;
  confianca_extracao?: number | null;
}

export interface CamadaGIS {
  id: string;
  nome: string;
  categoria: string;
  tipo_servico: string;
  url: string;
  campo_codigo_zona?: string | null;
  campo_nome_zona?: string | null;
  campo_grupo?: string | null;
  campo_legislacao?: string | null;
  campo_area?: string | null;
  crs_origem?: string | null;
  origem_geometria: 'oficial' | 'derivada_pdf';
  fonte_oficial?: string | null;
  data_verificacao?: string | null;
  observacao?: string | null;
}

export interface ZonaRegra {
  sigla: string;
  nome: string;
  grupo?: string | null;
  lei?: string | null;
  artigo?: string | null;
  finalidade?: string | null;
  usos_permitidos?: string | null;
  usos_condicionados?: string | null;
  usos_proibidos?: string | null;
  parametros: Record<string, unknown>;
  aviso_parametros?: string | null;
}

export interface HistoricoVersao {
  lei: string;
  ano?: number | null;
  situacao: string;
  observacao?: string | null;
}

export interface MunicipioResumo {
  codigo_ibge: string;
  nome: string;
  uf: string;
  uf_nome: string;
  regiao: string;
  mesorregiao: string;
  microrregiao: string;
  situacao: SituacaoPlano;
  lei_principal?: string | null;
  ano_lei?: number | null;
  possui_cartografia: boolean;
  fonte_oficial?: string | null;
  confiabilidade: string;
}

export interface MunicipioDetalhe extends MunicipioResumo {
  nome_plano_diretor: string;
  data_aprovacao?: string | null;
  data_revisao?: string | null;
  hierarquia_fonte?: number | null;
  url_oficial?: string | null;
  url_pdf?: string | null;
  data_verificacao?: string | null;
  aviso_documental?: string | null;
  mensagem_situacao: string;
  documentos: DocumentoMunicipal[];
  camadas_gis: CamadaGIS[];
  zonas_regras: ZonaRegra[];
  historico_versoes: HistoricoVersao[];
}

export interface LegendaItem {
  chave: string;
  sigla: string;
  nome: string;
  grupo?: string | null;
  cor: string;
  contagem: number;
}

export interface CamadaGeoJSONPayload {
  camada: CamadaGIS;
  total_feicoes: number;
  legenda: LegendaItem[];
  geojson: GeoJSON.FeatureCollection & { bbox?: number[] };
  aviso?: string;
}

export interface ChunkDocumental {
  id: number;
  lei: string;
  artigo?: string | null;
  anexo?: string | null;
  pagina?: number | null;
  titulo?: string | null;
  texto_literal: string;
  palavras_chave: string[];
  url?: string | null;
  confianca: number;
  data_verificacao?: string | null;
}

export interface RespostaIA {
  codigo_ibge: string;
  municipio: string;
  uf: string;
  modo: ModoIA;
  zona_consultada?: string | null;
  situacao_documental: SituacaoPlano;
  aviso_documental?: string | null;
  sete_blocos: {
    o_que_e: string;
    por_que_existe: string;
    o_que_pode: string;
    o_que_depende_de_condicoes: string;
    o_que_nao_pode: string;
    fundamentacao: string;
    fonte: string;
  };
  proveniencia: {
    texto_literal: Array<{
      escopo?: string;
      lei: string;
      artigo?: string | null;
      anexo?: string | null;
      pagina?: number | null;
      trecho: string;
      confianca?: number | null;
      data_verificacao?: string | null;
      url?: string | null;
    }>;
    sintese_sistema: string;
    explicacao_ia: string;
    geometria_origem: string;
    status_verificacao: string;
  };
  distincao_ambiental?: Record<
    string,
    {
      nome: string;
      fundamentacao: string;
      definicao: string;
      criterios?: string[];
      excecoes_hipoteses?: string;
    }
  > | null;
  checklist_analise: Array<{
    instrumento: string;
    status: string;
    detalhe: string;
  }>;
  aviso_legal: string;
}

export interface FeicaoSelecionada {
  camadaId: string;
  camadaNome: string;
  categoria: string;
  origemGeometria: 'oficial' | 'derivada_pdf';
  fonteOficial?: string | null;
  dataVerificacao?: string | null;
  properties: Record<string, unknown>;
}
