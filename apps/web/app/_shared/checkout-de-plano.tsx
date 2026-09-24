import { notFound, redirect } from 'next/navigation'
import { getTenantContext, assertPodeReceber, can } from '@/lib/auth'
import { montarCheckoutPlan } from '@/lib/checkout/plano-para-checkout'
import { CheckoutWizard } from '@/components/branch/checkout-wizard'

/**
 * Checkout de um plano de tratamento — a mesma tela nos dois portais.
 *
 * Quem chama resolve a filial: pelo slug da URL na unidade, pelo próprio plano
 * na rede. A consulta continua exigindo o `branch_id`, então o recorte não
 * afrouxou por existir no portal da rede.
 */
export async function CheckoutDePlano({
  branchId, branchName, slug, planId,
}: {
  branchId:   string
  branchName: string
  slug:       string
  planId:     string
}) {
  const ctx = await getTenantContext()
  assertPodeReceber(ctx)

  const { plan, clientId, error } = await montarCheckoutPlan(planId, branchId, branchName, ctx.tenantId!)

  if (!plan) {
    // Plano já fechado volta para a ficha do cliente; o resto é 404.
    if (clientId) redirect(`${slug ? `/${slug}` : '/admin'}/clients/${clientId}`)
    notFound()
  }

  return (
    <div style={{ maxWidth: 680, margin: '0 auto', padding: '0 4px 40px' }}>
      <div style={{ marginBottom: 28 }} className="esconde-impressao">
        <p style={{ fontSize: 'var(--text-2xs)', fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
          Novo paciente
        </p>
        <h1 style={{ fontSize: 'var(--text-title)', fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--text)' }}>
          Checkout
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm-sz)', marginTop: 4 }}>
          {plan.clientName} · {branchName}
        </p>
      </div>

      <CheckoutWizard plan={plan} slug={slug} podeAgendar={can(ctx, 'agenda', 'MANAGE')} />
    </div>
  )
}
