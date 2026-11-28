import { createAdminClient } from '@/lib/supabase/admin'
import { ler } from '@/lib/db'

/**
 * A3 da 43ª simulação (comissoes:CF-17: "É a única porta: o Financeiro comum
 * recusa estornar essa despesa"): as despesas da lista que são o pagamento de
 * um fechamento de comissões ainda vivo. É a MESMA marca do gatilho que recusa
 * o estorno por fora (`private.despesa_de_fechamento_so_pelo_fechamento`: um
 * `commission_payouts` com `transaction_id` = a despesa e `estornado_at` nulo)
 * — a lista não desenha o "Estornar" nelas; estorna-se em Financeiro →
 * Comissões. Servidor só (o cliente de serviço), com o filtro da rede.
 */
export async function despesasDasComissoes(tenantId: string, idsDasDespesas: readonly string[]): Promise<Set<string>> {
  const ids = [...new Set(idsDasDespesas)]
  const marcadas = new Set<string>()
  if (!ids.length) return marcadas
  const admin = createAdminClient()
  // Em lotes: o `in` vai na URL.
  for (let i = 0; i < ids.length; i += 200) {
    const lote = ids.slice(i, i + 200)
    const linhas = await ler(admin.from('commission_payouts').select('transaction_id')
      .eq('tenant_id', tenantId).in('transaction_id', lote).is('estornado_at', null),
      'ler os fechamentos de comissões das despesas') as { transaction_id: string }[] | null
    for (const l of linhas ?? []) marcadas.add(l.transaction_id)
  }
  return marcadas
}
