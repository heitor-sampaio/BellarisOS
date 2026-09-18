import { notFound } from 'next/navigation'
import { getTenantContext } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { CheckoutDePlano } from '@/app/_shared/checkout-de-plano'

/**
 * Checkout visto do portal da rede: a filial vem do próprio plano, não da URL.
 * O `slug` resolvido aqui é o endereço da unidade, que as actions do wizard
 * usam no `revalidatePath` — não o portal.
 */
export default async function AdminCheckoutPage({
  params,
}: {
  params: Promise<{ planId: string }>
}) {
  const { planId } = await params
  const ctx        = await getTenantContext()

  const admin = createAdminClient()
  const { data: plan, error: planErr } = await admin
    .from('treatment_plans')
    .select('branch_id, branches!branch_id(name, slug, tenant_id)')
    .eq('id', planId)
    .maybeSingle()

  // Consulta que falha não é plano inexistente.
  if (planErr) throw new Error('Não foi possível carregar o plano: ' + planErr.message)

  const branch = plan?.branches as unknown as { name: string; slug: string; tenant_id: string } | null
  if (!plan?.branch_id || !branch || branch.tenant_id !== ctx.tenantId) notFound()

  return (
    <CheckoutDePlano
      branchId={plan.branch_id as string}
      branchName={branch.name}
      slug={branch.slug}
      planId={planId}
    />
  )
}
