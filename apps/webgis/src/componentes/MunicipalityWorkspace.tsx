import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  BookOpen,
  Bot,
  Info,
  Layers,
  Map as MapIcon,
  Menu,
  Search,
  X,
} from 'lucide-react';
import { apiClient } from '../api/client';
import { AiAssistant } from '../assistente-ia/AiAssistant';
import { MunicipalityMap } from '../mapas/MunicipalityMap';
import type {
  CamadaGeoJSONPayload,
  EstadoResumo,
  FeicaoSelecionada,
  MunicipioDetalhe,
  MunicipioResumo,
} from '../types/domain';
import { formatSituacaoBadge } from '../utils/format';
import { DocumentViewer } from '../visualizador-pdf/DocumentViewer';
import { ZoneInspector } from './ZoneInspector';

interface MunicipalityWorkspaceProps {
  codigoIbge: string;
  onBackHome: () => void;
  onChangeMunicipio: (codigoIbge: string) => void;
}

export function MunicipalityWorkspace({
  codigoIbge,
  onBackHome,
  onChangeMunicipio,
}: MunicipalityWorkspaceProps) {
  const [municipio, setMunicipio] = useState<MunicipioDetalhe | null>(null);
  const [loadingMun, setLoadingMun] = useState(true);
  const [erroMun, setErroMun] = useState<string | null>(null);

  const [estados, setEstados] = useState<EstadoResumo[]>([]);
  const [ufSelect, setUfSelect] = useState('');
  const [munListUf, setMunListUf] = useState<MunicipioResumo[]>([]);

  const [areaCentral, setAreaCentral] = useState<'mapa' | 'documentacao'>('mapa');
  const [rightTab, setRightTab] = useState<'zona' | 'ia'>('zona');

  // Camadas carregadas e visibilidade
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

  // Seleção de feição e integração com IA
  const [feicaoSelecionada, setFeicaoSelecionada] = useState<FeicaoSelecionada | null>(null);
  const [pendingAI, setPendingAI] = useState<{
    pergunta: string;
    zonaSigla?: string;
    zonaNome?: string;
  } | null>(null);

  // Drawers mobile
  const [mobileLeftOpen, setMobileLeftOpen] = useState(false);
  const [mobileRightOpen, setMobileRightOpen] = useState(false);

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

      // Ativa automaticamente a primeira camada urbanística se existir
      if (det.camadas_gis.length > 0) {
        const primeira = det.camadas_gis[0];
        setCamadasAtivas({ [primeira.id]: true });
        setCamadasOpacidade({ [primeira.id]: 0.62 });
        setCamadasLoading({ [primeira.id]: true });
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
    const novoEstado = !camadasAtivas[layerId];
    setCamadasAtivas((prev) => ({ ...prev, [layerId]: novoEstado }));
    if (camadasOpacidade[layerId] === undefined) {
      setCamadasOpacidade((prev) => ({ ...prev, [layerId]: 0.62 }));
    }
    if (novoEstado && !camadaPayloads[layerId]) {
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

  const camadasVisiveis = useMemo(() => {
    if (!municipio) return [];
    return municipio.camadas_gis
      .filter((c) => camadasAtivas[c.id] && camadaPayloads[c.id])
      .map((c) => ({
        payload: camadaPayloads[c.id],
        opacity: camadasOpacidade[c.id] ?? 0.62,
      }));
  }, [municipio, camadasAtivas, camadaPayloads, camadasOpacidade]);

  const handleSelectFeature = useCallback((f: FeicaoSelecionada | null) => {
    setFeicaoSelecionada(f);
    if (f) {
      setRightTab('zona');
      setMobileRightOpen(true);
    }
  }, []);

  const handleAskAIWithZone = (sigla: string, nome: string) => {
    setPendingAI({
      pergunta: `O que é, por que existe, o que pode e quais restrições se aplicam à zona ${sigla} (${nome})?`,
      zonaSigla: sigla,
      zonaNome: nome,
    });
    setRightTab('ia');
    setMobileRightOpen(true);
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
        setEnderecoErro('Endereço ou logradouro não encontrado para este município.');
        return;
      }
      setFlyToCoord({
        lat: Number(data[0].lat),
        lon: Number(data[0].lon),
        label: data[0].display_name,
      });
      setAreaCentral('mapa');
    } catch {
      setEnderecoErro('Serviço de geocodificação indisponível no momento.');
    }
  };

  if (loadingMun) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50 text-sm font-medium text-slate-600">
        Carregando infraestrutura territorial e documental do município (IBGE {codigoIbge})...
      </div>
    );
  }

  if (erroMun || !municipio) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-3 bg-slate-50 p-6 text-center">
        <AlertCircle className="h-8 w-8 text-rose-600" />
        <p className="text-sm font-semibold text-slate-800">{erroMun || 'Município não encontrado.'}</p>
        <button
          type="button"
          onClick={onBackHome}
          className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white"
        >
          Voltar ao Mapa Nacional
        </button>
      </div>
    );
  }

  const badge = formatSituacaoBadge(municipio.situacao);
  const camadasUrbanisticas = municipio.camadas_gis.filter((c) => c.categoria !== 'ambiental');
  const camadasAmbientais = municipio.camadas_gis.filter((c) => c.categoria === 'ambiental');

  const painelEsquerdoConteudo = (
    <div className="flex h-full flex-col overflow-y-auto bg-white text-xs">
      {/* Troca rápida UF / Município */}
      <div className="space-y-2 border-b border-slate-200 p-3">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          Navegação Territorial
        </div>
        <select
          aria-label="Selecionar Estado"
          value={ufSelect}
          onChange={(e) => setUfSelect(e.target.value)}
          className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-800"
        >
          {estados.map((uf) => (
            <option key={uf.uf} value={uf.uf}>
              {uf.uf} — {uf.uf_nome}
            </option>
          ))}
        </select>
        <select
          aria-label="Selecionar Município"
          value={municipio.codigo_ibge}
          onChange={(e) => onChangeMunicipio(e.target.value)}
          className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-800"
        >
          {munListUf.map((m) => (
            <option key={m.codigo_ibge} value={m.codigo_ibge}>
              {m.nome} ({m.codigo_ibge})
            </option>
          ))}
        </select>

        {/* Busca de endereço */}
        <form onSubmit={handleBuscarEndereco} className="flex gap-1.5 pt-1">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute top-2 left-2 h-3.5 w-3.5 text-slate-400" />
            <input
              type="text"
              value={enderecoQuery}
              onChange={(e) => setEnderecoQuery(e.target.value)}
              placeholder="Buscar endereço / rua..."
              className="w-full rounded-lg border border-slate-300 py-1.5 pr-2 pl-7 text-xs outline-none focus:border-sky-600"
            />
          </div>
          <button
            type="submit"
            className="rounded-lg bg-slate-800 px-2.5 py-1.5 text-[11px] font-semibold text-white hover:bg-slate-900"
          >
            Ir
          </button>
        </form>
        {enderecoErro && <p className="text-[11px] text-rose-600">{enderecoErro}</p>}
      </div>

      {/* Camadas Urbanísticas */}
      <div className="space-y-2 border-b border-slate-200 p-3">
        <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          <Layers className="h-3.5 w-3.5 text-sky-700" />
          Camadas Urbanísticas
        </div>
        {camadasUrbanisticas.length === 0 ? (
          <p className="rounded bg-slate-50 p-2 text-[11px] text-slate-500">
            Nenhuma camada vetorial urbanística catalogada até o momento para este município.
          </p>
        ) : (
          camadasUrbanisticas.map((c) => (
            <div key={c.id} className="rounded-lg border border-slate-200 bg-slate-50/70 p-2">
              <label className="flex cursor-pointer items-start gap-2">
                <input
                  type="checkbox"
                  checked={Boolean(camadasAtivas[c.id])}
                  onChange={() => toggleCamada(c.id)}
                  className="mt-0.5 rounded border-slate-300 text-sky-700"
                />
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-slate-900">{c.nome}</div>
                  <div className="mt-0.5 flex flex-wrap gap-1 text-[10px]">
                    <span className="rounded bg-emerald-100 px-1.5 py-0.5 font-medium text-emerald-800">
                      {c.origem_geometria === 'oficial' ? 'Geometria Oficial' : 'Derivada de PDF'}
                    </span>
                    <span className="rounded bg-slate-200 px-1.5 py-0.5 uppercase text-slate-700">
                      {c.tipo_servico}
                    </span>
                  </div>
                </div>
              </label>
              {camadasLoading[c.id] && (
                <p className="mt-1 text-[10px] text-sky-700">Carregando feições oficiais...</p>
              )}
              {camadasAtivas[c.id] && (
                <div className="mt-1.5 flex items-center gap-2 text-[10px] text-slate-500">
                  <span>Opacidade</span>
                  <input
                    type="range"
                    min={0.1}
                    max={0.95}
                    step={0.05}
                    value={camadasOpacidade[c.id] ?? 0.62}
                    onChange={(e) =>
                      setCamadasOpacidade((prev) => ({ ...prev, [c.id]: Number(e.target.value) }))
                    }
                    className="w-full"
                  />
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Camadas Ambientais */}
      <div className="space-y-2 border-b border-slate-200 p-3">
        <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-emerald-800">
          <Layers className="h-3.5 w-3.5 text-emerald-700" />
          Camadas Ambientais e Restrições
        </div>
        {camadasAmbientais.length === 0 ? (
          <p className="rounded bg-slate-50 p-2 text-[11px] text-slate-500">
            Sem camadas ambientais municipais específicas catalogadas. Consulte critérios de APP do
            Código Florestal no Assistente IA.
          </p>
        ) : (
          camadasAmbientais.map((c) => (
            <div key={c.id} className="rounded-lg border border-emerald-200 bg-emerald-50/40 p-2">
              <label className="flex cursor-pointer items-start gap-2">
                <input
                  type="checkbox"
                  checked={Boolean(camadasAtivas[c.id])}
                  onChange={() => toggleCamada(c.id)}
                  className="mt-0.5 rounded border-emerald-300 text-emerald-700"
                />
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-slate-900">{c.nome}</div>
                  <span className="mt-0.5 inline-block rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-900">
                    {c.origem_geometria === 'oficial' ? 'Geometria Oficial' : 'Derivada de PDF'}
                  </span>
                </div>
              </label>
              {camadasLoading[c.id] && (
                <p className="mt-1 text-[10px] text-emerald-700">Carregando camada ambiental...</p>
              )}
            </div>
          ))
        )}
      </div>

      {/* Legenda Dinâmica da camada ativa */}
      <div className="space-y-2 border-b border-slate-200 p-3">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          Legenda Dinâmica (Categorias Locais)
        </div>
        {camadasVisiveis.length === 0 ? (
          <p className="text-[11px] text-slate-400">
            Ative uma camada para exibir as classes originais da legislação do município.
          </p>
        ) : (
          camadasVisiveis.map(({ payload }) => (
            <div key={payload.camada.id} className="space-y-1">
              <div className="font-semibold text-slate-800">{payload.camada.nome}</div>
              <div className="max-h-48 space-y-1 overflow-y-auto pr-1">
                {payload.legenda.map((item) => (
                  <div key={item.chave} className="flex items-center justify-between gap-2 text-[11px]">
                    <div className="flex min-w-0 items-center gap-1.5">
                      <span
                        className="h-3 w-3 shrink-0 rounded-xs border border-slate-400"
                        style={{ backgroundColor: item.cor }}
                      />
                      <span className="truncate text-slate-700" title={`${item.sigla} — ${item.nome}`}>
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

      {/* Lista resumida de documentos */}
      <div className="space-y-1.5 p-3">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Documentos ({municipio.documentos.length})
          </span>
          <button
            type="button"
            onClick={() => setAreaCentral('documentacao')}
            className="text-[11px] font-semibold text-sky-700 hover:underline"
          >
            Abrir leitor
          </button>
        </div>
        {municipio.documentos.length === 0 ? (
          <p className="text-[11px] text-slate-500">
            Plano Diretor não localizado nas fontes consultadas.
          </p>
        ) : (
          municipio.documentos.map((d, i) => (
            <div key={i} className="rounded border border-slate-200 bg-slate-50 p-2 text-[11px]">
              <div className="font-semibold text-slate-800">{d.titulo}</div>
              {d.lei_numero && <div className="text-slate-500">{d.lei_numero}</div>}
            </div>
          ))
        )}
      </div>
    </div>
  );

  const painelDireitoConteudo = (
    <div className="flex h-full flex-col bg-white">
      <div className="grid grid-cols-2 border-b border-slate-200 bg-slate-50">
        <button
          type="button"
          onClick={() => setRightTab('zona')}
          className={`flex items-center justify-center gap-1.5 py-2.5 text-xs font-bold transition ${
            rightTab === 'zona'
              ? 'border-b-2 border-sky-700 bg-white text-sky-800'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Info className="h-3.5 w-3.5" />
          Ficha da Zona
        </button>
        <button
          type="button"
          onClick={() => setRightTab('ia')}
          className={`flex items-center justify-center gap-1.5 py-2.5 text-xs font-bold transition ${
            rightTab === 'ia'
              ? 'border-b-2 border-sky-700 bg-white text-sky-800'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Bot className="h-3.5 w-3.5" />
          Assistente IA
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {rightTab === 'zona' ? (
          <ZoneInspector
            municipio={municipio}
            feicao={feicaoSelecionada}
            onAskAIWithZone={handleAskAIWithZone}
          />
        ) : (
          <AiAssistant
            municipio={municipio}
            feicaoSelecionada={feicaoSelecionada}
            pendingQuestion={pendingAI}
            onClearPending={() => setPendingAI(null)}
          />
        )}
      </div>
    </div>
  );

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-slate-100">
      {/* Cabeçalho do Município */}
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-950 px-4 py-2.5 text-white">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBackHome}
            className="inline-flex items-center gap-1 rounded-lg border border-white/15 bg-white/5 px-2.5 py-1.5 text-xs font-semibold hover:bg-white/15"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Brasil
          </button>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-sm font-extrabold uppercase tracking-wide sm:text-base">
                {municipio.nome} — {municipio.uf_nome}
              </h1>
              <span className="rounded bg-white/10 px-2 py-0.5 font-mono text-[11px] text-slate-200">
                IBGE: {municipio.codigo_ibge}
              </span>
              <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${badge.classes}`}>
                {badge.label}
              </span>
            </div>
            <p className="text-[11px] text-slate-300">
              {municipio.lei_principal
                ? `${municipio.nome_plano_diretor} • ${municipio.lei_principal}`
                : municipio.mensagem_situacao}
            </p>
          </div>
        </div>

        {/* Alternador MAPA INTERATIVO vs DOCUMENTAÇÃO */}
        <div className="flex items-center gap-1 rounded-lg bg-white/10 p-1">
          <button
            type="button"
            onClick={() => setAreaCentral('mapa')}
            className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-bold transition ${
              areaCentral === 'mapa' ? 'bg-sky-600 text-white' : 'text-slate-200 hover:bg-white/10'
            }`}
          >
            <MapIcon className="h-3.5 w-3.5" />
            MAPA INTERATIVO
          </button>
          <button
            type="button"
            onClick={() => setAreaCentral('documentacao')}
            className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-bold transition ${
              areaCentral === 'documentacao'
                ? 'bg-sky-600 text-white'
                : 'text-slate-200 hover:bg-white/10'
            }`}
          >
            <BookOpen className="h-3.5 w-3.5" />
            DOCUMENTAÇÃO
          </button>
        </div>
      </header>

      {/* Banner de aviso documental quando pertinente */}
      {municipio.aviso_documental && (
        <div className="border-b border-amber-200 bg-amber-50 px-4 py-1.5 text-[11px] text-amber-950">
          <strong>Nota documental:</strong> {municipio.aviso_documental}
        </div>
      )}

      {/* Workspace 3 colunas (Desktop) + Drawers (Mobile) */}
      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        {/* Painel Esquerdo Desktop */}
        <aside className="hidden w-72 shrink-0 border-r border-slate-200 lg:block xl:w-80">
          {painelEsquerdoConteudo}
        </aside>

        {/* Área Central (Mapa Interativo ou Leitor Documental) */}
        <main className="relative min-w-0 flex-1">
          {areaCentral === 'mapa' ? (
            <MunicipalityMap
              codigoIbge={municipio.codigo_ibge}
              limiteGeojson={limiteGeojson}
              camadasVisiveis={camadasVisiveis}
              flyToCoord={flyToCoord}
              onSelectFeature={handleSelectFeature}
            />
          ) : (
            <DocumentViewer
              municipio={municipio}
              onRefreshMunicipio={carregarDadosMunicipio}
            />
          )}
        </main>

        {/* Painel Direito Desktop */}
        <aside className="hidden w-80 shrink-0 border-l border-slate-200 lg:block xl:w-96">
          {painelDireitoConteudo}
        </aside>

        {/* Drawers Mobile */}
        {mobileLeftOpen && (
          <div className="fixed inset-0 z-40 flex lg:hidden">
            <div className="h-full w-80 max-w-[85vw] bg-white shadow-2xl">
              <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2">
                <span className="text-xs font-bold text-slate-800">Camadas & Legenda</span>
                <button type="button" onClick={() => setMobileLeftOpen(false)}>
                  <X className="h-4 w-4 text-slate-600" />
                </button>
              </div>
              <div className="h-[calc(100%-40px)]">{painelEsquerdoConteudo}</div>
            </div>
            <div className="flex-1 bg-black/40" onClick={() => setMobileLeftOpen(false)} />
          </div>
        )}

        {mobileRightOpen && (
          <div className="fixed inset-0 z-40 flex justify-end lg:hidden">
            <div className="flex-1 bg-black/40" onClick={() => setMobileRightOpen(false)} />
            <div className="h-full w-96 max-w-[90vw] bg-white shadow-2xl">
              <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2">
                <span className="text-xs font-bold text-slate-800">Ficha & Assistente IA</span>
                <button type="button" onClick={() => setMobileRightOpen(false)}>
                  <X className="h-4 w-4 text-slate-600" />
                </button>
              </div>
              <div className="h-[calc(100%-40px)]">{painelDireitoConteudo}</div>
            </div>
          </div>
        )}
      </div>

      {/* Barra inferior mobile para alternar painéis sem sacrificar o mapa */}
      <nav className="grid grid-cols-2 border-t border-slate-200 bg-white lg:hidden">
        <button
          type="button"
          onClick={() => setMobileLeftOpen(true)}
          className="flex items-center justify-center gap-2 border-r border-slate-200 py-2.5 text-xs font-semibold text-slate-800"
        >
          <Menu className="h-4 w-4 text-sky-700" />
          Camadas & Documentos
        </button>
        <button
          type="button"
          onClick={() => setMobileRightOpen(true)}
          className="flex items-center justify-center gap-2 py-2.5 text-xs font-semibold text-slate-800"
        >
          <Bot className="h-4 w-4 text-sky-700" />
          Zona & Assistente IA
        </button>
      </nav>
    </div>
  );
}
