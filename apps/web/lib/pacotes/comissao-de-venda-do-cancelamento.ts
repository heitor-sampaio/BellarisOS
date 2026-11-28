import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { ler } from '@/lib/db'

/**
 * A16 da 43ª (comissoes:CQ-07, vendas:PA-26): a janela do cancelamento só diz
 * que "a comissão de venda volta na proporção do que caiu" quando a venda TEM
 * a linha de comissão de venda — a do pacote (`client_package_id`) ou a do
 * plano (`treatment_plan_id`), sem atendimento e ativa. O pacote trazido de
 * fora não tem (não é venda), nem a venda sem a comissão ligada.
 */
export async function temComissaoDeVenda(tenantId: string, alvo: { pacote: string } | { plano: string }): Promise<boolean> {
  const base = createAdminClient().from('commission_lines').select('id').eq('tenant_id', tenantId)
  const doAlvo = 'pacote' in alvo ? base.eq('client_package_id', alvo.pacote) : base.eq('treatment_plan_id', alvo.plano)
  const linhas = await ler(doAlvo.is('appointment_id', null).eq('status', 'ATIVA').limit(1), 'ler a comissão de venda do cancelamento')
  return (linhas ?? []).length > 0
}
