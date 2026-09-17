import { getTenantContext } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { ListaDeCheckout } from '@/app/_shared/lista-de-checkout'

/**
 * Checkouts pendentes de toda a rede.
 *
 * Antes só existia por unidade, e o dashboard da rede mandava a pessoa para o
 * portal da filial para fechar um plano que ele mesmo tinha listado.
 */
export default async function AdminCheckoutListPage() {
  const ctx   = await getTenantContext()
  const admin = createAdminClient()

  // `treatment_plans` não tem `tenant_id`: a rede é o conjunto das filiais ativas.
  const { data: branchesRaw } = await admin
    .from('branches')
    .select('id')
    .eq('tenant_id', ctx.tenantId!)
    .eq('is_active', true)

  const branchIds = (branchesRaw ?? []).map(b => b.id as string)

  return <ListaDeCheckout branchIds={branchIds} branchName={null} slug="" />
}
