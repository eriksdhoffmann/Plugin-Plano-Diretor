import { useEffect, useMemo, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import { Layers, LocateFixed, Map as MapIcon } from 'lucide-react';
import type { CamadaGeoJSONPayload, FeicaoSelecionada } from '../types/domain';

interface MunicipalityMapProps {
  codigoIbge: string;
  limiteGeojson: (GeoJSON.FeatureCollection & { bbox?: number[] }) | null;
  camadasVisiveis: Array<{
    payload: CamadaGeoJSONPayload;
    opacity: number;
  }>;
  flyToCoord?: { lon: number; lat: number; label: string } | null;
  onSelectFeature: (feicao: FeicaoSelecionada | null) => void;
}

type BasemapKind = 'claro' | 'osm' | 'satelite';

const BASEMAPS: Record<BasemapKind, { label: string; tiles: string[]; attribution: string }> = {
  claro: {
    label: 'Mapa Claro',
    tiles: ['https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png'],
    attribution: '© OpenStreetMap • © CARTO',
  },
  osm: {
    label: 'OpenStreetMap',
    tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
    attribution: '© OpenStreetMap contributors',
  },
  satelite: {
    label: 'Satélite (Esri)',
    tiles: [
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    ],
    attribution: '© Esri World Imagery',
  },
};

export function MunicipalityMap({
  codigoIbge,
  limiteGeojson,
  camadasVisiveis,
  flyToCoord,
  onSelectFeature,
}: MunicipalityMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [basemap, setBasemap] = useState<BasemapKind>('claro');
  const [hoverInfo, setHoverInfo] = useState<string | null>(null);

  const layerIdsRef = useRef<string[]>([]);
  const payloadLookupRef = useRef<Record<string, CamadaGeoJSONPayload>>({});

  useEffect(() => {
    const m: Record<string, CamadaGeoJSONPayload> = {};
    for (const item of camadasVisiveis) {
      m[item.payload.camada.id] = item.payload;
    }
    payloadLookupRef.current = m;
  }, [camadasVisiveis]);

  const initialStyle = useMemo<maplibregl.StyleSpecification>(
    () => ({
      version: 8,
      sources: {
        basemap: {
          type: 'raster',
          tiles: BASEMAPS.claro.tiles,
          tileSize: 256,
          attribution: BASEMAPS.claro.attribution,
        },
      },
      layers: [{ id: 'basemap-layer', type: 'raster', source: 'basemap' }],
    }),
    []
  );

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: initialStyle,
      center: [-49.27, -25.43],
      zoom: 11,
      attributionControl: { compact: true },
    });
    map.addControl(new maplibregl.NavigationControl(), 'top-right');
    map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left');

    map.on('load', () => {
      map.addSource('mun-limite', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
      map.addLayer({
        id: 'mun-limite-line',
        type: 'line',
        source: 'mun-limite',
        paint: {
          'line-color': '#0f172a',
          'line-width': 2.2,
          'line-dasharray': [4, 2],
        },
      });
      setMapReady(true);
    });

    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      setMapReady(false);
    };
  }, [initialStyle]);

  // Troca basemap sem recriar camadas vetoriais
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const src = map.getSource('basemap') as maplibregl.RasterTileSource | undefined;
    if (src && typeof src.setTiles === 'function') {
      src.setTiles(BASEMAPS[basemap].tiles);
    }
  }, [basemap, mapReady]);

  // Atualiza contorno municipal e aplica zoom inicial
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !limiteGeojson) return;
    const src = map.getSource('mun-limite') as maplibregl.GeoJSONSource | undefined;
    if (!src) return;
    src.setData(limiteGeojson);
    if (limiteGeojson.bbox && limiteGeojson.bbox.length === 4) {
      map.fitBounds(
        [
          [limiteGeojson.bbox[0], limiteGeojson.bbox[1]],
          [limiteGeojson.bbox[2], limiteGeojson.bbox[3]],
        ],
        { padding: 32, duration: 750 }
      );
    }
  }, [limiteGeojson, mapReady, codigoIbge]);

  // Sincroniza camadas de zoneamento / ambientais visíveis
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    // Remove camadas anteriores controladas
    for (const lid of layerIdsRef.current) {
      if (map.getLayer(`${lid}-fill`)) map.removeLayer(`${lid}-fill`);
      if (map.getLayer(`${lid}-line`)) map.removeLayer(`${lid}-line`);
      if (map.getSource(lid)) map.removeSource(lid);
    }
    layerIdsRef.current = [];

    for (const item of camadasVisiveis) {
      const { payload, opacity } = item;
      const lid = payload.camada.id;
      if (!payload.geojson?.features?.length) continue;

      map.addSource(lid, { type: 'geojson', data: payload.geojson });

      const fillId = `${lid}-fill`;
      const lineId = `${lid}-line`;
      const beforeId = map.getLayer('mun-limite-line') ? 'mun-limite-line' : undefined;

      map.addLayer(
        {
          id: fillId,
          type: 'fill',
          source: lid,
          paint: {
            'fill-color': ['coalesce', ['get', '_pd_cor'], '#3b82f6'],
            'fill-opacity': opacity,
          },
        },
        beforeId
      );

      map.addLayer(
        {
          id: lineId,
          type: 'line',
          source: lid,
          paint: {
            'line-color': payload.camada.categoria === 'ambiental' ? '#064e3b' : '#1e293b',
            'line-width': payload.camada.categoria === 'ambiental' ? 1.4 : 0.7,
            'line-opacity': Math.min(1, opacity + 0.25),
          },
        },
        beforeId
      );

      map.on('mousemove', fillId, (e) => {
        map.getCanvas().style.cursor = 'pointer';
        const props = e.features?.[0]?.properties;
        if (props) {
          setHoverInfo(`${props._pd_sigla || ''} — ${props._pd_nome || payload.camada.nome}`);
        }
      });

      map.on('mouseleave', fillId, () => {
        map.getCanvas().style.cursor = '';
        setHoverInfo(null);
      });

      map.on('click', fillId, (e) => {
        const feat = e.features?.[0];
        if (!feat?.properties) return;
        const meta = payloadLookupRef.current[lid]?.camada ?? payload.camada;
        onSelectFeature({
          camadaId: meta.id,
          camadaNome: meta.nome,
          categoria: meta.categoria,
          origemGeometria: meta.origem_geometria,
          fonteOficial: meta.fonte_oficial,
          dataVerificacao: meta.data_verificacao,
          properties: { ...feat.properties },
        });
      });

      layerIdsRef.current.push(lid);
    }
  }, [camadasVisiveis, mapReady, onSelectFeature]);

  // FlyTo para busca de endereço
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !flyToCoord) return;
    if (markerRef.current) markerRef.current.remove();
    markerRef.current = new maplibregl.Marker({ color: '#dc2626' })
      .setLngLat([flyToCoord.lon, flyToCoord.lat])
      .setPopup(new maplibregl.Popup().setText(flyToCoord.label))
      .addTo(map);
    map.flyTo({ center: [flyToCoord.lon, flyToCoord.lat], zoom: 15, duration: 900 });
  }, [flyToCoord, mapReady]);

  const handleZoomMunicipio = () => {
    const map = mapRef.current;
    if (!map || !limiteGeojson?.bbox || limiteGeojson.bbox.length !== 4) return;
    map.fitBounds(
      [
        [limiteGeojson.bbox[0], limiteGeojson.bbox[1]],
        [limiteGeojson.bbox[2], limiteGeojson.bbox[3]],
      ],
      { padding: 32, duration: 600 }
    );
  };

  return (
    <div className="relative h-full w-full bg-slate-100">
      <div ref={containerRef} className="h-full w-full" />

      {/* Barra superior esquerda de controles cartográficos */}
      <div className="absolute top-3 left-3 z-10 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white/95 p-1 shadow-md backdrop-blur">
          <MapIcon className="ml-1.5 h-3.5 w-3.5 text-slate-500" />
          {(Object.keys(BASEMAPS) as BasemapKind[]).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setBasemap(key)}
              className={`rounded-md px-2 py-1 text-xs font-medium transition ${
                basemap === key
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              {BASEMAPS[key].label}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={handleZoomMunicipio}
          title="Centralizar no território municipal"
          className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white/95 px-2.5 py-1.5 text-xs font-medium text-slate-700 shadow-md backdrop-blur hover:bg-slate-50"
        >
          <LocateFixed className="h-3.5 w-3.5 text-sky-700" />
          Enquadrar Município
        </button>
      </div>

      {hoverInfo && (
        <div className="pointer-events-none absolute bottom-10 left-3 z-10 rounded-lg border border-slate-200 bg-white/95 px-3 py-1.5 text-xs font-semibold text-slate-800 shadow-md backdrop-blur">
          {hoverInfo} <span className="font-normal text-slate-500">• Clique para inspecionar</span>
        </div>
      )}

      {camadasVisiveis.length === 0 && (
        <div className="pointer-events-none absolute bottom-10 right-3 z-10 flex items-center gap-2 rounded-lg border border-slate-200 bg-white/90 px-3 py-2 text-xs text-slate-600 shadow">
          <Layers className="h-4 w-4 text-slate-400" />
          <span>Exibindo limite oficial IBGE. Ative camadas disponíveis no painel esquerdo.</span>
        </div>
      )}
    </div>
  );
}
