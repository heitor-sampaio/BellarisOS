import { formatBRL } from '@estetica-os/utils'
import type { SemReceita } from '@/lib/metrics/fechamento-extra'

/**
 * A11 da 13ª simulação (2026-11-12): o "Top 5" da Visão geral dos Relatórios
 * não dizia o que foi pago com crédito na clínica — as tabelas das abas
 * Procedimentos e Profissionais dizem ("R$ 140,00 pagos com crédito na
 * clínica (não é receita)"). Uma linha por nome do Top 5 que tem esse
 * pagamento; o número vem de `getAtendimentosSemReceita` (lib/metrics).
 */
export function notasDoTop5(nomes: string[], porNome: Record<string, SemReceita> | undefined | null): string[] {
  if (!porNome) return []
  return nomes.flatMap(nome => {
    const valor = porNome[nome]?.comCredito.valor ?? 0
    return valor > 0 ? [`${nome}: ${formatBRL(valor)} pagos com crédito na clínica (não é receita)`] : []
  })
}
