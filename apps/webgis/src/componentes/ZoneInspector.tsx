import { ExternalLink, FileCheck2, Info, Sparkles } from 'lucide-react';
import type { FeicaoSelecionada, MunicipioDetalhe } from '../types/domain';
import { formatArea } from '../utils/format';

interface ZoneInspectorProps {
  municipio: MunicipioDetalhe;
  feicao: FeicaoSelecionada | null;
  onAskAIWithZone: (sigla: string, nome: string) => void;
}

export function ZoneInspector({ municipio, feicao, onAskAIWithZone }: ZoneInspectorProps) {
  if (!feicao) {
    return (
      <div className="space-y-4 p-4 text-sm text-slate-600">
        <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4 text-center">
          <Info className="mx-auto mb-2 h-6 w-6 text-slate-400" />
          <p className="font-medium text-slate-800">Nenhum polígono selecionado no mapa</p>
          <p className="mt-1 text-xs text-slate-500">
            Clique sobre qualquer polígono de zoneamento ou camada ambiental para visualizar sua
            ficha técnica, parâmetros encontrados e fundamentação legal.
          </p>
        </div>

        {municipio.zonas_regras.length > 0 && (
          <div>
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Zonas catalogadas em {municipio.nome}
            </h4>
            <div className="space-y-2">
              {municipio.zonas_regras.map((z) => (
                <div
                  key={z.sigla}
                  className="rounded-lg border border-slate-200 bg-white p-3 text-xs shadow-2xs"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-slate-900">
                      {z.sigla} — {z.nome}
                    </span>
                    <button
                      type="button"
                      onClick={() => onAskAIWithZone(z.sigla, z.nome)}
                      className="inline-flex items-center gap-1 rounded bg-sky-50 px-2 py-1 font-medium text-sky-800 hover:bg-sky-100"
                    >
                      <Sparkles className="h-3 w-3" />
                      Explicar
                    </button>
                  </div>
                  {z.finalidade && <p className="mt-1 text-slate-600">{z.finalidade}</p>}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  const p = feicao.properties;
  const sigla = String(p._pd_sigla || p.sg_zona || p.sigla_z || feicao.camadaNome);
  const nome = String(p._pd_nome || p.nm_zona || p.legenda_m || feicao.camadaNome);
  const grupo = p._pd_grupo ? String(p._pd_grupo) : null;
  const legislacao = p._pd_legislacao ? String(p._pd_legislacao) : municipio.lei_principal;
  const areaM2 = typeof p._pd_area_m2 === 'number' ? p._pd_area_m2 : null;

  const regra = municipio.zonas_regras.find(
    (z) =>
      z.sigla.toLowerCase() === sigla.toLowerCase() ||
      z.nome.toLowerCase() === nome.toLowerCase()
  );

  const parametrosEntries = Object.entries(regra?.parametros || {});

  return (
    <div className="space-y-4 p-4 text-xs">
      {/* Cabeçalho da zona preservando nome/código original */}
      <div className="rounded-xl border border-slate-200 bg-slate-900 p-3.5 text-white">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="rounded bg-white/15 px-2 py-0.5 font-mono text-[11px] font-semibold">
            {sigla}
          </span>
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
              feicao.origemGeometria === 'oficial'
                ? 'bg-emerald-500/20 text-emerald-200'
                : 'bg-amber-500/20 text-amber-200'
            }`}
          >
            {feicao.origemGeometria === 'oficial'
              ? 'Geometria Oficial'
              : 'Geometria Derivada de PDF'}
          </span>
        </div>
        <h3 className="mt-2 text-sm font-bold leading-snug">{nome}</h3>
        {grupo && <p className="mt-0.5 text-[11px] text-slate-300">{grupo}</p>}
        <div className="mt-2.5 flex items-center justify-between border-t border-white/10 pt-2 text-[11px] text-slate-300">
          <span>Área calculada:</span>
          <strong className="text-white">{formatArea(areaM2)}</strong>
        </div>
      </div>

      {/* Botão para IA explicar esta zona */}
      <button
        type="button"
        onClick={() => onAskAIWithZone(sigla, nome)}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-sky-700 px-3 py-2 text-xs font-semibold text-white shadow-xs transition hover:bg-sky-800"
      >
        <Sparkles className="h-4 w-4" />
        Interpretar esta zona com Assistente IA
      </button>

      {/* Síntese e Usos */}
      <div className="space-y-2.5 rounded-lg border border-slate-200 bg-white p-3">
        <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          <FileCheck2 className="h-3.5 w-3.5 text-sky-700" />
          Síntese fundamentada na legislação local
        </div>

        <div>
          <span className="font-semibold text-slate-800">O que é / Finalidade:</span>
          <p className="mt-0.5 text-slate-600">
            {regra?.finalidade ||
              'Classificação espacial preservada da cartografia oficial municipal. Consulte o texto integral da lei ou acione o Assistente IA para interpretação fundamentada.'}
          </p>
        </div>

        <div>
          <span className="font-semibold text-emerald-800">Atividades permitidas:</span>
          <p className="mt-0.5 text-slate-600">
            {regra?.usos_permitidos || 'Não foi possível determinar automaticamente apenas pelos atributos do polígono; verificar quadro de usos na lei municipal.'}
          </p>
        </div>

        <div>
          <span className="font-semibold text-amber-800">Atividades condicionadas:</span>
          <p className="mt-0.5 text-slate-600">
            {regra?.usos_condicionados || 'Sujeitas à consulta da legislação complementar e exigências ambientais/viárias aplicáveis.'}
          </p>
        </div>

        <div>
          <span className="font-semibold text-rose-800">Atividades proibidas / Restrições:</span>
          <p className="mt-0.5 text-slate-600">
            {regra?.usos_proibidos || 'Verificar vedações expressas na tabela da lei municipal.'}
          </p>
        </div>
      </div>

      {/* Parâmetros Urbanísticos (somente os efetivamente encontrados) */}
      <div className="rounded-lg border border-slate-200 bg-white p-3">
        <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          Parâmetros Urbanísticos Encontrados
        </h4>
        {parametrosEntries.length > 0 ? (
          <dl className="grid grid-cols-2 gap-2">
            {parametrosEntries.map(([k, v]) => (
              <div key={k} className="rounded bg-slate-50 p-2">
                <dt className="text-[10px] text-slate-500">{k}</dt>
                <dd className="font-semibold text-slate-800">{String(v)}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="rounded border border-amber-200 bg-amber-50 p-2 text-amber-900">
            {regra?.aviso_parametros ||
              'Parâmetros numéricos (coeficiente de aproveitamento, taxa de ocupação, recuos, gabarito, lote mínimo) não estão anexados ao polígono e dependem de conferência na tabela anexa da legislação oficial municipal.'}
          </p>
        )}
      </div>

      {/* Rastreabilidade */}
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-[11px] text-slate-600">
        <div className="mb-1.5 font-semibold uppercase tracking-wide text-slate-700">
          Rastreabilidade e Proveniência
        </div>
        <ul className="space-y-1">
          <li>
            <strong>Zona:</strong> {sigla}
          </li>
          <li>
            <strong>Legislação aplicável:</strong> {legislacao || 'Não informada'}
          </li>
          <li>
            <strong>Artigo / Referência:</strong> {regra?.artigo || 'Conferir texto consolidado da lei'}
          </li>
          <li>
            <strong>Camada / Mapa:</strong> {feicao.camadaNome}
          </li>
          <li>
            <strong>Fonte oficial:</strong> {feicao.fonteOficial || municipio.fonte_oficial || 'Não informada'}
          </li>
          <li>
            <strong>Data de verificação:</strong>{' '}
            {feicao.dataVerificacao || municipio.data_verificacao || 'Não verificada'}
          </li>
        </ul>
        {municipio.url_oficial && (
          <a
            href={municipio.url_oficial}
            target="_blank"
            rel="noreferrer"
            className="mt-2 inline-flex items-center gap-1 font-medium text-sky-700 hover:underline"
          >
            Abrir fonte oficial <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </div>
    </div>
  );
}
