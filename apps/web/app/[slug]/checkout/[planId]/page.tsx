import { notFound } from 'next/navigation'
import { getTenantContext, assertPermission } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient as createSupabase } from '@/lib/supabase/server'
import { getTreatmentPlanSessions } from '@/actions/treatment-plans'
import { getCachedBranchProfessionals } from '@/lib/cached-queries'
import { CheckoutWizard } from '@/components/branch/checkout-wizard'
import type { CheckoutPlan } from '@/components/branch/checkout-wizard'

export default async function CheckoutPage({
  params,
}: {
  params: Promise<{ slug: string; planId: string }>
}) {
  const { slug, planId } = await params
  const ctx              = await getTenantContext()
  assertPermission(ctx, 'procedures', 'VIEW')

  const supabase = await createSupabase()
  const admin    = createAdminClient()

  const { data: branch } = await supabase
    .from('branches')
    .select('id, name')
    .eq('slug', slug)
    .eq('tenant_id', ctx.tenantId!)
    .single()
  if (!branch) notFound()

  const { data: planRaw } = await admin
    .from('treatment_plans')
    .select('id, status, professional_notes, client_id, branch_id, clients(name, document, phone), evaluation_appointment_id')
    .eq('id', planId)
    .eq('branch_id', branch.id)
    .single()

  if (!planRaw) notFound()
  if (planRaw.status === 'ACCEPTED' || planRaw.status === 'COMPLETED') {
    const { redirect } = await import('next/navigation')
    redirect(`/${slug}/clients/${planRaw.client_id}`)
  }

  type RawClient = { name: string; document: string | null; phone: string | null }
  const cli = planRaw.clients as unknown as RawClient | null

  const [{ sessions, total }, professionalsRaw, { data: medRecordRaw }, { data: branchesRaw }] = await Promise.all([
    getTreatmentPlanSessions(planId),
    getCachedBranchProfessionals(branch.id, ctx.tenantId!),
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
    branchName:        branch.name,
    medicalRecordId:   medRecordRaw?.id ?? null,
    sessions,
    total,
    professionals:    ((professionalsRaw ?? []) as { id: string; name: string }[]).map(p => ({ id: p.id, name: p.name })),
    branches:         ((branchesRaw      ?? []) as { id: string; name: string }[]).map(b => ({ id: b.id, name: b.name })),
    currentBranchId:  branch.id,
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
          {cli?.name} · {branch.name}
        </p>
      </div>

      <CheckoutWizard plan={plan} slug={slug} />
    </div>
  )
}
