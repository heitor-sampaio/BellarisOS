import { redirect } from 'next/navigation'
import { getTenantContext, assertRole } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { SetupWizard } from '@/components/setup/setup-wizard'

export default async function SetupPage() {
  const ctx = await getTenantContext()
  assertRole(ctx, ['NETWORK_ADMIN'])

  const admin = createAdminClient()
  const { data: tenant } = await admin
    .from('tenants')
    .select('name, onboarding_completed_at')
    .eq('id', ctx.tenantId!)
    .single()

  if (tenant?.onboarding_completed_at) redirect('/admin/dashboard')

  return <SetupWizard tenantName={tenant?.name ?? 'Minha Clínica'} />
}
