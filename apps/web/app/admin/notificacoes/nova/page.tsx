import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { getTenantContext, assertRole } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { NotificationCampaignForm } from '@/components/admin/notification-campaign-form'

export const dynamic = 'force-dynamic'

export default async function NovaCampanhaPage() {
  const ctx = await getTenantContext()
  assertRole(ctx, ['NETWORK_ADMIN'])

  const admin = createAdminClient()

  const [{ data: branches }, { data: procedures }] = await Promise.all([
    admin
      .from('branches')
      .select('id, name, city')
      .eq('tenant_id', ctx.tenantId!)
      .eq('is_active', true)
      .order('name'),
    admin
      .from('procedures')
      .select('id, name, category')
      .eq('tenant_id', ctx.tenantId!)
      .eq('is_active', true)
      .order('name'),
  ])

  return (
    <div>
      <div style={{ marginBottom: 28 }}>
        <Link
          href="/admin/notificacoes"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: 'var(--text-muted)', fontSize: 13, fontWeight: 600, textDecoration: 'none', marginBottom: 12 }}
        >
          <ChevronLeft size={14} />
          Voltar
        </Link>
        <h1 style={{
          fontSize: 'var(--text-title)', fontWeight: 'var(--weight-extrabold)',
          letterSpacing: 'var(--tracking-tight)', color: 'var(--text)',
        }}>
          Nova campanha
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm-sz)', marginTop: 4 }}>
          Configure o tipo, conteúdo e o público da sua campanha.
        </p>
      </div>

      <NotificationCampaignForm
        branches={(branches ?? []) as { id: string; name: string; city: string | null }[]}
        procedures={(procedures ?? []) as { id: string; name: string; category: string | null }[]}
      />
    </div>
  )
}
