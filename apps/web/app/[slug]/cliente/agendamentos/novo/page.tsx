import { notFound } from 'next/navigation'
import { getTenantContext, assertClient } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCachedBranchProfessionals } from '@/lib/cached-queries'
import { NewAppointmentWizard } from '@/components/client-portal/new-appointment-wizard'
import { ler } from '@/lib/db'

export default async function NewClientAppointmentPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const ctx = await getTenantContext()
  assertClient(ctx)

  const admin = createAdminClient()

  // Querying by slug alone matches duplicates across tenants (.single() returns null).
  // Use the client's own branch_id instead — it's a UUID and globally unique.
  const clientRecord = await ler(admin
    .from('clients')
    .select('branch_id')
    .eq('id', ctx.clientId!)
    .single(), 'buscar o cliente')

  if (!clientRecord?.branch_id) notFound()

  const branch = await ler(admin
    .from('branches')
    .select('id, name, tenant_id, slug')
    .eq('id', clientRecord.branch_id)
    .single(), 'buscar a unidade')

  if (!branch || (branch as { slug: string }).slug !== slug) notFound()

  const branchTyped = branch as { id: string; name: string; tenant_id: string }

  const [{ data: rawProcedures }, rawProfessionals] = await Promise.all([
    admin
      .from('procedures')
      .select('id, name, price, duration_min')
      .eq('tenant_id', branchTyped.tenant_id)
      .or(`branch_id.is.null,branch_id.eq.${branchTyped.id}`)
      .eq('is_active', true)
      .eq('visible_on_client_app', true)
      .order('name'),
    // Filtrava por `users.role`, coluna removida na migração de cargos: a lista
    // vinha vazia e o cliente não tinha profissional para escolher.
    getCachedBranchProfessionals(branchTyped.id, branchTyped.tenant_id as string),
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
