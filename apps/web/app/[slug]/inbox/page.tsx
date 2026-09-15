import { notFound } from 'next/navigation'
import { getTenantContext, assertPermission, ownerFilter, can } from '@/lib/auth'
import { createClient as createSupabase } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getConversations } from '@/actions/inbox'
import { canaisConectados } from '@/lib/channels/factory'
import { isUnitTag, unitTagName } from '@estetica-os/utils'
import { CRMInbox } from '@/components/admin/crm-inbox'
import { RealtimeRefresher } from '@/components/shared/realtime-refresher'

/** Nome da unidade marcada no lead, se houver. */
function unidadeDoLead(tags: unknown): string | null {
  const t = (Array.isArray(tags) ? tags : []).find(
    (x): x is string => typeof x === 'string' && isUnitTag(x),
  )
  return t ? unitTagName(t) : null
}

export default async function BranchInboxPage({
  params, searchParams,
}: {
  params:       Promise<{ slug: string }>
  searchParams: Promise<{ c?: string }>
}) {
  const { slug } = await params
  const { c: convParam } = await searchParams

  const ctx = await getTenantContext()
  assertPermission(ctx, 'crm', 'VIEW')

  const supabase = await createSupabase()

  const { data: branch } = await supabase
    .from('branches').select('id, name')
    .eq('slug', slug).eq('tenant_id', ctx.tenantId!).single()
  if (!branch) notFound()

  // ⚠️ Sem recorte por unidade, igual ao quadro de Oportunidades: lead e
  // conversa são da REDE. Quem responde na unidade vê as mesmas conversas de
  // quem responde na rede — o que separa é o alcance do cargo (`ownerFilter`,
  // aplicado dentro de `getConversations`), não a unidade.
  const conversations = await getConversations()
  const canais = await canaisConectados(ctx.tenantId!)

  const admin = createAdminClient()

  const { data: branchesRaw } = await admin
    .from('branches')
    .select('id, name, slug')
    .eq('tenant_id', ctx.tenantId!)
    .eq('is_active', true)
    .order('name')
  const branches = (branchesRaw ?? []) as { id: string; name: string; slug: string }[]

  const leadOwner = ownerFilter(ctx, 'crm')
  let leadsQuery = admin
    .from('leads')
    .select('id, name, phone, tags')
    .eq('tenant_id', ctx.tenantId!)
  if (leadOwner) leadsQuery = leadsQuery.or(`owner_id.is.null,owner_id.eq.${leadOwner}`)
  const { data: leadsRaw, error } = await leadsQuery.order('created_at', { ascending: false })
  if (error) throw new Error(`Falha ao carregar os leads: ${error.message}`)

  const inboxLeads = (leadsRaw ?? []).map(l => ({
    id:          l.id as string,
    name:        l.name as string,
    phone:       (l.phone as string | null) ?? null,
    branch_name: unidadeDoLead(l.tags),
  }))

  const naoLidas = conversations.reduce((s, c) => s + c.unread_count, 0)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <RealtimeRefresher tables={['leads', 'conversations']} />

      <div>
        <h1 style={{ fontSize: 'var(--text-title)', fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--text)' }}>
          Inbox
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm-sz)', marginTop: 4 }}>
          {conversations.length} conversa{conversations.length !== 1 ? 's' : ''}
          {' · '}{naoLidas} não lida{naoLidas !== 1 ? 's' : ''}
        </p>
      </div>

      <CRMInbox
        initialConversations={conversations}
        leads={inboxLeads}
        canEdit={can(ctx, 'crm', 'MANAGE')}
        branches={branches}
        slug={slug}
        initialSelectedId={convParam ?? null}
        canaisConectados={canais}
      />
    </div>
  )
}
