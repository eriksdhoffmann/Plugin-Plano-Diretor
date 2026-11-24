import { useEffect, useState } from 'react';
import {
  ArrowRight,
  BookOpen,
  Building2,
  CheckCircle2,
  Clock,
  Download,
  Layers,
  MapPin,
  Search,
  XCircle,
} from 'lucide-react';
import { apiClient } from '../api/client';
import { BrazilMap } from '../mapas/BrazilMap';
import type { EstadoResumo, EstatisticasNacionais, MunicipioResumo } from '../types/domain';
import { PlanoDiretorGuideModal } from './PlanoDiretorGuideModal';

interface HomeViewProps {
  onSelectMunicipio: (codigoIbge: string) => void;
}

const DESTAQUES_INICIAIS = [
  {
    codigo_ibge: '4201307',
    nome: 'Araquari',
    uf: 'SC',
    resumo: 'LC nº 281/2019 • Zoneamento, Macrozoneamento, Viário e APPs',
  },
  {
    codigo_ibge: '4106902',
    nome: 'Curitiba',
    uf: 'PR',
    resumo: 'Lei nº 14.771/2015 • GeoCuritiba & SEUC',
  },
  {
    codigo_ibge: '4209102',
    nome: 'Joinville',
    uf: 'SC',
    resumo: 'PDDS LC nº 620/2022 • SIMGeo & Cota 40',
  },
];

type FiltroMunic = 'todos' | 'sim' | 'em_elaboracao' | 'nao' | 'com_mapa';

