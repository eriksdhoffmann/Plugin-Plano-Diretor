import { BookOpen, ExternalLink, FileCheck2, Info, Sparkles } from 'lucide-react';
import type { FeicaoSelecionada, MunicipioDetalhe } from '../types/domain';
import { formatArea } from '../utils/format';
import { obterExplicacaoCamada } from '../utils/layerExplainer';

interface ZoneInspectorProps {
  municipio: MunicipioDetalhe;
  feicao: FeicaoSelecionada | null;
  onAskAIWithZone: (sigla: string, nome: string) => void;
}

const DICIONARIO_PARAMETROS: Array<{
  keys: string[];
  label: string;
  explicacao: string;
}> = [
  {
    keys: ['taxa_ocupacao'],
    label: 'Taxa de Ocupação (TO)',
    explicacao: 'Percentual máximo do lote que a edificação pode cobrir no solo.',
  },
  {
    keys: ['cal_basico'],
    label: 'Coeficiente Básico (CAL)',
    explicacao: 'Multiplicador gratuito da área do lote para o total de m² construídos.',
  },
  {
    keys: ['cal_maximo'],
    label: 'Coeficiente Máximo (CAL)',
    explicacao: 'Limite máximo de construção (geralmente exige outorga onerosa acima do básico).',
  },
  {
    keys: ['gabarito_pavimentos'],
    label: 'Gabarito / Altura Máxima',
    explicacao: 'Número máximo de pavimentos permitido na zona.',
  },
  {
    keys: ['taxa_permeabilidade'],
    label: 'Taxa de Permeabilidade',
    explicacao: 'Percentual mínimo do terreno que deve infiltrar água da chuva.',
  },
  {
    keys: ['recuo_frontal'],
    label: 'Recuo Frontal',
    explicacao: 'Distância mínima obrigatória entre a fachada e o alinhamento da via.',
  },
  {
    keys: ['lote_area_minima'],
    label: 'Lote Área Mínima',
    explicacao: 'Menor tamanho de terreno permitido em novos parcelamentos.',
  },
  {
    keys: ['lote_testada_minima'],
    label: 'Testada Mínima',
    explicacao: 'Largura mínima da frente do lote para a rua.',
  },
];

