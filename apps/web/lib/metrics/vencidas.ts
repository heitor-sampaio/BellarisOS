import { createAdminClient } from '@/lib/supabase/admin'

/**
 * O a receber da cliente VENCIDO (D13 da 9ª simulação, 2026-11-07; princípio
 * 3): em aberto, com o vencimento antes de hoje em Brasília — o conjunto de
 * `metrics_a_receber_em_aberto`, contado no banco (`metrics_a_receber_vencido`).
 * O cartão "A receber da cliente", o dashboard e o check-in dizem o mesmo número.
 */
export interface AReceberVencido {
  valor:      number
  quantidade: number
  /** O vencimento mais antigo (ISO), ou nulo sem nenhuma. */
  maisAntiga: string | null
}

export const SEM_VENCIDAS: AReceberVencido = { valor: 0, quantidade: 0, maisAntiga: null }

const n = (v: unknown): number => (v == null ? 0 : Number(v))
const lido = (r: Record<string, unknown> | undefined): AReceberVencido =>
  r ? { valor: n(r.valor), quantidade: n(r.quantidade), maisAntiga: (r.mais_antiga as string | null) ?? null } : SEM_VENCIDAS

export async function getAReceberVencido(args: {
  tenantId: string; branchIds?: string[] | null; professionalId?: string | null; clientId?: string | null
}): Promise<{ total: AReceberVencido; porUnidade: Record<string, AReceberVencido> }> {
  const { data, error } = await createAdminClient().rpc('metrics_a_receber_vencido', {
    p_tenant: args.tenantId, p_branch_ids: args.branchIds ?? null,
    p_professional_id: args.professionalId ?? null, p_client: args.clientId ?? null,
  })
  // A tela para (lib/metrics nunca devolve zero com cara de dado).
  if (error) throw new Error(`metrics_a_receber_vencido: ${error.message}`)
  const linhas = (data as Record<string, unknown>[] | null) ?? []
  return {
    total: lido(linhas.find(r => r.branch_id == null)),
    porUnidade: Object.fromEntries(linhas.filter(r => r.branch_id != null).map(r => [String(r.branch_id), lido(r)])),
  }
}

/** "1 parcela vencida", "3 parcelas vencidas". */
export const parcelasVencidas = (q: number) => `${q} ${q === 1 ? 'parcela vencida' : 'parcelas vencidas'}`
