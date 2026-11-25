import { createAdminClient } from '@/lib/supabase/admin'

/**
 * A parte do em aberto SEM cliente (A17 da 30ª simulação; vendas-financeiro:
 * FN-11; princípio 3): a receita em aberto que não é de cliente nenhuma nem de
 * atendimento — a sublocação da sala, um aluguel. O cartão "A receber da
 * cliente · em aberto" soma todo o em aberto, e a nota diz quanto disso é sem
 * cliente. Contado no banco (`metrics_a_receber_sem_cliente`), com o mesmo
 * conjunto de `metrics_a_receber_em_aberto`. No total e por unidade.
 */
export async function getAReceberSemCliente(args: { tenantId: string; branchIds?: string[] | null }): Promise<{ total: number; porUnidade: Record<string, number> }> {
  const { data, error } = await createAdminClient().rpc('metrics_a_receber_sem_cliente', {
    p_tenant: args.tenantId, p_branch_ids: args.branchIds ?? null,
  })
  // A tela para (lib/metrics nunca devolve zero com cara de dado).
  if (error) throw new Error(`metrics_a_receber_sem_cliente: ${error.message}`)
  const linhas = (data as Record<string, unknown>[] | null) ?? []
  const n = (v: unknown) => (v == null ? 0 : Number(v))
  return {
    total: n(linhas.find(r => r.branch_id == null)?.valor),
    porUnidade: Object.fromEntries(linhas.filter(r => r.branch_id != null).map(r => [String(r.branch_id), n(r.valor)])),
  }
}
