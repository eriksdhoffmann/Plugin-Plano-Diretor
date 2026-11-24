import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  BookOpen,
  Bot,
  ChevronDown,
  ChevronRight,
  Download,
  FileText,
  HelpCircle,
  Info,
  Layers,
  Map as MapIcon,
  Printer,
  Search,
  Sparkles,
  X,
} from 'lucide-react';
import { apiClient } from '../api/client';
import { AiAssistant } from '../assistente-ia/AiAssistant';
import { MunicipalityMap, type GeoportalBasemap } from '../mapas/MunicipalityMap';
import type {
  CamadaGeoJSONPayload,
  EstadoResumo,
  FeicaoSelecionada,
  MunicipioDetalhe,
  MunicipioResumo,
} from '../types/domain';
import { formatSituacaoBadge } from '../utils/format';
import { obterExplicacaoCamada } from '../utils/layerExplainer';
import { DocumentViewer } from '../visualizador-pdf/DocumentViewer';
import { PlanoDiretorGuideModal } from './PlanoDiretorGuideModal';
import { ZoneInspector } from './ZoneInspector';

interface GeoportalShellProps {
  codigoIbge: string;
  onBackHome: () => void;
  onChangeMunicipio: (codigoIbge: string) => void;
}

type RightTab = 'camadas' | 'legenda' | 'interpretar' | 'ia';

