import { redirect } from 'next/navigation'
import { getTenantContext, assertPermission } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { SetupWizard } from '@/components/setup/setup-wizard'
import { ler } from '@/lib/db'

export default async function SetupPage() {
  const ctx = await getTenantContext()
  assertPermission(ctx, 'settings', 'MANAGE')

  const admin = createAdminClient()
  const tenant = await ler(admin
    .from('tenants')
    .select('name, onboarding_completed_at')
    .eq('id', ctx.tenantId!)
    .single(), 'buscar a rede')

  if (tenant?.onboarding_completed_at) redirect('/admin/dashboard')

  return <SetupWizard tenantName={tenant?.name ?? 'Minha Clínica'} />
}
