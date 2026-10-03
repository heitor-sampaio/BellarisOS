/**
 * Situações do plano de uma rede (`tenants.plan_status`). Hoje só a
 * plataforma as muda, à mão; quando houver cobrança, é ela que escreve aqui.
 */
export const SITUACOES_DO_PLANO = ['trial', 'active', 'past_due', 'suspended', 'canceled'] as const
export type SituacaoDoPlano = typeof SITUACOES_DO_PLANO[number]

export const ROTULO_DA_SITUACAO: Record<SituacaoDoPlano, string> = {
  trial:     'Em teste',
  active:    'Ativa',
  past_due:  'Pagamento atrasado',
  suspended: 'Suspensa',
  canceled:  'Cancelada',
}

export function rotuloDaSituacao(s: string | null | undefined): string {
  return (s && (ROTULO_DA_SITUACAO as Record<string, string>)[s]) || s || '—'
}
