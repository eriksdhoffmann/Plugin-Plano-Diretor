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

// Fundo cartográfico limpo sem dependências externas de chave API (sem marca d'água)
const BASE_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {},
  layers: [
    {
      id: 'bg-ocean-clean',
      type: 'background',
      paint: { 'background-color': '#eef4fa' },
    },
  ],
};

export function BrazilMap({
  selectedUf,
  estadosStats,
  onSelectUf,
  onSelectMunicipio,
}: BrazilMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
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

    map.on('load', async () => {
      try {
        const geoEstados = await apiClient.obterGeoEstados();
        map.addSource('estados-br', { type: 'geojson', data: geoEstados });

        // Coroplético pelo percentual real de municípios com Plano Diretor (IBGE MUNIC)
        map.addLayer({
          id: 'estados-fill',
          type: 'fill',
          source: 'estados-br',
          paint: {
            'fill-color': [
              'step',
              [
                '/',
                ['coalesce', ['get', 'munic_com_plano'], 0],
                ['max', ['coalesce', ['get', 'municipios_cadastrados'], 1], 1],
              ],
              '#bfdbfe',
              0.35,
              '#6ee7b7',
              0.55,
              '#10b981',
              0.75,
              '#047857',
            ],
            'fill-opacity': 0.82,
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
              ['coalesce', ['get', 'munic_possui_plano'], 'sem_dados'],
              'sim',
              '#059669',
              'em_elaboracao',
              '#d97706',
              'nao',
              '#cbd5e1',
              '#e2e8f0',
            ],
            'fill-opacity': [
              'case',
              ['==', ['get', 'possui_cartografia'], true],
              0.92,
              0.75,
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
              '#0369a1',
              '#475569',
            ],
            'line-width': ['case', ['==', ['get', 'possui_cartografia'], true], 2.2, 0.55],
          },
        });

        map.on('mousemove', 'estados-fill', (e) => {
          map.getCanvas().style.cursor = 'pointer';
          const f = e.features?.[0];
          if (!f?.properties) return;
          const p = f.properties;
          setHoverText(
            `${p.uf_nome || p.uf} (${p.uf}) — ${p.municipios_cadastrados ?? 0} municípios • ${
              p.munic_com_plano ?? 0
            } têm Plano Diretor • ${p.munic_em_elaboracao ?? 0} em elaboração • ${
              p.munic_sem_plano ?? 0
            } não têm`
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
          const statusMunic =
            p.munic_possui_plano === 'sim'
              ? `Tem Plano Diretor (IBGE${p.munic_ano_criacao ? ` • Lei ${p.munic_ano_criacao}` : ''})`
              : p.munic_possui_plano === 'em_elaboracao'
                ? 'Plano Diretor em elaboração (IBGE)'
                : p.munic_possui_plano === 'nao'
                  ? 'Não possui Plano Diretor (IBGE)'
                  : 'Sem resposta na MUNIC 2021';
          setHoverText(
            `${p.nome}/${p.uf} (${p.codigo_ibge}) • ${statusMunic}${
              p.possui_cartografia ? ' • Mapas GIS no Geoportal' : ''
            }`
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

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const src = map.getSource('municipios-uf') as maplibregl.GeoJSONSource | undefined;
    if (!src) return;

    if (!selectedUf) {
      src.setData({ type: 'FeatureCollection', features: [] });
      map.setPaintProperty('estados-fill', 'fill-opacity', 0.82);
      map.flyTo({ center: [-52.5, -14.2], zoom: 3.45, duration: 700 });
      return;
    }

    let cancelled = false;
    apiClient
      .obterGeoMunicipiosUF(selectedUf)
      .then((fc) => {
        if (cancelled) return;
        src.setData(fc);
        map.setPaintProperty('estados-fill', 'fill-opacity', 0.14);
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
    <div className="relative h-full w-full overflow-hidden rounded-xl border border-slate-200 bg-[#eef4fa] shadow-sm">
      <div ref={containerRef} className="h-full w-full" />

      {hoverText && (
        <div className="pointer-events-none absolute top-3 left-3 z-10 max-w-md rounded-lg border border-slate-200 bg-white/95 px-3 py-2 text-xs font-medium text-slate-800 shadow-md backdrop-blur">
          {hoverText}
        </div>
      )}

      <div className="absolute right-3 bottom-7 z-10 rounded-lg border border-slate-200 bg-white/95 p-2.5 text-[11px] shadow-md backdrop-blur">
        <div className="mb-1.5 font-semibold text-slate-700">
          {selectedUf ? `Municípios de ${selectedUf} (IBGE MUNIC)` : 'Cobertura de Planos Diretores (IBGE MUNIC)'}
        </div>
        {selectedUf ? (
          <div className="space-y-1 text-slate-600">
            <div className="flex items-center gap-2">
              <span className="inline-block h-3 w-3 rounded-sm bg-emerald-600" />
              <span>Tem Plano Diretor</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-block h-3 w-3 rounded-sm bg-amber-600" />
              <span>Em elaboração</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-block h-3 w-3 rounded-sm bg-slate-300" />
              <span>Não tem Plano Diretor</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-block h-3 w-3 rounded-sm border-2 border-sky-700 bg-emerald-600" />
              <span>Com mapas GIS integrados</span>
            </div>
          </div>
        ) : (
          <div className="space-y-1 text-slate-600">
            <div className="flex items-center gap-2">
              <span className="inline-block h-3 w-3 rounded-sm bg-emerald-700" />
              <span>&ge; 75% dos municípios têm Plano</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-block h-3 w-3 rounded-sm bg-emerald-500" />
              <span>55% a 74% têm Plano Diretor</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-block h-3 w-3 rounded-sm bg-emerald-300" />
              <span>35% a 54% têm Plano Diretor</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-block h-3 w-3 rounded-sm bg-blue-200" />
              <span>&lt; 35% têm Plano Diretor</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
