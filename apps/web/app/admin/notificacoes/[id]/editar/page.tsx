import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { getTenantContext, assertPermission, assertRecurso } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { ler } from '@/lib/db'
import { getCachedNetworkProcedures } from '@/lib/cached-queries'
import { getCampaign } from '@/actions/notification-campaigns'
import { NotificationCampaignForm } from '@/components/admin/notification-campaign-form'

export const dynamic = 'force-dynamic'

/**
 * Editar uma campanha — só rascunho ou pausada, a mesma regra do
 * `updateCampaign`. A action existia desde o começo e nenhuma tela a chamava.
 */
export default async function EditarCampanhaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await getTenantContext()
  // A funcionalidade é do PLANO da rede (lib/planos/recursos.ts).
  assertRecurso(ctx, 'campanhas')
  assertPermission(ctx, 'marketing', 'MANAGE')

  let campaign
  try {
    campaign = (await getCampaign(id)).campaign
  } catch {
    notFound()
  }
  if (!['DRAFT', 'PAUSED'].includes(campaign.status)) redirect(`/admin/notificacoes/${id}`)

  const admin = createAdminClient()
  const [branches, procedures] = await Promise.all([
    ler(admin
      .from('branches')
      .select('id, name, city')
      .eq('tenant_id', ctx.tenantId!)
      .eq('is_active', true)
      .order('name'), 'carregar as unidades'),
    getCachedNetworkProcedures(ctx.tenantId!),
  ])

  return (
    <div>
      <div style={{ marginBottom: 28 }}>
        <Link
          href={`/admin/notificacoes/${id}`}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: 'var(--text-muted)', fontSize: 'var(--text-base-sz)', fontWeight: 600, textDecoration: 'none', marginBottom: 12 }}
        >
          <ChevronLeft size={14} />
          Voltar
        </Link>
        <h1 style={{
          fontSize: 'var(--text-title)', fontWeight: 'var(--weight-extrabold)',
          letterSpacing: 'var(--tracking-tight)', color: 'var(--text)',
        }}>
          Editar campanha
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm-sz)', marginTop: 4 }}>
          {campaign.name}
        </p>
      </div>

      <NotificationCampaignForm
        existing={campaign}
        branches={(branches ?? []) as { id: string; name: string; city: string | null }[]}
        procedures={(procedures ?? []) as { id: string; name: string; category: string | null }[]}
      />
    </div>
  )
}
