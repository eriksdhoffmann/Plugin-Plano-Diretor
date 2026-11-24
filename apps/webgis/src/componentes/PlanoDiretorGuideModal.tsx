import { BookOpen, Compass, Layers, Ruler, ShieldAlert, X } from 'lucide-react';

interface PlanoDiretorGuideModalProps {
  open: boolean;
  onClose: () => void;
}

const PARTES_PLANO_DIRETOR = [
  {
    titulo: '1. O que é o Plano Diretor (Lei Federal nº 10.257/2001)',
    subtitulo: 'A regra maior de desenvolvimento da cidade',
    resumo:
      'É a lei municipal básica que orienta como o município deve crescer pelos próximos anos, definindo onde morar, trabalhar, preservar o meio ambiente e investir em transporte, saneamento e equipamentos públicos.',
    comoLer:
      'Sempre observe o número da lei vigente e sua data de aprovação/revisão (o Estatuto da Cidade determina revisão a cada 10 anos).',
  },
  {
    titulo: '2. Macrozoneamento (Anexo Estratégico)',
    subtitulo: 'O mapa das grandes divisões do território',
    resumo:
      'Divide o município em grandes porções — como Macrozona Urbana, Macrozona de Expansão Urbana, Macrozona Rural e Macrozonas Ambientais. Ele diz qual é a vocação geral de cada região antes de detalhar quadra por quadra.',
    comoLer:
      'Se um terreno está na Macrozona Rural, não se aplicam índices de construção urbana (prédios, loteamentos urbanos) sem alteração legal do perímetro urbano.',
  },
  {
    titulo: '3. Zoneamento e Uso do Solo',
    subtitulo: 'As regras específicas de cada bairro ou corredor',
    resumo:
      'Subdivide a cidade em zonas específicas (Residenciais, Mistas/Diversidade, Industriais, Corredores de Urbanidade, ZEIS, Preservação). Cada zona define quais atividades são permitidas, condicionadas ou proibidas.',
    comoLer:
      'Códigos comuns de uso: R1 (casa unifamiliar), R2/R3 (multifamiliar/prédios), C1–C5 (comércio do local ao grande porte), S1–S4 (serviços), INST (escolas/saúde/público), IND (indústria).',
  },
  {
    titulo: '4. Perímetro Urbano e Sistema Viário',
    subtitulo: 'Limite cidade × campo e hierarquia das ruas',
    resumo:
      'O Perímetro Urbano define exatamente onde termina a área urbana e começa a zona rural. O Sistema Viário classifica vias arteriais, coletoras, locais e rodovias — o tipo de rua na frente do lote pode ampliar ou restringir o que se constrói.',
    comoLer:
      'Muitas leis exigem recuo frontal maior ou faixa não edificável ao longo de rodovias e vias arteriais projetadas.',
  },
];

const PARAMETROS_CONSTRUTIVOS = [
  {
    nome: 'Taxa de Ocupação (TO)',
    sigla: 'Ex.: 60%',
    significado:
      'Porcentagem máxima do terreno que a projeção da construção pode cobrir no chão. Em um lote de 300 m² com TO de 60%, a área ocupada no térreo pode chegar a 180 m².',
  },
  {
    nome: 'Coeficiente de Aproveitamento (CA / CAL)',
    sigla: 'Básico e Máximo',
    significado:
      'Número que multiplicado pela área do terreno dá o total de metros quadrados construíveis somando todos os andares. Ex.: lote 300 m² × CAL 2,5 = até 750 m² construídos. Acima do Básico até o Máximo pode exigir Outorga Onerosa.',
  },
  {
    nome: 'Gabarito / Altura Máxima',
    sigla: 'Ex.: 4 ou 12 pavimentos',
    significado:
      'Número máximo de andares (pavimentos) ou altura em metros permitida naquela zona. Quando aparece "2 / 4 / 8", varia conforme o porte ou largura da via.',
  },
  {
    nome: 'Taxa de Permeabilidade',
    sigla: 'Ex.: 15% a 80%',
    significado:
      'Fração mínima do terreno que precisa permanecer livre de piso impermeável (grama, brita, jardim ou piso drenante) para a água da chuva infiltrar e evitar enchentes.',
  },
  {
    nome: 'Recuos / Afastamentos',
    sigla: 'Frontal, Lateral e Fundos',
    significado:
      'Distância mínima obrigatória entre a parede da edificação e a divisa do terreno ou alinhamento da rua (ex.: recuo frontal de 5,00 m).',
  },
  {
    nome: 'Lote Mínimo e Testada Mínima',
    sigla: 'Ex.: 240 m² / 10 m',
    significado:
      'Menor área (m²) e menor largura de frente (testada em metros) permitidas ao desmembrar ou lotear um terreno naquela zona.',
  },
];

