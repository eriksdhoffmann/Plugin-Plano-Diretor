import type {
  CamadaGIS,
  CamadaGeoJSONPayload,
  ChunkDocumental,
  DocumentoMunicipal,
  EstadoResumo,
  EstatisticasNacionais,
  LegendaItem,
  ModoIA,
  MunicipioDetalhe,
  MunicipioResumo,
  RespostaIA,
  SituacaoPlano,
  ZonaRegra,
} from '../types/domain';

interface IbgeCompactRow {
  c: string;
  n: string;
  u: string;
  un: string;
  r: string;
  me: string;
  mi: string;
  mp?: 'sim' | 'em_elaboracao' | 'nao' | 'sem_dados';
  ma?: number | null;
  mr?: number | null;
}

interface CatalogoVerificadoFile {
  planos_diretores: Array<{
    codigo_ibge: string;
    municipio: string;
    uf: string;
    nome_plano_diretor: string;
    lei_principal?: string | null;
    ano_lei?: number | null;
    data_aprovacao?: string | null;
    data_revisao?: string | null;
    situacao: SituacaoPlano;
    fonte_oficial?: string | null;
    hierarquia_fonte?: number | null;
    url_oficial?: string | null;
    url_pdf?: string | null;
    confiabilidade: string;
    data_verificacao?: string | null;
    aviso_documental?: string | null;
    documentos?: DocumentoMunicipal[];
    camadas_gis?: CamadaGIS[];
    historico_versoes?: Array<{
      lei: string;
      ano?: number | null;
      situacao: string;
      observacao?: string | null;
    }>;
  }>;
}

interface LegislacaoBundle {
  federal: {
    data_verificacao?: string;
    url_oficial?: string;
    distincao_conceitual?: Record<
      string,
      {
        nome: string;
        fundamentacao: string;
        definicao: string;
        criterios?: string[];
        excecoes_hipoteses?: string;
      }
    >;
    dispositivos?: Array<{
      id: string;
      lei: string;
      artigo?: string | null;
      anexo?: string | null;
      pagina?: number | null;
      titulo?: string | null;
      texto_literal: string;
      palavras_chave?: string[];
      url?: string | null;
      confianca?: number;
    }>;
  };
  municipais: Record<
    string,
    {
      codigo_ibge: string;
      data_verificacao?: string;
      zonas_conhecidas?: ZonaRegra[];
      dispositivos?: Array<{
        id: string;
        lei: string;
        artigo?: string | null;
        anexo?: string | null;
        pagina?: number | null;
        titulo?: string | null;
        texto_literal: string;
        palavras_chave?: string[];
        url?: string | null;
        confianca?: number;
      }>;
    }
  >;
}

const MENSAGEM_NAO_LOCALIZADO = 'Plano Diretor não localizado nas fontes consultadas.';

const UF_TO_COD_IBGE: Record<string, string> = {
  RO: '11', AC: '12', AM: '13', RR: '14', PA: '15', AP: '16', TO: '17',
  MA: '21', PI: '22', CE: '23', RN: '24', PB: '25', PE: '26', AL: '27',
  SE: '28', BA: '29', MG: '31', ES: '32', RJ: '33', SP: '35', PR: '41',
  SC: '42', RS: '43', MS: '50', MT: '51', GO: '52', DF: '53',
};
const COD_TO_UF = Object.fromEntries(Object.entries(UF_TO_COD_IBGE).map(([k, v]) => [v, k]));

const PALETA_ZONAS = [
  '#2563eb', '#059669', '#d97706', '#dc2626', '#7c3aed',
  '#0891b2', '#65a30d', '#db2777', '#ea580c', '#4f46e5',
  '#0d9488', '#ca8a04', '#9333ea', '#0284c7', '#16a34a',
  '#b91c1c', '#c026d3', '#4338ca', '#15803d', '#b45309',
];

