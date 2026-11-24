import { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import type { EstadoResumo } from '../types/domain';
import { apiClient } from '../api/client';

interface BrazilMapProps {
  selectedUf: string | null;
  estadosStats: EstadoResumo[];
  onSelectUf: (uf: string) => void;
  onSelectMunicipio: (codigoIbge: string) => void;
}

const BASE_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    osm: {
      type: 'raster',
      tiles: ['https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png'],
      tileSize: 256,
      attribution: '© OpenStreetMap • © CARTO • Malhas: IBGE',
    },
  },
  layers: [{ id: 'base-carto', type: 'raster', source: 'osm' }],
};

export function BrazilMap({
  selectedUf,
  estadosStats,
  onSelectUf,
  onSelectMunicipio,
}: BrazilMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const popupRef = useRef<maplibregl.Popup | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [hoverText, setHoverText] = useState<string | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: BASE_STYLE,
      center: [-52.5, -14.2],
      zoom: 3.45,
      attributionControl: { compact: true },
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left');

    popupRef.current = new maplibregl.Popup({ closeButton: false, closeOnClick: false });

    map.on('load', async () => {
      try {
        const geoEstados = await apiClient.obterGeoEstados();
        map.addSource('estados-br', { type: 'geojson', data: geoEstados });

        map.addLayer({
          id: 'estados-fill',
          type: 'fill',
          source: 'estados-br',
          paint: {
            'fill-color': [
              'case',
              ['>', ['coalesce', ['get', 'municipios_com_cartografia'], 0], 0],
              '#0284c7',
              ['>', ['coalesce', ['get', 'planos_localizados'], 0], 0],
              '#10b981',
              '#cbd5e1',
            ],
            'fill-opacity': 0.55,
          },
        });

        map.addLayer({
          id: 'estados-line',
          type: 'line',
          source: 'estados-br',
          paint: {
            'line-color': '#1e293b',
            'line-width': 1.1,
          },
        });

        map.addSource('municipios-uf', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] },
        });

        map.addLayer({
          id: 'municipios-uf-fill',
          type: 'fill',
          source: 'municipios-uf',
          paint: {
            'fill-color': [
              'match',
              ['get', 'situacao'],
              'vigente',
              '#059669',
              'localizado_em_verificacao',
              '#d97706',
              'desatualizado_ou_substituido',
              '#0284c7',
              '#e2e8f0',
            ],
            'fill-opacity': [
              'case',
              ['==', ['get', 'possui_cartografia'], true],
              0.78,
              0.42,
            ],
          },
        });

        map.addLayer({
          id: 'municipios-uf-line',
          type: 'line',
          source: 'municipios-uf',
          paint: {
            'line-color': [
              'case',
              ['==', ['get', 'possui_cartografia'], true],
              '#0f172a',
              '#64748b',
            ],
            'line-width': ['case', ['==', ['get', 'possui_cartografia'], true], 1.6, 0.5],
          },
        });

        map.on('mousemove', 'estados-fill', (e) => {
          map.getCanvas().style.cursor = 'pointer';
          const f = e.features?.[0];
          if (!f?.properties) return;
          const p = f.properties;
          setHoverText(
            `${p.uf_nome || p.uf} (${p.uf}) — ${p.municipios_cadastrados ?? 0} municípios • ${
              p.planos_localizados ?? 0
            } planos localizados • ${p.municipios_com_cartografia ?? 0} com cartografia`
          );
        });
        map.on('mouseleave', 'estados-fill', () => {
          map.getCanvas().style.cursor = '';
          setHoverText(null);
        });

        map.on('mousemove', 'municipios-uf-fill', (e) => {
          map.getCanvas().style.cursor = 'pointer';
          const f = e.features?.[0];
          if (!f?.properties) return;
          const p = f.properties;
          setHoverText(
            `${p.nome}/${p.uf} (IBGE ${p.codigo_ibge}) • ${
              p.lei_principal ? p.lei_principal : 'Plano Diretor não localizado nas fontes'
            }${p.possui_cartografia ? ' • Cartografia oficial disponível' : ''}`
          );
        });
        map.on('mouseleave', 'municipios-uf-fill', () => {
          map.getCanvas().style.cursor = '';
          setHoverText(null);
        });

        map.on('click', 'municipios-uf-fill', (e) => {
          const cod = e.features?.[0]?.properties?.codigo_ibge;
          if (cod) {
            onSelectMunicipio(String(cod));
          }
        });

        map.on('click', 'estados-fill', (e) => {
          // Se já estamos vendo os municípios da UF selecionada, o clique no município acima tem precedência
          const muniHits = map.queryRenderedFeatures(e.point, { layers: ['municipios-uf-fill'] });
          if (muniHits.length > 0) return;
          const uf = e.features?.[0]?.properties?.uf;
          if (uf) onSelectUf(String(uf));
        });

        setMapReady(true);
      } catch (err) {
        console.error('Erro ao inicializar mapa nacional:', err);
      }
    });

    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Carrega malha municipal e aplica zoom quando uma UF é selecionada
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const src = map.getSource('municipios-uf') as maplibregl.GeoJSONSource | undefined;
    if (!src) return;

    if (!selectedUf) {
      src.setData({ type: 'FeatureCollection', features: [] });
      map.setPaintProperty('estados-fill', 'fill-opacity', 0.55);
      map.flyTo({ center: [-52.5, -14.2], zoom: 3.45, duration: 700 });
      return;
    }

    let cancelled = false;
    apiClient
      .obterGeoMunicipiosUF(selectedUf)
      .then((fc) => {
        if (cancelled) return;
        src.setData(fc);
        map.setPaintProperty('estados-fill', 'fill-opacity', 0.15);
        if (fc.bbox && fc.bbox.length === 4) {
          map.fitBounds(
            [
              [fc.bbox[0], fc.bbox[1]],
              [fc.bbox[2], fc.bbox[3]],
            ],
            { padding: 36, duration: 800 }
          );
        }
      })
      .catch((err) => console.error('Falha ao carregar municípios da UF:', err));

    return () => {
      cancelled = true;
    };
  }, [selectedUf, mapReady, estadosStats]);

  return (
    <div className="relative h-full w-full overflow-hidden rounded-xl border border-slate-200 bg-slate-100 shadow-sm">
      <div ref={containerRef} className="h-full w-full" />

      {/* Tooltip informativo fixo no topo esquerdo do mapa */}
      {hoverText && (
        <div className="pointer-events-none absolute top-3 left-3 z-10 max-w-md rounded-lg border border-slate-200 bg-white/95 px-3 py-2 text-xs font-medium text-slate-800 shadow-md backdrop-blur">
          {hoverText}
        </div>
      )}

      {/* Legenda cartográfica nacional */}
      <div className="absolute right-3 bottom-7 z-10 rounded-lg border border-slate-200 bg-white/95 p-2.5 text-[11px] shadow-md backdrop-blur">
        <div className="mb-1.5 font-semibold text-slate-700">
          {selectedUf ? `Cobertura em ${selectedUf}` : 'Cobertura Nacional por UF'}
        </div>
        {selectedUf ? (
          <div className="space-y-1 text-slate-600">
            <div className="flex items-center gap-2">
              <span className="inline-block h-3 w-3 rounded-sm bg-emerald-600" />
              <span>Plano Diretor Vigente</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-block h-3 w-3 rounded-sm bg-amber-600" />
              <span>Localizado — Em Verificação</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-block h-3 w-3 rounded-sm border border-slate-400 bg-slate-200" />
              <span>Não localizado nas fontes</span>
            </div>
          </div>
        ) : (
          <div className="space-y-1 text-slate-600">
            <div className="flex items-center gap-2">
              <span className="inline-block h-3 w-3 rounded-sm bg-sky-600" />
              <span>UF com Cartografia GIS catalogada</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-block h-3 w-3 rounded-sm bg-emerald-500" />
              <span>UF com Planos localizados</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-block h-3 w-3 rounded-sm bg-slate-300" />
              <span>Aguardando catalogação de planos</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