export function ZoneInspector({ municipio, feicao, onAskAIWithZone }: ZoneInspectorProps) {
  if (!feicao) {
    return (
      <div className="space-y-4 p-4 text-sm text-slate-600">
        <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4 text-center">
          <Info className="mx-auto mb-2 h-6 w-6 text-slate-400" />
          <p className="font-medium text-slate-800">Nenhum polígono selecionado no mapa</p>
          <p className="mt-1 text-xs text-slate-500">
            Clique sobre qualquer polígono no mapa para entender o que aquela área significa, seus
            usos, parâmetros urbanísticos e fundamentação legal.
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
                      Interpretar
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
  const sigla = String(p._pd_sigla || p.sg_zona || p.sigla_z || p.zona || feicao.camadaNome);
  const nome = String(p._pd_nome || p.nm_zona || p.legenda_m || p.nome_zona || feicao.camadaNome);
  const grupo = p._pd_grupo ? String(p._pd_grupo) : null;
  const legislacao = p._pd_legislacao ? String(p._pd_legislacao) : municipio.lei_principal;
  const areaM2 = typeof p._pd_area_m2 === 'number' ? p._pd_area_m2 : null;

  const regra = municipio.zonas_regras.find(
    (z) =>
      z.sigla.toLowerCase() === sigla.toLowerCase() ||
      z.nome.toLowerCase() === nome.toLowerCase()
  );

  // Extrai parâmetros diretamente da feição (ex.: Araquari LC 281) ou da regra catalogada
  const parametrosExtraidos: Array<{ label: string; valor: string; explicacao?: string }> = [];
  for (const spec of DICIONARIO_PARAMETROS) {
    const kFound = spec.keys.find((k) => p[k] !== undefined && p[k] !== null && String(p[k]).trim() !== '');
    if (kFound) {
      parametrosExtraidos.push({
        label: spec.label,
        valor: String(p[kFound]),
        explicacao: spec.explicacao,
      });
    }
  }
  if (parametrosExtraidos.length === 0 && regra?.parametros) {
    for (const [k, v] of Object.entries(regra.parametros)) {
      parametrosExtraidos.push({ label: k, valor: String(v) });
    }
  }

  const usosDaFeicao = p.usos_admitidos ? String(p.usos_admitidos) : null;
  const avisoFeicao = p.aviso_origem ? String(p.aviso_origem) : null;
  const expCamada = obterExplicacaoCamada(feicao.camadaNome, feicao.categoria);

  return (
    <div className="space-y-3.5 p-3.5 text-xs">
      {/* Explicação didática imediata da camada clicada (ex.: Sistema Viário, Zoneamento, APP) */}
      <div className="rounded-xl border border-sky-200 bg-sky-50/80 p-3">
        <div className="flex items-center gap-1.5 text-[11px] font-bold text-sky-900">
          <BookOpen className="h-3.5 w-3.5 text-sky-700" />
          O que é: {expCamada.tituloCurto}?
        </div>
        <p className="mt-1 leading-relaxed text-slate-700">{expCamada.oQueE}</p>
        <p className="mt-1 text-[11px] text-slate-600">
          <strong>Para que serve:</strong> {expCamada.paraQueServe}
        </p>
      </div>

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

      <button
        type="button"
        onClick={() => onAskAIWithZone(sigla, nome)}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-sky-700 px-3 py-2 text-xs font-semibold text-white shadow-xs transition hover:bg-sky-800"
      >
        <Sparkles className="h-4 w-4" />
        Interpretar esta parte do Plano Diretor com IA
      </button>

      {/* Síntese didática e usos */}
      <div className="space-y-2 rounded-lg border border-slate-200 bg-white p-3">
        <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          <FileCheck2 className="h-3.5 w-3.5 text-sky-700" />
          O que é esta parte e como funciona
        </div>

        <div>
          <span className="font-semibold text-slate-800">Finalidade territorial:</span>
          <p className="mt-0.5 text-slate-600">
            {regra?.finalidade ||
              'Classificação preservada da cartografia municipal. Use o botão acima para obter a explicação didática completa em 7 blocos.'}
          </p>
        </div>

        <div>
          <span className="font-semibold text-emerald-800">Atividades permitidas / admitidas:</span>
          <p className="mt-0.5 text-slate-600">
            {regra?.usos_permitidos ||
              usosDaFeicao ||
              'Não foi possível determinar automaticamente apenas pelos atributos do polígono; verificar quadro de usos na lei municipal.'}
          </p>
        </div>

        <div>
          <span className="font-semibold text-amber-800">Atividades condicionadas:</span>
          <p className="mt-0.5 text-slate-600">
            {regra?.usos_condicionados ||
              'Sujeitas a notas de rodapé da lei, licenciamento ambiental e consulta de viabilidade.'}
          </p>
        </div>

        <div>
          <span className="font-semibold text-rose-800">Atividades proibidas / Restrições:</span>
          <p className="mt-0.5 text-slate-600">
            {regra?.usos_proibidos || 'Verificar vedações expressas na tabela da lei municipal.'}
          </p>
        </div>
      </div>

      {/* Parâmetros Urbanísticos com tradução didática */}
      <div className="rounded-lg border border-slate-200 bg-white p-3">
        <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          Parâmetros Urbanísticos Encontrados
        </h4>
        {parametrosExtraidos.length > 0 ? (
          <div className="space-y-2">
            {parametrosExtraidos.map((item) => (
              <div key={item.label} className="rounded-lg border border-slate-100 bg-slate-50 p-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-slate-700">{item.label}</span>
                  <span className="rounded bg-slate-900 px-2 py-0.5 font-mono text-[11px] font-bold text-white">
                    {item.valor}
                  </span>
                </div>
                {item.explicacao && (
                  <p className="mt-1 text-[10px] text-slate-500">{item.explicacao}</p>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="rounded border border-amber-200 bg-amber-50 p-2 text-amber-900">
            {regra?.aviso_parametros ||
              'Parâmetros numéricos (CA, TO, recuos, gabarito, lote mínimo) não estão anexados ao polígono e dependem de conferência na tabela anexa oficial do município.'}
          </p>
        )}
      </div>

      {/* Rastreabilidade */}
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-[11px] text-slate-600">
        <div className="mb-1.5 font-semibold uppercase tracking-wide text-slate-700">
          Rastreabilidade e Proveniência
        </div>
        {avisoFeicao && (
          <p className="mb-2 rounded border border-amber-200 bg-amber-50 p-1.5 text-[10px] text-amber-900">
            {avisoFeicao}
          </p>
        )}
        <ul className="space-y-1">
          <li>
            <strong>Zona:</strong> {sigla}
          </li>
          <li>
            <strong>Legislação aplicável:</strong> {legislacao || 'Não informada'}
          </li>
          <li>
            <strong>Artigo / Anexo:</strong> {regra?.artigo || 'Conferir texto consolidado da lei'}
          </li>
          <li>
            <strong>Camada / Mapa:</strong> {feicao.camadaNome}
          </li>
          <li>
            <strong>Fonte:</strong> {feicao.fonteOficial || municipio.fonte_oficial || 'Não informada'}
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
