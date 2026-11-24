import type {
  CamadaGeoJSONPayload,
  ChunkDocumental,
  DocumentoMunicipal,
  EstadoResumo,
  EstatisticasNacionais,
  ModoIA,
  MunicipioDetalhe,
  MunicipioResumo,
  RespostaIA,
} from '../types/domain';

const API_BASE = '/api/v1';

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const resp = await fetch(`${API_BASE}${path}`, init);
  if (!resp.ok) {
    let msg = `Erro HTTP ${resp.status}`;
    try {
      const body = await resp.json();
      if (body?.detail) msg = String(body.detail);
    } catch {
      // ignora
    }
    throw new Error(msg);
  }
  return resp.json() as Promise<T>;
}

export const apiClient = {
  obterEstatisticas: () => fetchJson<EstatisticasNacionais>('/estatisticas'),

  listarEstados: () => fetchJson<EstadoResumo[]>('/estados'),

  buscarMunicipios: (params: {
    uf?: string;
    q?: string;
    situacao?: string;
    com_cartografia?: boolean;
    limit?: number;
    offset?: number;
  }) => {
    const qs = new URLSearchParams();
    if (params.uf) qs.set('uf', params.uf);
    if (params.q) qs.set('q', params.q);
    if (params.situacao) qs.set('situacao', params.situacao);
    if (params.com_cartografia) qs.set('com_cartografia', 'true');
    qs.set('limit', String(params.limit ?? 100));
    qs.set('offset', String(params.offset ?? 0));
    return fetchJson<{ total: number; limit: number; offset: number; items: MunicipioResumo[] }>(
      `/municipios?${qs.toString()}`
    );
  },

  obterMunicipioDetalhe: (codigoIbge: string) =>
    fetchJson<MunicipioDetalhe>(`/municipios/${codigoIbge}`),

  obterGeoEstados: () => fetchJson<GeoJSON.FeatureCollection>('/geo/estados'),

  obterGeoMunicipiosUF: (uf: string) =>
    fetchJson<GeoJSON.FeatureCollection & { bbox?: number[] }>(`/geo/estados/${uf}/municipios`),

  obterLimiteMunicipio: (codigoIbge: string) =>
    fetchJson<GeoJSON.FeatureCollection & { bbox?: number[] }>(`/geo/municipios/${codigoIbge}/limite`),

  obterCamadaGeoJSON: (codigoIbge: string, layerId: string) =>
    fetchJson<CamadaGeoJSONPayload>(`/geo/municipios/${codigoIbge}/camadas/${layerId}/geojson`),

  obterDocumentosMunicipio: (codigoIbge: string) =>
    fetchJson<{
      codigo_ibge: string;
      municipio: string;
      uf: string;
      documentos: DocumentoMunicipal[];
      trechos_indexados: ChunkDocumental[];
    }>(`/documentos/${codigoIbge}`),

  processarPDF: async (codigoIbge: string, file: File, titulo: string, leiNumero?: string) => {
    const fd = new FormData();
    fd.append('arquivo', file);
    fd.append('titulo', titulo);
    if (leiNumero) fd.append('lei_numero', leiNumero);
    return fetchJson<Record<string, unknown>>(`/documentos/${codigoIbge}/processar`, {
      method: 'POST',
      body: fd,
    });
  },

  consultarIA: (payload: {
    codigo_ibge: string;
    pergunta: string;
    modo: ModoIA;
    zona_sigla?: string | null;
    zona_nome?: string | null;
    atributos_feicao?: Record<string, unknown> | null;
  }) =>
    fetchJson<RespostaIA>('/ia/consultar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }),

  explicarZona: (payload: {
    codigo_ibge: string;
    zona_sigla?: string | null;
    zona_nome?: string | null;
    modo: ModoIA;
    atributos_feicao?: Record<string, unknown> | null;
  }) =>
    fetchJson<RespostaIA>('/ia/explicar-zona', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }),
};
