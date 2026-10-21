import type { Period } from '@/components/admin/period-selector'

/**
 * O que os cartões do dashboard dizem do período escolhido ("Receita do mês",
 * "concluídos no mês", "vs. mês anterior"). Eram fixos em "mês" — com o filtro
 * "Hoje", diziam "do mês" (D36 da simulação de um dia de clínica). `anterior`
 * nulo: sem base de comparação ("Todo período").
 */
export function rotulosDoPeriodo(p: Period | string): { doPeriodo: string; noPeriodo: string; anterior: string | null } {
  switch (p) {
    case 'today': return { doPeriodo: 'de hoje', noPeriodo: 'hoje', anterior: 'ontem' }
    case '7d':    return { doPeriodo: 'dos 7 dias', noPeriodo: 'nos 7 dias', anterior: 'os 7 dias anteriores' }
    case '15d':   return { doPeriodo: 'dos 15 dias', noPeriodo: 'nos 15 dias', anterior: 'os 15 dias anteriores' }
    case 'month': return { doPeriodo: 'do mês', noPeriodo: 'no mês', anterior: 'mês anterior' }
    case 'all':   return { doPeriodo: 'de todo o período', noPeriodo: 'em todo o período', anterior: null }
    default:      return { doPeriodo: 'do período', noPeriodo: 'no período', anterior: 'período anterior' }
  }
}
