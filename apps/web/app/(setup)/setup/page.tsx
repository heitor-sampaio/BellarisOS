import { redirect } from 'next/navigation'
import { getTenantContext, assertPermission } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { SetupWizard } from '@/components/setup/setup-wizard'
import { ler } from '@/lib/db'

export default async function SetupPage() {
  const ctx = await getTenantContext()
  assertPermission(ctx, 'settings', 'MANAGE')

  const admin = createAdminClient()
  const [tenant, unidades] = await Promise.all([
    ler(admin
      .from('tenants')
      .select('name, document, phone, website, onboarding_completed_at')
      .eq('id', ctx.tenantId!)
      .single(), 'buscar a rede'),
    ler(admin.from('branches').select('id').eq('tenant_id', ctx.tenantId!).eq('is_active', true).limit(1),
      'conferir as unidades da rede'),
  ])

  if (tenant?.onboarding_completed_at) redirect('/admin/dashboard')

  // Retoma de onde parou (simulação de 2026-10-20): o que já foi gravado vem
  // preenchido — o campo vazio gravava nulo e apagava o telefone — e a rede
  // que já tem unidade vai direto ao fim, em vez de criar uma segunda.
  return (
    <SetupWizard
      rede={{
        nome:      (tenant?.name as string | null) ?? 'Minha Clínica',
        documento: (tenant?.document as string | null) ?? '',
        telefone:  (tenant?.phone as string | null) ?? '',
        site:      (tenant?.website as string | null) ?? '',
      }}
      temUnidade={(unidades ?? []).length > 0}
    />
  )
}
