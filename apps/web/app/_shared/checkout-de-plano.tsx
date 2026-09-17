import { notFound } from 'next/navigation'
import { getTenantContext, assertPodeReceber, can } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { getTreatmentPlanSessions } from '@/actions/treatment-plans'
import { getCachedBranchProfessionals } from '@/lib/cached-queries'
import { CheckoutWizard } from '@/components/branch/checkout-wizard'
import type { CheckoutPlan } from '@/components/branch/checkout-wizard'

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

  const admin = createAdminClient()

  const { data: planRaw } = await admin
    .from('treatment_plans')
    .select('id, status, professional_notes, client_id, branch_id, clients(name, document, phone), evaluation_appointment_id')
    .eq('id', planId)
    .eq('branch_id', branchId)
    .single()

  if (!planRaw) notFound()
  if (planRaw.status === 'ACCEPTED' || planRaw.status === 'COMPLETED') {
    const { redirect } = await import('next/navigation')
    redirect(`${slug ? `/${slug}` : '/admin'}/clients/${planRaw.client_id}`)
  }

  type RawClient = { name: string; document: string | null; phone: string | null }
  const cli = planRaw.clients as unknown as RawClient | null

  const [{ sessions, total }, professionalsRaw, { data: medRecordRaw }, { data: branchesRaw }] = await Promise.all([
    getTreatmentPlanSessions(planId),
    getCachedBranchProfessionals(branchId, ctx.tenantId!),
    admin.from('medical_records').select('id').eq('client_id', planRaw.client_id).maybeSingle(),
    admin.from('branches').select('id, name').eq('tenant_id', ctx.tenantId!).eq('is_active', true).order('name'),
  ])

  const plan: CheckoutPlan = {
    id:                planRaw.id as string,
    status:            planRaw.status as string,
    professionalNotes: (planRaw.professional_notes as string | null) ?? null,
    clientName:        cli?.name ?? '—',
    clientDocument:    cli?.document ?? null,
    clientPhone:       cli?.phone ?? null,
    clientId:          planRaw.client_id as string,
    branchName,
    medicalRecordId:   medRecordRaw?.id ?? null,
    sessions,
    total,
    professionals:    ((professionalsRaw ?? []) as { id: string; name: string }[]).map(p => ({ id: p.id, name: p.name })),
    branches:         ((branchesRaw      ?? []) as { id: string; name: string }[]).map(b => ({ id: b.id, name: b.name })),
    currentBranchId:  branchId,
  }

  return (
    <div style={{ maxWidth: 680, margin: '0 auto', padding: '0 4px 40px' }}>
      <div style={{ marginBottom: 28 }}>
        <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
          Novo paciente
        </p>
        <h1 style={{ fontSize: 'var(--text-title)', fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--text)' }}>
          Checkout
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm-sz)', marginTop: 4 }}>
          {cli?.name} · {branchName}
        </p>
      </div>

      <CheckoutWizard plan={plan} slug={slug} podeAgendar={can(ctx, 'agenda', 'MANAGE')} />
    </div>
  )
}
