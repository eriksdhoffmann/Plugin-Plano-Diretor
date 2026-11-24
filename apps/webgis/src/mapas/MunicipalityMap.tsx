import { useEffect, useMemo, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import {
  Globe2,
  Home,
  Layers,
  Maximize2,
  Minus,
  Plus,
} from 'lucide-react';
import type { CamadaGeoJSONPayload, FeicaoSelecionada } from '../types/domain';

export type GeoportalBasemap = 'branco' | 'claro' | 'osm' | 'satelite';

interface MunicipalityMapProps {
  codigoIbge: string;
  limiteGeojson: (GeoJSON.FeatureCollection & { bbox?: number[] }) | null;
  camadasVisiveis: Array<{
    payload: CamadaGeoJSONPayload;
    opacity: number;
  }>;
  flyToCoord?: { lon: number; lat: number; label: string } | null;
  basemap: GeoportalBasemap;
  onChangeBasemap: (b: GeoportalBasemap) => void;
  onBackBrasil?: () => void;
  onToggleRightPanel?: () => void;
  onSelectFeature: (feicao: FeicaoSelecionada | null) => void;
}

const BASEMAPS: Record<GeoportalBasemap, { label: string; tiles: string[]; attribution: string }> = {
  branco: {
    label: 'Fundo Cartográfico Limpo',
    tiles: [],
    attribution: 'Malhas: IBGE • Cartografia Temática',
  },
  claro: {
    label: 'Mapa Urbano (OSM)',
    tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
    attribution: '© OpenStreetMap contributors',
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
  basemap,
  onChangeBasemap,
  onBackBrasil,
  onToggleRightPanel,
  onSelectFeature,
}: MunicipalityMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [hoverInfo, setHoverInfo] = useState<string | null>(null);
  const [cursorInfo, setCursorInfo] = useState<{
    lat: number;
    lon: number;
    escala: number;
  }>({ lat: -26.37, lon: -48.72, escala: 250000 });

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
          tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
          tileSize: 256,
          attribution: '© OpenStreetMap • IBGE',
        },
      },
      layers: [
        {
          id: 'bg-clean',
          type: 'background',
          paint: { 'background-color': '#ffffff' },
        },
        {
          id: 'basemap-layer',
          type: 'raster',
          source: 'basemap',
          layout: { visibility: basemap === 'branco' ? 'none' : 'visible' },
        },
      ],
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const atualizarEscala = (map: maplibregl.Map, lat: number) => {
    const zoom = map.getZoom();
    const metersPerPixel = (156543.03392 * Math.cos((lat * Math.PI) / 180)) / Math.pow(2, zoom);
    const escala = Math.max(500, Math.round((metersPerPixel / 0.00028) / 100) * 100);
    setCursorInfo((prev) => ({ ...prev, escala }));
  };

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: initialStyle,
      center: [-48.72, -26.37],
      zoom: 11,
      attributionControl: { compact: true },
    });
    map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left');

    map.on('load', () => {
      map.addSource('mun-limite', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
      map.addLayer({
        id: 'mun-limite-fill',
        type: 'fill',
        source: 'mun-limite',
        paint: {
          'fill-color': '#fef9c3',
          'fill-opacity': 0.28,
        },
      });
      map.addLayer({
        id: 'mun-limite-line',
        type: 'line',
        source: 'mun-limite',
        paint: {
          'line-color': '#0f172a',
          'line-width': 2.0,
        },
      });
      setMapReady(true);
      atualizarEscala(map, map.getCenter().lat);
    });

    map.on('mousemove', (e) => {
      setCursorInfo((prev) => ({
        ...prev,
        lat: e.lngLat.lat,
        lon: e.lngLat.lng,
      }));
    });
    map.on('zoomend', () => {
      atualizarEscala(map, map.getCenter().lat);
    });

    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      setMapReady(false);
    };
  }, [initialStyle]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    if (basemap === 'branco') {
      if (map.getLayer('basemap-layer')) {
        map.setLayoutProperty('basemap-layer', 'visibility', 'none');
      }
      return;
    }
    const src = map.getSource('basemap') as maplibregl.RasterTileSource | undefined;
    if (src && typeof src.setTiles === 'function') {
      src.setTiles(BASEMAPS[basemap].tiles);
    }
    if (map.getLayer('basemap-layer')) {
      map.setLayoutProperty('basemap-layer', 'visibility', 'visible');
    }
  }, [basemap, mapReady]);

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
        { padding: 48, duration: 700 }
      );
    }
  }, [limiteGeojson, mapReady, codigoIbge]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

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

      const isLineLayer = payload.geojson.features.some(
        (f) => f.geometry?.type === 'LineString' || f.geometry?.type === 'MultiLineString'
      );

      map.addSource(lid, { type: 'geojson', data: payload.geojson });

      const fillId = `${lid}-fill`;
      const lineId = `${lid}-line`;
      const beforeId = map.getLayer('mun-limite-line') ? 'mun-limite-line' : undefined;

      if (!isLineLayer) {
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
      }

      map.addLayer(
        {
          id: lineId,
          type: 'line',
          source: lid,
          paint: {
            'line-color': isLineLayer
              ? ['coalesce', ['get', '_pd_cor'], '#b45309']
              : payload.camada.categoria === 'ambiental'
                ? '#065f46'
                : '#1e293b',
            'line-width': isLineLayer ? 2.4 : payload.camada.categoria === 'ambiental' ? 1.4 : 0.85,
            'line-opacity': Math.min(1, opacity + 0.25),
          },
        },
        beforeId
      );

      const hitLayer = isLineLayer ? lineId : fillId;
      map.on('mousemove', hitLayer, (e) => {
        map.getCanvas().style.cursor = 'pointer';
        const props = e.features?.[0]?.properties;
        if (props) {
          setHoverInfo(`${props._pd_sigla || ''} — ${props._pd_nome || payload.camada.nome}`);
        }
      });

      map.on('mouseleave', hitLayer, () => {
        map.getCanvas().style.cursor = '';
        setHoverInfo(null);
      });

      map.on('click', hitLayer, (e) => {
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
      { padding: 48, duration: 600 }
    );
  };

  const toggleFullscreen = () => {
    const el = containerRef.current?.parentElement;
    if (!el) return;
    if (!document.fullscreenElement) {
      el.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
  };

  const cycleBasemap = () => {
    const order: GeoportalBasemap[] = ['claro', 'branco', 'osm', 'satelite'];
    const idx = order.indexOf(basemap);
    onChangeBasemap(order[(idx + 1) % order.length]);
  };

  return (
    <div className="relative h-full w-full bg-white">
      <div ref={containerRef} className="h-full w-full" />

      {/* Barra vertical esquerda flutuante estilo Geoportal Itajaí / Araquari */}
      <div className="absolute bottom-14 left-3 z-10 flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white/95 shadow-lg backdrop-blur">
        {onBackBrasil && (
          <button
            type="button"
            onClick={onBackBrasil}
            title="Voltar ao mapa do Brasil"
            className="border-b border-slate-100 p-2 text-slate-700 hover:bg-slate-100"
          >
            <Globe2 className="h-4 w-4" />
          </button>
        )}
        <button
          type="button"
          onClick={() => mapRef.current?.zoomIn()}
          title="Aproximar"
          className="border-b border-slate-100 p-2 text-slate-700 hover:bg-slate-100"
        >
          <Plus className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => mapRef.current?.zoomOut()}
          title="Afastar"
          className="border-b border-slate-100 p-2 text-slate-700 hover:bg-slate-100"
        >
          <Minus className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={handleZoomMunicipio}
          title="Enquadrar município"
          className="border-b border-slate-100 p-2 text-sky-700 hover:bg-sky-50"
        >
          <Home className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={cycleBasemap}
          title={`Alternar mapa base (atual: ${BASEMAPS[basemap].label})`}
          className="border-b border-slate-100 p-2 text-slate-700 hover:bg-slate-100"
        >
          <Layers className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={toggleFullscreen}
          title="Tela cheia"
          className="p-2 text-slate-700 hover:bg-slate-100"
        >
          <Maximize2 className="h-4 w-4" />
        </button>
      </div>

      {/* Tooltip hover */}
      {hoverInfo && (
        <div className="pointer-events-none absolute bottom-14 left-16 z-10 max-w-sm rounded-lg border border-slate-200 bg-white/95 px-3 py-1.5 text-xs font-semibold text-slate-800 shadow-md backdrop-blur">
          {hoverInfo}{' '}
          <span className="font-normal text-slate-500">• Clique para interpretar</span>
        </div>
      )}

      {/* Barra escura inferior estilo Geoportal (Coordenadas + Basemap + Escala) */}
      <div className="pointer-events-auto absolute bottom-2 left-1/2 z-10 flex -translate-x-1/2 items-center gap-3 rounded-lg bg-slate-900/90 px-3 py-1.5 font-mono text-[11px] text-slate-100 shadow-lg backdrop-blur">
        <span>
          {cursorInfo.lat.toFixed(5)}, {cursorInfo.lon.toFixed(5)}
        </span>
        <span className="text-slate-500">|</span>
        <span className="hidden sm:inline">{BASEMAPS[basemap].label}</span>
        <span className="hidden text-slate-500 sm:inline">|</span>
        <span>1 : {cursorInfo.escala.toLocaleString('pt-BR')}</span>
        {onToggleRightPanel && (
          <>
            <span className="text-slate-500 sm:hidden">|</span>
            <button
              type="button"
              onClick={onToggleRightPanel}
              className="font-sans text-[11px] font-semibold text-sky-300 sm:hidden"
            >
              Camadas
            </button>
          </>
        )}
      </div>
    </div>
  );
}
