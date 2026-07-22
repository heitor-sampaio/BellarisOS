import { notFound } from 'next/navigation'
import { getTenantContext, assertClient } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { NewAppointmentWizard } from '@/components/client-portal/new-appointment-wizard'

export default async function NewClientAppointmentPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const ctx = await getTenantContext()
  assertClient(ctx)

  const admin = createAdminClient()

  // Querying by slug alone matches duplicates across tenants (.single() returns null).
  // Use the client's own branch_id instead — it's a UUID and globally unique.
  const { data: clientRecord } = await admin
    .from('clients')
    .select('branch_id')
    .eq('id', ctx.clientId!)
    .single()

  if (!clientRecord?.branch_id) notFound()

  const { data: branch } = await admin
    .from('branches')
    .select('id, name, tenant_id, slug')
    .eq('id', clientRecord.branch_id)
    .single()

  if (!branch || (branch as { slug: string }).slug !== slug) notFound()

  const branchTyped = branch as { id: string; name: string; tenant_id: string }

  const [{ data: rawProcedures }, { data: rawProfessionals }] = await Promise.all([
    admin
      .from('procedures')
      .select('id, name, price, duration_min')
      .eq('tenant_id', branchTyped.tenant_id)
      .or(`branch_id.is.null,branch_id.eq.${branchTyped.id}`)
      .eq('is_active', true)
      .eq('visible_on_client_app', true)
      .order('name'),
    admin
      .from('users')
      .select('id, name')
      .eq('branch_id', branchTyped.id)
      .in('role', ['BRANCH_ADMIN', 'PROFESSIONAL'])
      .eq('is_active', true)
      .order('name'),
  ])

  const procedures    = (rawProcedures ?? []) as { id: string; name: string; price: number; duration_min: number }[]
  const professionals = (rawProfessionals ?? []) as { id: string; name: string }[]

  return (
    <NewAppointmentWizard
      slug={slug}
      branchId={branchTyped.id}
      procedures={procedures}
      professionals={professionals}
    />
  )
}
