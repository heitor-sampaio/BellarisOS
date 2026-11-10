import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { ler } from '@/lib/db'

/**
 * A26 da 10ª simulação (2026-11-10): os pontos que os pagamentos do pacote (ou
 * do plano) deram, líquidos do que um estorno já tirou, e o saldo da cliente
 * hoje — a conta é do banco (`fidelidade_pontos_do_conjunto`). A janela do
 * cancelamento os mostra antes: o estorno tira os pontos do que voltar, e o
 * saldo pode ficar negativo (`fidelidade.md`).
 */
export async function pontosDoConjunto(tenantId: string, alvo: { pacote?: string; plano?: string }): Promise<{ ganhos: number; saldo: number }> {
  const linhas = await ler(createAdminClient().rpc('fidelidade_pontos_do_conjunto', {
    p_tenant: tenantId, p_pacote: alvo.pacote ?? null, p_plano: alvo.plano ?? null,
  }), 'ler os pontos do pacote') as { ganhos: number | null; saldo: number | null }[] | null
  const l = (linhas ?? [])[0]
  return { ganhos: Number(l?.ganhos ?? 0), saldo: Number(l?.saldo ?? 0) }
}
