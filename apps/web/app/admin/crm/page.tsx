import Link from 'next/link'
import { getTenantContext, assertRole } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { seedDefaultStages } from '@/actions/crm-stages'
import { getConversations } from '@/actions/inbox'
import { getCachedNetworkProcedures } from '@/lib/cached-queries'
import { CRMBoard } from '@/components/branch/crm-board'
import { CRMLeadModal } from '@/components/branch/crm-lead-modal'
import { CRMStageSettings } from '@/components/branch/crm-stage-settings'
import { CRMInbox } from '@/components/admin/crm-inbox'
import { RealtimeRefresher } from '@/components/shared/realtime-refresher'
import { UserPlus } from 'lucide-react'

type View = 'funil' | 'inbox'

export default async function AdminCRMPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; c?: string }>
}) {
  const ctx = await getTenantContext()
  assertRole(ctx, ['NETWORK_ADMIN', 'FINANCIAL', 'COMERCIAL', 'GERENTE_COMERCIAL'])

  const { view: viewParam, c: convParam } = await searchParams
  // Uma conversa selecionada (?c=) força a aba inbox (deep-link vindo do card do funil).
  const view: View = (viewParam === 'inbox' || convParam) ? 'inbox' : 'funil'

  const admin = createAdminClient()

  // Filiais da rede
  const { data: branchesRaw } = await admin
    .from('branches')
    .select('id, name, slug')
    .eq('tenant_id', ctx.tenantId!)
    .eq('is_active', true)
    .order('name')

  const branches = (branchesRaw ?? []) as { id: string; name: string; slug: string }[]
  const branchIds = branches.map(b => b.id)

  // COMERCIAL opera o funil; GERENTE_COMERCIAL e FINANCIAL só leem.
  const canEdit = ctx.role === 'NETWORK_ADMIN' || ctx.role === 'COMERCIAL'

  // -- Funil data (always needed for stats) --
  const stages = await seedDefaultStages(ctx.tenantId!)

  const allProcs = await getCachedNetworkProcedures(ctx.tenantId!)

  const procedures = allProcs.map(p => ({ id: p.id as string, name: p.name as string }))

  // Funil da REDE: inclui leads de rede (branch_id null) + leads de filiais do tenant.
  const { data: leadsRaw } = await admin
    .from('leads')
    .select(`
      id, name, phone, email, social_media, source,
      crm_stage_id, notes, client_id, created_at, tags,
      branch_id,
      branches(name, slug),
      conversations(last_message_at, awaiting_since),
      lead_procedures(procedure_id, procedures(name, price))
    `)
    .eq('tenant_id', ctx.tenantId!)
    .order('created_at', { ascending: false })

  const leads = (leadsRaw ?? []).map((l: any) => {
    const { conversations, ...rest } = l
    const convs = (conversations ?? []) as { last_message_at: string | null; awaiting_since: string | null }[]
    const lastInteractionAt = convs
      .map(c => c.last_message_at)
      .filter((v): v is string => v != null)
      .sort()
      .at(-1) ?? null
    const awaitingSince = convs
      .map(c => c.awaiting_since)
      .filter((v): v is string => v != null)
      .sort()
      .at(0) ?? null
    return {
      ...rest,
      tags:                l.tags ?? [],
      last_interaction_at: lastInteractionAt,
      awaiting_since:      awaitingSince,
      branch_name:         l.branches?.name ?? null,
      branch_slug:         l.branches?.slug ?? null,
    }
  })

  const total       = leads.length
  const convertidos = leads.filter((l: any) => l.client_id).length
  const conversion  = total > 0 ? Math.round((convertidos / total) * 100) : 0

  // -- Inbox data (only when on inbox view) --
  const conversations = view === 'inbox' ? await getConversations() : []
  const totalUnread   = conversations.reduce((sum, c) => sum + c.unread_count, 0)

  // Leads list for new conversation picker (id + name + branch_name)
  const inboxLeads = leads.map((l: any) => ({
    id:          l.id as string,
    name:        l.name as string,
    phone:       l.phone ?? null,
    branch_name: l.branch_name ?? null,
  }))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <RealtimeRefresher tables={['leads', 'crm_stages']} />

      {/* -- Header -- */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 'var(--text-title)', fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--text)' }}>
            CRM
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm-sz)', marginTop: 4 }}>
            {total} leads · {convertidos} convertidos · {conversion}% de conversão · {branches.length} filial{branches.length !== 1 ? 'is' : ''}
          </p>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {view === 'funil' && canEdit && branches.length > 0 && (
            <>
              <CRMStageSettings slug="__admin__" stages={stages} />
              <CRMLeadModal
                branches={branches}
                stages={stages}
                procedures={procedures}
                trigger={
                  <button type="button" className="btn-primary">
                    <UserPlus size={15} />
                    Novo lead
                  </button>
                }
              />
            </>
          )}
        </div>
      </div>

      {/* -- Tabs -- */}
      <div style={{ display: 'flex', gap: 2, borderBottom: '1px solid var(--hairline)', marginBottom: -8 }}>
        <TabLink href="/admin/crm?view=funil" active={view === 'funil'}>
          Funil
        </TabLink>
        <TabLink href="/admin/crm?view=inbox" active={view === 'inbox'}>
          Inbox
          {totalUnread > 0 && (
            <span style={{
              marginLeft: 6, background: 'var(--brand)', color: '#fff',
              borderRadius: 99, fontSize: 10, fontWeight: 800,
              padding: '1px 6px', display: 'inline-block',
            }}>
              {totalUnread}
            </span>
          )}
        </TabLink>
      </div>

      {/* -- Content -- */}
      {branches.length === 0 ? (
        <div className="card" style={{ padding: '56px 24px', textAlign: 'center' }}>
          <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm-sz)' }}>
            Nenhuma filial ativa cadastrada.
          </p>
        </div>
      ) : view === 'inbox' ? (
        <CRMInbox
          initialConversations={conversations}
          leads={inboxLeads}
          canEdit={canEdit}
          branches={branches}
          initialSelectedId={convParam ?? null}
        />
      ) : (
        <CRMBoard
          initialLeads={leads}
          stages={stages}
          procedures={procedures}
          branchId=""
          slug="__admin__"
          networkMode
          branches={branches}
        />
      )}
    </div>
  )
}

function TabLink({
  href, active, children,
}: {
  href: string; active: boolean; children: React.ReactNode
}) {
  return (
    <Link
      href={href}
      style={{
        display: 'inline-flex', alignItems: 'center',
        padding: '8px 16px', fontSize: 13.5, fontWeight: active ? 800 : 600,
        color: active ? 'var(--brand)' : 'var(--text-muted)',
        borderBottom: active ? '2px solid var(--brand)' : '2px solid transparent',
        textDecoration: 'none', transition: 'color 0.15s',
        marginBottom: -1,
      }}
    >
      {children}
    </Link>
  )
}
