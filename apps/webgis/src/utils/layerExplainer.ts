export interface LayerExplanation {
  tituloCurto: string;
  oQueE: string;
  paraQueServe: string;
  comoLerNoMapa: string;
  exemploPratico: string;
}

export function obterExplicacaoCamada(nomeCamada: string, categoria?: string): LayerExplanation {
  const txt = (nomeCamada || '').toLowerCase();

  if (txt.includes('viário') || txt.includes('viario') || txt.includes('sistema vi')) {
    return {
      tituloCurto: 'Sistema Viário do Plano Diretor',
      oQueE:
        'É o mapa oficial da hierarquia das ruas, avenidas, rodovias e ligações futuras planejadas pela cidade (vias arteriais, coletoras, estruturais, marginais e locais).',
      paraQueServe:
        'Define quais vias concentram o transporte pesado, ônibus e comércio, qual deve ser a largura mínima da rua (caixa viária) e qual recuo frontal ou faixa de alargamento futuro um terreno precisa respeitar.',
      comoLerNoMapa:
        'Cada linha colorida representa uma categoria de via. Clique em qualquer rua/eixo no mapa para ver a hierarquia e a legislação aplicável.',
      exemploPratico:
        'Se um terreno faz frente para uma "Via Arterial" ou "Projetada", a prefeitura pode exigir recuo maior ou reservar parte da frente para futuro alargamento da avenida.',
    };
  }

  if (txt.includes('macrozone')) {
    return {
      tituloCurto: 'Macrozoneamento Municipal',
      oQueE:
        'É a grande divisão estratégica do território inteiro do município — separando o que tem vocação urbana (cidade e bairros) do que tem vocação rural, industrial ou ambiental.',
      paraQueServe:
        'Orienta onde a cidade deve crescer, onde o poder público vai investir em infraestrutura (água, esgoto, transporte) e onde a ocupação deve ser contida.',
      comoLerNoMapa:
        'As grandes manchas dividem o município (ex.: Macrozona Urbana × Macrozona Rural). Clique em qualquer área para ver os detalhes da macrozona.',
      exemploPratico:
        'Um imóvel na Macrozona Rural segue regras agrárias (módulo mínimo do INCRA) e não pode ser loteado em lotes urbanos pequenos como na Macrozona Urbana.',
    };
  }

  if (txt.includes('perímetro') || txt.includes('perimetro')) {
    return {
      tituloCurto: 'Perímetro Urbano',
      oQueE:
        'É a linha oficial definida por lei municipal que separa a Zona Urbana (cidade) da Zona Rural (campo).',
      paraQueServe:
        'Determina onde podem existir loteamentos urbanos (Lei nº 6.766/1979), onde se aplicam os índices de construção do zoneamento urbano e onde incide IPTU (urbano) em vez de ITR (rural).',
      comoLerNoMapa:
        'A área destacada delimita o território legalmente considerado urbano pelo Plano Diretor.',
      exemploPratico:
        'Para transformar uma chácara rural em loteamento residencial, o imóvel precisa primeiro estar dentro do Perímetro Urbano aprovado em lei.',
    };
  }

  if (txt.includes('zoneamento') || txt.includes('uso e ocupação')) {
    return {
      tituloCurto: 'Zoneamento Urbano (Uso e Ocupação do Solo)',
      oQueE:
        'É a divisão detalhada da cidade em "zonas" com regras próprias (ex.: residenciais, diversidade urbana, corredores comerciais, industriais e interesse social).',
      paraQueServe:
        'Define o que pode ser construído ou aberto em cada terreno (casa, prédio, loja, indústria), a altura máxima (gabarito), quanto do lote pode ser ocupado (TO) e o afastamento da rua (recuo).',
      comoLerNoMapa:
        'Cada cor representa uma sigla de zona local. Clique em qualquer polígono colorido para abrir a ficha com os usos e parâmetros encontrados.',
      exemploPratico:
        'Em uma Zona Industrial ou Corredor Industrial (CIND), grandes galpões são permitidos e prédios residenciais costumam ser proibidos para evitar conflitos de ruído e tráfego.',
    };
  }

  if (txt.includes('app') || txt.includes('preservação permanente') || txt.includes('hidrografia')) {
    return {
      tituloCurto: 'Área de Preservação Permanente (APP)',
      oQueE:
        'Área ambientalmente protegida pelo Código Florestal (Lei Federal nº 12.651/2012): margens de rios/córregos, entorno de nascentes (50 m), manguezais, restingas e encostas > 45°.',
      paraQueServe:
        'Protege a água, evita enchentes, deslizamentos e assoreamento dos rios. Não se confunde com Zona de Preservação criada pela prefeitura — a APP vale por lei federal.',
      comoLerNoMapa:
        'As manchas mostram faixas de proteção mapeadas ao longo de rios e nascentes. A delimitação definitiva de um lote exige medição hidrográfica em campo.',
      exemploPratico:
        'Mesmo que um terreno esteja em zona urbana comercial, se passar um córrego nos fundos, a faixa marginal é APP e tem restrição severa de construção.',
    };
  }

  if (txt.includes('unidade de conservação') || txt.includes('parque') || txt.includes('apa') || txt.includes('seuc')) {
    return {
      tituloCurto: 'Unidade de Conservação (SNUC)',
      oQueE:
        'Espaço territorial protegido por decreto ou lei específica (Parque Natural, APA, Estação Ecológica, RPPN), regido pela Lei Federal nº 9.985/2000 e por Plano de Manejo próprio.',
      paraQueServe:
        'Conserva ecossistemas relevantes e disciplina visitação, pesquisa ou ocupação sustentável dentro dos limites da unidade.',
      comoLerNoMapa:
        'Clique no polígono para identificar o nome da Unidade de Conservação, seu grupo (Proteção Integral ou Uso Sustentável) e decreto de criação.',
      exemploPratico:
        'Em uma APA (Uso Sustentável), construções podem existir desde que cumpram tanto o Plano Diretor quanto as regras do Plano de Manejo da APA.',
    };
  }

  if (txt.includes('cota') || categoria === 'ambiental') {
    return {
      tituloCurto: 'Restrição Ambiental / Topográfica Municipal',
      oQueE:
        'Camada de restrição urbanística ou ambiental definida por norma municipal ou estadual (como cotas altimétricas para proteção de morros/mananciais ou áreas de risco).',
      paraQueServe:
        'Limita ou condiciona cortes de terreno, desmatamento e edificações em áreas ambientalmente sensíveis ou acima de determinada altitude.',
      comoLerNoMapa:
        'Quando se sobrepõe ao zoneamento comum, aplicam-se as regras mais restritivas após consulta de viabilidade.',
      exemploPratico:
        'Em Joinville, acima da Cota 40 m há restrições específicas de ocupação e preservação definidas pela legislação municipal.',
    };
  }

  if (txt.includes('limite municipal')) {
    return {
      tituloCurto: 'Limite Municipal Oficial (IBGE)',
      oQueE:
        'Linha oficial da divisão político-administrativa publicada pelo IBGE que delimita o território jurídico do município.',
      paraQueServe:
        'Garante que todas as camadas do Plano Diretor sejam visualizadas exatamente dentro da fronteira oficial do município.',
      comoLerNoMapa:
        'A linha contínua escura marca a divisa municipal oficial.',
      exemploPratico:
        'Um imóvel próximo à divisa entre dois municípios segue exclusivamente o Plano Diretor do município em que está matriculado.',
    };
  }

  return {
    tituloCurto: nomeCamada || 'Camada Cartográfica Municipal',
    oQueE:
      'Camada espacial integrante da base territorial e urbanística do município.',
    paraQueServe:
      'Auxilia na leitura territorial e no cruzamento entre regras do Plano Diretor e condicionantes físicas/ambientais.',
    comoLerNoMapa:
      'Clique sobre qualquer elemento desenhado para inspecionar seus atributos originais.',
    exemploPratico:
      'Use o Controle de Camadas para sobrepor esta informação ao Zoneamento e verificar interferências no lote.',
  };
}
