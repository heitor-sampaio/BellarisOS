import { redirect } from 'next/navigation'
import { getTenantContext } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { ClientPortalNav } from '@/components/client-portal/client-nav'
import { NotificationBell } from '@/components/client-portal/notification-bell'
import { CapacitorNavFix } from '@/components/client-portal/capacitor-nav-fix'

export default async function ClientPortalLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const ctx = await getTenantContext()

  if (!ctx.isClient) redirect(`/${slug}/dashboard`)

  const admin = createAdminClient()
  const [{ data: branch }, { count: unreadCount }] = await Promise.all([
    admin.from('branches').select('name').eq('slug', slug).single(),
    admin
      .from('client_notifications')
      .select('id', { count: 'exact', head: true })
      .eq('client_id', ctx.clientId!)
      .eq('is_received', false),
  ])

  const branchName = (branch as { name: string } | null)?.name ?? 'Clínica'
  const initialUnread = unreadCount ?? 0

  return (
    <div style={{ minHeight: '100dvh', background: 'var(--bg-app)' }}>
      {/* -- Topbar mínima ---------------------------------------- */}
      {/* Header cresce para cobrir a status bar (edge-to-edge).
          O inner div de 52px mantém o conteúdo verticalmente centrado
          abaixo da safe area, sem depender de align-items no wrapper. */}
      <header style={{
        position:    'sticky',
        top:         0,
        zIndex:      50,
        background:  'var(--surface)',
        borderBottom: '1px solid var(--hairline)',
        paddingTop:  'env(safe-area-inset-top, 0px)',
      }}>
        <div style={{
          height:         52,
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'space-between',
          paddingLeft:    '20px',
          paddingRight:   '20px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
            <span style={{ fontSize: 15, color: 'var(--brand)', fontWeight: 800, marginRight: 8, lineHeight: 1 }}>✦</span>
            <span style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.01em' }}>
              {branchName}
            </span>
          </div>
          <NotificationBell initialUnread={initialUnread} clientId={ctx.clientId!} />
        </div>
      </header>

      {/* -- Conteúdo ---------------------------------------------- */}
      <main style={{
        maxWidth:      640,
        margin:        '0 auto',
        padding:       '20px 16px',
        paddingBottom: 'calc(76px + env(safe-area-inset-bottom, 0px))',
        minHeight:     'calc(100dvh - 52px)',
      }}>
        {children}
      </main>

      {/* -- Bottom nav -------------------------------------------- */}
      <ClientPortalNav slug={slug} />
      <CapacitorNavFix />
    </div>
  )
}