function norm(texto?: string | null): string {
  if (!texto) return '';
  return String(texto)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

function hashCor(chave: string, categoria: string): string {
  let h = 0;
  for (let i = 0; i < chave.length; i += 1) {
    h = (h * 31 + chave.charCodeAt(i)) >>> 0;
  }
  if (categoria === 'ambiental') {
    const amb = ['#15803d', '#0f766e', '#166534', '#047857', '#065f46'];
    return amb[h % amb.length];
  }
  return PALETA_ZONAS[h % PALETA_ZONAS.length];
}

function calcAreaAnelM2(anel: number[][]): number {
  if (!anel || anel.length < 3) return 0;
  const r = 6378137.0;
  let total = 0;
  for (let i = 0; i < anel.length; i += 1) {
    const p1 = anel[i];
    const p2 = anel[(i + 1) % anel.length];
    const lon1 = (p1[0] * Math.PI) / 180;
    const lat1 = (p1[1] * Math.PI) / 180;
    const lon2 = (p2[0] * Math.PI) / 180;
    const lat2 = (p2[1] * Math.PI) / 180;
    total += (lon2 - lon1) * (2 + Math.sin(lat1) + Math.sin(lat2));
  }
  return Math.abs((total * r * r) / 2);
}

function calcAreaGeomM2(geom: GeoJSON.Geometry | null | undefined): number | null {
  if (!geom) return null;
  if (geom.type === 'Polygon' && geom.coordinates?.length) {
    let a = calcAreaAnelM2(geom.coordinates[0]);
    for (let i = 1; i < geom.coordinates.length; i += 1) {
      a -= calcAreaAnelM2(geom.coordinates[i]);
    }
    return Math.round(Math.max(a, 0) * 100) / 100;
  }
  if (geom.type === 'MultiPolygon' && geom.coordinates?.length) {
    let total = 0;
    for (const poly of geom.coordinates) {
      if (!poly.length) continue;
      let a = calcAreaAnelM2(poly[0]);
      for (let i = 1; i < poly.length; i += 1) {
        a -= calcAreaAnelM2(poly[i]);
      }
      total += Math.max(a, 0);
    }
    return Math.round(total * 100) / 100;
  }
  return null;
}

function calcBbox(fc: GeoJSON.FeatureCollection): [number, number, number, number] | undefined {
  let minx = Infinity;
  let miny = Infinity;
  let maxx = -Infinity;
  let maxy = -Infinity;

  const walk = (coords: unknown) => {
    if (!Array.isArray(coords) || coords.length === 0) return;
    if (typeof coords[0] === 'number' && typeof coords[1] === 'number') {
      minx = Math.min(minx, coords[0]);
      miny = Math.min(miny, coords[1]);
      maxx = Math.max(maxx, coords[0]);
      maxy = Math.max(maxy, coords[1]);
    } else {
      for (const c of coords) walk(c);
    }
  };

  for (const feat of fc.features) {
    if (feat.geometry && 'coordinates' in feat.geometry) {
      walk(feat.geometry.coordinates);
    }
  }
  if (!Number.isFinite(minx)) return undefined;
  return [minx, miny, maxx, maxy];
}

let cachePromise: Promise<{
  ibge: IbgeCompactRow[];
  catalogoMap: Map<string, CatalogoVerificadoFile['planos_diretores'][number]>;
  legislacao: LegislacaoBundle;
}> | null = null;

async function loadStaticData() {
  if (!cachePromise) {
    cachePromise = Promise.all([
      fetch('./data/municipios_ibge_compact.json').then((r) => r.json()),
      fetch('./data/planos_diretores_verificados.json').then((r) => r.json()),
      fetch('./data/legislacao_bundle.json').then((r) => r.json()),
    ]).then(([ibge, cat, leg]: [IbgeCompactRow[], CatalogoVerificadoFile, LegislacaoBundle]) => {
      const map = new Map<string, CatalogoVerificadoFile['planos_diretores'][number]>();
      for (const p of cat.planos_diretores || []) {
        map.set(p.codigo_ibge, p);
      }
      return { ibge, catalogoMap: map, legislacao: leg };
    });
  }
  return cachePromise;
}

const geoCache = new Map<string, unknown>();

export const staticEngine = {
  async obterEstatisticas(): Promise<EstatisticasNacionais> {
    const { ibge, catalogoMap } = await loadStaticData();
    let munic_com_plano = 0;
    let munic_em_elaboracao = 0;
    let munic_sem_plano = 0;
    for (const m of ibge) {
      if (m.mp === 'sim') munic_com_plano += 1;
      else if (m.mp === 'em_elaboracao') munic_em_elaboracao += 1;
      else if (m.mp === 'nao') munic_sem_plano += 1;
    }

    let planos_localizados = 0;
    let planos_vigentes = 0;
    let documentos_fonte_oficial = 0;
    let municipios_com_cartografia = 0;
    let municipios_aguardando_verificacao = 0;

    for (const p of catalogoMap.values()) {
      if (['vigente', 'localizado_em_verificacao', 'desatualizado_ou_substituido'].includes(p.situacao)) {
        planos_localizados += 1;
      }
      if (p.situacao === 'vigente') planos_vigentes += 1;
      if (p.situacao === 'localizado_em_verificacao') municipios_aguardando_verificacao += 1;
      if ((p.camadas_gis || []).length > 0) municipios_com_cartografia += 1;
      for (const d of p.documentos || []) {
        if ((d.hierarquia_fonte ?? 99) <= 4 && d.url) documentos_fonte_oficial += 1;
      }
    }

    return {
      municipios_cadastrados: ibge.length,
      munic_com_plano,
      munic_em_elaboracao,
      munic_sem_plano,
      planos_localizados,
      planos_vigentes,
      documentos_fonte_oficial,
      municipios_com_cartografia,
      municipios_aguardando_verificacao,
      municipios_nao_localizados: Math.max(ibge.length - planos_localizados, 0),
    };
  },

  async listarEstados(): Promise<EstadoResumo[]> {
    const { ibge, catalogoMap } = await loadStaticData();
    const map = new Map<string, EstadoResumo>();
    for (const m of ibge) {
      let est = map.get(m.u);
      if (!est) {
        est = {
          uf: m.u,
          uf_nome: m.un,
          regiao: m.r,
          municipios_cadastrados: 0,
          munic_com_plano: 0,
          munic_em_elaboracao: 0,
          munic_sem_plano: 0,
          planos_localizados: 0,
          planos_vigentes: 0,
          municipios_com_cartografia: 0,
          municipios_aguardando_verificacao: 0,
        };
        map.set(m.u, est);
      }
      est.municipios_cadastrados += 1;
      if (m.mp === 'sim') est.munic_com_plano = (est.munic_com_plano || 0) + 1;
      else if (m.mp === 'em_elaboracao') est.munic_em_elaboracao = (est.munic_em_elaboracao || 0) + 1;
      else if (m.mp === 'nao') est.munic_sem_plano = (est.munic_sem_plano || 0) + 1;

      const p = catalogoMap.get(m.c);
      if (p) {
        if (['vigente', 'localizado_em_verificacao', 'desatualizado_ou_substituido'].includes(p.situacao)) {
          est.planos_localizados += 1;
        }
        if (p.situacao === 'vigente') est.planos_vigentes += 1;
        if (p.situacao === 'localizado_em_verificacao') est.municipios_aguardando_verificacao += 1;
        if ((p.camadas_gis || []).length > 0) est.municipios_com_cartografia += 1;
      }
    }
    return Array.from(map.values()).sort((a, b) => a.uf.localeCompare(b.uf));
  },

  async buscarMunicipios(params: {
    uf?: string;
    q?: string;
    situacao?: string;
    munic_status?: string;
    com_cartografia?: boolean;
    limit?: number;
    offset?: number;
  }): Promise<{ total: number; limit: number; offset: number; items: MunicipioResumo[] }> {
    const { ibge, catalogoMap } = await loadStaticData();
    const ufUp = params.uf?.trim().toUpperCase();
    const qRaw = params.q?.trim() || '';
    const qNorm = norm(qRaw);
    const qIsDigits = /^\d+$/.test(qRaw);

    const filtrados: MunicipioResumo[] = [];
    for (const m of ibge) {
      if (ufUp && m.u !== ufUp) continue;
      if (params.munic_status && (m.mp || 'sem_dados') !== params.munic_status) continue;
      if (qRaw) {
        if (qIsDigits) {
          if (!m.c.startsWith(qRaw)) continue;
        } else if (!norm(m.n).includes(qNorm)) {
          continue;
        }
      }
      const p = catalogoMap.get(m.c);
      const sit: SituacaoPlano = p?.situacao || 'nao_localizado';
      const temCart = Boolean(p && (p.camadas_gis || []).length > 0);
      if (params.situacao && sit !== params.situacao) continue;
      if (params.com_cartografia && !temCart) continue;

      filtrados.push({
        codigo_ibge: m.c,
        nome: m.n,
        uf: m.u,
        uf_nome: m.un,
        regiao: m.r,
        mesorregiao: m.me,
        microrregiao: m.mi,
        munic_possui_plano: m.mp || 'sem_dados',
        munic_ano_criacao: m.ma ?? null,
        munic_ano_revisao: m.mr ?? null,
        situacao: sit,
        lei_principal: p?.lei_principal ?? null,
        ano_lei: p?.ano_lei ?? null,
        possui_cartografia: temCart,
        fonte_oficial: p?.fonte_oficial ?? null,
        confiabilidade: p?.confiabilidade ?? 'nao_verificada',
      });
    }

    const limit = params.limit ?? 100;
    const offset = params.offset ?? 0;
    return {
      total: filtrados.length,
      limit,
      offset,
      items: filtrados.slice(offset, offset + limit),
    };
  },

  async obterMunicipioDetalhe(codigoIbge: string): Promise<MunicipioDetalhe> {
    const { ibge, catalogoMap, legislacao } = await loadStaticData();
    const m = ibge.find((x) => x.c === codigoIbge);
    if (!m) throw new Error(`Município IBGE ${codigoIbge} não encontrado.`);

    const p = catalogoMap.get(codigoIbge);
    const leg = legislacao.municipais[codigoIbge];
    const sit: SituacaoPlano = p?.situacao || 'nao_localizado';
    const msg =
      sit === 'nao_localizado'
        ? MENSAGEM_NAO_LOCALIZADO
        : sit === 'vigente'
          ? 'Plano Diretor vigente verificado nas fontes catalogadas.'
          : 'Plano Diretor localizado; aguardando verificação integral de anexos/vigência.';

    return {
      codigo_ibge: m.c,
      nome: m.n,
      uf: m.u,
      uf_nome: m.un,
      regiao: m.r,
      mesorregiao: m.me,
      microrregiao: m.mi,
      situacao: sit,
      lei_principal: p?.lei_principal ?? null,
      ano_lei: p?.ano_lei ?? null,
      possui_cartografia: Boolean(p && (p.camadas_gis || []).length > 0),
      fonte_oficial: p?.fonte_oficial ?? null,
      confiabilidade: p?.confiabilidade ?? 'nao_verificada',
      nome_plano_diretor: p?.nome_plano_diretor || `Plano Diretor de ${m.n} (não localizado)`,
      data_aprovacao: p?.data_aprovacao ?? null,
      data_revisao: p?.data_revisao ?? null,
      hierarquia_fonte: p?.hierarquia_fonte ?? null,
      url_oficial: p?.url_oficial ?? null,
      url_pdf: p?.url_pdf ?? null,
      data_verificacao: p?.data_verificacao ?? null,
      aviso_documental: p?.aviso_documental ?? (sit === 'nao_localizado' ? MENSAGEM_NAO_LOCALIZADO : null),
      mensagem_situacao: msg,
      documentos: p?.documentos || [],
      camadas_gis: p?.camadas_gis || [],
      zonas_regras: leg?.zonas_conhecidas || [],
      historico_versoes: p?.historico_versoes || [],
    };
  },

  async obterGeoEstados(): Promise<GeoJSON.FeatureCollection> {
    const key = 'estados';
    if (geoCache.has(key)) return geoCache.get(key) as GeoJSON.FeatureCollection;
    const url =
      'https://servicodados.ibge.gov.br/api/v3/malhas/paises/BR?intrarregiao=UF&qualidade=minima&formato=application/vnd.geo+json';
    const fc = (await fetch(url).then((r) => r.json())) as GeoJSON.FeatureCollection;
    const estados = await this.listarEstados();
    const porUf = new Map(estados.map((e) => [e.uf, e]));
    fc.features = fc.features.map((f) => {
      const codarea = String((f.properties || {}).codarea || '').trim();
      const uf = COD_TO_UF[codarea] || '';
      const est = porUf.get(uf);
      return {
        ...f,
        properties: {
          ...(f.properties || {}),
          uf,
          uf_nome: est?.uf_nome || uf,
          regiao: est?.regiao || '',
          municipios_cadastrados: est?.municipios_cadastrados ?? 0,
          munic_com_plano: est?.munic_com_plano ?? 0,
          munic_em_elaboracao: est?.munic_em_elaboracao ?? 0,
          munic_sem_plano: est?.munic_sem_plano ?? 0,
          planos_localizados: est?.planos_localizados ?? 0,
          planos_vigentes: est?.planos_vigentes ?? 0,
          municipios_com_cartografia: est?.municipios_com_cartografia ?? 0,
          municipios_aguardando_verificacao: est?.municipios_aguardando_verificacao ?? 0,
        },
      };
    });
    geoCache.set(key, fc);
    return fc;
  },

  async obterGeoMunicipiosUF(uf: string): Promise<GeoJSON.FeatureCollection & { bbox?: number[] }> {
    const ufUp = uf.toUpperCase();
    const key = `muns_${ufUp}`;
    if (geoCache.has(key)) {
      return geoCache.get(key) as GeoJSON.FeatureCollection & { bbox?: number[] };
    }
    const codUf = UF_TO_COD_IBGE[ufUp];
    const url = `https://servicodados.ibge.gov.br/api/v3/malhas/estados/${codUf}?intrarregiao=municipio&qualidade=minima&formato=application/vnd.geo+json`;
    const fc = (await fetch(url).then((r) => r.json())) as GeoJSON.FeatureCollection & {
      bbox?: number[];
    };
    const { ibge, catalogoMap } = await loadStaticData();
    const ibgeMap = new Map(ibge.filter((m) => m.u === ufUp).map((m) => [m.c, m]));
    fc.features = fc.features.map((f) => {
      const cod = String((f.properties || {}).codarea || '').trim();
      const m = ibgeMap.get(cod);
      const p = catalogoMap.get(cod);
      return {
        ...f,
        properties: {
          ...(f.properties || {}),
          codigo_ibge: cod,
          uf: ufUp,
          nome: m?.n || cod,
          munic_possui_plano: m?.mp || 'sem_dados',
          munic_ano_criacao: m?.ma ?? null,
          situacao: p?.situacao || 'nao_localizado',
          lei_principal: p?.lei_principal ?? null,
          possui_cartografia: Boolean(p && (p.camadas_gis || []).length > 0),
        },
      };
    });
    fc.bbox = calcBbox(fc);
    geoCache.set(key, fc);
    return fc;
  },

  async obterLimiteMunicipio(
    codigoIbge: string
  ): Promise<GeoJSON.FeatureCollection & { bbox?: number[] }> {
    const key = `lim_${codigoIbge}`;
    if (geoCache.has(key)) {
      return geoCache.get(key) as GeoJSON.FeatureCollection & { bbox?: number[] };
    }
    const url = `https://servicodados.ibge.gov.br/api/v3/malhas/municipios/${codigoIbge}?qualidade=intermediaria&formato=application/vnd.geo+json`;
    const fc = (await fetch(url).then((r) => r.json())) as GeoJSON.FeatureCollection & {
      bbox?: number[];
    };
    fc.bbox = calcBbox(fc);
    geoCache.set(key, fc);
    return fc;
  },

  async obterCamadaGeoJSON(codigoIbge: string, layerId: string): Promise<CamadaGeoJSONPayload> {
    const key = `layer_${codigoIbge}_${layerId}`;
    if (geoCache.has(key)) return geoCache.get(key) as CamadaGeoJSONPayload;

    const det = await this.obterMunicipioDetalhe(codigoIbge);
    const camada = det.camadas_gis.find((c) => c.id === layerId);
    if (!camada) throw new Error(`Camada ${layerId} não encontrada.`);

    let rawFc: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };
    if (camada.tipo_servico === 'arcgis_rest') {
      const baseUrl = camada.url.replace(/\/$/, '');
      const feats: GeoJSON.Feature[] = [];
      let offset = 0;
      const pageSize = 500;
      while (feats.length < 1200) {
        const qUrl = `${baseUrl}/query?where=1%3D1&outFields=*&outSR=4326&f=geojson&resultOffset=${offset}&resultRecordCount=${pageSize}`;
        const chunk = (await fetch(qUrl).then((r) => r.json())) as GeoJSON.FeatureCollection;
        const batch = chunk.features || [];
        if (!batch.length) break;
        feats.push(...batch);
        if (batch.length < pageSize) break;
        offset += batch.length;
      }
      rawFc = { type: 'FeatureCollection', features: feats.slice(0, 1200) };
    } else if (camada.tipo_servico === 'geojson') {
      rawFc = (await fetch(camada.url).then((r) => r.json())) as GeoJSON.FeatureCollection;
    }

    const legendaMap = new Map<string, LegendaItem>();
    const featuresOut: GeoJSON.Feature[] = (rawFc.features || []).map((feat, idx) => {
      const props = { ...(feat.properties || {}) } as Record<string, unknown>;
      const siglaRaw = camada.campo_codigo_zona ? props[camada.campo_codigo_zona] : null;
      const nomeRaw = camada.campo_nome_zona ? props[camada.campo_nome_zona] : null;
      const grupoRaw = camada.campo_grupo ? props[camada.campo_grupo] : null;
      const legRaw = camada.campo_legislacao ? props[camada.campo_legislacao] : null;

      let sigla = siglaRaw !== null && siglaRaw !== undefined ? String(siglaRaw).trim() : '';
      let nome = nomeRaw !== null && nomeRaw !== undefined ? String(nomeRaw).trim() : '';
      if (!sigla && nome) sigla = nome.slice(0, 32);
      if (!nome && sigla) nome = sigla;
      if (!sigla && !nome) {
        sigla = camada.nome;
        nome = camada.nome;
      }

      let areaM2: number | null = null;
      if (camada.campo_area && typeof props[camada.campo_area] === 'number') {
        areaM2 = Math.round((props[camada.campo_area] as number) * 100) / 100;
      } else if (typeof props.area_m2 === 'number') {
        areaM2 = props.area_m2 as number;
      } else if (typeof props.area_ha === 'number') {
        areaM2 = Math.round((props.area_ha as number) * 10000 * 100) / 100;
      }
      if (!areaM2 || areaM2 <= 0) {
        areaM2 = calcAreaGeomM2(feat.geometry);
      }

      const chave = sigla || nome;
      const cor = hashCor(chave, camada.categoria);
      if (!legendaMap.has(chave)) {
        legendaMap.set(chave, {
          chave,
          sigla,
          nome,
          grupo: grupoRaw ? String(grupoRaw).trim() : null,
          cor,
          contagem: 0,
        });
      }
      legendaMap.get(chave)!.contagem += 1;

      props._pd_feature_id = idx + 1;
      props._pd_sigla = sigla;
      props._pd_nome = nome;
      props._pd_grupo = grupoRaw ? String(grupoRaw).trim() : null;
      props._pd_legislacao = legRaw ? String(legRaw).trim() : null;
      props._pd_area_m2 = areaM2;
      props._pd_area_ha = areaM2 ? Math.round((areaM2 / 10000) * 10000) / 10000 : null;
      props._pd_cor = cor;
      props._pd_origem_geometria = camada.origem_geometria;
      props._pd_fonte_oficial = camada.fonte_oficial;

      return { ...feat, properties: props };
    });

    const fcOut: GeoJSON.FeatureCollection & { bbox?: number[] } = {
      type: 'FeatureCollection',
      features: featuresOut,
    };
    fcOut.bbox = calcBbox(fcOut);

    const payload: CamadaGeoJSONPayload = {
      camada,
      total_feicoes: featuresOut.length,
      legenda: Array.from(legendaMap.values()).sort((a, b) => b.contagem - a.contagem),
      geojson: fcOut,
    };
    geoCache.set(key, payload);
    return payload;
  },

  async obterDocumentosMunicipio(codigoIbge: string): Promise<{
    codigo_ibge: string;
    municipio: string;
    uf: string;
    documentos: DocumentoMunicipal[];
    trechos_indexados: ChunkDocumental[];
  }> {
    const det = await this.obterMunicipioDetalhe(codigoIbge);
    const { legislacao } = await loadStaticData();
    const munLeg = legislacao.municipais[codigoIbge];
    const chunks: ChunkDocumental[] = (munLeg?.dispositivos || []).map((d, i) => ({
      id: i + 1,
      lei: d.lei,
      artigo: d.artigo ?? null,
      anexo: d.anexo ?? null,
      pagina: d.pagina ?? null,
      titulo: d.titulo ?? null,
      texto_literal: d.texto_literal,
      palavras_chave: d.palavras_chave || [],
      url: d.url ?? null,
      confianca: d.confianca ?? 0.9,
      data_verificacao: munLeg.data_verificacao ?? null,
    }));

    return {
      codigo_ibge: det.codigo_ibge,
      municipio: det.nome,
      uf: det.uf,
      documentos: det.documentos,
      trechos_indexados: chunks,
    };
  },

  async consultarIA(payload: {
    codigo_ibge: string;
    pergunta: string;
    modo: ModoIA;
    zona_sigla?: string | null;
    zona_nome?: string | null;
    atributos_feicao?: Record<string, unknown> | null;
  }): Promise<RespostaIA> {
    const det = await this.obterMunicipioDetalhe(payload.codigo_ibge);
    const { legislacao } = await loadStaticData();
    const munLeg = legislacao.municipais[payload.codigo_ibge];
    const textoBusca = norm(`${payload.pergunta} ${payload.zona_sigla || ''} ${payload.zona_nome || ''}`);
    const ehApp = /app|preservacao permanente|codigo florestal|nascente|rio|curso dagua|mangue|12651/.test(textoBusca);
    const ehAmbiental =
      ehApp ||
      /ambiental|preservacao|conservacao|apa|parque|aupa|area verde|risco|cota 40/.test(textoBusca);

    const regra = det.zonas_regras.find(
      (z) =>
        (payload.zona_sigla && norm(z.sigla) === norm(payload.zona_sigla)) ||
        (payload.zona_nome && norm(z.nome) === norm(payload.zona_nome))
    );

    const dispositivosMun = munLeg?.dispositivos || [];
    const dispositivosFed = ehAmbiental ? legislacao.federal.dispositivos || [] : [];
    const avisoLegal =
      'Esta resposta tem caráter exclusivamente informativo e de apoio técnico/didático, baseado nos registros catalogados até a data de verificação. Não constitui parecer jurídico, licença ambiental, consulta de viabilidade oficial nem autorização para construir — atos que competem exclusivamente ao órgão municipal competente.';

    if (det.situacao === 'nao_localizado' && dispositivosMun.length === 0) {
      return {
        codigo_ibge: det.codigo_ibge,
        municipio: det.nome,
        uf: det.uf,
        modo: payload.modo,
        situacao_documental: det.situacao,
        aviso_documental: MENSAGEM_NAO_LOCALIZADO,
        sete_blocos: {
          o_que_e: `${MENSAGEM_NAO_LOCALIZADO} Ainda não há documentos municipais catalogados para ${det.nome}/${det.uf} (IBGE ${det.codigo_ibge}).`,
          por_que_existe: 'Não foi possível determinar sem o texto vigente do Plano Diretor municipal.',
          o_que_pode: 'Não foi possível determinar permissões urbanísticas sem a legislação local.',
          o_que_depende_de_condicoes:
            'Restrições federais do Código Florestal (Lei nº 12.651/2012) aplicam-se independentemente de Plano Diretor caso existam APPs no imóvel.',
          o_que_nao_pode: 'Não é possível afirmar proibições municipais específicas sem acesso ao documento oficial.',
          fundamentacao: 'Legislação municipal: não localizada. Referência ambiental geral: Lei Federal nº 12.651/2012.',
          fonte: 'Catálogo Nacional (sem fonte municipal validada até esta data).',
        },
        proveniencia: {
          texto_literal: dispositivosFed.map((d) => ({
            escopo: 'federal',
            lei: d.lei,
            artigo: d.artigo,
            trecho: d.texto_literal,
            url: d.url,
          })),
          sintese_sistema: MENSAGEM_NAO_LOCALIZADO,
          explicacao_ia: 'Modo estático: sem documentos municipais para interpretação.',
          geometria_origem: 'nao_disponivel',
          status_verificacao: 'nao_localizado',
        },
        distincao_ambiental: ehAmbiental ? legislacao.federal.distincao_conceitual ?? null : null,
        checklist_analise: [
          {
            instrumento: 'Plano Diretor Municipal',
            status: 'nao_localizado',
            detalhe: MENSAGEM_NAO_LOCALIZADO,
          },
          {
            instrumento: 'APP (Código Florestal — Lei nº 12.651/2012)',
            status: 'requer_verificacao',
            detalhe: 'Exige conferência hidrográfica e topográfica independentemente de Plano Diretor.',
          },
        ],
        aviso_legal: avisoLegal,
      };
    }

    const attrs = payload.atributos_feicao || {};
    const attrUsos = attrs.usos_admitidos ? String(attrs.usos_admitidos) : null;
    const prefixoModo =
      payload.modo === 'didatico'
        ? '[Modo Didático] '
        : payload.modo === 'prefeitura'
          ? '[Apoio Técnico Municipal] '
          : '[Modo Técnico] ';

    const oQueE = regra
      ? `${prefixoModo}Em ${det.nome}/${det.uf}, ${regra.nome} (${regra.sigla}) é uma classificação do ordenamento territorial prevista em ${regra.lei}.`
      : `${prefixoModo}${dispositivosMun[0]?.texto_literal || det.nome_plano_diretor}`;

    return {
      codigo_ibge: det.codigo_ibge,
      municipio: det.nome,
      uf: det.uf,
      modo: payload.modo,
      zona_consultada: payload.zona_sigla || payload.zona_nome || null,
      situacao_documental: det.situacao,
      aviso_documental: det.aviso_documental ?? null,
      sete_blocos: {
        o_que_e: oQueE,
        por_que_existe:
          regra?.finalidade ||
          dispositivosMun[0]?.texto_literal ||
          'Finalidade detalhada requer consulta ao texto integral da lei municipal.',
        o_que_pode:
          regra?.usos_permitidos ||
          attrUsos ||
          'Consultar quadro de usos permitidos nos anexos da legislação municipal.',
        o_que_depende_de_condicoes:
          regra?.usos_condicionados ||
          'Atividades sujeitas a licenciamento, EIV, notas de rodapé da lei ou parâmetros construtivos específicos.',
        o_que_nao_pode:
          regra?.usos_proibidos ||
          'Atividades incompatíveis com a zona ou incidentes em APP sem autorização legal.',
        fundamentacao: `${det.lei_principal || 'Legislação municipal'}${regra?.artigo ? ` — ${regra.artigo}` : ''}`,
        fonte: det.url_oficial || det.fonte_oficial || 'Catálogo Nacional',
      },
      proveniencia: {
        texto_literal: [...dispositivosMun, ...dispositivosFed].map((d) => ({
          lei: d.lei,
          artigo: d.artigo,
          anexo: d.anexo,
          trecho: d.texto_literal,
          confianca: d.confianca,
          url: d.url,
        })),
        sintese_sistema: 'Síntese fundamentada no repositório local verificado e nas feições carregadas.',
        explicacao_ia: 'Interpretação estruturada gerada a partir da base documental indexada (sem invenção de artigos ou índices).',
        geometria_origem: String(attrs._pd_origem_geometria || det.camadas_gis[0]?.origem_geometria || 'nao_disponivel'),
        status_verificacao: det.situacao,
      },
      distincao_ambiental: ehAmbiental ? legislacao.federal.distincao_conceitual ?? null : null,
      checklist_analise: [
        {
          instrumento: 'Plano Diretor Municipal',
          status: 'disponivel',
          detalhe: det.lei_principal || 'Catalogado',
        },
        {
          instrumento: 'Zoneamento / Camadas GIS',
          status: det.possui_cartografia ? 'disponivel' : 'requer_verificacao',
          detalhe: det.possui_cartografia
            ? `${det.camadas_gis.length} camada(s) integrada(s) no Geoportal`
            : 'Sem camada vetorial catalogada',
        },
        {
          instrumento: 'APP (Código Florestal — Lei nº 12.651/2012)',
          status: 'requer_verificacao',
          detalhe: 'Conferir hidrografia, nascentes e declividade em campo; nunca inferir apenas pela cor.',
        },
      ],
      aviso_legal: avisoLegal,
    };
  },
};
