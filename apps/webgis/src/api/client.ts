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
import { staticEngine } from './staticEngine';

const API_BASE = '/api/v1';

let backendAvailable: boolean | null = null;

async function tryApi<T>(path: string, init?: RequestInit, timeoutMs = 1800): Promise<T | null> {
  if (backendAvailable === false) return null;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const resp = await fetch(`${API_BASE}${path}`, { ...init, signal: ctrl.signal });
    if (!resp.ok) {
      if (resp.status === 404 && !path.startsWith('/geo')) {
        backendAvailable = false;
      }
      return null;
    }
    const ct = resp.headers.get('content-type') || '';
    if (!ct.includes('application/json')) {
      backendAvailable = false;
      return null;
    }
    backendAvailable = true;
    return (await resp.json()) as T;
  } catch {
    backendAvailable = false;
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export const apiClient = {
  isStaticFallback: () => backendAvailable === false,

  obterEstatisticas: async (): Promise<EstatisticasNacionais> => {
    return (await tryApi<EstatisticasNacionais>('/estatisticas')) ?? staticEngine.obterEstatisticas();
  },

  listarEstados: async (): Promise<EstadoResumo[]> => {
    return (await tryApi<EstadoResumo[]>('/estados')) ?? staticEngine.listarEstados();
  },

  buscarMunicipios: async (params: {
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

    return (
      (await tryApi<{ total: number; limit: number; offset: number; items: MunicipioResumo[] }>(
        `/municipios?${qs.toString()}`
      )) ?? staticEngine.buscarMunicipios(params)
    );
  },

  obterMunicipioDetalhe: async (codigoIbge: string): Promise<MunicipioDetalhe> => {
    return (
      (await tryApi<MunicipioDetalhe>(`/municipios/${codigoIbge}`)) ??
      staticEngine.obterMunicipioDetalhe(codigoIbge)
    );
  },

  obterGeoEstados: async (): Promise<GeoJSON.FeatureCollection> => {
    return (
      (await tryApi<GeoJSON.FeatureCollection>('/geo/estados', undefined, 5000)) ??
      staticEngine.obterGeoEstados()
    );
  },

  obterGeoMunicipiosUF: async (
    uf: string
  ): Promise<GeoJSON.FeatureCollection & { bbox?: number[] }> => {
    return (
      (await tryApi<GeoJSON.FeatureCollection & { bbox?: number[] }>(
        `/geo/estados/${uf}/municipios`,
        undefined,
        5000
      )) ?? staticEngine.obterGeoMunicipiosUF(uf)
    );
  },

  obterLimiteMunicipio: async (
    codigoIbge: string
  ): Promise<GeoJSON.FeatureCollection & { bbox?: number[] }> => {
    return (
      (await tryApi<GeoJSON.FeatureCollection & { bbox?: number[] }>(
        `/geo/municipios/${codigoIbge}/limite`,
        undefined,
        5000
      )) ?? staticEngine.obterLimiteMunicipio(codigoIbge)
    );
  },

  obterCamadaGeoJSON: async (
    codigoIbge: string,
    layerId: string
  ): Promise<CamadaGeoJSONPayload> => {
    return (
      (await tryApi<CamadaGeoJSONPayload>(
        `/geo/municipios/${codigoIbge}/camadas/${layerId}/geojson`,
        undefined,
        15000
      )) ?? staticEngine.obterCamadaGeoJSON(codigoIbge, layerId)
    );
  },

  obterDocumentosMunicipio: async (codigoIbge: string) => {
    return (
      (await tryApi<{
        codigo_ibge: string;
        municipio: string;
        uf: string;
        documentos: DocumentoMunicipal[];
        trechos_indexados: ChunkDocumental[];
      }>(`/documentos/${codigoIbge}`)) ?? staticEngine.obterDocumentosMunicipio(codigoIbge)
    );
  },

  processarPDF: async (codigoIbge: string, file: File, titulo: string, leiNumero?: string) => {
    const fd = new FormData();
    fd.append('arquivo', file);
    fd.append('titulo', titulo);
    if (leiNumero) fd.append('lei_numero', leiNumero);
    const resp = await fetch(`${API_BASE}/documentos/${codigoIbge}/processar`, {
      method: 'POST',
      body: fd,
    });
    if (!resp.ok) {
      throw new Error(
        'O upload e OCR de PDF requerem o backend FastAPI local ativo (porta 8000).'
      );
    }
    return resp.json() as Promise<Record<string, unknown>>;
  },

  consultarIA: async (payload: {
    codigo_ibge: string;
    pergunta: string;
    modo: ModoIA;
    zona_sigla?: string | null;
    zona_nome?: string | null;
    atributos_feicao?: Record<string, unknown> | null;
  }): Promise<RespostaIA> => {
    return (
      (await tryApi<RespostaIA>(
        '/ia/consultar',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
        4000
      )) ?? staticEngine.consultarIA(payload)
    );
  },
};
