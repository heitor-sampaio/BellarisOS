import { getTenantContext, assertPermission } from '@/lib/auth'
import { listCampaigns } from '@/actions/notification-campaigns'
import { NotificationCampaignsList } from '@/components/admin/notification-campaigns-list'

export const dynamic = 'force-dynamic'

export default async function AdminNotificacoesPage() {
  const ctx = await getTenantContext()
  assertPermission(ctx, 'marketing', 'VIEW')

  const { campaigns, totalSent, activeCount } = await listCampaigns()

  return (
    <div>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{
          fontSize: 'var(--text-title)', fontWeight: 'var(--weight-extrabold)',
          letterSpacing: 'var(--tracking-tight)', color: 'var(--text)',
        }}>
          Notificações
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm-sz)', marginTop: 4 }}>
          Campanhas de notificação para clientes · in-app
        </p>
      </div>

      <NotificationCampaignsList
        campaigns={campaigns}
        totalSent={totalSent}
        activeCount={activeCount}
      />
    </div>
  )
}
