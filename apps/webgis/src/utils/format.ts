import type { SituacaoPlano } from '../types/domain';

export function formatSituacaoBadge(situacao: SituacaoPlano): {
  label: string;
  classes: string;
} {
  switch (situacao) {
    case 'vigente':
      return {
        label: 'Plano Diretor Vigente',
        classes: 'bg-emerald-50 text-emerald-800 border-emerald-200',
      };
    case 'localizado_em_verificacao':
      return {
        label: 'Localizado — Em Verificação',
        classes: 'bg-amber-50 text-amber-800 border-amber-200',
      };
    case 'desatualizado_ou_substituido':
      return {
        label: 'Histórico / Em Revisão',
        classes: 'bg-sky-50 text-sky-800 border-sky-200',
      };
    default:
      return {
        label: 'Não Localizado nas Fontes',
        classes: 'bg-slate-100 text-slate-600 border-slate-200',
      };
  }
}

export function formatArea(areaM2?: number | null): string {
  if (areaM2 === null || areaM2 === undefined || Number.isNaN(areaM2)) return 'Não disponível';
  if (areaM2 >= 10000) {
    const ha = areaM2 / 10000;
    return `${ha.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} ha (${Math.round(areaM2).toLocaleString('pt-BR')} m²)`;
  }
  return `${Math.round(areaM2).toLocaleString('pt-BR')} m²`;
}