export function HomeView({ onSelectMunicipio }: HomeViewProps) {
  const [stats, setStats] = useState<EstatisticasNacionais | null>(null);
  const [estados, setEstados] = useState<EstadoResumo[]>([]);
  const [selectedUf, setSelectedUf] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [filtroMunic, setFiltroMunic] = useState<FiltroMunic>('todos');
  const [municipios, setMunicipios] = useState<MunicipioResumo[]>([]);
  const [totalBusca, setTotalBusca] = useState(0);
  const [loadingBusca, setLoadingBusca] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [exportandoCsv, setExportandoCsv] = useState(false);

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
          munic_status:
            filtroMunic === 'sim' || filtroMunic === 'em_elaboracao' || filtroMunic === 'nao'
              ? filtroMunic
              : undefined,
          com_cartografia: filtroMunic === 'com_mapa' ? true : undefined,
          limit: 60,
        })
        .then((res) => {
          setMunicipios(res.items);
          setTotalBusca(res.total);
        })
        .catch(console.error)
        .finally(() => setLoadingBusca(false));
    }, 180);

    return () => clearTimeout(timer);
  }, [selectedUf, query, filtroMunic]);

  const handleExportarCsv = async () => {
    setExportandoCsv(true);
    try {
      const res = await apiClient.buscarMunicipios({
        uf: selectedUf ?? undefined,
        q: query.trim() || undefined,
        munic_status:
          filtroMunic === 'sim' || filtroMunic === 'em_elaboracao' || filtroMunic === 'nao'
            ? filtroMunic
            : undefined,
        com_cartografia: filtroMunic === 'com_mapa' ? true : undefined,
        limit: 6000,
      });
      const header = [
        'codigo_ibge',
        'municipio',
        'uf',
        'regiao',
        'possui_plano_diretor_ibge_munic',
        'ano_lei_ibge',
        'ano_revisao_ibge',
        'lei_catalogada',
        'possui_mapas_gis',
      ].join(';');
      const lines = res.items.map((m) =>
        [
          m.codigo_ibge,
          `"${m.nome.replace(/"/g, '""')}"`,
          m.uf,
          `"${m.regiao}"`,
          m.munic_possui_plano || 'sem_dados',
          m.munic_ano_criacao ?? '',
          m.munic_ano_revisao ?? '',
          `"${(m.lei_principal || '').replace(/"/g, '""')}"`,
          m.possui_cartografia ? 'Sim' : 'Não',
        ].join(';')
      );
      const csv = '\ufeff' + [header, ...lines].join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `planos_diretores_brasil_${selectedUf || 'nacional'}_${filtroMunic}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExportandoCsv(false);
    }
  };

  const cards = [
    {
      label: 'Municípios no Brasil',
      value: stats ? stats.municipios_cadastrados.toLocaleString('pt-BR') : '—',
      sub: 'Divisão oficial IBGE (7 dígitos)',
      icon: Building2,
      tone: 'text-slate-900',
    },
    {
      label: 'Têm Plano Diretor (IBGE)',
      value: stats ? (stats.munic_com_plano ?? 0).toLocaleString('pt-BR') : '—',
      sub: 'Pesquisa IBGE MUNIC 2021 (com ano da lei)',
      icon: CheckCircle2,
      tone: 'text-emerald-700',
    },
    {
      label: 'Em Elaboração (IBGE)',
      value: stats ? (stats.munic_em_elaboracao ?? 0).toLocaleString('pt-BR') : '—',
      sub: 'Elaborando Plano Diretor segundo IBGE',
      icon: Clock,
      tone: 'text-amber-700',
    },
    {
      label: 'Não Têm Plano Diretor',
      value: stats ? (stats.munic_sem_plano ?? 0).toLocaleString('pt-BR') : '—',
      sub: 'Sem Plano Diretor na MUNIC 2021',
      icon: XCircle,
      tone: 'text-slate-600',
    },
    {
      label: 'Mapas GIS no Geoportal',
      value: stats ? stats.municipios_com_cartografia.toLocaleString('pt-BR') : '—',
      sub: 'Camadas de zoneamento integradas ao vivo',
      icon: Layers,
      tone: 'text-sky-700',
    },
  ];

  const renderMunicBadge = (m: MunicipioResumo) => {
    if (m.munic_possui_plano === 'sim') {
      return (
        <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-800">
          Tem Plano Diretor (IBGE{m.munic_ano_criacao ? ` • ${m.munic_ano_criacao}` : ''})
        </span>
      );
    }
    if (m.munic_possui_plano === 'em_elaboracao') {
      return (
        <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
          Em Elaboração (IBGE MUNIC)
        </span>
      );
    }
    if (m.munic_possui_plano === 'nao') {
      return (
        <span className="rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">
          Não Possui Plano Diretor (IBGE)
        </span>
      );
    }
    return (
      <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] text-slate-500">
        Sem resposta na MUNIC 2021
      </span>
    );
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white shadow-2xs">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-3.5 sm:px-6">
          <div className="flex items-center gap-3">
            <svg className="h-10 w-10 shrink-0" viewBox="0 0 46 50" fill="none">
              <defs>
                <linearGradient id="homePinB" x1="6" y1="4" x2="40" y2="38" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stopColor="#1473db" />
                  <stop offset="100%" stopColor="#033c8e" />
                </linearGradient>
                <linearGradient id="homePinG" x1="13" y1="32" x2="33" y2="48" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stopColor="#10b981" />
                  <stop offset="100%" stopColor="#047857" />
                </linearGradient>
              </defs>
              <path d="M12.5 32.5L23 47.5L33.5 32.5H12.5Z" fill="url(#homePinG)" />
              <circle cx="23" cy="20.5" r="17.5" fill="url(#homePinB)" />
              <circle cx="23" cy="20.5" r="9.4" fill="#ffffff" />
              <circle cx="23" cy="20.5" r="3.2" fill="#f59e0b" />
            </svg>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-black tracking-tight text-sky-900">GEO</span>
                <span className="rounded bg-sky-700 px-1.5 py-0.5 text-[10px] font-bold text-white">
                  PORTAL
                </span>
                <span className="text-sm font-black tracking-tight text-slate-900">
                  PLANOS DIRETORES DO BRASIL
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Base nacional oficial (IBGE MUNIC) + mapas e interpretação didática de Planos Diretores.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleExportarCsv}
              disabled={exportandoCsv}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
            >
              <Download className="h-4 w-4 text-emerald-700" />
              {exportandoCsv ? 'Gerando CSV...' : 'Baixar Base CSV (5.571)'}
            </button>
            <button
              type="button"
              onClick={() => setGuideOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-bold text-sky-900 hover:bg-sky-100"
            >
              <BookOpen className="h-4 w-4 text-sky-700" />
              Entender o Plano Diretor
            </button>
            <button
              type="button"
              onClick={() => onSelectMunicipio('4201307')}
              className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-xs font-bold text-white hover:bg-slate-800"
            >
              Abrir Geoportal (Araquari)
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-5 px-4 py-5 sm:px-6">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {DESTAQUES_INICIAIS.map((d) => (
            <button
              key={d.codigo_ibge}
              type="button"
              onClick={() => onSelectMunicipio(d.codigo_ibge)}
              className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-3.5 text-left shadow-2xs transition hover:border-sky-400 hover:bg-sky-50/30"
            >
              <div>
                <div className="flex items-center gap-1.5 text-xs font-extrabold text-slate-900">
                  <MapPin className="h-3.5 w-3.5 text-sky-700" />
                  {d.nome} — {d.uf}
                  <span className="font-mono text-[10px] font-normal text-slate-400">
                    ({d.codigo_ibge})
                  </span>
                </div>
                <div className="mt-1 text-[11px] text-slate-600">{d.resumo}</div>
              </div>
              <ArrowRight className="h-4 w-4 shrink-0 text-sky-700" />
            </button>
          ))}
        </div>

        <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
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

        <section className="grid grid-cols-1 gap-5 lg:grid-cols-12">
          <div className="flex flex-col rounded-xl border border-slate-200 bg-white p-4 shadow-2xs lg:col-span-5">
            <h2 className="text-sm font-bold text-slate-900">
              Catálogo Nacional: Municípios Com e Sem Plano Diretor
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Fonte oficial: IBGE MUNIC 2021 + portais municipais integrados.
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
                    {uf.uf} — {uf.uf_nome} ({uf.munic_com_plano ?? 0}/{uf.municipios_cadastrados})
                  </option>
                ))}
              </select>

              <div className="relative sm:col-span-2">
                <Search className="pointer-events-none absolute top-2.5 left-2.5 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Nome do município ou código IBGE (ex: 4201307)"
                  className="w-full rounded-lg border border-slate-300 py-2 pr-3 pl-8 text-xs text-slate-900 outline-none focus:border-sky-600"
                />
              </div>
            </div>

            {/* Filtros por situação oficial do Plano Diretor */}
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {[
                { id: 'todos', label: 'Todos' },
                { id: 'sim', label: 'Têm Plano Diretor' },
                { id: 'em_elaboracao', label: 'Em Elaboração' },
                { id: 'nao', label: 'Não Têm' },
                { id: 'com_mapa', label: 'Com Mapas GIS' },
              ].map((btn) => (
                <button
                  key={btn.id}
                  type="button"
                  onClick={() => setFiltroMunic(btn.id as FiltroMunic)}
                  className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition ${
                    filtroMunic === btn.id
                      ? 'bg-slate-900 text-white'
                      : 'border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  {btn.label}
                </button>
              ))}
            </div>

            <div className="mt-3 flex items-center justify-between border-b border-slate-100 pb-2 text-[11px] text-slate-500">
              <span>
                {loadingBusca
                  ? 'Consultando base...'
                  : `${totalBusca.toLocaleString('pt-BR')} município(s) encontrado(s)`}
              </span>
              {selectedUf ? (
                <button
                  type="button"
                  onClick={() => setSelectedUf(null)}
                  className="font-semibold text-sky-700 hover:underline"
                >
                  Voltar ao Brasil
                </button>
              ) : (
                <span>Exibindo até 60</span>
              )}
            </div>

            <div className="mt-2 max-h-[400px] flex-1 space-y-1.5 overflow-y-auto pr-1">
              {municipios.map((m) => (
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
                      <span className="font-mono text-[10px] text-slate-400">{m.codigo_ibge}</span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      {renderMunicBadge(m)}
                      {m.lei_principal && (
                        <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[10px] font-semibold text-sky-800">
                          {m.lei_principal}
                        </span>
                      )}
                      {m.possui_cartografia && (
                        <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-semibold text-indigo-700">
                          Mapas GIS
                        </span>
                      )}
                    </div>
                  </div>
                  <ArrowRight className="h-4 w-4 shrink-0 text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-sky-700" />
                </button>
              ))}
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

      <PlanoDiretorGuideModal open={guideOpen} onClose={() => setGuideOpen(false)} />
    </div>
  );
}
