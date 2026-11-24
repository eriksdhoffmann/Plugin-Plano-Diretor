import { useEffect, useState } from 'react';
import {
  ArrowRight,
  Building2,
  CheckCircle2,
  Clock,
  FileCheck,
  MapPin,
  Search,
  Layers,
} from 'lucide-react';
import { apiClient } from '../api/client';
import { BrazilMap } from '../mapas/BrazilMap';
import type { EstadoResumo, EstatisticasNacionais, MunicipioResumo } from '../types/domain';
import { formatSituacaoBadge } from '../utils/format';

interface HomeViewProps {
  onSelectMunicipio: (codigoIbge: string) => void;
}

const DESTAQUES_INICIAIS = [
  { codigo_ibge: '4106902', nome: 'Curitiba', uf: 'PR', resumo: 'Lei nº 14.771/2015 + GeoCuritiba GIS' },
  { codigo_ibge: '4209102', nome: 'Joinville', uf: 'SC', resumo: 'PDDS LC nº 620/2022 + SIMGeo 2025' },
  { codigo_ibge: '4201307', nome: 'Araquari', uf: 'SC', resumo: 'LC nº 281/2019 (em verificação)' },
];

export function HomeView({ onSelectMunicipio }: HomeViewProps) {
  const [stats, setStats] = useState<EstatisticasNacionais | null>(null);
  const [estados, setEstados] = useState<EstadoResumo[]>([]);
  const [selectedUf, setSelectedUf] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [apenasComMapa, setApenasComMapa] = useState(false);
  const [municipios, setMunicipios] = useState<MunicipioResumo[]>([]);
  const [totalBusca, setTotalBusca] = useState(0);
  const [loadingBusca, setLoadingBusca] = useState(false);

  useEffect(() => {
    apiClient.obterEstatisticas().then(setStats).catch(console.error);
    apiClient.listarEstados().then(setEstados).catch(console.error);
  }, []);

  useEffect(() => {
    setLoadingBusca(true);
    const timer = setTimeout(() => {
      apiClient
        .buscarMunicipios({
          uf: selectedUf ?? undefined,
          q: query.trim() || undefined,
          com_cartografia: apenasComMapa ? true : undefined,
          limit: 60,
        })
        .then((res) => {
          setMunicipios(res.items);
          setTotalBusca(res.total);
        })
        .catch(console.error)
        .finally(() => setLoadingBusca(false));
    }, 200);

    return () => clearTimeout(timer);
  }, [selectedUf, query, apenasComMapa]);

  const cards = [
    {
      label: 'Municípios cadastrados',
      value: stats ? stats.municipios_cadastrados.toLocaleString('pt-BR') : '—',
      sub: 'Divisão territorial oficial IBGE (7 dígitos)',
      icon: Building2,
      tone: 'text-slate-900',
    },
    {
      label: 'Planos Diretores localizados',
      value: stats ? stats.planos_localizados.toLocaleString('pt-BR') : '—',
      sub: `${stats ? stats.planos_vigentes : 0} vigente(s) verificado(s)`,
      icon: CheckCircle2,
      tone: 'text-emerald-700',
    },
    {
      label: 'Documentos com fonte oficial',
      value: stats ? stats.documentos_fonte_oficial.toLocaleString('pt-BR') : '—',
      sub: 'Prefeituras, Câmaras e portais oficiais',
      icon: FileCheck,
      tone: 'text-sky-700',
    },
    {
      label: 'Municípios com cartografia',
      value: stats ? stats.municipios_com_cartografia.toLocaleString('pt-BR') : '—',
      sub: 'Camadas ArcGIS REST / OGC / Vetoriais',
      icon: Layers,
      tone: 'text-indigo-700',
    },
    {
      label: 'Aguardando verificação / busca',
      value: stats
        ? (
            stats.municipios_aguardando_verificacao + stats.municipios_nao_localizados
          ).toLocaleString('pt-BR')
        : '—',
      sub: stats
        ? `${stats.municipios_aguardando_verificacao} em verificação • ${stats.municipios_nao_localizados.toLocaleString('pt-BR')} sem fonte`
        : 'Contagem real do catálogo',
      icon: Clock,
      tone: 'text-amber-700',
    },
  ];

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Cabeçalho institucional técnico */}
      <header className="border-b border-slate-200 bg-slate-950 text-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-6 sm:px-6">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-sky-500/15 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-sky-300">
              WebGIS • Infraestrutura Nacional Unificada
            </div>
            <h1 className="mt-2 text-2xl font-extrabold tracking-tight sm:text-3xl">
              PLANOS DIRETORES DO BRASIL
            </h1>
            <p className="mt-1 text-sm text-slate-300">
              Explore o planejamento urbano dos municípios brasileiros.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {DESTAQUES_INICIAIS.map((d) => (
              <button
                key={d.codigo_ibge}
                type="button"
                onClick={() => onSelectMunicipio(d.codigo_ibge)}
                className="rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-left transition hover:border-sky-400 hover:bg-white/10"
              >
                <div className="flex items-center gap-1.5 text-xs font-bold text-white">
                  <MapPin className="h-3.5 w-3.5 text-sky-400" />
                  {d.nome} — {d.uf}
                </div>
                <div className="mt-0.5 text-[10px] text-slate-300">{d.resumo}</div>
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6">
        {/* Indicadores reais calculados do catálogo */}
        <section aria-label="Indicadores reais de cobertura" className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {cards.map((card) => {
            const Icon = card.icon;
            return (
              <div
                key={card.label}
                className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-500">{card.label}</span>
                  <Icon className={`h-4 w-4 ${card.tone}`} />
                </div>
                <div className={`mt-2 text-2xl font-extrabold ${card.tone}`}>{card.value}</div>
                <div className="mt-1 text-[11px] text-slate-500">{card.sub}</div>
              </div>
            );
          })}
        </section>

        {/* Mapa interativo + painel de navegação UF/Município */}
        <section className="grid grid-cols-1 gap-5 lg:grid-cols-12">
          <div className="flex flex-col rounded-xl border border-slate-200 bg-white p-4 shadow-2xs lg:col-span-5">
            <h2 className="text-sm font-bold text-slate-900">
              Pesquisar e Selecionar Município (IBGE 7 dígitos)
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Navegue por Estado, nome do município ou código IBGE.
            </p>

            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
              <select
                aria-label="Selecionar Estado"
                value={selectedUf ?? ''}
                onChange={(e) => setSelectedUf(e.target.value || null)}
                className="rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs font-medium text-slate-800 outline-none focus:border-sky-600"
              >
                <option value="">Todos os Estados (27 UFs)</option>
                {estados.map((uf) => (
                  <option key={uf.uf} value={uf.uf}>
                    {uf.uf} — {uf.uf_nome} ({uf.municipios_cadastrados})
                  </option>
                ))}
              </select>

              <div className="relative sm:col-span-2">
                <Search className="pointer-events-none absolute top-2.5 left-2.5 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Nome do município ou código IBGE (ex: 4106902)"
                  className="w-full rounded-lg border border-slate-300 py-2 pr-3 pl-8 text-xs text-slate-900 outline-none focus:border-sky-600"
                />
              </div>
            </div>

            <div className="mt-2.5 flex items-center justify-between text-xs">
              <label className="inline-flex cursor-pointer items-center gap-2 text-slate-700">
                <input
                  type="checkbox"
                  checked={apenasComMapa}
                  onChange={(e) => setApenasComMapa(e.target.checked)}
                  className="rounded border-slate-300 text-sky-700"
                />
                Somente municípios com cartografia disponível
              </label>

              {selectedUf && (
                <button
                  type="button"
                  onClick={() => setSelectedUf(null)}
                  className="font-semibold text-sky-700 hover:underline"
                >
                  Voltar ao Brasil
                </button>
              )}
            </div>

            <div className="mt-3 flex items-center justify-between border-b border-slate-100 pb-2 text-[11px] text-slate-500">
              <span>
                {loadingBusca
                  ? 'Consultando catálogo...'
                  : `${totalBusca.toLocaleString('pt-BR')} município(s) encontrado(s)`}
              </span>
              <span>Exibindo até 60</span>
            </div>

            <div className="mt-2 max-h-[420px] flex-1 space-y-1.5 overflow-y-auto pr-1">
              {municipios.map((m) => {
                const badge = formatSituacaoBadge(m.situacao);
                return (
                  <button
                    key={m.codigo_ibge}
                    type="button"
                    onClick={() => onSelectMunicipio(m.codigo_ibge)}
                    className="group flex w-full items-center justify-between rounded-lg border border-slate-200 bg-white p-2.5 text-left transition hover:border-sky-400 hover:bg-sky-50/40"
                  >
                    <div className="min-w-0 pr-2">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-xs font-bold text-slate-900 group-hover:text-sky-800">
                          {m.nome} — {m.uf}
                        </span>
                        <span className="font-mono text-[10px] text-slate-400">
                          {m.codigo_ibge}
                        </span>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        <span
                          className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${badge.classes}`}
                        >
                          {badge.label}
                        </span>
                        {m.possui_cartografia && (
                          <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-semibold text-indigo-700">
                            Mapas GIS
                          </span>
                        )}
                      </div>
                    </div>
                    <ArrowRight className="h-4 w-4 shrink-0 text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-sky-700" />
                  </button>
                );
              })}
            </div>
          </div>

          <div className="h-[540px] lg:col-span-7 lg:h-[600px]">
            <BrazilMap
              selectedUf={selectedUf}
              estadosStats={estados}
              onSelectUf={(uf) => setSelectedUf(uf)}
              onSelectMunicipio={onSelectMunicipio}
            />
          </div>
        </section>
      </main>
    </div>
  );
}