export function GeoportalShell({
  codigoIbge,
  onBackHome,
  onChangeMunicipio,
}: GeoportalShellProps) {
  const [municipio, setMunicipio] = useState<MunicipioDetalhe | null>(null);
  const [loadingMun, setLoadingMun] = useState(true);
  const [erroMun, setErroMun] = useState<string | null>(null);

  const [estados, setEstados] = useState<EstadoResumo[]>([]);
  const [ufSelect, setUfSelect] = useState('');
  const [munListUf, setMunListUf] = useState<MunicipioResumo[]>([]);
  const [searchPopoverOpen, setSearchPopoverOpen] = useState(false);

  const [viewMode, setViewMode] = useState<'mapa' | 'documentos'>('mapa');
  const [guideOpen, setGuideOpen] = useState(false);
  const [rightPanelOpen, setRightPanelOpen] = useState(true);
  const [rightTab, setRightTab] = useState<RightTab>('camadas');
  const [basemap, setBasemap] = useState<GeoportalBasemap>('branco');

  // Controle de camadas estilo Geoportal Itajaí / Araquari
  const [camadaFiltro, setCamadaFiltro] = useState('');
  const [grupoUrbAberto, setGrupoUrbAberto] = useState(true);
  const [grupoAmbAberto, setGrupoAmbAberto] = useState(true);
  const [limiteGeojson, setLimiteGeojson] = useState<
    (GeoJSON.FeatureCollection & { bbox?: number[] }) | null
  >(null);
  const [camadaPayloads, setCamadaPayloads] = useState<Record<string, CamadaGeoJSONPayload>>({});
  const [camadasAtivas, setCamadasAtivas] = useState<Record<string, boolean>>({});
  const [camadasOpacidade, setCamadasOpacidade] = useState<Record<string, number>>({});
  const [camadasLoading, setCamadasLoading] = useState<Record<string, boolean>>({});

  // Busca de endereço
  const [enderecoQuery, setEnderecoQuery] = useState('');
  const [flyToCoord, setFlyToCoord] = useState<{ lon: number; lat: number; label: string } | null>(
    null
  );
  const [enderecoErro, setEnderecoErro] = useState<string | null>(null);

  // Interpretação e IA
  const [feicaoSelecionada, setFeicaoSelecionada] = useState<FeicaoSelecionada | null>(null);
  const [expandedInfoLayerId, setExpandedInfoLayerId] = useState<string | null>(null);
  const [cardCamadaAtivaNome, setCardCamadaAtivaNome] = useState<{
    nome: string;
    categoria: string;
  } | null>(null);
  const [pendingAI, setPendingAI] = useState<{
    pergunta: string;
    zonaSigla?: string;
    zonaNome?: string;
  } | null>(null);

  const carregarDadosMunicipio = useCallback(async () => {
    setLoadingMun(true);
    setErroMun(null);
    setFeicaoSelecionada(null);
    setCamadaPayloads({});
    setCamadasAtivas({});
    setFlyToCoord(null);

    try {
      const det = await apiClient.obterMunicipioDetalhe(codigoIbge);
      setMunicipio(det);
      setUfSelect(det.uf);

      apiClient
        .obterLimiteMunicipio(codigoIbge)
        .then(setLimiteGeojson)
        .catch(() => setLimiteGeojson(null));

      if (det.camadas_gis.length > 0) {
        const primeira = det.camadas_gis[0];
        setCamadasAtivas({ [primeira.id]: true });
        setCamadasOpacidade({ [primeira.id]: 0.72 });
        setCamadasLoading({ [primeira.id]: true });
        setCardCamadaAtivaNome({ nome: primeira.nome, categoria: primeira.categoria });
        apiClient
          .obterCamadaGeoJSON(codigoIbge, primeira.id)
          .then((payload) => {
            setCamadaPayloads((prev) => ({ ...prev, [primeira.id]: payload }));
          })
          .catch(console.error)
          .finally(() => setCamadasLoading((prev) => ({ ...prev, [primeira.id]: false })));
      }
    } catch (err) {
      setErroMun(err instanceof Error ? err.message : 'Erro ao carregar município.');
    } finally {
      setLoadingMun(false);
    }
  }, [codigoIbge]);

  useEffect(() => {
    carregarDadosMunicipio();
  }, [carregarDadosMunicipio]);

  useEffect(() => {
    apiClient.listarEstados().then(setEstados).catch(console.error);
  }, []);

  useEffect(() => {
    if (!ufSelect) return;
    apiClient
      .buscarMunicipios({ uf: ufSelect, limit: 800 })
      .then((res) => setMunListUf(res.items))
      .catch(console.error);
  }, [ufSelect]);

  const toggleCamada = async (layerId: string) => {
    const novo = !camadasAtivas[layerId];
    setCamadasAtivas((prev) => ({ ...prev, [layerId]: novo }));
    if (novo && municipio) {
      const camObj = municipio.camadas_gis.find((c) => c.id === layerId);
      if (camObj) {
        setCardCamadaAtivaNome({ nome: camObj.nome, categoria: camObj.categoria });
      }
    }
    if (camadasOpacidade[layerId] === undefined) {
      setCamadasOpacidade((prev) => ({ ...prev, [layerId]: 0.72 }));
    }
    if (novo && !camadaPayloads[layerId]) {
      setCamadasLoading((prev) => ({ ...prev, [layerId]: true }));
      try {
        const payload = await apiClient.obterCamadaGeoJSON(codigoIbge, layerId);
        setCamadaPayloads((prev) => ({ ...prev, [layerId]: payload }));
      } catch (err) {
        console.error(err);
      } finally {
        setCamadasLoading((prev) => ({ ...prev, [layerId]: false }));
      }
    }
  };

  const limparCamadas = () => {
    setCamadasAtivas({});
    setFeicaoSelecionada(null);
  };

  const camadasVisiveis = useMemo(() => {
    if (!municipio) return [];
    return municipio.camadas_gis
      .filter((c) => camadasAtivas[c.id] && camadaPayloads[c.id])
      .map((c) => ({
        payload: camadaPayloads[c.id],
        opacity: camadasOpacidade[c.id] ?? 0.72,
      }));
  }, [municipio, camadasAtivas, camadaPayloads, camadasOpacidade]);

  const totalAtivas = useMemo(
    () => Object.values(camadasAtivas).filter(Boolean).length,
    [camadasAtivas]
  );

  const handleSelectFeature = useCallback((f: FeicaoSelecionada | null) => {
    setFeicaoSelecionada(f);
    if (f) {
      setRightPanelOpen(true);
      setRightTab('interpretar');
    }
  }, []);

  const handleAskAIWithZone = (sigla: string, nome: string) => {
    setPendingAI({
      pergunta: `O que é, por que existe, o que pode construir/fazer e quais restrições se aplicam à zona ${sigla} (${nome})?`,
      zonaSigla: sigla,
      zonaNome: nome,
    });
    setRightPanelOpen(true);
    setRightTab('ia');
  };

  const handleBuscarEndereco = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!enderecoQuery.trim() || !municipio) return;
    setEnderecoErro(null);
    try {
      const q = encodeURIComponent(`${enderecoQuery.trim()}, ${municipio.nome}, ${municipio.uf}, Brasil`);
      const resp = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${q}`);
      const data = (await resp.json()) as Array<{ lat: string; lon: string; display_name: string }>;
      if (!data.length) {
        setEnderecoErro('Logradouro não localizado para este município.');
        return;
      }
      setFlyToCoord({
        lat: Number(data[0].lat),
        lon: Number(data[0].lon),
        label: data[0].display_name,
      });
      setViewMode('mapa');
      setSearchPopoverOpen(false);
    } catch {
      setEnderecoErro('Serviço de geocodificação temporariamente indisponível.');
    }
  };

  const handleDownloadFicha = () => {
    if (!municipio) return;
    const blob = new Blob([JSON.stringify(municipio, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `plano_diretor_${municipio.codigo_ibge}_${municipio.uf}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loadingMun) {
    return (
      <div className="flex h-screen items-center justify-center bg-white text-sm font-semibold text-slate-600">
        Carregando Geoportal de Planos Diretores (IBGE {codigoIbge})...
      </div>
    );
  }

  if (erroMun || !municipio) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-3 bg-white p-6 text-center">
        <AlertCircle className="h-8 w-8 text-rose-600" />
        <p className="text-sm font-semibold text-slate-800">{erroMun || 'Município não encontrado.'}</p>
        <button
          type="button"
          onClick={onBackHome}
          className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white"
        >
          Voltar ao Mapa do Brasil
        </button>
      </div>
    );
  }

  const badge = formatSituacaoBadge(municipio.situacao);
  const filtroNorm = camadaFiltro.trim().toLowerCase();
  const camadasUrb = municipio.camadas_gis.filter(
    (c) => c.categoria !== 'ambiental' && (!filtroNorm || c.nome.toLowerCase().includes(filtroNorm))
  );
  const camadasAmb = municipio.camadas_gis.filter(
    (c) => c.categoria === 'ambiental' && (!filtroNorm || c.nome.toLowerCase().includes(filtroNorm))
  );

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-white text-slate-900">
      {/* ======================= CABEÇALHO SUPERIOR PADRÃO GEOPORTAL ======================= */}
      <header className="z-30 flex h-14 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-3 shadow-2xs sm:px-5">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBackHome}
            className="flex items-center gap-2 text-left"
            title="Voltar ao Panorama Nacional do Brasil"
          >
            {/* Pin SVG institucional inspirado no Geoportal Araquari/Itajaí */}
            <svg className="h-9 w-9 shrink-0" viewBox="0 0 46 50" fill="none">
              <defs>
                <linearGradient id="pdPinBlue" x1="6" y1="4" x2="40" y2="38" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stopColor="#1473db" />
                  <stop offset="100%" stopColor="#033c8e" />
                </linearGradient>
                <linearGradient id="pdPinGreen" x1="13" y1="32" x2="33" y2="48" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stopColor="#10b981" />
                  <stop offset="100%" stopColor="#047857" />
                </linearGradient>
              </defs>
              <path d="M12.5 32.5L23 47.5L33.5 32.5H12.5Z" fill="url(#pdPinGreen)" />
              <circle cx="23" cy="20.5" r="17.5" fill="url(#pdPinBlue)" />
              <circle cx="23" cy="20.5" r="9.4" fill="#ffffff" />
              <circle cx="23" cy="20.5" r="3.2" fill="#f59e0b" />
            </svg>
            <div className="leading-none">
              <div className="flex items-center gap-1 text-xs font-black tracking-tight text-sky-900">
                <span>GEO</span>
                <span className="rounded bg-sky-700 px-1 py-0.5 text-[9px] font-bold text-white">
                  PORTAL
                </span>
              </div>
              <div className="text-[11px] font-extrabold tracking-wide text-slate-800">
                PLANOS DIRETORES
              </div>
            </div>
          </button>

          <div className="hidden h-7 w-px bg-slate-200 sm:block" />

          <div className="hidden min-w-0 sm:block">
            <div className="flex items-center gap-2">
              <span className="truncate text-xs font-extrabold uppercase text-slate-900">
                {municipio.nome} — {municipio.uf}
              </span>
              <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-600">
                IBGE {municipio.codigo_ibge}
              </span>
              <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${badge.classes}`}>
                {badge.label}
              </span>
            </div>
            <div className="truncate text-[11px] text-slate-500">
              {municipio.lei_principal || 'Plano Diretor não localizado nas fontes consultadas.'}
            </div>
          </div>
        </div>

        {/* Navegação horizontal estilo Geoportal */}
        <nav className="flex items-center gap-1 text-xs font-semibold sm:gap-2">
          <button
            type="button"
            onClick={onBackHome}
            className="rounded-md px-2.5 py-1.5 text-slate-600 hover:bg-slate-100"
          >
            Início
          </button>
          <button
            type="button"
            onClick={() => setViewMode('mapa')}
            className={`rounded-md px-2.5 py-1.5 ${
              viewMode === 'mapa' ? 'text-amber-600' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            Mapas Interativos
          </button>
          <button
            type="button"
            onClick={() => setGuideOpen(true)}
            className="hidden items-center gap-1 rounded-md px-2.5 py-1.5 text-sky-700 hover:bg-sky-50 md:inline-flex"
          >
            <BookOpen className="h-3.5 w-3.5" />
            Entender o Plano Diretor
          </button>
          <button
            type="button"
            onClick={handleDownloadFicha}
            className="hidden rounded-md px-2.5 py-1.5 text-slate-600 hover:bg-slate-100 lg:inline-flex lg:items-center lg:gap-1"
            title="Baixar ficha e metadados JSON"
          >
            Download <Download className="h-3 w-3" />
          </button>
          <button
            type="button"
            onClick={() => setViewMode('documentos')}
            className={`rounded-md px-2.5 py-1.5 ${
              viewMode === 'documentos'
                ? 'border-b-2 border-sky-700 text-sky-800'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            Documentos &amp; Leis
          </button>
          <button
            type="button"
            onClick={() => setGuideOpen(true)}
            className="rounded-md px-2 py-1.5 text-slate-600 hover:bg-slate-100"
            title="Ajuda e Guia"
          >
            <span className="hidden sm:inline">Ajuda</span>
            <HelpCircle className="h-4 w-4 sm:hidden" />
          </button>
        </nav>
      </header>

      {/* ======================= ÁREA PRINCIPAL ======================= */}
      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        {/* ÁREA DO MAPA OU DOCUMENTAÇÃO */}
        <main className="relative min-w-0 flex-1">
          {viewMode === 'mapa' ? (
            <MunicipalityMap
              codigoIbge={municipio.codigo_ibge}
              limiteGeojson={limiteGeojson}
              camadasVisiveis={camadasVisiveis}
              flyToCoord={flyToCoord}
              basemap={basemap}
              onChangeBasemap={setBasemap}
              onBackBrasil={onBackHome}
              onToggleRightPanel={() => setRightPanelOpen((v) => !v)}
              onSelectFeature={handleSelectFeature}
            />
          ) : (
            <DocumentViewer
              municipio={municipio}
              onRefreshMunicipio={carregarDadosMunicipio}
            />
          )}

          {/* Lupa flutuante canto superior esquerdo (Busca Município / UF / Endereço) */}
          {viewMode === 'mapa' && (
            <div className="pointer-events-none absolute top-3 left-3 z-20 flex items-start gap-2.5">
              <div className="pointer-events-auto">
                <button
                  type="button"
                  onClick={() => setSearchPopoverOpen((v) => !v)}
                  title="Trocar município ou buscar endereço"
                  className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 shadow-md hover:bg-slate-50"
                >
                  <Search className="h-4 w-4" />
                </button>
              </div>

              {/* Card didático ao vivo dentro do mapa explicando o que é a camada ativa */}
              {cardCamadaAtivaNome && !searchPopoverOpen && (() => {
                const exp = obterExplicacaoCamada(cardCamadaAtivaNome.nome, cardCamadaAtivaNome.categoria);
                return (
                  <div className="pointer-events-auto hidden max-w-md rounded-xl border border-slate-200 bg-white/95 p-3 text-xs shadow-lg backdrop-blur md:block">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-sky-700">
                          Entendendo esta camada no mapa
                        </span>
                        <h4 className="text-xs font-extrabold text-slate-900">{exp.tituloCurto}</h4>
                      </div>
                      <button
                        type="button"
                        onClick={() => setCardCamadaAtivaNome(null)}
                        title="Fechar explicação"
                        className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <p className="mt-1 text-[11px] leading-relaxed text-slate-700">{exp.oQueE}</p>
                    <p className="mt-1 rounded bg-sky-50 px-2 py-1 text-[10px] text-sky-900">
                      <strong>Exemplo prático:</strong> {exp.exemploPratico}
                    </p>
                  </div>
                );
              })()}
            </div>
          )}
          {viewMode === 'mapa' && searchPopoverOpen && (
            <div className="absolute top-14 left-3 z-20">
                <div className="w-80 rounded-xl border border-slate-200 bg-white p-3.5 text-xs shadow-xl">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="font-bold text-slate-900">Trocar Município / Buscar Endereço</span>
                    <button type="button" onClick={() => setSearchPopoverOpen(false)}>
                      <X className="h-4 w-4 text-slate-400" />
                    </button>
                  </div>

                  {/* Atalhos rápidos */}
                  <div className="mb-2.5 flex flex-wrap gap-1">
                    {[
                      { cod: '4201307', label: 'Araquari/SC' },
                      { cod: '4106902', label: 'Curitiba/PR' },
                      { cod: '4209102', label: 'Joinville/SC' },
                    ].map((a) => (
                      <button
                        key={a.cod}
                        type="button"
                        onClick={() => {
                          onChangeMunicipio(a.cod);
                          setSearchPopoverOpen(false);
                        }}
                        className="rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[10px] font-semibold text-sky-800 hover:bg-sky-100"
                      >
                        {a.label}
                      </button>
                    ))}
                  </div>

                  <div className="space-y-2">
                    <select
                      aria-label="UF"
                      value={ufSelect}
                      onChange={(e) => setUfSelect(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
                    >
                      {estados.map((uf) => (
                        <option key={uf.uf} value={uf.uf}>
                          {uf.uf} — {uf.uf_nome}
                        </option>
                      ))}
                    </select>

                    <select
                      aria-label="Município"
                      value={municipio.codigo_ibge}
                      onChange={(e) => {
                        onChangeMunicipio(e.target.value);
                        setSearchPopoverOpen(false);
                      }}
                      className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
                    >
                      {munListUf.map((m) => (
                        <option key={m.codigo_ibge} value={m.codigo_ibge}>
                          {m.nome} ({m.codigo_ibge}){m.possui_cartografia ? ' [GIS]' : ''}
                        </option>
                      ))}
                    </select>
                  </div>

                  <form onSubmit={handleBuscarEndereco} className="mt-3 flex gap-1.5 border-t border-slate-100 pt-2.5">
                    <input
                      type="text"
                      value={enderecoQuery}
                      onChange={(e) => setEnderecoQuery(e.target.value)}
                      placeholder="Buscar rua / endereço neste município..."
                      className="flex-1 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs outline-none focus:border-sky-600"
                    />
                    <button
                      type="submit"
                      className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white"
                    >
                      Ir
                    </button>
                  </form>
                  {enderecoErro && <p className="mt-1 text-[11px] text-rose-600">{enderecoErro}</p>}
                </div>
            </div>
          )}

          {/* Barra de ferramentas vertical à direita do mapa (colada ao Controle de Camadas) */}
          <div className="absolute top-3 right-3 z-20 flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white/95 shadow-lg backdrop-blur">
            <button
              type="button"
              onClick={() => {
                setRightPanelOpen(true);
                setRightTab('camadas');
              }}
              title="Controle de Camadas"
              className={`border-b border-slate-100 p-2 ${
                rightPanelOpen && rightTab === 'camadas'
                  ? 'bg-sky-50 text-sky-700'
                  : 'text-slate-700 hover:bg-slate-100'
              }`}
            >
              <Layers className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => {
                setRightPanelOpen(true);
                setRightTab('legenda');
              }}
              title="Legenda Dinâmica"
              className={`border-b border-slate-100 p-2 ${
                rightPanelOpen && rightTab === 'legenda'
                  ? 'bg-sky-50 text-sky-700'
                  : 'text-slate-700 hover:bg-slate-100'
              }`}
            >
              <MapIcon className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => {
                setRightPanelOpen(true);
                setRightTab('interpretar');
              }}
              title="Interpretar Zona / Parte do Plano Diretor"
              className={`border-b border-slate-100 p-2 ${
                rightPanelOpen && rightTab === 'interpretar'
                  ? 'bg-sky-50 text-sky-700'
                  : 'text-slate-700 hover:bg-slate-100'
              }`}
            >
              <Info className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => {
                setRightPanelOpen(true);
                setRightTab('ia');
              }}
              title="Assistente IA do Plano Diretor"
              className={`border-b border-slate-100 p-2 ${
                rightPanelOpen && rightTab === 'ia'
                  ? 'bg-sky-50 text-sky-700'
                  : 'text-slate-700 hover:bg-slate-100'
              }`}
            >
              <Bot className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setViewMode(viewMode === 'mapa' ? 'documentos' : 'mapa')}
              title="Alternar Documentação e PDFs"
              className="border-b border-slate-100 p-2 text-slate-700 hover:bg-slate-100"
            >
              <FileText className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              title="Imprimir / Exportar visualização"
              className="p-2 text-slate-700 hover:bg-slate-100"
            >
              <Printer className="h-4 w-4" />
            </button>
          </div>
        </main>

        {/* ======================= PAINEL DIREITO PADRÃO GEOPORTAL (CONTROLE DE CAMADAS + INTERPRETAÇÃO) ======================= */}
        {rightPanelOpen && (
          <aside className="fixed inset-y-14 right-0 z-30 flex w-80 max-w-[92vw] flex-col border-l border-slate-200 bg-white shadow-2xl sm:static sm:w-88 xl:w-96">
            {/* Cabeçalho escuro idêntico ao print do Geoportal Araquari */}
            <div className="flex items-center justify-between bg-slate-800 px-3.5 py-2.5 text-white">
              <span className="text-xs font-bold tracking-wide">
                {rightTab === 'camadas'
                  ? 'Controle de Camadas'
                  : rightTab === 'legenda'
                    ? 'Legenda do Plano Diretor'
                    : rightTab === 'interpretar'
                      ? 'Interpretação do Plano Diretor'
                      : 'Assistente IA Urbanística'}
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setGuideOpen(true)}
                  title="Entender o Plano Diretor"
                  className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-semibold hover:bg-white/20"
                >
                  Guia
                </button>
                <button
                  type="button"
                  onClick={() => setRightPanelOpen(false)}
                  className="rounded p-0.5 text-slate-300 hover:bg-white/10 hover:text-white"
                  title="Recolher painel"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Busca de camada + abas internas */}
            <div className="border-b border-slate-200 bg-white px-3 pt-2.5 pb-2">
              {rightTab === 'camadas' && (
                <input
                  type="text"
                  value={camadaFiltro}
                  onChange={(e) => setCamadaFiltro(e.target.value)}
                  placeholder="Buscar Grupo ou Camada"
                  className="mb-2.5 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs outline-none focus:border-sky-600"
                />
              )}

              <div className="flex items-center justify-between gap-1 text-[11px] font-semibold">
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setRightTab('camadas')}
                    className={`rounded px-2 py-1 ${
                      rightTab === 'camadas'
                        ? 'bg-sky-50 text-sky-800'
                        : 'text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    Camadas ({totalAtivas})
                  </button>
                  <button
                    type="button"
                    onClick={() => setRightTab('legenda')}
                    className={`rounded px-2 py-1 ${
                      rightTab === 'legenda'
                        ? 'bg-sky-50 text-sky-800'
                        : 'text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    Legenda
                  </button>
                  <button
                    type="button"
                    onClick={() => setRightTab('interpretar')}
                    className={`rounded px-2 py-1 ${
                      rightTab === 'interpretar'
                        ? 'bg-sky-50 text-sky-800'
                        : 'text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    Interpretar
                  </button>
                  <button
                    type="button"
                    onClick={() => setRightTab('ia')}
                    className={`inline-flex items-center gap-1 rounded px-2 py-1 ${
                      rightTab === 'ia'
                        ? 'bg-sky-50 text-sky-800'
                        : 'text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    <Sparkles className="h-3 w-3" />
                    IA
                  </button>
                </div>

                {rightTab === 'camadas' && totalAtivas > 0 && (
                  <button
                    type="button"
                    onClick={limparCamadas}
                    className="text-[11px] font-bold text-rose-600 hover:underline"
                  >
                    Limpar
                  </button>
                )}
              </div>
            </div>

            {/* Corpo do Painel Direito */}
            <div className="min-h-0 flex-1 overflow-y-auto">
              {rightTab === 'camadas' && (
                <div className="space-y-3 p-3 text-xs">
                  {municipio.aviso_documental && (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-[11px] text-amber-950">
                      {municipio.aviso_documental}
                    </div>
                  )}

                  {/* Grupo 1: Plano Diretor e Zoneamento */}
                  <div className="rounded-lg border border-slate-200 bg-slate-50/50">
                    <button
                      type="button"
                      onClick={() => setGrupoUrbAberto((v) => !v)}
                      className="flex w-full items-center justify-between px-2.5 py-2 text-left font-bold text-slate-800"
                    >
                      <span className="flex items-center gap-1.5">
                        {grupoUrbAberto ? (
                          <ChevronDown className="h-3.5 w-3.5" />
                        ) : (
                          <ChevronRight className="h-3.5 w-3.5" />
                        )}
                        Plano Diretor, Zoneamento e Viário
                      </span>
                      <span className="rounded-full bg-sky-100 px-1.5 py-0.5 text-[10px] text-sky-800">
                        {camadasUrb.length}
                      </span>
                    </button>

                    {grupoUrbAberto && (
                      <div className="space-y-2 border-t border-slate-200 bg-white p-2">
                        {camadasUrb.length === 0 ? (
                          <p className="p-1 text-[11px] text-slate-500">
                            Nenhuma camada vetorial de Plano Diretor catalogada para este município.
                          </p>
                        ) : (
                          camadasUrb.map((cam) => {
                            const payload = camadaPayloads[cam.id];
                            return (
                              <div
                                key={cam.id}
                                className="rounded-md border border-slate-100 p-2 hover:bg-slate-50"
                              >
                                <label className="flex cursor-pointer items-start gap-2">
                                  <input
                                    type="checkbox"
                                    checked={Boolean(camadasAtivas[cam.id])}
                                    onChange={() => toggleCamada(cam.id)}
                                    className="mt-0.5 rounded border-slate-300 text-sky-700"
                                  />
                                  <span className="mt-0.5 h-3 w-3 shrink-0 rounded-xs bg-amber-400 ring-1 ring-amber-700" />
                                  <div className="min-w-0 flex-1">
                                    <div className="font-semibold text-slate-900">{cam.nome}</div>
                                    <div className="mt-1 flex flex-wrap items-center gap-1">
                                      <span
                                        className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                                          cam.origem_geometria === 'oficial'
                                            ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200'
                                            : 'bg-amber-50 text-amber-800 ring-1 ring-amber-200'
                                        }`}
                                      >
                                        {cam.origem_geometria === 'oficial' ? 'Oficial' : 'Deriv. PDF'}
                                      </span>
                                      {payload && (
                                        <span className="rounded-full bg-sky-50 px-1.5 py-0.5 text-[10px] font-semibold text-sky-700">
                                          {payload.total_feicoes}
                                        </span>
                                      )}
                                      <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[9px] uppercase text-slate-600">
                                        {cam.tipo_servico}
                                      </span>
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.preventDefault();
                                          setExpandedInfoLayerId(
                                            expandedInfoLayerId === cam.id ? null : cam.id
                                          );
                                        }}
                                        className="ml-auto inline-flex items-center gap-0.5 rounded bg-sky-50 px-1.5 py-0.5 text-[10px] font-bold text-sky-800 hover:bg-sky-100"
                                      >
                                        <Info className="h-2.5 w-2.5" />
                                        O que é?
                                      </button>
                                    </div>
                                  </div>
                                </label>
                                {expandedInfoLayerId === cam.id && (() => {
                                  const exp = obterExplicacaoCamada(cam.nome, cam.categoria);
                                  return (
                                    <div className="mt-2 rounded-lg border border-sky-200 bg-sky-50/70 p-2 text-[11px] text-slate-700">
                                      <div className="font-bold text-sky-900">{exp.tituloCurto}</div>
                                      <p className="mt-0.5">{exp.oQueE}</p>
                                      <p className="mt-1 text-[10px] text-slate-600">
                                        <strong>Para que serve:</strong> {exp.paraQueServe}
                                      </p>
                                      <p className="mt-1 text-[10px] text-sky-900">
                                        <strong>Na prática:</strong> {exp.exemploPratico}
                                      </p>
                                    </div>
                                  );
                                })()}
                                {camadasLoading[cam.id] && (
                                  <p className="mt-1 text-[10px] text-sky-700">Baixando feições...</p>
                                )}
                                {camadasAtivas[cam.id] && (
                                  <div className="mt-1.5 flex items-center gap-2 pl-6 text-[10px] text-slate-500">
                                    <span>Opacidade</span>
                                    <input
                                      type="range"
                                      min={0.1}
                                      max={0.95}
                                      step={0.05}
                                      value={camadasOpacidade[cam.id] ?? 0.72}
                                      onChange={(e) =>
                                        setCamadasOpacidade((prev) => ({
                                          ...prev,
                                          [cam.id]: Number(e.target.value),
                                        }))
                                      }
                                      className="w-full"
                                    />
                                  </div>
                                )}
                              </div>
                            );
                          })
                        )}
                      </div>
                    )}
                  </div>

                  {/* Grupo 2: Meio Ambiente e Restrições */}
                  <div className="rounded-lg border border-slate-200 bg-slate-50/50">
                    <button
                      type="button"
                      onClick={() => setGrupoAmbAberto((v) => !v)}
                      className="flex w-full items-center justify-between px-2.5 py-2 text-left font-bold text-slate-800"
                    >
                      <span className="flex items-center gap-1.5">
                        {grupoAmbAberto ? (
                          <ChevronDown className="h-3.5 w-3.5" />
                        ) : (
                          <ChevronRight className="h-3.5 w-3.5" />
                        )}
                        Meio Ambiente, APPs e Restrições
                      </span>
                      <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] text-emerald-800">
                        {camadasAmb.length}
                      </span>
                    </button>

                    {grupoAmbAberto && (
                      <div className="space-y-2 border-t border-slate-200 bg-white p-2">
                        {camadasAmb.length === 0 ? (
                          <p className="p-1 text-[11px] text-slate-500">
                            Sem camadas ambientais específicas catalogadas. Consulte regras de APP no botão IA.
                          </p>
                        ) : (
                          camadasAmb.map((cam) => {
                            const payload = camadaPayloads[cam.id];
                            return (
                              <div
                                key={cam.id}
                                className="rounded-md border border-slate-100 p-2 hover:bg-slate-50"
                              >
                                <label className="flex cursor-pointer items-start gap-2">
                                  <input
                                    type="checkbox"
                                    checked={Boolean(camadasAtivas[cam.id])}
                                    onChange={() => toggleCamada(cam.id)}
                                    className="mt-0.5 rounded border-emerald-300 text-emerald-700"
                                  />
                                  <span className="mt-0.5 h-3 w-3 shrink-0 rounded-xs bg-emerald-600 ring-1 ring-emerald-900" />
                                  <div className="min-w-0 flex-1">
                                    <div className="font-semibold text-slate-900">{cam.nome}</div>
                                    <div className="mt-1 flex flex-wrap items-center gap-1">
                                      <span className="rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 ring-1 ring-emerald-200">
                                        {cam.origem_geometria === 'oficial' ? 'Oficial / Cient.' : 'Deriv. PDF'}
                                      </span>
                                      {payload && (
                                        <span className="rounded-full bg-sky-50 px-1.5 py-0.5 text-[10px] font-semibold text-sky-700">
                                          {payload.total_feicoes}
                                        </span>
                                      )}
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.preventDefault();
                                          setExpandedInfoLayerId(
                                            expandedInfoLayerId === cam.id ? null : cam.id
                                          );
                                        }}
                                        className="ml-auto inline-flex items-center gap-0.5 rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold text-emerald-800 hover:bg-emerald-100"
                                      >
                                        <Info className="h-2.5 w-2.5" />
                                        O que é?
                                      </button>
                                    </div>
                                  </div>
                                </label>
                                {expandedInfoLayerId === cam.id && (() => {
                                  const exp = obterExplicacaoCamada(cam.nome, cam.categoria);
                                  return (
                                    <div className="mt-2 rounded-lg border border-emerald-200 bg-emerald-50/70 p-2 text-[11px] text-slate-700">
                                      <div className="font-bold text-emerald-950">{exp.tituloCurto}</div>
                                      <p className="mt-0.5">{exp.oQueE}</p>
                                      <p className="mt-1 text-[10px] text-emerald-900">
                                        <strong>Na prática:</strong> {exp.exemploPratico}
                                      </p>
                                    </div>
                                  );
                                })()}
                                {camadasLoading[cam.id] && (
                                  <p className="mt-1 text-[10px] text-emerald-700">Baixando camada ambiental...</p>
                                )}
                              </div>
                            );
                          })
                        )}
                      </div>
                    )}
                  </div>

                  {/* Base Territorial IBGE */}
                  <div className="rounded-lg border border-slate-200 bg-white p-2.5">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-slate-800">
                        Limite Municipal Oficial (IBGE)
                      </span>
                      <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 ring-1 ring-emerald-200">
                        Oficial
                      </span>
                    </div>
                    <p className="mt-1 text-[11px] text-slate-500">
                      Contorno sempre ativo • Código IBGE {municipio.codigo_ibge}
                    </p>
                  </div>
                </div>
              )}

              {rightTab === 'legenda' && (
                <div className="space-y-3 p-3 text-xs">
                  {camadasVisiveis.length === 0 ? (
                    <p className="text-slate-500">
                      Ative ao menos uma camada na aba Camadas para gerar a legenda dinâmica.
                    </p>
                  ) : (
                    camadasVisiveis.map(({ payload }) => (
                      <div key={payload.camada.id} className="rounded-lg border border-slate-200 p-2.5">
                        <div className="mb-2 font-bold text-slate-900">{payload.camada.nome}</div>
                        <div className="space-y-1.5">
                          {payload.legenda.map((item) => (
                            <div key={item.chave} className="flex items-center justify-between gap-2 text-[11px]">
                              <div className="flex min-w-0 items-center gap-2">
                                <span
                                  className="h-3.5 w-3.5 shrink-0 rounded-xs border border-slate-400"
                                  style={{ backgroundColor: item.cor }}
                                />
                                <span className="truncate text-slate-800">
                                  <strong>{item.sigla}</strong>
                                  {item.nome !== item.sigla ? ` — ${item.nome}` : ''}
                                </span>
                              </div>
                              <span className="shrink-0 font-mono text-[10px] text-slate-400">
                                {item.contagem}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}

              {rightTab === 'interpretar' && (
                <ZoneInspector
                  municipio={municipio}
                  feicao={feicaoSelecionada}
                  onAskAIWithZone={handleAskAIWithZone}
                />
              )}

              {rightTab === 'ia' && (
                <AiAssistant
                  municipio={municipio}
                  feicaoSelecionada={feicaoSelecionada}
                  pendingQuestion={pendingAI}
                  onClearPending={() => setPendingAI(null)}
                />
              )}
            </div>
          </aside>
        )}
      </div>

      <PlanoDiretorGuideModal open={guideOpen} onClose={() => setGuideOpen(false)} />
    </div>
  );
}