export function PlanoDiretorGuideModal({ open, onClose }: PlanoDiretorGuideModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-xs">
      <div className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-900 px-5 py-4 text-white">
          <div className="flex items-center gap-2.5">
            <BookOpen className="h-5 w-5 text-sky-400" />
            <div>
              <h2 className="text-base font-extrabold">
                Entender o Plano Diretor — Guia Didático e Técnico
              </h2>
              <p className="text-xs text-slate-300">
                Aprenda o que significa cada parte do Plano Diretor, seus mapas e índices urbanísticos
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-300 hover:bg-white/10 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-6 overflow-y-auto p-5 text-xs text-slate-700">
          {/* Partes estruturais */}
          <section>
            <div className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-900">
              <Compass className="h-4 w-4 text-sky-700" />
              Estrutura de um Plano Diretor Municipal
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {PARTES_PLANO_DIRETOR.map((p) => (
                <div key={p.titulo} className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5">
                  <div className="font-bold text-slate-900">{p.titulo}</div>
                  <div className="text-[11px] font-semibold text-sky-800">{p.subtitulo}</div>
                  <p className="mt-1.5 leading-relaxed text-slate-600">{p.resumo}</p>
                  <p className="mt-2 rounded bg-white p-2 text-[11px] text-slate-700">
                    <strong>Na prática:</strong> {p.comoLer}
                  </p>
                </div>
              ))}
            </div>
          </section>

          {/* Parâmetros construtivos */}
          <section>
            <div className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-900">
              <Ruler className="h-4 w-4 text-amber-600" />
              O que significa cada índice na Ficha da Zona?
            </div>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
              {PARAMETROS_CONSTRUTIVOS.map((item) => (
                <div key={item.nome} className="rounded-xl border border-slate-200 bg-white p-3">
                  <div className="font-bold text-slate-900">{item.nome}</div>
                  <span className="mt-0.5 inline-block rounded bg-amber-50 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-amber-800">
                    {item.sigla}
                  </span>
                  <p className="mt-1.5 leading-relaxed text-slate-600">{item.significado}</p>
                </div>
              ))}
            </div>
          </section>

          {/* Distinção ambiental */}
          <section className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4">
            <div className="mb-2 flex items-center gap-2 text-sm font-bold text-emerald-950">
              <ShieldAlert className="h-4 w-4 text-emerald-700" />
              Atenção Ambiental — Não Confunda estas Categorias:
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <div className="rounded-lg bg-white p-2.5">
                <strong className="text-emerald-900">APP (Código Florestal — Lei 12.651/2012)</strong>
                <p className="mt-0.5 text-slate-600">
                  Proteção federal de margens de rios, nascentes (50 m), manguezais e encostas &gt; 45°. Independe da cor do zoneamento municipal.
                </p>
              </div>
              <div className="rounded-lg bg-white p-2.5">
                <strong className="text-emerald-900">Zona de Preservação Municipal</strong>
                <p className="mt-0.5 text-slate-600">
                  Classe urbanística da lei local (ex.: AUPA, ZPA) com índices restritivos próprios definidos pelo município.
                </p>
              </div>
              <div className="rounded-lg bg-white p-2.5">
                <strong className="text-emerald-900">Unidade de Conservação (SNUC — Lei 9.985/2000)</strong>
                <p className="mt-0.5 text-slate-600">
                  Parque Natural, APA, Estação Ecológica ou RPPN criada por decreto/lei específica e regida por Plano de Manejo.
                </p>
              </div>
              <div className="rounded-lg bg-white p-2.5">
                <strong className="text-emerald-900">Cotas Topográficas / Áreas de Risco</strong>
                <p className="mt-0.5 text-slate-600">
                  Restrições geotécnicas ou de inundação (ex.: Cota 40 em Joinville, Cota 5m ou declividade). Exigem laudo técnico específico.
                </p>
              </div>
            </div>
          </section>

          <section className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-100 p-3 text-[11px] text-slate-600">
            <Layers className="h-4 w-4 shrink-0 text-slate-500" />
            <span>
              <strong>Como interpretar no mapa:</strong> Selecione um município, ative a camada de Zoneamento ou Macrozoneamento no <strong>Controle de Camadas</strong> à direita e clique em qualquer polígono do mapa para abrir sua interpretação completa.
            </span>
          </section>
        </div>
      </div>
    </div>
  );
}
