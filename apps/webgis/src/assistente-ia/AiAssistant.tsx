import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, HelpCircle, Send, ShieldAlert, Sparkles } from 'lucide-react';
import { apiClient } from '../api/client';
import type { FeicaoSelecionada, ModoIA, MunicipioDetalhe, RespostaIA } from '../types/domain';

interface AiAssistantProps {
  municipio: MunicipioDetalhe;
  feicaoSelecionada: FeicaoSelecionada | null;
  pendingQuestion?: { pergunta: string; zonaSigla?: string; zonaNome?: string } | null;
  onClearPending?: () => void;
}

const PERGUNTAS_RAPIDAS = [
  'Por que essa área recebeu essa classificação e qual é sua finalidade?',
  'Posso construir um imóvel residencial nessa área?',
  'Qual é a diferença entre zona de preservação municipal e APP?',
  'Quais documentos preciso consultar antes de uma análise urbanística?',
];

export function AiAssistant({
  municipio,
  feicaoSelecionada,
  pendingQuestion,
  onClearPending,
}: AiAssistantProps) {
  const [modo, setModo] = useState<ModoIA>('didatico');
  const [pergunta, setPergunta] = useState('');
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [resposta, setResposta] = useState<RespostaIA | null>(null);

  const zonaSigla = feicaoSelecionada
    ? String(
        feicaoSelecionada.properties._pd_sigla ||
          feicaoSelecionada.properties.sg_zona ||
          feicaoSelecionada.properties.sigla_z ||
          ''
      ) || undefined
    : undefined;
  const zonaNome = feicaoSelecionada
    ? String(
        feicaoSelecionada.properties._pd_nome ||
          feicaoSelecionada.properties.nm_zona ||
          feicaoSelecionada.properties.legenda_m ||
          ''
      ) || undefined
    : undefined;

  const executarConsulta = async (texto: string, overrideSigla?: string, overrideNome?: string) => {
    if (!texto.trim()) return;
    setLoading(true);
    setErro(null);
    try {
      const res = await apiClient.consultarIA({
        codigo_ibge: municipio.codigo_ibge,
        pergunta: texto.trim(),
        modo,
        zona_sigla: overrideSigla ?? zonaSigla ?? null,
        zona_nome: overrideNome ?? zonaNome ?? null,
        atributos_feicao: feicaoSelecionada?.properties ?? null,
      });
      setResposta(res);
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro ao consultar assistente IA.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (pendingQuestion) {
      setPergunta(pendingQuestion.pergunta);
      executarConsulta(
        pendingQuestion.pergunta,
        pendingQuestion.zonaSigla,
        pendingQuestion.zonaNome
      );
      onClearPending?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingQuestion]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    executarConsulta(pergunta);
  };

  return (
    <div className="flex h-full flex-col">
      {/* Seletor de Modo: Didático / Técnico / Técnico de Prefeitura */}
      <div className="border-b border-slate-200 bg-slate-50 p-3">
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Modo de Interpretação
          </span>
          {(zonaSigla || zonaNome) && (
            <span className="rounded bg-sky-100 px-2 py-0.5 text-[10px] font-semibold text-sky-800">
              Zona: {zonaSigla || zonaNome}
            </span>
          )}
        </div>
        <div className="grid grid-cols-3 gap-1">
          {[
            { id: 'didatico', label: 'Didático' },
            { id: 'tecnico', label: 'Técnico' },
            { id: 'prefeitura', label: 'Prefeitura' },
          ].map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setModo(m.id as ModoIA)}
              className={`rounded-md px-2 py-1.5 text-xs font-semibold transition ${
                modo === m.id
                  ? 'bg-slate-900 text-white shadow-2xs'
                  : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-100'
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>

        {/* Sugestões rápidas */}
        <div className="mt-2 flex flex-wrap gap-1">
          {PERGUNTAS_RAPIDAS.map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => {
                setPergunta(q);
                executarConsulta(q);
              }}
              className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-left text-[10px] text-slate-600 hover:border-sky-300 hover:bg-sky-50 hover:text-sky-900"
            >
              {q}
            </button>
          ))}
        </div>
      </div>

      {/* Área de resposta estruturada */}
      <div className="flex-1 space-y-3 overflow-y-auto p-3.5 text-xs">
        {loading && (
          <div className="rounded-lg border border-sky-200 bg-sky-50 p-3 text-sky-900">
            Consultando documentos municipais e fundamentação legal de {municipio.nome}...
          </div>
        )}

        {erro && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-rose-800">
            {erro}
          </div>
        )}

        {!resposta && !loading && (
          <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4 text-center text-slate-600">
            <Sparkles className="mx-auto mb-2 h-6 w-6 text-sky-700" />
            <p className="font-semibold text-slate-800">
              Assistente RAG — {municipio.nome}/{municipio.uf}
            </p>
            <p className="mt-1 text-[11px] text-slate-500">
              Consulta primeiro os documentos catalogados do município e, quando aplicável, o
              Código Florestal Federal (Lei nº 12.651/2012). Nunca inventa artigos ou parâmetros.
            </p>
          </div>
        )}

        {resposta && (
          <div className="space-y-3">
            {resposta.aviso_documental && (
              <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-[11px] text-amber-900">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                <span>{resposta.aviso_documental}</span>
              </div>
            )}

            {/* Os 7 blocos obrigatórios */}
            {[
              { titulo: '1. O que é', corpo: resposta.sete_blocos.o_que_e, tone: 'border-slate-200 bg-white' },
              { titulo: '2. Por que existe', corpo: resposta.sete_blocos.por_que_existe, tone: 'border-slate-200 bg-white' },
              { titulo: '3. O que pode', corpo: resposta.sete_blocos.o_que_pode, tone: 'border-emerald-200 bg-emerald-50/40' },
              {
                titulo: '4. O que depende de condições',
                corpo: resposta.sete_blocos.o_que_depende_de_condicoes,
                tone: 'border-amber-200 bg-amber-50/40',
              },
              { titulo: '5. O que não pode', corpo: resposta.sete_blocos.o_que_nao_pode, tone: 'border-rose-200 bg-rose-50/40' },
              { titulo: '6. Fundamentação legal', corpo: resposta.sete_blocos.fundamentacao, tone: 'border-sky-200 bg-sky-50/40' },
              { titulo: '7. Fonte oficial', corpo: resposta.sete_blocos.fonte, tone: 'border-slate-200 bg-slate-50' },
            ].map((b) => (
              <div key={b.titulo} className={`rounded-lg border p-2.5 ${b.tone}`}>
                <div className="font-bold text-slate-900">{b.titulo}</div>
                <p className="mt-1 leading-relaxed text-slate-700 break-words">{b.corpo}</p>
              </div>
            ))}

            {/* Distinção ambiental obrigatória quando aplicável */}
            {resposta.distincao_ambiental && (
              <div className="rounded-lg border border-emerald-300 bg-emerald-50/60 p-3">
                <div className="mb-1.5 flex items-center gap-1.5 font-bold text-emerald-950">
                  <ShieldAlert className="h-4 w-4 text-emerald-700" />
                  Distinção Ambiental Obrigatória (Não Confundir)
                </div>
                <div className="space-y-2 text-[11px] text-emerald-950">
                  {Object.values(resposta.distincao_ambiental).map((item) => (
                    <div key={item.nome} className="rounded bg-white/80 p-2">
                      <div className="font-semibold">{item.nome}</div>
                      <div className="text-[10px] text-emerald-800">{item.fundamentacao}</div>
                      <p className="mt-0.5 text-slate-700">{item.definicao}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Checklist de instrumentos disponíveis vs pendentes (especialmente útil para Prefeituras) */}
            <div className="rounded-lg border border-slate-200 bg-white p-3">
              <div className="mb-2 font-bold text-slate-900">
                Instrumentos Necessários para Análise Completa
              </div>
              <div className="space-y-1.5">
                {resposta.checklist_analise.map((c) => (
                  <div key={c.instrumento} className="flex items-start gap-2 text-[11px]">
                    {c.status === 'disponivel' ? (
                      <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
                    ) : (
                      <HelpCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
                    )}
                    <div>
                      <span className="font-semibold text-slate-800">{c.instrumento}: </span>
                      <span className="text-slate-600">{c.detalhe}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Separação de proveniência */}
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-[11px] text-slate-600">
              <div className="font-semibold text-slate-800">Separação de Proveniência</div>
              <p className="mt-1">
                <strong>Síntese do sistema:</strong> {resposta.proveniencia.sintese_sistema}
              </p>
              <p className="mt-0.5">
                <strong>Geometria:</strong> {resposta.proveniencia.geometria_origem} •{' '}
                <strong>Situação:</strong> {resposta.proveniencia.status_verificacao}
              </p>
              {resposta.proveniencia.texto_literal.length > 0 && (
                <div className="mt-1.5 space-y-1">
                  <strong className="text-slate-800">Trechos literais recuperados:</strong>
                  {resposta.proveniencia.texto_literal.map((t, i) => (
                    <blockquote
                      key={i}
                      className="border-l-2 border-sky-400 bg-white pl-2 py-1 text-[10px] text-slate-700"
                    >
                      <span className="font-semibold">
                        {t.lei} {t.artigo ? `(${t.artigo})` : ''}:
                      </span>{' '}
                      {t.trecho}
                    </blockquote>
                  ))}
                </div>
              )}
            </div>

            {/* Aviso legal permanente */}
            <div className="rounded-lg border border-slate-300 bg-slate-100 p-2.5 text-[10px] leading-relaxed text-slate-600">
              {resposta.aviso_legal}
            </div>
          </div>
        )}
      </div>

      {/* Formulário de pergunta */}
      <form onSubmit={handleSubmit} className="flex gap-2 border-t border-slate-200 bg-white p-3">
        <input
          type="text"
          value={pergunta}
          onChange={(e) => setPergunta(e.target.value)}
          placeholder="Pergunte sobre zoneamento, regras, APP ou legislação..."
          className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900 outline-none focus:border-sky-600"
        />
        <button
          type="submit"
          disabled={loading || !pergunta.trim()}
          className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
        >
          <Send className="h-3.5 w-3.5" />
          Enviar
        </button>
      </form>
    </div>
  );
}
