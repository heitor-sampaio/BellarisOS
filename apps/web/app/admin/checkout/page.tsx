import { getTenantContext, assertRecurso } from '@/lib/auth'
import { filiaisAtivas } from '@/lib/branches'
import { ListaDeCheckout } from '@/app/_shared/lista-de-checkout'

/**
 * Checkouts pendentes de toda a rede.
 *
 * Antes só existia por unidade, e o dashboard da rede mandava a pessoa para o
 * portal da filial para fechar um plano que ele mesmo tinha listado.
 */
export default async function AdminCheckoutListPage() {
  const ctx   = await getTenantContext()
  // A funcionalidade é do PLANO da rede (lib/planos/recursos.ts).
  assertRecurso(ctx, 'planos_de_tratamento')
  // `treatment_plans` não tem `tenant_id`: a rede é o conjunto das filiais ativas.
  const branchIds = (await filiaisAtivas(ctx.tenantId!)).map(b => b.id)

  return <ListaDeCheckout branchIds={branchIds} branchName={null} slug="" />
}
